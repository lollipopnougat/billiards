import { ACCENTS, GROUP_NAME } from '../../game/constants';
import type { UiSnapshot } from '../../game/types';
import './TurnBanner.css';

export default function TurnBanner({ ui }: { ui: UiSnapshot }) {
  const turnText = ui.state === 'over'
    ? '本局结束'
    : (ui.breakShotFlag
        ? ui.players[ui.turn].name + ' 开球'
        : '轮到 ' + ui.players[ui.turn].name + ' 出杆' + (ui.players[ui.turn].group ? ' · ' + GROUP_NAME[ui.players[ui.turn].group as 'solid' | 'stripe'] : ''));
  const accent = ACCENTS[ui.turn];
  return (
    <div className="turn-banner">
      <div className="tb-score">胜局 <b>{ui.scores[0]}</b><i>:</i><b>{ui.scores[1]}</b></div>
      <div className="tb-mid">
        <span className="tb-dot" style={{ background: accent, boxShadow: '0 0 10px ' + accent }} />
        <span id="turnText" className="swap" key={ui.uiKey}>{turnText}</span>
      </div>
      <div className="tb-side">8 BALL POOL</div>
    </div>
  );
}