import './Header.css';

interface Props {
  guideOn: boolean;
  soundOn: boolean;
  aiLabel: string | null;
  children?: React.ReactNode;
  onRules: () => void;
  onToggleGuide: () => void;
  onToggleSound: () => void;
  onRestart: () => void;
}

export default function Header({ guideOn, soundOn, aiLabel, children, onRules, onToggleGuide, onToggleSound, onRestart }: Props) {
  return (
    <header className="marquee">
      <div className="sign">
        <div className="badge8"><i>8</i></div>
        <div>
          <h1>金杆台球馆</h1>
          <p>GOLDEN CUE BILLIARDS · 中式八球 · {aiLabel ? `单人 vs AI · ${aiLabel}` : '双人对战'}</p>
        </div>
      </div>
      <div className="header-actions">
        <button className="btn" onClick={onRules}>规则说明</button>
        <button className={'btn' + (guideOn ? ' on' : '')} onClick={onToggleGuide}>
          辅助线 · {guideOn ? '开' : '关'}
        </button>
        <button className={'btn' + (soundOn ? ' on' : '')} onClick={onToggleSound}>
          音效 · {soundOn ? '开' : '关'}
        </button>
        <button className="btn" onClick={onRestart}>重新开局</button>
        {children}
      </div>
    </header>
  );
}