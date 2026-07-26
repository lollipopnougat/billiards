export type GameState = 'idle' | 'place' | 'aim' | 'charge' | 'strike' | 'rolling' | 'resolving' | 'over';
export type BallGroup = 'solid' | 'stripe' | null;

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  active: boolean;
  sink: { px: number; py: number; t: number } | null;
  dead: boolean;
}

export interface Shot {
  firstHit: number | null;
  pocketed: Ball[];
  cueScratched: boolean;
  wasOpen: boolean;
  wasOnEight: boolean;
}

export interface PlayerView {
  name: string;
  group: BallGroup;
}

export type StatusKind = 'info' | 'good' | 'foul';

export interface UiSnapshot {
  turn: number;
  state: GameState;
  scores: [number, number];
  breakShotFlag: boolean;
  players: [PlayerView, PlayerView];
  /** ballDead[id] = true 表示该球已落袋 */
  ballDead: boolean[];
  statusText: string;
  statusKind: StatusKind;
  /** 每次状态文本变化自增,用于触发 React 重渲染动画 */
  statusKey: number;
  /** 每次 UI 更新自增,用于驱动 turnText 的换入动画 */
  uiKey: number;
}

export interface WinInfo {
  winner: number;
  reason: string;
  scores: [number, number];
}

export interface EngineCallbacks {
  onUi: (snap: UiSnapshot) => void;
  onGameOver: (info: WinInfo) => void;
  onConfetti: () => void;
}