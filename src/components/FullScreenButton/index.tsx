import { useEffect, useState } from 'react';
import './FullScreenButton.css';

interface Props {
  rotated: boolean;
  onToggleRotate: (v: boolean) => void;
}

function lockOrientation() {
  try {
    const orient = screen.orientation as { lock?: (o: string) => Promise<void> };
    if (orient?.lock) {
      orient.lock('portrait').catch(() => { /* ignore */ });
    }
  } catch { /* ignore */ }
}
function unlockOrientation() {
  try {
    const orient = screen.orientation as { unlock?: () => void };
    orient?.unlock?.();
  } catch { /* ignore */ }
}

function requestFullscreen(el: Element) {
  if (document.fullscreenElement) return;
  const anyEl = el as Element & { webkitRequestFullscreen?: () => Promise<void> };
  const req = el.requestFullscreen || anyEl.webkitRequestFullscreen;
  if (req) {
    try {
      const p = req.call(el);
      if (p instanceof Promise) p.then(() => lockOrientation()).catch(() => {});
      else lockOrientation();
    } catch { /* ignore */ }
  }
}
function exitFullscreen() {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  const ex = document.exitFullscreen || doc.webkitExitFullscreen;
  if (document.fullscreenElement && ex) {
    try {
      unlockOrientation();
      ex.call(document);
    } catch { /* ignore */ }
  }
}

export default function FullScreenButton({ rotated, onToggleRotate }: Props) {
  const [show, setShow] = useState(false);
  const isFs = useIsFullscreen();

  useEffect(() => {
    function check() {
      if (typeof window === 'undefined') return;
      const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
      const vw = Math.min(window.innerWidth, window.screen?.width || Infinity);
      setShow(coarse && vw <= 1024);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!show) return null;

  const active = isFs || rotated;
  const enter = () => { requestFullscreen(document.documentElement); onToggleRotate(true); };
  const exit = () => { exitFullscreen(); onToggleRotate(false); };

  return (
    <button
      className={'btn fs-btn' + (active ? ' on' : '')}
      onClick={active ? exit : enter}
      aria-label={active ? '退出竖屏全屏' : '竖屏全屏'}
    >
      {active ? '⤢ 退出全屏' : '⤡ 竖屏全屏'}
    </button>
  );
}

function useIsFullscreen() {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const upd = () => setFs(!!document.fullscreenElement);
    upd();
    document.addEventListener('fullscreenchange', upd);
    return () => document.removeEventListener('fullscreenchange', upd);
  }, []);
  return fs;
}