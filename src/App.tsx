import { useEffect, useRef, useState } from 'react';
import { BilliardsEngine } from './game/engine';
import type { UiSnapshot, WinInfo } from './game/types';
import DustLayer from './components/DustLayer';
import Header from './components/Header';
import PlayerCard from './components/PlayerCard';
import TableZone from './components/TableZone';
import Modals from './components/Modals';

const INITIAL_UI: UiSnapshot = {
  turn: 0,
  state: 'idle',
  scores: [0, 0],
  breakShotFlag: true,
  players: [{ name: '玩家一', group: null }, { name: '玩家二', group: null }],
  ballDead: new Array(16).fill(false),
  statusText: '欢迎来到金杆台球馆',
  statusKind: 'info',
  statusKey: 0,
  uiKey: 0,
};

const CONFETTI_COLORS = ['#f0b23e', '#e2705a', '#77e0a0', '#f3e5c3', '#8a6432', '#e8c87e'];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const powerFillRef = useRef<HTMLDivElement>(null);
  const powerValRef = useRef<HTMLElement>(null);

  const engineRef = useRef<BilliardsEngine | null>(null);
  const rulesOpenRef = useRef(false);
  const winOpenRef = useRef(false);

  const [ui, setUi] = useState<UiSnapshot>(INITIAL_UI);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [winOpen, setWinOpen] = useState(false);
  const [winInfo, setWinInfo] = useState<WinInfo | null>(null);
  const [guideOn, setGuideOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => { rulesOpenRef.current = rulesOpen; }, [rulesOpen]);
  useEffect(() => { winOpenRef.current = winOpen; }, [winOpen]);

  // 胜利彩纸(直接操作 DOM,与原版一致)
  const launchConfetti = () => {
    for (let i = 0; i < 70; i++) {
      const d = document.createElement('div');
      d.className = 'confetti';
      d.style.left = Math.random() * 100 + 'vw';
      d.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      d.style.animationDuration = (2.2 + Math.random() * 1.8) + 's';
      d.style.animationDelay = (Math.random() * 0.5) + 's';
      d.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      document.body.appendChild(d);
      d.addEventListener('animationend', () => d.remove());
    }
  };

  useEffect(() => {
    if (!canvasRef.current || !powerFillRef.current || !powerValRef.current) return;
    const engine = new BilliardsEngine({
      canvas: canvasRef.current,
      powerFill: powerFillRef.current,
      powerVal: powerValRef.current,
      isModalOpen: () => rulesOpenRef.current || winOpenRef.current,
      cb: {
        onUi: setUi,
        onGameOver: (info) => { setWinInfo(info); setWinOpen(true); },
        onConfetti: launchConfetti,
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => { engine.destroy(); engineRef.current = null; };
  }, []);

  // Esc 关闭所有弹窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setRulesOpen(false); setWinOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // 按钮回调
  const handleRules = () => setRulesOpen(true);
  const handleCloseRules = () => setRulesOpen(false);
  const handleAgain = () => { setWinOpen(false); engineRef.current?.restart(); };
  const handleCloseWin = () => setWinOpen(false);
  const handleRestart = () => engineRef.current?.restart();
  const handleToggleGuide = () => {
    setGuideOn((v) => { const nv = !v; engineRef.current?.setGuide(nv); return nv; });
  };
  const handleToggleSound = () => {
    setSoundOn((v) => { const nv = !v; engineRef.current?.setSound(nv); return nv; });
  };

  return (
    <>
      <DustLayer />
      <div className="room">
        <Header
          guideOn={guideOn}
          soundOn={soundOn}
          onRules={handleRules}
          onToggleGuide={handleToggleGuide}
          onToggleSound={handleToggleSound}
          onRestart={handleRestart}
        />
        <div className="divider" />
        <main className="arena">
          <PlayerCard index={0} ui={ui} />
          <TableZone ui={ui} canvasRef={canvasRef} powerFillRef={powerFillRef} powerValRef={powerValRef} />
          <PlayerCard index={1} ui={ui} />
        </main>
      </div>
      <Modals
        rulesOpen={rulesOpen}
        winOpen={winOpen}
        winInfo={winInfo}
        onCloseRules={handleCloseRules}
        onAgain={handleAgain}
        onCloseWin={handleCloseWin}
      />
    </>
  );
}