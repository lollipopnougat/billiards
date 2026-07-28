import { useMemo } from 'react';
import './DustLayer.css';

/** 顶部漂浮尘埃氛围,16 颗,一次性生成 */
export default function DustLayer() {
  const dust = useMemo(() => Array.from({ length: 16 }, () => {
    const sz = 2 + Math.random() * 3.2;
    return {
      left: Math.random() * 100 + '%',
      top: (15 + Math.random() * 65) + '%',
      width: sz,
      height: sz,
      duration: (8 + Math.random() * 14) + 's',
      delay: (-Math.random() * 12) + 's',
    };
  }), []);
  return (
    <div id="dustLayer">
      {dust.map((s, i) => (
        <span key={i} style={{
          left: s.left, top: s.top,
          width: s.width + 'px', height: s.height + 'px',
          animationDuration: s.duration, animationDelay: s.delay,
        }} />
      ))}
    </div>
  );
}