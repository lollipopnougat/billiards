import type { RefObject } from 'react';
import type { UiSnapshot } from '../game/types';
import TurnBanner from './TurnBanner';

interface Props {
  ui: UiSnapshot;
  canvasRef: RefObject<HTMLCanvasElement>;
  powerFillRef: RefObject<HTMLDivElement>;
  powerValRef: RefObject<HTMLElement>;
}

export default function TableZone({ ui, canvasRef, powerFillRef, powerValRef }: Props) {
  return (
    <section className="table-zone">
      <TurnBanner ui={ui} />
      <div className="table-wrap">
        <canvas id="table" ref={canvasRef} />
        <div className="lamp">
          <div className="cord"></div>
          <div className="shade"><div className="bulb"></div></div>
          <div className="glow"></div>
        </div>
      </div>
      <div className="console">
        <div className="power-wrap">
          <span className="pw-label">力度</span>
          <div className="power-bar">
            <div className="power-fill" ref={powerFillRef} />
          </div>
          <span className="pw-val" ref={powerValRef as RefObject<HTMLSpanElement>}>0%</span>
        </div>
        <div className={'status ' + ui.statusKind}>
          <span className="status-dot" />
          <span id="statusText" key={ui.statusKey}>{ui.statusText}</span>
        </div>
      </div>
      <p className="hint-line">🎯 移动鼠标瞄准 · ✊ 按住并向后拖拽蓄力 · 🖐 松开出杆 · 犯规后点击球台任意位置放置白球</p>
    </section>
  );
}