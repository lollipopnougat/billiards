/* ================= 几何与物理常量 ================= */
export const WOOD = 26, CUSH = 22, BORDER = WOOD + CUSH;
export const PLAY_W = 880, PLAY_H = 440;
export const CW = PLAY_W + BORDER * 2, CH = PLAY_H + BORDER * 2;
export const L = BORDER, R = BORDER + PLAY_W, T = BORDER, B = BORDER + PLAY_H;
export const BALL_R = 11.5;
export const FRICTION = 0.985, RAIL_REST = 0.72, BALL_REST = 0.965, STOP_V = 0.03;
export const HEAD_X = L + PLAY_W * 0.25, FOOT_X = L + PLAY_W * 0.75, MID_Y = T + PLAY_H / 2;

export interface Pocket { x: number; y: number; r: number; }
export const POCKETS: Pocket[] = [
  { x: L - 4, y: T - 4, r: 22 }, { x: (L + R) / 2, y: T - 7, r: 20 }, { x: R + 4, y: T - 4, r: 22 },
  { x: L - 4, y: B + 4, r: 22 }, { x: (L + R) / 2, y: B + 7, r: 20 }, { x: R + 4, y: B + 4, r: 22 },
];

export const BALL_COLORS: Record<number, string> = {
  1: '#f2c230', 2: '#2e63c9', 3: '#dd3a2c', 4: '#7d41b5',
  5: '#ef7d1a', 6: '#1d9157', 7: '#96382b', 8: '#1b1b20',
};
export const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';
export const ballChar = (id: number) => CIRC[id - 1] || '';

export type GroupKey = 'cue' | 'eight' | 'solid' | 'stripe';
export const groupOf = (id: number): GroupKey =>
  id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? 'solid' : 'stripe';

export const GROUP_NAME: Record<'solid' | 'stripe', string> = { solid: '实色球', stripe: '花色球' };
export const GROUP_IDS: Record<'solid' | 'stripe', number[]> = {
  solid: [1, 2, 3, 4, 5, 6, 7],
  stripe: [9, 10, 11, 12, 13, 14, 15],
};
export const ACCENTS = ['#f0b23e', '#e2705a'];