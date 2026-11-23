# Obsidian Terminal — Pre-Token Radar & Institutional Valuation

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/matuyen889/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/matuyen889/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Obsidian Terminal is an institutional-grade pre-token radar and valuation dashboard built for the [make.fun](https://make.fun) $1,325 USDC token launch radar bounty.

## Core Capabilities
- **Comps-Calibrated Valuation**: Sublinear power-law TVL scaling calibrated against live sector comparable trading multiples.
- **Dampened Momentum & Lindy Maturity**: Hyperbolic tangent growth dampener paired with logarithmic age maturity curve to prevent volatility distortions.
- **Institutional Farm Playbook**: Automated 6-step operational farm execution plan with capital requirements, gas estimates, and qualification horizons.
- **High-Density Terminal UI**: Obsidian dark design system with sector comps, real-time KPI aggregates, and responsive filtering.

## Build and Execution
```bash
node main.ts --input /input/snapshot.json
```
Emits `board.json`, `data.js`, `dashboard/`, `screenshots/`, and byte-matched `dossier.json`.
