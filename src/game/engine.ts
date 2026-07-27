import {
  CW, CH, L, R, T, B, BALL_R, PLAY_W, PLAY_H, FRICTION, RAIL_REST, BALL_REST, STOP_V,
  HEAD_X, FOOT_X, MID_Y, POCKETS, BALL_COLORS, GROUP_NAME, groupOf, ballChar,
} from './constants';
import { audioFX } from './audio';
import type { Ball, GameState, PlayerView, Shot, StatusKind, UiSnapshot, EngineCallbacks, WinInfo } from './types';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface PartNoRing {
  ring?: false;
  x: number; y: number; vx: number; vy: number;
  life: number; decay: number; size: number; color: string;
}
interface PartRing {
  ring: true;
  x: number; y: number; life: number; decay: number;
}
type Part = PartNoRing | PartRing;

export class BilliardsEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr: number;
  tableLayer: HTMLCanvasElement;
  cb: EngineCallbacks;

  balls: Ball[] = [];
  parts: Part[] = [];
  state: GameState = 'idle';
  turn = 0;
  scores: [number, number] = [0, 0];
  lastStarter = 0;
  aimDir = { x: 1, y: 0 };
  mouse = { x: CW / 2, y: CH / 2 };
  downPos: { x: number; y: number } | null = null;
  power = 0;
  shotPower = 0;
  shot: Shot | null = null;
  breakShotFlag = false;
  kitchenOnly = false;
  guideOn = true;
  strikeT = 0;
  strikeFrom = 0;
  resolveTimer: ReturnType<typeof setTimeout> | null = null;
  aiChargeTimer: ReturnType<typeof setTimeout> | null = null;
  placePos = { x: HEAD_X - 80, y: MID_Y };
  players: [PlayerView, PlayerView] = [
    { name: '玩家一', group: null },
    { name: '玩家二', group: null },
  ];

  powerFillEl: HTMLDivElement;
  powerValEl: HTMLElement;
  isModalOpen: () => boolean;

  lastPow = -1;
  last = 0;
  statusText = '欢迎来到金杆台球馆';
  statusKind: StatusKind = 'info';
  statusKey = 0;
  uiKey = 0;
  raf = 0;

  constructor(opts: {
    canvas: HTMLCanvasElement;
    powerFill: HTMLDivElement;
    powerVal: HTMLElement;
    cb: EngineCallbacks;
    isModalOpen: () => boolean;
  }) {
    this.canvas = opts.canvas;
    this.powerFillEl = opts.powerFill;
    this.powerValEl = opts.powerVal;
    this.cb = opts.cb;
    this.isModalOpen = opts.isModalOpen;

    this.ctx = this.canvas.getContext('2d')!;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = CW * this.dpr;
    this.canvas.height = CH * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);

    this.tableLayer = document.createElement('canvas');
    this.tableLayer.width = CW * this.dpr;
    this.tableLayer.height = CH * this.dpr;
    this.paintTable();

    this.attach();
  }

  cue() { return this.balls[0]; }

  /* ================= 摆球 ================= */
  makeBall(id: number, x: number, y: number): Ball {
    return { id, x, y, vx: 0, vy: 0, r: BALL_R, rot: Math.random() * 6, active: true, sink: null, dead: false };
  }
  rack() {
    this.balls = [this.makeBall(0, 0, 0)];
    this.balls[0].active = false;
    const gap = BALL_R * 2 + 0.7, dx = gap * Math.cos(Math.PI / 6);
    const slots: { x: number; y: number }[] = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c <= r; c++) slots.push({ x: FOOT_X + r * dx, y: MID_Y + (c - r / 2) * gap });
    const solids = [1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5);
    const stripes = [9, 10, 11, 12, 13, 14, 15].sort(() => Math.random() - 0.5);
    const ids = new Array(15).fill(0);
    ids[4] = 8;
    if (Math.random() < 0.5) { ids[10] = solids.pop()!; ids[14] = stripes.pop()!; }
    else { ids[10] = stripes.pop()!; ids[14] = solids.pop()!; }
    const rest = solids.concat(stripes).sort(() => Math.random() - 0.5);
    let k = 0;
    for (let i = 0; i < 15; i++) if (!ids[i]) ids[i] = rest[k++];
    slots.forEach((s, i) => this.balls.push(this.makeBall(ids[i], s.x, s.y)));
  }

  /* ================= 工具 ================= */
  remaining(g: 'solid' | 'stripe') {
    return this.balls.filter(b => b.active && !b.sink && !b.dead && groupOf(b.id) === g).length;
  }
  isOnEight(p: PlayerView): boolean {
    return !!p.group && this.remaining(p.group) === 0;
  }

  /* ================= 静态球台图层(离屏) ================= */
  paintTable() {
    const c = this.tableLayer.getContext('2d')!;
    c.scale(this.dpr, this.dpr);
    const roundRect = (cx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r);
      cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
    };
    // 木质外框
    let g = c.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, '#7d5633'); g.addColorStop(0.5, '#5a3b22'); g.addColorStop(1, '#3a2513');
    c.fillStyle = g; roundRect(c, 0, 0, CW, CH, 24); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 3; roundRect(c, 1.5, 1.5, CW - 3, CH - 3, 23); c.stroke();
    c.strokeStyle = 'rgba(255,220,160,.14)'; c.lineWidth = 1.5; roundRect(c, 5, 5, CW - 10, CH - 10, 20); c.stroke();
    // 木纹
    c.strokeStyle = 'rgba(0,0,0,.08)'; c.lineWidth = 1;
    for (let i = 0; i < 26; i++) { c.beginPath(); const y = Math.random() * CH; c.moveTo(0, y);
      c.bezierCurveTo(CW * 0.3, y + (Math.random() * 14 - 7), CW * 0.7, y + (Math.random() * 14 - 7), CW, y + (Math.random() * 10 - 5)); c.stroke(); }
    // 库边橡胶
    const cush = (pts: number[][]) => {
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath();
      const y1 = Math.min(...pts.map(p => p[1])), y2 = Math.max(...pts.map(p => p[1]));
      const x1 = Math.min(...pts.map(p => p[0])), x2 = Math.max(...pts.map(p => p[0]));
      const gr = (x2 - x1 < 20) ? c.createLinearGradient(x1, 0, x2, 0) : c.createLinearGradient(0, y1, 0, y2);
      gr.addColorStop(0, '#0c6a40'); gr.addColorStop(1, '#084a2c');
      c.fillStyle = gr; c.fill(); c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.stroke();
    };
    const cx = (L + R) / 2;
    cush([[L + 26, 30], [cx - 28, 30], [cx - 14, 48], [L + 42, 48]]);
    cush([[cx + 28, 30], [R - 26, 30], [R - 42, 48], [cx + 14, 48]]);
    cush([[L + 26, 506], [cx - 28, 506], [cx - 14, 488], [L + 42, 488]]);
    cush([[cx + 28, 506], [R - 26, 506], [R - 42, 488], [cx + 14, 488]]);
    cush([[30, T + 26], [30, B - 26], [48, B - 42], [48, T + 42]]);
    cush([[946, T + 26], [946, B - 26], [928, B - 42], [928, T + 42]]);
    // 台呢
    g = c.createRadialGradient(cx, MID_Y, 60, cx, MID_Y, 560);
    g.addColorStop(0, '#12884f'); g.addColorStop(0.65, '#0d6b41'); g.addColorStop(1, '#085231');
    c.fillStyle = g; c.fillRect(L, T, PLAY_W, PLAY_H);
    // 台呢绒毛噪点
    for (let i = 0; i < 420; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.012)' : 'rgba(0,0,0,.02)';
      c.fillRect(L + Math.random() * PLAY_W, T + Math.random() * PLAY_H, 1.4, 1.4);
    }
    // 灯光椭圆
    g = c.createRadialGradient(cx, 170, 20, cx, 170, 420);
    g.addColorStop(0, 'rgba(255,240,200,.10)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = g; c.fillRect(L, T, PLAY_W, PLAY_H);
    // 开球线 & 置球点
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(HEAD_X, T); c.lineTo(HEAD_X, B); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.16)'; c.beginPath(); c.arc(FOOT_X, MID_Y, 2.6, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 2; c.strokeRect(L, T, PLAY_W, PLAY_H);
    // 袋口
    for (const p of POCKETS) {
      c.fillStyle = '#241209'; c.beginPath(); c.arc(p.x, p.y, p.r + 6, 0, 7); c.fill();
      const pg = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r + 2);
      pg.addColorStop(0, '#000'); pg.addColorStop(0.8, '#0a0603'); pg.addColorStop(1, '#1c0f06');
      c.fillStyle = pg; c.beginPath(); c.arc(p.x, p.y, p.r + 2, 0, 7); c.fill();
      c.strokeStyle = 'rgba(202,161,92,.5)'; c.lineWidth = 2.4;
      c.beginPath(); c.arc(p.x, p.y, p.r + 4, Math.PI * 0.75, Math.PI * 2.25); c.stroke();
    }
    // 木框铜菱形准星
    c.fillStyle = '#e8c87e';
    const dia = (x: number, y: number) => {
      c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
      c.shadowColor = 'rgba(240,200,120,.8)'; c.shadowBlur = 4; c.fillRect(-3, -3, 6, 6); c.restore();
    };
    for (let k = 1; k <= 7; k++) { if (k === 4) continue; const x = L + PLAY_W * k / 8; dia(x, 13); dia(x, CH - 13); }
    [1, 2, 3].forEach(k => { const y = T + PLAY_H * k / 4; dia(13, y); dia(CW - 13, y); });
  }

  /* ================= 粒子 ================= */
  spark(x: number, y: number, n: number, color: string, sp: number) {
    for (let i = 0; i < n; i++) this.parts.push({
      x, y, vx: (Math.random() - 0.5) * sp * 2.4, vy: (Math.random() - 0.5) * sp * 2.4,
      life: 1, decay: 0.03 + Math.random() * 0.035, size: 1 + Math.random() * 1.8, color,
    });
  }
  ringFx(x: number, y: number) { this.parts.push({ ring: true, x, y, life: 1, decay: 0.05 }); }
  updateParts(dtf: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= p.decay * dtf;
      if (!p.ring) { p.x += p.vx * dtf; p.y += p.vy * dtf; p.vx *= 0.94; p.vy *= 0.94; }
      if (p.life <= 0) this.parts.splice(i, 1);
    }
  }
  drawParts() {
    const ctx = this.ctx;
    for (const p of this.parts) {
      if (p.ring) {
        ctx.strokeStyle = `rgba(255,220,150,${p.life * 0.5})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, (1 - p.life) * 26 + 6, 0, 7); ctx.stroke();
      } else {
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
  }

  /* ================= 物理 ================= */
  sinkBall(b: Ball, p: { x: number; y: number }) {
    b.sink = { px: p.x, py: p.y, t: 0 }; b.vx *= 0.2; b.vy *= 0.2;
    audioFX.pocket(); this.ringFx(p.x, p.y);
    if (this.shot) { if (b.id === 0) this.shot.cueScratched = true; else this.shot.pocketed.push(b); }
  }
  pocketCheck(b: Ball) {
    for (const p of POCKETS) if (Math.hypot(b.x - p.x, b.y - p.y) < p.r + 1.5) { this.sinkBall(b, p); return; }
  }
  nearMouth(x: number, y: number) {
    for (const p of POCKETS) if (Math.hypot(p.x - x, p.y - y) < p.r + 13) return true;
    return false;
  }
  cushion(b: Ball) {
    let hit = false;
    if (b.x < L + b.r && b.vx < 0 && !this.nearMouth(b.x, b.y)) { b.x = L + b.r; b.vx = -b.vx * RAIL_REST; b.vy *= 0.985; hit = true; }
    if (b.x > R - b.r && b.vx > 0 && !this.nearMouth(b.x, b.y)) { b.x = R - b.r; b.vx = -b.vx * RAIL_REST; b.vy *= 0.985; hit = true; }
    if (b.y < T + b.r && b.vy < 0 && !this.nearMouth(b.x, b.y)) { b.y = T + b.r; b.vy = -b.vy * RAIL_REST; b.vx *= 0.985; hit = true; }
    if (b.y > B - b.r && b.vy > 0 && !this.nearMouth(b.x, b.y)) { b.y = B - b.r; b.vy = -b.vy * RAIL_REST; b.vx *= 0.985; hit = true; }
    if (hit && Math.hypot(b.vx, b.vy) > 1.2) audioFX.rail();
    if (b.x < L - 10 || b.x > R + 10 || b.y < T - 10 || b.y > B + 10) {
      let np = POCKETS[0], bd = 1e9;
      for (const p of POCKETS) { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; np = p; } }
      this.sinkBall(b, np);
    }
  }
  collide(a: Ball, b: Ball) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
    if (d >= min || d === 0) return;
    const nx = dx / d, ny = dy / d, ov = (min - d) / 2;
    a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
    const rv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rv > 0) {
      const j = rv * (1 + BALL_REST) / 2;
      a.vx -= j * nx; a.vy -= j * ny; b.vx += j * nx; b.vy += j * ny;
      if (this.shot && this.shot.firstHit == null && (a.id === 0 || b.id === 0)) this.shot.firstHit = a.id === 0 ? b.id : a.id;
      if (rv > 0.5) {
        audioFX.clack(Math.min(1, rv / 14));
        if (rv > 3) this.spark((a.x + b.x) / 2, (a.y + b.y) / 2, Math.min(6, rv | 0), '#ffe9c0', 2);
      }
    }
  }
  physics(dtf: number) {
    const n = 4;
    for (let s = 0; s < n; s++) {
      const act = this.balls.filter(b => b.active && !b.dead && !b.sink);
      for (const b of act) { b.x += b.vx * dtf / n; b.y += b.vy * dtf / n; b.rot += Math.hypot(b.vx, b.vy) * 0.005 * dtf / n; }
      for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) this.collide(act[i], act[j]);
      for (const b of act) { this.pocketCheck(b); if (!b.sink) this.cushion(b); }
    }
    for (const b of this.balls) {
      if (!b.active || b.sink) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        let ns = sp * Math.pow(FRICTION, dtf) - 0.0075 * dtf;
        if (ns < STOP_V) ns = 0;
        const f = ns / sp; b.vx *= f; b.vy *= f;
      }
    }
    for (const b of this.balls) {
      if (b.sink) {
        b.sink.t += dtf * 0.075;
        b.x += (b.sink.px - b.x) * 0.22 * dtf; b.y += (b.sink.py - b.y) * 0.22 * dtf;
        if (b.sink.t >= 1) { b.dead = true; b.active = false; b.sink = null; }
      }
    }
  }
  allStopped() {
    for (const b of this.balls) {
      if (b.sink) return false;
      if (b.active && (b.vx !== 0 || b.vy !== 0)) return false;
    }
    return true;
  }

  /* ================= 回合规则 ================= */
  beginPlacement(kitchen: boolean) {
    const c = this.cue(); c.active = false; c.dead = false; c.sink = null; c.vx = c.vy = 0;
    this.kitchenOnly = kitchen; this.state = 'place';
    this.placePos = { x: HEAD_X - 80, y: MID_Y };
    this.canvas.classList.add('placing'); this.updateUI();
  }
  resolveShot() {
    const s = this.shot; this.shot = null;
    if (!s) return;
    const turn = this.turn;
    const shooter = this.players[turn], opp = this.players[1 - turn];
    const potted = s.pocketed, nonEight = potted.filter(b => b.id !== 8);
    const eightPotted = potted.some(b => b.id === 8), cuePotted = s.cueScratched;
    const wasBreak = this.breakShotFlag; this.breakShotFlag = false;

    if (wasBreak && eightPotted) {
      this.setStatus('开球打进8号球!重新摆球,' + shooter.name + ' 重新开球', 'info');
      this.state = 'over'; this.updateUI();
      setTimeout(() => this.newGame(turn), 1300); return;
    }
    let foul: string | null = null;
    if (cuePotted) foul = '白球洗袋';
    else if (s.firstHit == null) foul = '空杆,未触碰任何球';
    else if (!s.wasOpen) {
      if (s.wasOnEight) { if (s.firstHit !== 8) foul = '应先击打8号球'; }
      else { const g = groupOf(s.firstHit); if (g !== shooter.group) foul = (g === 'eight') ? '先击打了8号球' : '先击打了对方球组'; }
    } else { if (s.firstHit === 8) foul = '开放球局不能先击打8号球'; }

    if (eightPotted && !wasBreak) {
      if (cuePotted) { this.gameOver(1 - turn, shooter.name + ' 打进8号球的同时洗袋'); return; }
      if (foul) { this.gameOver(1 - turn, shooter.name + ' 打8号球时犯规(' + foul + ')'); return; }
      if (!s.wasOnEight) { this.gameOver(1 - turn, shooter.name + ' 过早打进8号球'); return; }
      this.gameOver(turn, '漂亮!合法打进8号球,赢得比赛!'); return;
    }
    let assigned = false;
    if (s.wasOpen && !wasBreak && !foul && nonEight.length > 0) {
      const g = groupOf(nonEight[0].id) as 'solid' | 'stripe';
      shooter.group = g; opp.group = (g === 'solid') ? 'stripe' : 'solid'; assigned = true;
    }
    let cont = false;
    if (!foul) {
      if (assigned) cont = true;
      else if (!s.wasOpen && nonEmpty(nonEight, shooter.group)) cont = true;
      else if (wasBreak && nonEight.length > 0) cont = true;
    }
    const chars = nonEight.map(b => ballChar(b.id)).join('');
    if (foul) {
      this.setStatus('犯规:' + foul + '!' + opp.name + ' 获自由球,点击球台放置白球', 'foul');
      audioFX.foul(); this.turn = 1 - turn; this.beginPlacement(false); return;
    }
    if (assigned) {
      this.setStatus(shooter.name + ' 打进 ' + chars + ',选定' + GROUP_NAME[shooter.group!] + '!继续出杆', 'good');
    } else if (cont) {
      this.setStatus(shooter.name + ' 打进 ' + chars + ',继续出杆', 'good');
    } else {
      this.setStatus('换 ' + opp.name + ' 出杆', 'info'); this.turn = 1 - turn;
    }
    if (!foul && cont && this.isOnEight(shooter)) this.setStatus(shooter.name + ' 已清空球组,🎯 目标8号球!', 'good');
    this.state = 'aim'; this.updateUI();
  }
  gameOver(winner: number, reason: string) {
    this.state = 'over';
    this.scores[winner]++;
    const info: WinInfo = { winner, reason, scores: [...this.scores] as [number, number] };
    audioFX.win();
    this.cb.onConfetti();
    this.updateUI();
    setTimeout(() => this.cb.onGameOver(info), 650);
  }
  newGame(starter: number) {
    if (this.resolveTimer) clearTimeout(this.resolveTimer);
    if (this.aiChargeTimer) { clearTimeout(this.aiChargeTimer); this.aiChargeTimer = null; }
    this.players.forEach(p => { p.group = null; });
    this.rack(); this.parts.length = 0; this.shot = null; this.power = 0;
    this.turn = starter; this.lastStarter = starter; this.breakShotFlag = true;
    this.beginPlacement(true);
    this.setStatus(this.players[this.turn].name + ' 开球!在左侧厨房区点击放置白球', 'info');
    this.updateUI();
  }

  /* ================= 交互 ================= */
  toCanvas(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * CW / r.width, y: (e.clientY - r.top) * CH / r.height };
  }
  setAim() {
    const c = this.cue(); const dx = this.mouse.x - c.x, dy = this.mouse.y - c.y, d = Math.hypot(dx, dy);
    if (d > 4) this.aimDir = { x: dx / d, y: dy / d };
  }
  validPlace(x: number, y: number) {
    if (x < L + BALL_R || x > R - BALL_R || y < T + BALL_R || y > B - BALL_R) return false;
    if (this.kitchenOnly && x > HEAD_X - BALL_R) return false;
    for (const b of this.balls) { if (!b.active || b.id === 0 || b.dead) continue; if (Math.hypot(b.x - x, b.y - y) < BALL_R * 2 + 1) return false; }
    return true;
  }
  placeCue() {
    const c = this.cue(); c.x = this.placePos.x; c.y = this.placePos.y; c.vx = c.vy = 0;
    c.active = true; c.dead = false; c.sink = null;
    this.state = 'aim'; this.canvas.classList.remove('placing'); audioFX.place();
    this.setStatus(this.breakShotFlag ? this.players[this.turn].name + ' 开球!向后拖拽白球蓄力击出' : this.players[this.turn].name + ' 已放置白球,请出杆', 'info');
    this.updateUI();
  }
  startStrike() {
    this.state = 'strike'; this.strikeFrom = 10 + this.power * 78; this.strikeT = 0; this.shotPower = this.power;
    this.shot = {
      firstHit: null, pocketed: [], cueScratched: false,
      wasOpen: this.players[0].group == null, wasOnEight: this.isOnEight(this.players[this.turn]),
    };
  }
  shoot() {
    const c = this.cue(), sp = 6 + this.shotPower * 22;
    c.vx = this.aimDir.x * sp; c.vy = this.aimDir.y * sp;
    this.state = 'rolling'; audioFX.cueHit(Math.min(1, this.shotPower + 0.3));
    this.spark(c.x + this.aimDir.x * c.r, c.y + this.aimDir.y * c.r, 3, '#ffe2a8', 1.6);
    this.power = 0; this.updateUI();
  }

  touchActive = false;   // 当前是否处于一次触屏拖拽中
  private clampPlace(x: number, y: number) {
    return {
      x: clamp(x, L + BALL_R, this.kitchenOnly ? HEAD_X - BALL_R : R - BALL_R),
      y: clamp(y, T + BALL_R, B - BALL_R),
    };
  }
  onPointerMove = (e: PointerEvent) => {
    this.mouse = this.toCanvas(e);
    const isTouch = e.pointerType === 'touch';
    if (this.state === 'aim') {
      // 桌面:鼠标悬停瞄准;触屏无悬停,aim 态不靠移动改动瞄準
      if (!isTouch) this.setAim();
    } else if (this.state === 'charge' && this.downPos) {
      const dd = Math.hypot(this.mouse.x - this.downPos.x, this.mouse.y - this.downPos.y);
      if (isTouch) {
        // 触屏:拖拽同时驶向击球方向(白球=>手指)定瞄準,拖远则力度增大;
        // 小幅度拖拽不改瞄準,避免点一下就偏方向
        if (dd > 10) this.setAim();
        this.power = clamp((dd - 8) / 150, 0, 1);
      } else {
        this.power = clamp((dd - 8) / 150, 0, 1);
      }
    } else if (this.state === 'place') {
      // 桌面:鼠标移动即可移动幽灵球;触屏:拖动时跟随手指(松手才确认)
      if (!isTouch || this.touchActive) this.placePos = this.clampPlace(this.mouse.x, this.mouse.y);
    }
  };
  onPointerDown = (e: PointerEvent) => {
    audioFX.init();
    if (this.isModalOpen()) return;
    const isTouch = e.pointerType === 'touch';
    this.canvas.setPointerCapture(e.pointerId);
    this.mouse = this.toCanvas(e);
    if (isTouch) this.touchActive = true;
    if (this.state === 'aim' && this.cue().active) {
      this.downPos = this.mouse; this.power = 0; this.state = 'charge';
      // 桌面:按下时再确认一次瞄準(原行为);触屏:不立即改方向,留待拖拽
      if (!isTouch) this.setAim();
    } else if (this.state === 'place') {
      if (isTouch) {
        // 触屏:触摸点作为幽灵球起点,随后可拖动微调,松手确认
        this.placePos = this.clampPlace(this.mouse.x, this.mouse.y);
      } else if (this.validPlace(this.placePos.x, this.placePos.y)) {
        this.placeCue();
      } else {
        audioFX.foul(); this.setStatus('此处不能放置白球,请换个位置', 'foul');
      }
    }
  };
  onPointerUp = (e: PointerEvent) => {
    const isTouch = e.pointerType === 'touch';
    if (isTouch) this.touchActive = false;
    // 仅人类蓄力(state==='charge' 且 downPos 已由 pointerdown 置位)响应 pointerup;
    // AI 蓄力(downPos==null)由 aiChargeFire 内部定时器接管,这里要避免抢断。
    if (this.state === 'charge' && this.downPos) {
      if (this.power > 0.05) this.startStrike(); else { this.state = 'aim'; this.power = 0; }
    } else if (isTouch && this.state === 'place') {
      // 触屏摆放:松手时确认;非法则提示,可继续拖动重试
      if (this.validPlace(this.placePos.x, this.placePos.y)) this.placeCue();
      else { audioFX.foul(); this.setStatus('此处不能放置白球,请换个位置', 'foul'); }
    }
  };
  onLostCapture = (e: PointerEvent) => {
    const isTouch = e.pointerType === 'touch';
    this.touchActive = false;
    if (this.state === 'charge' && this.downPos) { this.state = 'aim'; this.power = 0; }
    void isTouch;
  };

  attach() {
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('lostpointercapture', this.onLostCapture);
  }
  detach() {
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('lostpointercapture', this.onLostCapture);
  }

  /* ================= 绘制 ================= */
  shade(hex: string, amt: number) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
    return `rgb(${r},${g},${b})`;
  }
  drawShadow(b: Ball) {
    const ctx = this.ctx;
    const sc = b.sink ? Math.max(0.12, 1 - b.sink.t) : 1;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(b.x + 2.5, b.y + 3.8, b.r * 1.05 * sc, b.r * 0.55 * sc, 0, 0, 7); ctx.fill();
  }
  drawBall(b: Ball) {
    const ctx = this.ctx;
    const sc = b.sink ? Math.max(0.12, 1 - b.sink.t) : 1;
    const al = b.sink ? Math.max(0, 1 - b.sink.t * 1.15) : 1;
    const r = b.r * sc;
    ctx.save(); ctx.globalAlpha = al; ctx.translate(b.x, b.y);
    if (b.id === 0) {
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.75, '#efe9da'); g.addColorStop(1, '#c4b99f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    } else if (b.id <= 8) {
      const col = BALL_COLORS[b.id];
      const g = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.15, 0, 0, r);
      g.addColorStop(0, this.shade(col, 70)); g.addColorStop(0.55, col); g.addColorStop(1, this.shade(col, -62));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    } else {
      const col = BALL_COLORS[b.id - 8];
      const g = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.15, 0, 0, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#f0ead9'); g.addColorStop(1, '#bfb49a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.clip();
      ctx.rotate(b.rot); ctx.fillStyle = col; ctx.fillRect(-r, -r * 0.5, 2 * r, r); ctx.restore();
    }
    if (b.id > 0) {
      ctx.fillStyle = '#f7f3e6'; ctx.beginPath(); ctx.arc(0, 0, r * 0.46, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = '#231a10'; ctx.font = '700 ' + Math.max(5, r * 0.62) + 'px "Noto Sans SC"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(b.id), 0, 0.5);
    }
    const h = ctx.createRadialGradient(-r * 0.42, -r * 0.46, 0, -r * 0.42, -r * 0.46, r * 0.34);
    h.addColorStop(0, 'rgba(255,255,255,.9)'); h.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = h; ctx.beginPath(); ctx.arc(-r * 0.42, -r * 0.46, r * 0.34, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.restore();
  }
  castRay() {
    const c = this.cue();
    let best = 1e9, hit: Ball | null = null;
    for (const b of this.balls) {
      if (!b.active || b.sink || b.dead || b.id === 0) continue;
      const ox = b.x - c.x, oy = b.y - c.y, proj = ox * this.aimDir.x + oy * this.aimDir.y;
      if (proj <= 0) continue;
      const per2 = ox * ox + oy * oy - proj * proj, rr = (BALL_R * 2) * (BALL_R * 2);
      if (per2 > rr) continue;
      const t = proj - Math.sqrt(rr - per2);
      if (t > 0 && t < best) { best = t; hit = b; }
    }
    let tw = 1e9;
    if (this.aimDir.x > 1e-6) tw = Math.min(tw, (R - BALL_R - c.x) / this.aimDir.x);
    if (this.aimDir.x < -1e-6) tw = Math.min(tw, (L + BALL_R - c.x) / this.aimDir.x);
    if (this.aimDir.y > 1e-6) tw = Math.min(tw, (B - BALL_R - c.y) / this.aimDir.y);
    if (this.aimDir.y < -1e-6) tw = Math.min(tw, (T + BALL_R - c.y) / this.aimDir.y);
    const tEnd = Math.min(best, tw);
    return { gx: c.x + this.aimDir.x * tEnd, gy: c.y + this.aimDir.y * tEnd, hit: best < tw ? hit : null };
  }
  drawGuide() {
    if (!this.guideOn) return;
    const ctx = this.ctx;
    const c = this.cue(), ray = this.castRay();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.6; ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.moveTo(c.x + this.aimDir.x * c.r, c.y + this.aimDir.y * c.r); ctx.lineTo(ray.gx, ray.gy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.beginPath(); ctx.arc(ray.gx, ray.gy, BALL_R, 0, 7); ctx.stroke();
    if (ray.hit) {
      const hx = ray.hit.x, hy = ray.hit.y;
      let nx = hx - ray.gx, ny = hy - ray.gy; const nd = Math.hypot(nx, ny) || 1; nx /= nd; ny /= nd;
      ctx.strokeStyle = 'rgba(255,224,150,.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + nx * 46, hy + ny * 46); ctx.stroke();
      ctx.fillStyle = 'rgba(255,224,150,.85)';
      ctx.beginPath(); ctx.moveTo(hx + nx * 52, hy + ny * 52);
      ctx.lineTo(hx + nx * 42 - ny * 4, hy + ny * 42 + nx * 4); ctx.lineTo(hx + nx * 42 + ny * 4, hy + ny * 42 - nx * 4); ctx.fill();
      const dot = this.aimDir.x * nx + this.aimDir.y * ny;
      let tx = this.aimDir.x - dot * nx, ty = this.aimDir.y - dot * ny; const td = Math.hypot(tx, ty);
      if (td > 0.05) { tx /= td; ty /= td;
        ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ray.gx, ray.gy); ctx.lineTo(ray.gx + tx * 30, ray.gy + ty * 30); ctx.stroke(); }
    }
    ctx.restore();
  }
  drawCueStick(now: number) {
    const ctx = this.ctx;
    const c = this.cue(); if (!c.active) return;
    const ang = Math.atan2(this.aimDir.y, this.aimDir.x);
    let pull;
    if (this.state === 'strike') { const k = Math.min(1, this.strikeT / 90), e = k * (2 - k); pull = this.strikeFrom + (-6 - this.strikeFrom) * e; }
    else if (this.state === 'charge') pull = 10 + this.power * 78;
    else pull = 12 + Math.sin(now * 0.003) * 2;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ang + Math.PI);
    const gap = c.r + 5 + Math.max(pull, -4), len = 250;
    const g = ctx.createLinearGradient(gap, 0, gap + len, 0);
    g.addColorStop(0, '#f1e6c8'); g.addColorStop(0.05, '#e6cfa0'); g.addColorStop(0.35, '#d9a869');
    g.addColorStop(0.7, '#8a5a2c'); g.addColorStop(0.74, '#241407'); g.addColorStop(0.78, '#caa15c');
    g.addColorStop(0.85, '#3c2410'); g.addColorStop(1, '#2a1808');
    ctx.beginPath(); ctx.moveTo(gap, -2.5); ctx.lineTo(gap + len, -5.5);
    ctx.lineTo(gap + len, 5.5); ctx.lineTo(gap, 2.5); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#3e6ea8'; ctx.fillRect(gap - 3.5, -2.4, 4, 4.8);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gap + 6, -1.6); ctx.lineTo(gap + len - 6, -3.6); ctx.stroke();
    ctx.restore();
  }
  drawPlacementGhost() {
    const ctx = this.ctx;
    const ok = this.validPlace(this.placePos.x, this.placePos.y);
    ctx.save(); ctx.globalAlpha = 0.55;
    const g = ctx.createRadialGradient(this.placePos.x - 4, this.placePos.y - 4, 2, this.placePos.x, this.placePos.y, BALL_R);
    g.addColorStop(0, '#fff'); g.addColorStop(1, '#cfc4aa');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.placePos.x, this.placePos.y, BALL_R, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? '#77e0a0' : '#ff7a66'; ctx.lineWidth = 2.4;
    ctx.setLineDash(ok ? [] : [4, 4]);
    ctx.beginPath(); ctx.arc(this.placePos.x, this.placePos.y, BALL_R + 5, 0, 7); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }
  drawKitchen() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,235,190,.05)'; ctx.fillRect(L, T, HEAD_X - L, PLAY_H);
    ctx.strokeStyle = 'rgba(255,240,200,.2)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(HEAD_X, T); ctx.lineTo(HEAD_X, B); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,240,200,.28)';
    ctx.font = '16px "ZCOOL QingKe HuangYou"'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('厨 房 区', L + 14, T + 12);
  }
  draw(now: number) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CW, CH);
    ctx.drawImage(this.tableLayer, 0, 0, CW, CH);
    if (this.kitchenOnly && this.state === 'place') this.drawKitchen();
    const list = this.balls.filter(b => !b.dead && (b.active || b.sink));
    for (const b of list) this.drawShadow(b);
    for (const b of list) this.drawBall(b);
    this.drawParts();
    if ((this.state === 'aim' || this.state === 'charge') && this.cue().active) this.drawGuide();
    if (this.state === 'aim' || this.state === 'charge' || this.state === 'strike') this.drawCueStick(now);
    if (this.state === 'place') this.drawPlacementGhost();
  }

  /* ================= UI 快照 ================= */
  updatePowerUI() {
    const p = this.state === 'charge' ? this.power : 0;
    if (p === this.lastPow) return; this.lastPow = p;
    this.powerFillEl.style.width = (p * 100).toFixed(1) + '%';
    this.powerValEl.textContent = Math.round(p * 100) + '%';
    this.powerFillEl.classList.toggle('hot', p > 0.72);
  }
  setStatus(text: string, kind: StatusKind) {
    this.statusText = text;
    this.statusKind = kind;
    this.statusKey++;
    this.emitUi();
  }
  buildSnapshot(): UiSnapshot {
    const ballDead: boolean[] = new Array(16).fill(false);
    for (const b of this.balls) if (b.id >= 0 && b.id <= 15) ballDead[b.id] = b.dead;
    return {
      turn: this.turn,
      state: this.state,
      scores: [...this.scores] as [number, number],
      breakShotFlag: this.breakShotFlag,
      players: [{ name: this.players[0].name, group: this.players[0].group }, { name: this.players[1].name, group: this.players[1].group }] as [PlayerView, PlayerView],
      ballDead,
      statusText: this.statusText,
      statusKind: this.statusKind,
      statusKey: this.statusKey,
      uiKey: this.uiKey,
    };
  }
  emitUi() {
    this.uiKey++;
    this.cb.onUi(this.buildSnapshot());
  }
  updateUI() { this.emitUi(); }

  /* ================= 外部按钮 ================= */
  setGuide(on: boolean) { this.guideOn = on; }
  setSound(on: boolean) { audioFX.enabled = on; }
  restart() { this.newGame(1 - this.lastStarter); }

  /* ================= AI 接口 ================= */
  /** 检测线段 (x1,y1)->(x2,y2) 是否被其它活球遮挡;excludeIds 中的球忽略 */
  segmentBlocked(x1: number, y1: number, x2: number, y2: number, excludeIds: Set<number>): boolean {
    const ddx = x2 - x1, ddy = y2 - y1;
    const segLen2 = ddx * ddx + ddy * ddy;
    if (segLen2 < 1e-6) return false;
    for (const b of this.balls) {
      if (!b.active || b.sink || b.dead) continue;
      if (excludeIds.has(b.id)) continue;
      const px = b.x - x1, py = b.y - y1;
      const t = (px * ddx + py * ddy) / segLen2;
      if (t < 0 || t > 1) continue;
      const cx = x1 + t * ddx, cy = y1 + t * ddy;
      const dist2 = (b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy);
      const limit = (BALL_R * 2);
      if (dist2 < limit * limit) return true;
    }
    return false;
  }
  /** 直接设定瞄准方向(不依赖鼠标),供 AI 使用 */
  setAimVector(dir: { x: number; y: number }) {
    const m = Math.hypot(dir.x, dir.y) || 1;
    this.aimDir = { x: dir.x / m, y: dir.y / m };
  }
  /** 设定白球摆放位置(供 AI 在 place 状态调用),随后由 AI 调用 placeCuePublic() */
  setPlaceVector(pos: { x: number; y: number }) { this.placePos = { x: pos.x, y: pos.y }; }
  /** AI 调用摆放确认 */
  placeCuePublic() { this.placeCue(); }
  /** AI 调用:走同一条 charge→strike→shoot 动画链 */
  aiChargeFire(power: number, chargeViewMs: number) {
    if (this.state !== 'aim') return;
    this.power = clamp(power, 0, 1);
    this.state = 'charge';
    this.lastPow = -1; // 强制刷新力度条
    if (this.aiChargeTimer) clearTimeout(this.aiChargeTimer);
    this.aiChargeTimer = setTimeout(() => this.startStrike(), chargeViewMs);
  }

  /* ================= 主循环 ================= */
  loop = (now: number) => {
    const dt = Math.min(40, now - this.last); this.last = now;
    const dtf = dt / 16.667;
    if (this.state === 'strike') { this.strikeT += dt; if (this.strikeT >= 90) this.shoot(); }
    if (this.state === 'rolling') this.physics(dtf);
    if (this.state === 'rolling' && this.allStopped()) {
      this.state = 'resolving';
      this.resolveTimer = setTimeout(() => this.resolveShot(), 420);
    }
    this.updateParts(dtf);
    this.draw(now);
    this.updatePowerUI();
    this.raf = requestAnimationFrame(this.loop);
  };

  start() {
    this.last = performance.now();
    this.newGame(0);
    this.raf = requestAnimationFrame(this.loop);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    if (this.resolveTimer) clearTimeout(this.resolveTimer);
    if (this.aiChargeTimer) clearTimeout(this.aiChargeTimer);
    this.detach();
  }
}

function nonEmpty(nonEight: Ball[], group: 'solid' | 'stripe' | null) {
  return nonEight.some(b => groupOf(b.id) === group);
}
