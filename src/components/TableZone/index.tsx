import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { UiSnapshot } from '../../game/types';
import './TableZone.css';
import TurnBanner from '../TurnBanner';

interface Props {
  ui: UiSnapshot;
  canvasRef: RefObject<HTMLCanvasElement>;
  powerFillRef: RefObject<HTMLDivElement>;
  powerValRef: RefObject<HTMLElement>;
}

/** 判定当前是否以触屏为主要指针(粗指针) */
function useTouchPrimary(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setTouch(mq.matches);
    update();
    if (mq.addEventListener) mq.addEventListener('change', update);
    else mq.addListener(update);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', update); else mq.removeListener(update); };
  }, []);
  return touch;
}

export default function TableZone({ ui, canvasRef, powerFillRef, powerValRef }: Props) {
  const touch = useTouchPrimary();
  const hint = touch
    ? '🎯 按住球台并向击球方向拖拽瞄准蓄力 · 🖐 松开出杆 · 犯规后拖动白球到任意位置松手放置'
    : '🎯 移动鼠标瞄准 · ✊ 按住并向后拖拽蓄力 · 🖐 松开出杆 · 犯规后点击球台任意位置放置白球';
  return (
    <section className="table-zone">
      <TurnBanner ui={ui} />
      <div className="table-wrap">
        <canvas id="table" ref={canvasRef} />
      </div>
      {/* 力度条独立成块,横屏下贴到球台侧边纵向显示 */}
      <div className="power-wrap">
        <span className="pw-label">力度</span>
        <div className="power-bar">
          <div className="power-fill" ref={powerFillRef} />
        </div>
        <span className="pw-val" ref={powerValRef as RefObject<HTMLSpanElement>}>0%</span>
      </div>
      <div className="console">
        <div className={'status ' + ui.statusKind}>
          <span className="status-dot" />
          <span id="statusText" key={ui.statusKey}>{ui.statusText}</span>
        </div>
      </div>
      <p className="hint-line">{hint}</p>
    </section>
  );
}