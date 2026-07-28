# Repository Guidelines

This repository contains **金杆台球馆 · 中式八球**, a Chinese eight-ball billiards game built with React, TypeScript, and Vite. The game logic runs on an HTML5 canvas with a physics engine in plain TypeScript, surfaced through React components.

## Project Structure & Module Organization

- `index.html` — entry document; loads web fonts and mounts `/src/main.tsx`.
- `src/main.tsx` — React bootstrap.
- `src/App.tsx` — top-level component wiring the engine, AI, and UI panels together.
- `src/styles.css` — shared global styles; component styles live alongside their components.
- `src/game/` — framework-agnostic billiards engine and rules.
  - `engine.ts` — physics simulation, turn resolution, and state machine.
  - `ai.ts` — AI controller and difficulty presets.
  - `constants.ts` — tunable physics/court constants.
  - `types.ts` — shared TypeScript interfaces (`GameState`, `Ball`, `UiSnapshot`, etc.).
  - `audio.ts` — sound effects.
- `src/components/` — UI building blocks; each component is a folder containing `index.tsx` and a co-located `<Name>.css` (e.g. `PlayerCard/index.tsx`, `PlayerCard/PlayerCard.css`). Import a component via its directory path.

## Build, Test, and Development Commands

All commands run from the project root.

- `npm install` — install dependencies.
- `npm run dev` — start the Vite dev server with hot reload (default port `5173`).
- `npm run build` — type-check with `tsc -b` then produce a production bundle in `dist/`.
- `npm run preview` — serve the built bundle locally for verification.

No automated test suite or linter is configured. Verify changes manually via `npm run dev` and confirm the production build with `npm run build`.

## Coding Style & Naming Conventions

- **TypeScript**: `strict` mode is on (`tsconfig.json`); `noFallthroughCasesInSwitch` is enforced. Prefer interfaces and literal-union types (`'idle' | 'aim' | ...`) as in `src/game/types.ts`.
- **Components**: one folder per component, rooted at `src/components/<Name>/`, with `index.tsx` as the entry point and a co-located CSS file. This keeps imports short: `import Header from './components/Header'`.
- **Styling**: plain CSS files paired with each component; the global sheet (`src/styles.css`) holds shared tokens. Keep component-specific rules in their own CSS file.
- **Paths**: `./` is the Vite base (relative), so the build can be served from any subpath.

## Commit & Pull Request Guidelines

This project follows **Conventional Commits**, with summaries written in Chinese. Scopes are optional.

- `feat:` 新功能, e.g. `feat: 增加电脑玩家(AI)及开局模式选择`
- `fix:` 修复, e.g. `fix: 袋口铜环缺口按各自桌边朝向`
- `refactor:` 重构, e.g. `refactor: 组件入口 tsx 改名为 index.tsx`
- `build:` 构建相关, e.g. `build: vite base 改为相对路径 './'`
- Optional scopes may be appended, e.g. `fix(phone):`, `fix(ts):`.

Keep commits focused and atomic. Pull requests should describe the change in Chinese, reference any related work, and be verified with `npm run build` before review.
