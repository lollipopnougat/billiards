import {
  POCKETS, BALL_R, L, R, T, B, FOOT_X, MID_Y, HEAD_X,
  FRICTION, BALL_REST, STOP_V, groupOf,
} from './constants';
import type { BilliardsEngine } from './engine';
import type { Ball, PlayerView, UiSnapshot } from './types';

const DEG = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface AIDifficulty {
  label: string;
  angleNoiseRad: number;   // 瞄准角度高斯噪声 σ(弧度)
  powerNoise: number;      // 力度高斯噪声 σ
  cutMaxRad: number;       // 视为"可尝试进袋"的最大切球角
  middlePocketPenalty: number;
  proactiveSafety: boolean;  // 无理想进袋时主动出安全球
  washRiskAvoid: boolean;     // 规避白球洗袋的候选
  randomPickTopN: number;     // >1 时在最优 N 个候选里随机抽
  thinkMs: number;
  placeMs: number;
  chargeViewMs: number;
  breakPower: number;
}

export const DIFFICULTIES: Record<'easy' | 'medium' | 'hard', AIDifficulty> = {
  easy: {
    label: '简单', angleNoiseRad: 3.0 * DEG, powerNoise: 0.13, cutMaxRad: 70 * DEG,
    middlePocketPenalty: 0.7, proactiveSafety: false, washRiskAvoid: false,
    randomPickTopN: 3, thinkMs: 480, placeMs: 320, chargeViewMs: 360, breakPower: 0.78,
  },
  medium: {
    label: '中等', angleNoiseRad: 1.3 * DEG, powerNoise: 0.06, cutMaxRad: 62 * DEG,
    middlePocketPenalty: 1.0, proactiveSafety: true, washRiskAvoid: true,
    randomPickTopN: 1, thinkMs: 640, placeMs: 400, chargeViewMs: 420, breakPower: 0.82,
  },
  hard: {
    label: '困难', angleNoiseRad: 0.55 * DEG, powerNoise: 0.03, cutMaxRad: 55 * DEG,
    middlePocketPenalty: 1.2, proactiveSafety: true, washRiskAvoid: true,
    randomPickTopN: 1, thinkMs: 800, placeMs: 500, chargeViewMs: 460, breakPower: 0.85,
  },
};

interface Vec { x: number; y: number; }
interface ShotEval {
  target: Ball;
  pocket: { x: number; y: number; r: number };
  aim: Vec;        // 瞄准方向(单位向量)
  power: number;
  cutRad: number;
  totalDist: number;
  blocked: boolean;
  washRisk: boolean;
  score: number;
}
interface Plan {
  kind: 'pocket' | 'safety' | 'break';
  aim: Vec;
  power: number;
}

/* ---- 工具 ---- */
function gaussian(sigma: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function perturbAim(aim: Vec, sigma: number): Vec {
  const ang = Math.atan2(aim.y, aim.x) + gaussian(sigma);
  return { x: Math.cos(ang), y: Math.sin(ang) };
}
function simTravelDist(v0: number): number {
  let v = v0, d = 0, guard = 0;
  while (v > STOP_V && guard < 4000) { d += v; v = v * FRICTION - 0.0075; guard++; }
  return d;
}
function endpointNearPocket(x: number, y: number): boolean {
  for (const pp of POCKETS) if (Math.hypot(pp.x - x, pp.y - y) < pp.r + 9) return true;
  return false;
}

export class AIController {
  eng: BilliardsEngine;
  index: number;
  diff: AIDifficulty = DIFFICULTIES.medium;
  enabled = false;
  private isModalOpen: () => boolean;
  private lastActedUiKey = -1;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(eng: BilliardsEngine, index: number, isModalOpen: () => boolean) {
    this.eng = eng;
    this.index = index;
    this.isModalOpen = isModalOpen;
  }

  setEnabled(v: boolean) { this.enabled = v; }
  setDifficulty(d: AIDifficulty) { this.diff = d; }

  cancelPending() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.lastActedUiKey = -1;
  }
  destroy() { this.cancelPending(); }

  /** 由 App 在每次引擎发射 UI 快照时调用 */
  maybeAct(ui: UiSnapshot) {
    if (!this.enabled) { this.lastActedUiKey = ui.uiKey; return; }
    if (ui.turn !== this.index) { this.lastActedUiKey = ui.uiKey; return; }
    if (this.isModalOpen()) { this.lastActedUiKey = ui.uiKey; return; }
    if (ui.state !== 'place' && ui.state !== 'aim') { this.lastActedUiKey = ui.uiKey; return; }
    if (ui.uiKey === this.lastActedUiKey) return;
    this.lastActedUiKey = ui.uiKey;

    if (ui.state === 'place') {
      this.timers.push(setTimeout(() => this.actPlace(), this.diff.placeMs));
    } else {
      this.timers.push(setTimeout(() => this.actShot(), this.diff.thinkMs));
    }
  }

  /* ============ 合法目标 ============ */
  legalTargets(): Ball[] {
    const p = this.eng.players[this.eng.turn];
    const onEight = this.eng.isOnEight(p);
    const out: Ball[] = [];
    for (const b of this.eng.balls) {
      if (!b.active || b.sink || b.dead || b.id === 0) continue;
      if (onEight) { if (b.id === 8) out.push(b); }
      else if (p.group == null) { if (b.id >= 1 && b.id <= 7 || b.id >= 9 && b.id <= 15) out.push(b); }
      else { if (groupOf(b.id) === p.group) out.push(b); }
    }
    return out;
  }

  /* ============ 候选进袋评估 ============ */
  evaluateShot(t: Ball, p: { x: number; y: number; r: number }, cx: number, cy: number): ShotEval | null {
    const eng = this.eng;
    const dpx = p.x - t.x, dpy = p.y - t.y;
    const dpm = Math.hypot(dpx, dpy) || 1;
    const Dx = dpx / dpm, Dy = dpy / dpm; // target -> pocket 方向(= 接触法线)
    // 幽灵球位置
    const gx = t.x - Dx * 2 * BALL_R, gy = t.y - Dy * 2 * BALL_R;
    const ax = gx - cx, ay = gy - cy;
    const am = Math.hypot(ax, ay);
    if (am < 1) return null;
    const aimx = ax / am, aimy = ay / am;
    // 切球角 = 角度(aim, D)
    const cosCut = aimx * Dx + aimy * Dy;
    const cutRad = Math.acos(clamp(cosCut, -1, 1));
    if (cutRad > this.diff.cutMaxRad) return null;

    // 路径清空检查
    const blocked = eng.segmentBlocked(cx, cy, gx, gy, new Set([t.id, 0]))
      || eng.segmentBlocked(t.x, t.y, p.x, p.y, new Set([t.id, 0]));

    const totalDist = am + dpm;
    const basePower = clamp(0.32 + totalDist / 950, 0.3, 0.85);
    const cutBoost = 1 + (cutRad / this.diff.cutMaxRad) * 0.45;
    const power = clamp(basePower * cutBoost, 0.28, 0.88);

    // 白球碰撞后走向:aim - (aim·D)*D
    const dot = aimx * Dx + aimy * Dy;
    let outx = aimx - dot * Dx, outy = aimy - dot * Dy;
    const om = Math.hypot(outx, outy);
    if (om > 1e-4) { outx /= om; outy /= om; }
    const vpost = (6 + power * 22) * Math.sin(cutRad) * BALL_REST;
    let washRisk = false;
    if (om > 1e-4 && vpost > STOP_V * 1.5) {
      // 沿直线模拟滑动至停止,如经过袋口则判定洗袋风险
      let x = gx, y = gy, v = vpost, guard = 0;
      while (v > STOP_V && guard < 4000) {
        x += outx * v; y += outy * v;
        if (x < L || x > R || y < T || y > B) break;
        if (endpointNearPocket(x, y)) { washRisk = true; break; }
        v = v * FRICTION - 0.0075;
        guard++;
      }
    }

    const isMiddle = Math.abs(p.x - (L + R) / 2) < 1;
    let score = cutRad * 8 + totalDist * 0.012;
    if (isMiddle) score += this.diff.middlePocketPenalty * 4;
    if (blocked) score += 60;
    if (this.diff.washRiskAvoid && washRisk) score += 25;

    return { target: t, pocket: p, aim: { x: aimx, y: aimy }, power, cutRad, totalDist, blocked, washRisk, score };
  }

  /* ============ 出杆决策 ============ */
  planShot(): Plan | null {
    const eng = this.eng;
    const cue = eng.cue();
    if (!cue || !cue.active) return null;
    const legal = this.legalTargets();
    if (legal.length === 0) return null;

    // 用力收集所有可进袋候选
    const evals: ShotEval[] = [];
    for (const t of legal) {
      for (const p of POCKETS) {
        const ev = this.evaluateShot(t, p, cue.x, cue.y);
        if (ev) evals.push(ev);
      }
    }
    // 筛选"可行"
    const feasible = evals.filter((e) => !e.blocked && (!e.washRisk || !this.diff.washRiskAvoid));
    if (feasible.length > 0) {
      feasible.sort((a, b) => a.score - b.score);
      let chosen: ShotEval;
      const n = Math.max(1, this.diff.randomPickTopN);
      if (n >= feasible.length) chosen = feasible[Math.floor(Math.random() * feasible.length)];
      else chosen = feasible[Math.floor(Math.random() * n)];
      const aim = perturbAim(chosen.aim, this.diff.angleNoiseRad);
      const power = clamp(chosen.power + gaussian(this.diff.powerNoise), 0.28, 0.9);
      return { kind: 'pocket', aim, power };
    }

    // 无理想进袋候选:出安全球
    if (this.diff.proactiveSafety) {
      const safe = this.planSafety(legal);
      if (safe) return safe;
    }
    // 兜底:瞄准最近的合法目标中心,低力度触碰避免空杆犯规
    return this.fallbackTap(legal);
  }

  planSafety(legal: Ball[]): Plan | null {
    const eng = this.eng;
    const cue = eng.cue();
    if (!cue) return null;
    // 找一个 cue→目标中心 路径清空 的合法球,瞄准其中心低力度直球
    const cands: { t: Ball; aim: Vec; power: number; dist: number }[] = [];
    for (const t of legal) {
      if (eng.segmentBlocked(cue.x, cue.y, t.x, t.y, new Set([t.id, 0]))) continue;
      const ax = t.x - cue.x, ay = t.y - cue.y;
      const am = Math.hypot(ax, ay) || 1;
      const aimx = ax / am, aimy = ay / am;
      // 估计目标球出去的落点,避免意外进袋或冲到危险点
      const power = 0.3;
      const vin = 6 + power * 22;
      const travel = simTravelDist(vin) * 0.85; // 直球传递 ~90%
      const ex = t.x + aimx * travel, ey = t.y + aimy * travel;
      if (endpointNearPocket(ex, ey)) continue;
      // 避免目标球冲出球台(不科学,但当作不理想)
      if (ex < L + BALL_R || ex > R - BALL_R || ey < T + BALL_R || ey > B - BALL_R) {
        // 会撞库反弹,仍可接受;继续保留较低优先级
      }
      cands.push({ t, aim: { x: aimx, y: aimy }, power, dist: am });
    }
    if (cands.length === 0) return null;
    cands.sort((a, b) => a.dist - b.dist);
    const c = cands[0];
    const aim = perturbAim(c.aim, this.diff.angleNoiseRad * 0.5);
    const power = clamp(c.power + gaussian(this.diff.powerNoise), 0.25, 0.5);
    return { kind: 'safety', aim, power };
  }

  fallbackTap(legal: Ball[]): Plan {
    const cue = this.eng.cue()!;
    let t = legal[0], best = 1e9;
    for (const b of legal) {
      const d = Math.hypot(b.x - cue.x, b.y - cue.y);
      if (d < best) { best = d; t = b; }
    }
    const ax = t.x - cue.x, ay = t.y - cue.y, am = Math.hypot(ax, ay) || 1;
    const aim = perturbAim({ x: ax / am, y: ay / am }, this.diff.angleNoiseRad);
    return { kind: 'safety', aim, power: clamp(0.45 + gaussian(this.diff.powerNoise), 0.3, 0.7) };
  }

  /* ============ 开球特例 ============ */
  planBreak(): Plan {
    const cue = this.eng.cue()!;
    // 瞄向三角球堆顶球(apex)附近,带少许角度扩散以增加散度
    let apex: Ball | null = null;
    let best = 1e9;
    for (const b of this.eng.balls) {
      if (b.id === 0 || !b.active || b.sink || b.dead) continue;
      const d = Math.hypot(b.x - FOOT_X, b.y - MID_Y);
      if (d < best) { best = d; apex = b; }
    }
    const tx = apex ? apex.x : FOOT_X;
    const ty = apex ? (apex.y + (Math.random() - 0.5) * 4) : MID_Y;
    const ax = tx - cue.x, ay = ty - cue.y, am = Math.hypot(ax, ay) || 1;
    const aim = perturbAim({ x: ax / am, y: ay / am }, 0.6 * DEG);
    return { kind: 'break', aim, power: this.diff.breakPower };
  }

  /* ============ 自由球摆放决策 ============ */
  planPlacement(): Vec | null {
    const eng = this.eng;
    const p = eng.players[eng.turn];
    const legal = this.legalTargets();
    if (legal.length === 0) return null;

    const cands: { pos: Vec; score: number }[] = [];
    for (const t of legal) {
      for (const pocket of POCKETS) {
        const dpx = pocket.x - t.x, dpy = pocket.y - t.y;
        const dpm = Math.hypot(dpx, dpy) || 1;
        const Dx = dpx / dpm, Dy = dpy / dpm;
        // 摆放在 target 非袋侧后方 2R+pad 处,使入射方向直对袋口
        for (const pad of [12, 26, 46]) {
          const cx = t.x - Dx * (2 * BALL_R + pad);
          const cy = t.y - Dy * (2 * BALL_R + pad);
          if (!eng.validPlace(cx, cy)) continue;
          const ev = this.evaluateShot(t, pocket, cx, cy);
          if (!ev || ev.blocked || ev.cutRad > this.diff.cutMaxRad) continue;
          if (this.diff.washRiskAvoid && ev.washRisk) continue;
          cands.push({ pos: { x: cx, y: cy }, score: ev.score });
          break; // 同一(target,pocket)只用第一个可行的 pad
        }
      }
    }
    if (cands.length === 0) return null;
    cands.sort((a, b) => a.score - b.score);
    const n = Math.max(1, this.diff.randomPickTopN);
    const idx = n >= cands.length ? Math.floor(Math.random() * cands.length) : Math.floor(Math.random() * n);
    return cands[idx].pos;
  }

  /* ============ 执行 ============ */
  private actPlace() {
    const eng = this.eng;
    if (!this.enabled || eng.state !== 'place' || eng.turn !== this.index) return;
    let pos: Vec | null = null;
    if (!eng.breakShotFlag) pos = this.planPlacement();
    // 默认保持引擎自带的厨房区 placePos;自由球时优选拍摄点
    if (pos) eng.setPlaceVector(pos);
    this.timers.push(setTimeout(() => {
      if (!this.enabled || eng.state !== 'place' || eng.turn !== this.index) return;
      eng.placeCuePublic();
    }, 80));
  }

  private actShot() {
    const eng = this.eng;
    if (!this.enabled || eng.state !== 'aim' || eng.turn !== this.index) return;
    let plan: Plan | null;
    if (eng.breakShotFlag) plan = this.planBreak();
    else plan = this.planShot();
    if (!plan) {
      // 极端兜底:随便一杆
      plan = { kind: 'safety', aim: eng.aimDir, power: 0.4 };
    }
    eng.setAimVector(plan.aim);
    eng.aiChargeFire(plan.power, this.diff.chargeViewMs);
  }
}