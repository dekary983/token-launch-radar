# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dekary983/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dekary983/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of every protocol with at least $5M TVL, finds the ones that still record no token (and are not a wrapped, staked or bridged product of one that trades), and ranks them by what their token launch would be worth.

**Implied value model** — `implied = TVL × peerRatio(category) × growth × maturity × reach`:
- *peerRatio*: median market-cap/TVL of tokenized peers in the same category that carry at least $25M TVL themselves, shrunk toward the global median (0.129x) by six phantom peers and clamped to 0.03–2.5x; categories with no qualifying peers fall back to the global median, disclosed per row.
- *growth*: the protocol's 7-day TVL change, clamped to −50%…+100%, weighted ×0.6.
- *maturity*: 0.7x rising to 1.3x over five tokenless years.
- *reach*: +3% per additional chain, up to seven.

The board covers the whole 40-protocol watchlist plus 158 earlier pre-token protocols (198 rows). Every row carries a concrete farm plan — category- and chain-specific steps with explicit costs and times, and a caution step when 7-day TVL fell sharply. The dashboard is fully offline: a sortable board, filters (search, category, chain, minimum TVL), a live-token peers tab showing the comparables behind each ratio, a model panel with the formula and category evidence, and a per-protocol detail view showing the full model working.

## Run it

```sh
node main.ts --input /input/snapshot.json
# writes board.json, data.js, dashboard/, screenshots/ and dossier.json to the output dir
```

Node 22.18 or later, standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?ref=c4u-gaming&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
