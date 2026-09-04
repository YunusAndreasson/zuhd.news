# Market highlights

The backend scans completed trading sessions for sharp daily moves, four-or-more-session streaks, sustained weekly/monthly moves, reversals, and opposite-direction Nasdaq-100/S&P 500 divergence. It selects at most three highlights. Missing, provisional, misaligned, and stale series are excluded rather than guessed.

Cards use neutral directional color: a rising index is not automatically good news. The observation window, data date, factual description, optional news commentary, and sources have separate roles. Routine chart updates preserve viewed status; meaningful editorial revisions can show “Updated since you last viewed.”

## Operations

From the repository root:

```sh
node scripts/narrate-indicators.js --market-signals --dry-run
node scripts/narrate-indicators.js --market-signals --no-llm
node scripts/replay-market-signals.js --markets path/to/markets.json --trends path/to/trends.json
```

Dry-run is read-only and makes no model calls. `--no-llm` writes factual highlights and state. Normal narration uses the existing model dispatch, limits calls to three, validates supplied evidence, and falls back to facts when validation fails. These checks are conservative heuristics, not proof of causal accuracy.

The regular backend cycle runs selection before building `/api/market-signals.json`. Updated fetchers must first provide explicit session dates and completion flags; legacy cached data is not eligible. The replay tool’s optional `--legacy-research` reconstructs dates for exploratory analysis only, never production selection.

The emulator flow `.argent/flows/market-signal-preview.yaml` checks an injected updated preview and the caught-up boundary. It requires the stated fixture prerequisite; it does not generate live market commentary.
