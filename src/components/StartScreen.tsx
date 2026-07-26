interface Props {
  isRestart: boolean;
  currentMode: string | null;
  onStartPvP: () => void;
  onStartPvAI: (difficulty: 'easy' | 'medium' | 'hard') => void;
}

export default function StartScreen({ isRestart, currentMode, onStartPvP, onStartPvAI }: Props) {
  return (
    <div className="modal-backdrop start open">
      <div className="modal start-modal">
        <div className="start-badge"><span>8</span></div>
        <h2>金杆台球馆 · 中式八球</h2>
        <p className="start-sub">
          {isRestart ? `重新开局 · 当前 ${currentMode ?? '双人对战'} · 可更改` : '请选择对战模式'}
        </p>
        <div className="start-actions">
          <button className="btn primary" onClick={onStartPvP}>双人对战</button>
        </div>
        <div className="start-sub2">单人 vs AI</div>
        <div className="start-actions ai">
          <button className="btn ai easy" onClick={() => onStartPvAI('easy')}>简单</button>
          <button className="btn ai medium" onClick={() => onStartPvAI('medium')}>中等</button>
          <button className="btn ai hard" onClick={() => onStartPvAI('hard')}>困难</button>
        </div>
        <p className="start-hint">人类始终为 玩家一;选择 AI 模式时由 玩家二(电脑)出战。重选后将重新摸球并交换开球方。</p>
      </div>
    </div>
  );
}