import { useEffect, useRef, useState } from 'react';
import { BilliardsEngine } from './game/engine';
import { AIController, DIFFICULTIES } from './game/ai';
import type { UiSnapshot, WinInfo } from './game/types';
import DustLayer from './components/DustLayer';
import Header from './components/Header';
import PlayerCard from './components/PlayerCard';
import TableZone from './components/TableZone';
import Modals from './components/Modals';
import StartScreen from './components/StartScreen';
import FullScreenButton from './components/FullScreenButton';

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
  const aiRef = useRef<AIController | null>(null);

  const rulesOpenRef = useRef(false);
  const winOpenRef = useRef(false);
  const startOpenRef = useRef(true);
  const aiOnRef = useRef(false);

  const [ui, setUi] = useState<UiSnapshot>(INITIAL_UI);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [winOpen, setWinOpen] = useState(false);
  const [winInfo, setWinInfo] = useState<WinInfo | null>(null);
  const [guideOn, setGuideOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [startOpen, setStartOpen] = useState(true);
  const [aiLabel, setAiLabel] = useState<string | null>(null);
  const [rotated, setRotated] = useState(false);
  useEffect(() => {
    if (rotated) document.body.classList.add('fs-rotate');
    else document.body.classList.remove('fs-rotate');
  }, [rotated]);
  const firstPickDoneRef = useRef(false);

  useEffect(() => { rulesOpenRef.current = rulesOpen; }, [rulesOpen]);
  useEffect(() => { winOpenRef.current = winOpen; }, [winOpen]);
  useEffect(() => { startOpenRef.current = startOpen; }, [startOpen]);

  // 任意模态关闭后,重新评估 AI 是否该动作(之前因模态遮挡而跳过的快照可被重试)
  useEffect(() => {
    if (!startOpen && !rulesOpen && !winOpen) aiRef.current?.poke();
  }, [startOpen, rulesOpen, winOpen]);

  // 彩纸(与原版一致,直接操作 DOM)
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

  const isModalOpen = () => startOpenRef.current || rulesOpenRef.current || winOpenRef.current;

  useEffect(() => {
    if (!canvasRef.current || !powerFillRef.current || !powerValRef.current) return;
    const engine = new BilliardsEngine({
      canvas: canvasRef.current,
      powerFill: powerFillRef.current,
      powerVal: powerValRef.current,
      isModalOpen,
      cb: {
        onUi: (snap) => {
          setUi(snap);
          // AI 回合禁止人类交互:人类点击/拖拽会被引擎直接忽略
          const ai = aiRef.current;
          const aiTurn = !!ai && aiOnRef.current && snap.turn === ai.index;
          const eng = engineRef.current;
          if (eng) eng.setHumanDisabled(aiTurn);
          ai?.maybeAct(snap);
        },
        onGameOver: (info) => { aiRef.current?.cancelPending(); setWinInfo(info); setWinOpen(true); },
        onConfetti: launchConfetti,
      },
    });
    engineRef.current = engine;
    aiRef.current = new AIController(engine, 1, isModalOpen);
    engine.start();
    return () => {
      aiRef.current?.destroy();
      engine.destroy();
      aiRef.current = null;
      engineRef.current = null;
    };
  }, []);

  // Esc 关闭弹窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRulesOpen(false);
        if (winOpenRef.current) return; // 胜负弹窗由按钮关闭
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // 开始界面按钮:选择模式后,首次开局直接进入(游戏已运行);重选时重开一局
  const applyModeAndStart = (aiMode: boolean, difficulty?: 'easy' | 'medium' | 'hard' | 'master') => {
    const ai = aiRef.current;
    const eng = engineRef.current;
    ai?.cancelPending();
    if (aiMode && difficulty) {
      ai?.setEnabled(true);
      ai?.setDifficulty(DIFFICULTIES[difficulty]);
      if (eng) eng.players[1].name = '电脑·玩家二';
      setAiLabel(DIFFICULTIES[difficulty].label);
      aiOnRef.current = true;
    } else {
      ai?.setEnabled(false);
      if (eng) eng.players[1].name = '玩家二';
      setAiLabel(null);
      aiOnRef.current = false;
      eng?.setHumanDisabled(false);
    }
    if (firstPickDoneRef.current) eng?.restart();  // 重选模式则重新摸球开始
    firstPickDoneRef.current = true;
    setStartOpen(false);
  };
  const startPvP = () => applyModeAndStart(false);
  const startPvAI = (d: 'easy' | 'medium' | 'hard' | 'master') => applyModeAndStart(true, d);

  // 按钮回调
  const handleRules = () => { aiRef.current?.cancelPending(); setRulesOpen(true); };
  const handleCloseRules = () => setRulesOpen(false);
  const handleAgain = () => { setWinOpen(false); aiRef.current?.cancelPending(); setStartOpen(true); };
  const handleCloseWin = () => setWinOpen(false);
  const handleRestart = () => { aiRef.current?.cancelPending(); setStartOpen(true); };
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
          aiLabel={aiLabel}
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
      <FullScreenButton rotated={rotated} onToggleRotate={setRotated} />
      <Modals
        rulesOpen={rulesOpen}
        winOpen={winOpen}
        winInfo={winInfo}
        onCloseRules={handleCloseRules}
        onAgain={handleAgain}
        onCloseWin={handleCloseWin}
      />
      {startOpen && (
        <StartScreen
          isRestart={firstPickDoneRef.current}
          currentMode={aiLabel}
          onStartPvP={startPvP}
          onStartPvAI={startPvAI}
        />
      )}
    </>
  );
}