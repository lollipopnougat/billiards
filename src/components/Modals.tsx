import type { WinInfo } from '../game/types';

interface Props {
  rulesOpen: boolean;
  winOpen: boolean;
  winInfo: WinInfo | null;
  onCloseRules: () => void;
  onAgain: () => void;
  onCloseWin: () => void;
}

export default function Modals({ rulesOpen, winOpen, winInfo, onCloseRules, onAgain, onCloseWin }: Props) {
  return (
    <>
      <div
        className={'modal-backdrop' + (rulesOpen ? ' open' : '')}
        onClick={(e) => { if (e.target === e.currentTarget) onCloseRules(); }}
      >
        <div className="modal rules-modal">
          <h2>中式八球 · 规则速览</h2>
          <ul>
            <li><b>开球</b> — 将白球放置在左侧厨房区内,击打三角球堆。开球打进 8 号球将重新摆球。</li>
            <li><b>球组</b> — 开球后首个合法进球决定球组归属:<b>实色球 ①-⑦</b> 或 <b>花色球 ⑨-⑮</b>。</li>
            <li><b>出杆</b> — 打进己方球组可继续出杆,否则换对方击球。</li>
            <li><b>犯规</b> — 白球洗袋、空杆、先触碰对方球组或 8 号球均判犯规,对方获<b>自由球</b>(可将白球放置在任意位置)。</li>
            <li><b>胜负</b> — 清空己方球组后合法打进 8 号球获胜;提前打进 8 号球、或打进 8 号球同时犯规,直接判负。</li>
            <li><b>操作</b> — 移动鼠标瞄准 → 按住拖拽蓄力 → 松开出杆。</li>
          </ul>
          <button className="btn primary" onClick={onCloseRules}>明白了,开打!</button>
        </div>
      </div>

      <div
        className={'modal-backdrop' + (winOpen ? ' open' : '')}
        onClick={(e) => { if (e.target === e.currentTarget) onCloseWin(); }}
      >
        <div className="modal win-modal">
          <div className="win-8"><span>8</span></div>
          <h2>{winInfo ? `玩家${winInfo.winner === 0 ? '一' : '二'} 获胜!` : ''}</h2>
          <p>{winInfo ? winInfo.reason : ''}</p>
          <div className="win-score">{winInfo ? `胜局 ${winInfo.scores[0]} : ${winInfo.scores[1]}` : ''}</div>
          <button className="btn primary" onClick={onAgain}>再来一局</button>
        </div>
      </div>
    </>
  );
}