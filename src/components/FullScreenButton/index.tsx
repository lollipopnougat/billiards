import { useEffect, useState } from 'react';
import './FullScreenButton.css';

interface Props {
  /** 是否处于旋转横屏模式(父级 App 经管 body 类) */
  rotated: boolean;
  onToggleRotate: (v: boolean) => void;
}

/** 申请浏览器真正的全屏;部分老 iOS 不支持则静默失败,仍可用旋转横屏兜底 */
function requestFullscreen(el: Element) {
  const anyEl = el as Element & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  if (document.fullscreenElement) return;
  const req = el.requestFullscreen || (el as any).webkitRequestFullscreen;
  if (req) { try { req.call(el); } catch { /* ignore */ } }
}
function exitFullscreen() {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  const ex = document.exitFullscreen || doc.webkitExitFullscreen;
  if (document.fullscreenElement && ex) { try { ex.call(document); } catch { /* ignore */ } }
}

export default function FullScreenButton({ rotated, onToggleRotate }: Props) {
  // 仅在触屏(粗指针)设备显示;桌面端隐藏,不影响原体验
  const [touch, setTouch] = useState(false);
  const isFs = useIsFullscreen();

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    setTouch(mq.matches);
  }, []);

  if (!touch) return null;

  const enter = () => {
    requestFullscreen(document.documentElement);
    onToggleRotate(true);
  };
  const exit = () => {
    exitFullscreen();
    onToggleRotate(false);
  };
  const active = isFs || rotated;

  return (
    <button
      className={'btn fs-btn' + (active ? ' on' : '')}
      onClick={active ? exit : enter}
      aria-label={active ? '退出横屏全屏' : '横屏全屏'}
    >
      {active ? '⤢ 退出横屏' : '⤡ 横屏全屏'}
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