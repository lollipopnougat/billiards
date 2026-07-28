import { BALL_COLORS, GROUP_IDS, GROUP_NAME } from '../game/constants';
import './PlayerCard.css';
import type { UiSnapshot } from '../game/types';

interface Props {
  index: number;
  ui: UiSnapshot;
}

export default function PlayerCard({ index, ui }: Props) {
  const player = ui.players[index];
  const isActive = ui.turn === index && ui.state !== 'over';

  // chip 文案
  let chip: string;
  if (ui.state === 'over') chip = (ui.scores[0] + ui.scores[1]) ? '已结束' : '—';
  else if (isActive) {
    if (ui.state === 'place') chip = '自由球';
    else if (ui.state === 'rolling' || ui.state === 'resolving' || ui.state === 'strike') chip = '击球中';
    else chip = '出杆中';
  } else chip = '等待中';

  const group = player.group;
  const groupText = group
    ? GROUP_NAME[group] + (group === 'solid' ? ' ①-⑦' : ' ⑨-⑮')
    : '球组未定 · 等待首个进球';

  const remain = group ? GROUP_IDS[group].filter(id => !ui.ballDead[id]).length : 0;
  const remainText = group ? `剩余 ${remain} 球` : '剩余 — 球';
  const onEight = !!group && remain === 0;
  const eightText = onEight ? '🎯 目标 8号球' : '8号球 · 未解锁';

  // 托盘小球
  const tray: React.ReactNode[] = [];
  if (!group) {
    for (let k = 0; k < 7; k++) {
      tray.push(<div key={k} className="mini ph" style={{ animationDelay: k * 30 + 'ms' }}>?</div>);
    }
  } else {
    GROUP_IDS[group].forEach((id, k) => {
      const col = group === 'stripe' ? BALL_COLORS[id - 8] : BALL_COLORS[id];
      const potted = ui.ballDead[id];
      tray.push(
        <div key={id} className={'mini ' + (group === 'stripe' ? 'stripe' : 'solid') + (potted ? ' potted' : '')}
          style={{ ['--mc' as string]: col, animationDelay: k * 30 + 'ms' }}>
          <span className="num">{id}</span>
        </div>
      );
    });
    const eightDead = ui.ballDead[8];
    tray.push(
      <div key="eight" className={'mini eight' + (onEight ? ' target' : '') + (eightDead ? ' potted' : '')}
        style={{ animationDelay: '220ms' }}>
        <span className="num">8</span>
      </div>
    );
  }
  const accentVar = index === 0 ? 'var(--p1)' : 'var(--p2)';
  return (
    <aside
      id={'card' + index}
      className={'player-card' + (isActive ? ' active' : '')}
      style={{ ['--pc' as string]: accentVar }}
    >
      <div className="pc-head">
        <span className="pc-chalk"></span>
        <span className="pc-name">{player.name}</span>
        <span className="pc-chip">{chip}</span>
      </div>
      <div className="pc-group">{groupText}</div>
      <div className="pc-tray" key={ui.uiKey}>{tray}</div>
      <div className="pc-meta">
        <span className="pc-remain">{remainText}</span>
        <span className={'pc-eight' + (onEight ? ' target' : '')}>{eightText}</span>
      </div>
    </aside>
  );
}