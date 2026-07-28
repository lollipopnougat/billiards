# 金杆台球馆 · 中式八球

一款基于 React + TypeScript + Vite 的中式八球（Chinese 8-Ball）台球网页游戏。物理模拟在纯 TypeScript 中实现，画面渲染在 HTML5 Canvas 上，通过 React 组件组织界面，并内置可调节难度的 AI 玩家。

## ✨ 功能特性

- **完整的中式八球规则**：开球、分色（实色/花色）、击打落袋、犯规判定、自由球摆位、8 号球决胜与提前告负判定。
- **自研物理引擎**：球的滚动摩擦、库边反弹、球间碰撞、袋口吞噬与角动量（旋转）等均在 Canvas 逐帧模拟。
- **三种对战模式**：
  - 双人对战（本地热座）
  - 单人 vs AI（4 档难度梯度：简单 / 中等 / 困难 / 大师）
- **智能 AI**：
  - 候选球-袋组合评估、切球角限制、中袋惩罚
  - 困难及以上启用走位权重与一步连杆前瞻
  - 无理想进袋时主动出安全球，规避白球洗袋风险
  - 按难度叠加瞄准角度与力度的噪声，模拟真人失误
- **视觉与体验细节**：台呢纹理、木质库边、铜环袋口、击球粒子与扩散光环、胜负彩纸；移动端触屏适配。
- **辅助选项**：瞄准辅助线开关、音效开关、规则弹窗、随时重新开局并在开局模式间切换。

## 🧱 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | React 18 |
| 语言 | TypeScript（strict 模式） |
| 构建 | Vite 5 |
| 渲染 | HTML5 Canvas 2D |
| 字体 | ZCOOL QingKe HuangYou / Noto Sans SC / Bebas Neue（CDN） |

## 📦 项目结构

```
billiards/
├── index.html              # 入口文档，加载字体并挂载 /src/main.tsx
├── vite.config.ts          # Vite 配置（base 相对路径）
├── src/
│   ├── main.tsx            # React 启动
│   ├── App.tsx             # 顶层组件，串联引擎 / AI / UI 面板
│   ├── styles.css          # 全局样式与共享 token
│   ├── game/               # 框架无关的台球引擎与规则
│   │   ├── engine.ts       # 物理模拟、回合结算与状态机
│   │   ├── ai.ts           # AI 控制器与难度预设
│   │   ├── constants.ts    # 可调物理 / 球台常量
│   │   ├── types.ts        # 共享 TypeScript 接口
│   │   └── audio.ts        # 音效
│   └── components/         # UI 组件，每个组件一个目录（index.tsx + 同名 .css）
│       ├── Header/
│       ├── PlayerCard/
│       ├── TableZone/
│       ├── TurnBanner/
│       ├── Modals/
│       ├── StartScreen/
│       └── DustLayer/
```

## 🚀 快速开始

> 环境要求：Node.js（建议 18+）与 npm。

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173，热更新）
npm run dev

# 类型检查 + 生产构建（产物输出到 dist/）
npm run build

# 本地预览生产构建
npm run preview
```

## 🎮 玩法说明

1. 打开页面后在开始界面选择 **双人对战** 或 **单人 vs AI** 的难度。
2. 人类始终为「玩家一」，选择 AI 模式时由「玩家二（电脑）出战」。
3. 开球前可在开球区拖动白球摆位；随后瞄准、蓄力并出杆。
4. 落袋决定本方球组（实色 1–7 / 花色 9–15），先打完本方球组再击落 8 号即获胜。
5. 提前击落 8 号、或本方球未清就击落 8 号、或开球与击球过程中出现犯规等情形由规则判定为告负。

## 🤝 贡献指南

本项目遵循 **Conventional Commits**，提交摘要以中文撰写，例如：

- `feat:` 新功能，如 `feat: 增加电脑玩家(AI)及开局模式选择`
- `fix:` 修复，如 `fix: 袋口铜环缺口按各自桌边朝向`
- `refactor:` 重构，如 `refactor: 组件入口 tsx 改名为 index.tsx`
- `build:` 构建相关，如 `build: vite base 改为相对路径 './'`

保持提交聚焦、原子化；提交前请通过 `npm run build` 验证。本项目当前未配置自动化测试与 lint，需要手动通过 `npm run dev` 验证。

## 📄 许可

本项目为个人学习 / 练习作品，暂未指定开源许可证。