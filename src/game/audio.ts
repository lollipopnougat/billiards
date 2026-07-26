/* ================= 音效引擎 ================= */
type AnyAudioContext = typeof AudioContext;

class AudioFX {
  ctx: AudioContext | null = null;
  enabled = true;
  last = 0;
  master: GainNode | null = null;
  nbuf: AudioBuffer | null = null;

  init() {
    if (this.ctx) return;
    try {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: AnyAudioContext }).webkitAudioContext);
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.1;
      this.nbuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.nbuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    } catch (e) { /* ignore */ }
  }

  tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number) {
    if (!this.ctx || !this.enabled || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  noise(freq: number, q: number, dur: number, vol: number) {
    if (!this.ctx || !this.enabled || !this.master || !this.nbuf) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.nbuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
  }

  clack(v: number) {
    const n = performance.now();
    if (n - this.last < 25) return;
    this.last = n;
    this.noise(1600 + Math.random() * 900, 1.1, 0.05, 0.45 * v + 0.08);
    this.tone(340, 180, 0.04, 'sine', 0.22 * v);
  }
  rail() { this.noise(420, 0.9, 0.07, 0.22); }
  pocket() { this.tone(520, 160, 0.22, 'sine', 0.38); this.noise(900, 0.7, 0.12, 0.28); }
  cueHit(v: number) { this.noise(2400, 1.4, 0.035, 0.4 * v); this.tone(700, 300, 0.05, 'triangle', 0.18 * v); }
  place() { this.tone(600, 500, 0.06, 'sine', 0.14); }
  foul() {
    this.tone(330, 330, 0.12, 'square', 0.1);
    setTimeout(() => this.tone(247, 247, 0.18, 'square', 0.1), 150);
  }
  win() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.26, 'triangle', 0.22), i * 130));
  }
}

export const audioFX = new AudioFX();