import {
  POCKETS, BALL_R, L, R, T, B, FOOT_X, MID_Y, HEAD_X,
  FRICTION, BALL_REST, STOP_V, groupOf,
} from './constants';
import type { BilliardsEngine } from './engine';
import type { Ball, UiSnapshot } from './types';

const DEG = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface AIDifficulty {
  label: string;
  angleNoiseRad: number;   // 瞄准角度高斯噪声 σ(弧度)
  powerNoise: number;      // 力度高斯噪声 σ
  cutMaxRad: number;       // 视为"可尝试进袋"的最大切球角
  middlePocketPenalty: number;
  proactiveSafety: boolean;  // 无理想进袋时主动出安全球
  washRiskAvoid: boolean;    // 规避白球洗袋的候选
  randomPickTopN: number;    // >1 时在最优 N 个候选里随机抽
  positionWeight: number;    // 白球落点走位的权重(越大越重位置)
  lookahead: boolean;        // 是否用一步前瞻评估连杆可能性
  lookBonus: number;        // 有后续杆时从分值中减去的奖励
  lookPenalty: number;       // 没后续杆时给分值加的罚分
  thinkMs: number;
  placeMs: number;
  chargeViewMs: number;
  breakPower: number;
}

export const DIFFICULTIES: Record<'easy' | 'medium' | 'hard' | 'master', AIDifficulty> = {
  easy: {
    label: '简单', angleNoiseRad: 1.5 * DEG, powerNoise: 0.09, cutMaxRad: 64 * DEG,
    middlePocketPenalty: 0.7, proactiveSafety: false, washRiskAvoid: false,
    randomPickTopN: 2, positionWeight: 0, lookahead: false, lookBonus: 0, lookPenalty: 0,
    thinkMs: 480, placeMs: 300, chargeViewMs: 360, breakPower: 0.78,
  },
  medium: {
    label: '中等', angleNoiseRad: 0.75 * DEG, powerNoise: 0.05, cutMaxRad: 58 * DEG,
    middlePocketPenalty: 1.0, proactiveSafety: true, washRiskAvoid: true,
    randomPickTopN: 1, positionWeight: 0.7, lookahead: false, lookBonus: 0, lookPenalty: 0,
    thinkMs: 640, placeMs: 400, chargeViewMs: 420, breakPower: 0.82,
  },
  hard: {
    label: '困难', angleNoiseRad: 0.25 * DEG, powerNoise: 0.025, cutMaxRad: 50 * DEG,
    middlePocketPenalty: 1.2, proactiveSafety: true, washRiskAvoid: true,
    randomPickTopN: 1, positionWeight: 1.6, lookahead: true, lookBonus: 14, lookPenalty: 6,
    thinkMs: 740, placeMs: 480, chargeViewMs: 450, breakPower: 0.84,
  },
  master: {
    label: '大师', angleNoiseRad: 0.08 * DEG, powerNoise: 0.011, cutMaxRad: 44 * DEG,
    middlePocketPenalty: 1.4, proactiveSafety: true, washRiskAvoid: true,
    randomPickTopN: 1, positionWeight: 2.6, lookahead: true, lookBonus: 22, lookPenalty: 9,
    thinkMs: 860, placeMs: 520, chargeViewMs: 520, breakPower: 0.86,
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
  whiteEnd: Vec;     // 白球估算落点
  scoreLk: number;   // 含前瞻的最终分值(用于排序)
  othersRef: Ball[]; // 该杆之后的合法目标集
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
  private lastUi: UiSnapshot | null = null;
  private scheduledUiKey = -1;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(eng: BilliardsEngine, index: number, isModalOpen: () => boolean) {
    this.eng = eng;
    this.index = index;
    this.isModalOpen = isModalOpen;
  }

  setEnabled(v: boolean) { this.enabled = v; }
  setDifficulty(d: AIDifficulty) { this.diff = d; }

  cancelPending() {
    this.clearTimers();
    this.scheduledUiKey = -1;
  }
  destroy() { this.cancelPending(); }

  /** 由 App 在每次引擎发射 UI 快照时调用 */
  maybeAct(ui: UiSnapshot) {
    this.lastUi = ui;
    if (!this.enabled) return;
    if (ui.turn !== this.index) return;
    if (ui.state !== 'place' && ui.state !== 'aim') return;
    if (this.isModalOpen()) return;
    if (ui.uiKey === this.scheduledUiKey) return;
    this.scheduledUiKey = ui.uiKey;
    this.clearTimers();
    if (ui.state === 'place') {
      this.timers.push(setTimeout(() => this.actPlace(), this.diff.placeMs));
    } else {
      this.timers.push(setTimeout(() => this.actShot(), this.diff.thinkMs));
    }
  }

  poke() {
    if (this.lastUi) {
      this.scheduledUiKey = -1;
      this.maybeAct(this.lastUi);
    }
  }

  private clearTimers() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
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

  /** 该杆进袋后的下一批合法目标(用于走位/前瞻) */
  othersAfter(t: Ball, legal: Ball[]): Ball[] {
    if (legal.length <= 1 || t.id === 8) return [];
    const others = legal.filter((o) => o.id !== t.id);
    const p = this.eng.players[this.eng.turn];
    if (p.group != null && others.length === 0) {
      // t 是最后一颗己方组球,下一杆即 8 号
      const eight = this.eng.balls.find((b) => b.id === 8);
      if (eight && eight.active && !eight.dead && !eight.sink) return [eight];
      return [];
    }
    return others;
  }

  /* ============ 候选进袋评估 ============ */
  evaluateShot(t: Ball, p: { x: number; y: number; r: number }, cx: number, cy: number, others: Ball[]): ShotEval | null {
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

    // 白球碰撞后走向:aim - (aim·D)*D(切线方向)
    const dot = aimx * Dx + aimy * Dy;
    let outx = aimx - dot * Dx, outy = aimy - dot * Dy;
    const om = Math.hypot(outx, outy);
    if (om > 1e-4) { outx /= om; outy /= om; }
    const vpost = (6 + power * 22) * Math.sin(cutRad) * BALL_REST;

    // 用一段积分模拟白球进袋后走向:既判洗袋,又得到落点
    let wx = gx, wy = gy, v = vpost, guard = 0, washRisk = false;
    if (om > 1e-4 && vpost > STOP_V * 1.5) {
      while (v > STOP_V && guard < 4000) {
        wx += outx * v; wy += outy * v;
        if (endpointNearPocket(wx, wy)) { washRisk = true; break; }
        v = v * FRICTION - 0.0075; guard++;
      }
    }
    const whiteEnd: Vec = { x: wx, y: wy };

    // 基础分(越小越好)
    const isMiddle = Math.abs(p.x - (L + R) / 2) < 1;
    let score = cutRad * 8 + totalDist * 0.012;
    if (isMiddle) score += this.diff.middlePocketPenalty * 4;
    if (blocked) score += 60;
    if (washRisk && this.diff.washRiskAvoid) score += 30;

    // 走位项:尽量落在离其它合法目标更近、且线路清空的位置
    if (this.diff.positionWeight > 0 && others.length > 0 && !blocked) {
      let minClear = Infinity, hasClear = false;
      for (const o of others) {
        if (!eng.segmentBlocked(whiteEnd.x, whiteEnd.y, o.x, o.y, new Set([0, o.id]))) {
          const dd = Math.hypot(o.x - whiteEnd.x, o.y - whiteEnd.y);
          if (dd < minClear) minClear = dd;
          hasClear = true;
        }
      }
      if (hasClear) score += this.diff.positionWeight * (minClear / 220);
      else score += this.diff.positionWeight * 4.5; // 落点对哪个目标都被挡,惩罚
    }

    return {
      target: t, pocket: p, aim: { x: aimx, y: aimy }, power,
      cutRad, totalDist, blocked, washRisk, score,
      whiteEnd, scoreLk: score, othersRef: others,
    };
  }

  /** 从落点出发,是否存在一个可进的下一杆(一步前瞻) */
  nextPotFrom(ext: Vec, others: Ball[]): boolean {
    for (const o of others) {
      if (this.eng.segmentBlocked(ext.x, ext.y, o.x, o.y, new Set([0, o.id]))) continue;
      for (const pp of POCKETS) {
        const ev = this.evaluateShot(o, pp, ext.x, ext.y, []);
        if (ev && !ev.blocked && !ev.washRisk) {
          return true;
        }
      }
    }
    return false;
  }

  /* ============ 出杆决策 ============ */
  planShot(): Plan | null {
    const eng = this.eng;
    const cue = eng.cue();
    if (!cue || !cue.active) return null;
    const legal = this.legalTargets();
    if (legal.length === 0) return null;

    // 收集所有可进袋候选(含走位分)
    const evals: ShotEval[] = [];
    for (const t of legal) {
      const others = this.othersAfter(t, legal);
      for (const p of POCKETS) {
        const ev = this.evaluateShot(t, p, cue.x, cue.y, others);
        if (ev) evals.push(ev);
      }
    }
    const feasible = evals.filter((e) => !e.blocked && (!e.washRisk || !this.diff.washRiskAvoid));
    if (feasible.length > 0) {
      // 一步前瞻:在最优前若干个里重新打分,有后续杆给奖励、没有给罚分
      let pool: ShotEval[];
      if (this.diff.lookahead) {
        feasible.sort((a, b) => a.score - b.score);
        pool = feasible.slice(0, Math.min(8, feasible.length));
        for (const ev of pool) {
          if (ev.othersRef.length > 0 && !ev.blocked) {
            if (this.nextPotFrom(ev.whiteEnd, ev.othersRef)) ev.scoreLk = ev.score - this.diff.lookBonus;
            else ev.scoreLk = ev.score + this.diff.lookPenalty;
          } else {
            ev.scoreLk = ev.score;
          }
        }
        pool.sort((a, b) => a.scoreLk - b.scoreLk);
      } else {
        feasible.sort((a, b) => a.score - b.score);
        pool = feasible;
      }

      let chosen: ShotEval;
      const n = Math.max(1, this.diff.randomPickTopN);
      const take = Math.min(n, pool.length);
      chosen = pool[Math.floor(Math.random() * take)];
      const aim = perturbAim(chosen.aim, this.diff.angleNoiseRad);
      const power = clamp(chosen.power + gaussian(this.diff.powerNoise), 0.28, 0.9);
      return { kind: 'pocket', aim, power };
    }

    // 无理想进袋候选:出安全球
    if (this.diff.proactiveSafety) {
      const safe = this.planSafety(legal);
      if (safe) return safe;
    }
    return this.fallbackTap(legal);
  }

  planSafety(legal: Ball[]): Plan | null {
    const eng = this.eng;
    const cue = eng.cue();
    if (!cue) return null;
    const cands: { t: Ball; aim: Vec; power: number; dist: number }[] = [];
    for (const t of legal) {
      if (eng.segmentBlocked(cue.x, cue.y, t.x, t.y, new Set([t.id, 0]))) continue;
      const ax = t.x - cue.x, ay = t.y - cue.y;
      const am = Math.hypot(ax, ay) || 1;
      const aimx = ax / am, aimy = ay / am;
      const power = 0.3;
      const vin = 6 + power * 22;
      const travel = simTravelDist(vin) * 0.85;
      const ex = t.x + aimx * travel, ey = t.y + aimy * travel;
      if (endpointNearPocket(ex, ey)) continue;
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
    let apex: Ball | null = null, best = 1e9;
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
    const legal = this.legalTargets();
    if (legal.length === 0) return null;

    const cands: { pos: Vec; score: number }[] = [];
    for (const t of legal) {
      const others = this.othersAfter(t, legal);
      for (const pocket of POCKETS) {
        const dpx = pocket.x - t.x, dpy = pocket.y - t.y;
        const dpm = Math.hypot(dpx, dpy) || 1;
        const Dx = dpx / dpm, Dy = dpy / dpm;
        for (const pad of [12, 26, 46]) {
          const cx = t.x - Dx * (2 * BALL_R + pad);
          const cy = t.y - Dy * (2 * BALL_R + pad);
          if (!eng.validPlace(cx, cy)) continue;
          const ev = this.evaluateShot(t, pocket, cx, cy, others);
          if (!ev || ev.blocked || ev.cutRad > this.diff.cutMaxRad) continue;
          if (this.diff.washRiskAvoid && ev.washRisk) continue;
          // 大师级摆放也计入前瞻:优先摆到能连杆的位置
          let s = ev.score;
          if (this.diff.lookahead && others.length > 0 && this.nextPotFrom(ev.whiteEnd, others)) {
            s -= this.diff.lookBonus;
          }
          cands.push({ pos: { x: cx, y: cy }, score: s });
          break;
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
    if (!this.enabled || this.isModalOpen() || eng.state !== 'place' || eng.turn !== this.index) {
      this.scheduledUiKey = -1;
      return;
    }
    this.scheduledUiKey = -1;
    let pos: Vec | null = null;
    if (!eng.breakShotFlag) pos = this.planPlacement();
    if (pos) eng.setPlaceVector(pos);
    this.timers.push(setTimeout(() => {
      if (!this.enabled || this.isModalOpen() || eng.state !== 'place' || eng.turn !== this.index) return;
      eng.placeCuePublic();
    }, 80));
  }

  private actShot() {
    const eng = this.eng;
    if (!this.enabled || this.isModalOpen() || eng.state !== 'aim' || eng.turn !== this.index) {
      this.scheduledUiKey = -1;
      return;
    }
    this.scheduledUiKey = -1;
    let plan: Plan | null;
    if (eng.breakShotFlag) plan = this.planBreak();
    else plan = this.planShot();
    if (!plan) plan = { kind: 'safety', aim: eng.aimDir, power: 0.4 };
    eng.setAimVector(plan.aim);
    eng.aiChargeFire(plan.power, this.diff.chargeViewMs);
  }
}