---
paths:
  - "scripts/run-cycle.sh"
  - "scripts/cycle/**"
  - "scripts/lib/cycle-*.js"
  - "scripts/*.js"
  - "scripts/*-prompt.md"
---

# The cycle's stages

`scripts/cycle/stages.js` is the authority: one entry a stage, in order, run by
`scripts/cycle/run.js`, which `scripts/run-cycle.sh` starts under the lock.
This is the spine; the list has more stages between these (the ledger, layer
snapshots, entity extraction, translation, scoring). What the stages assume
about each other is `cycle.md`.

```
Stage 0    fetch-news-api.js + fetch-news.js → merge-feeds.js → /tmp/zuhd-feed.json
Stage 1    Claude CLI selector (select-prompt.md) → /tmp/zuhd-selection.json
Stage 1.3  node enrich-selection.js → full source bodies onto the selection
Stage 1.5  node dedup-selection.js → drops stories already published
Stage 1.7  node attach-indicators.js → live levels onto the selection
Stage 2    Claude CLI writer (write-prompt.md) → content/articles/*.md
Stage 3    Claude CLI editor (check-prompt.md) → style fixes
Stage 3b   validate-articles.js → build.js → git commit → wrangler deploy
           → push (api/push) + X (post-to-twitter.js) + IG (post-to-instagram.js)
Stage 3.8  node narrate-indicators.js (05:00 UTC) → content/.indicator-dispatch.json
Stage 4    node generate-briefing.js (05:00 UTC) → content/audio/
Stage 5    node measure-quality.js (Sun 22:00 UTC) → content/.quality-trend.json
Stage 6    Claude CLI tune (tune-prompt.md) (daily 22:00 UTC)
```

The daily hour is `DAILY_HOUR` in `scripts/lib/cycle-run.js`.

## Changing the cycle

- A stage is added, moved or re-timed in `stages.js`; one that is more than a
  command is a function in `lib/cycle-steps.js`. `node scripts/cycle/run.js
  --plan --at 22 --dow 7` prints what a cycle at that hour would run.
- **Never** import a stage into the runner. It is started by name, because
  the cycle pulls half way through and what runs next is the file as pulled.
- After an edit to the list, the engine, the steps or the wrapper, run `npm
  run test:cycle` and read the diff before `UPDATE_GOLDENS=1`: a recording is
  a claim about what the cycle does, and `cycle-harness.test.js` fails until
  the scenarios have been run again.
- A stage script exports `main` and ends with `runStage(import.meta, name,
  main)` (`lib/stage.js`), takes its paths from `pathOf` (`lib/datasets.js`)
  and its model from `modelFor` (`lib/models.js`): tests ratchet both.
- Prove a change to a stage with `scripts/cycle/replay-stage.js`, the old tree
  against the new on the same inputs: it seals off `/tmp`, `content/` and the
  network, which a bare run does not.
- `touch .cycle-legacy` in the repository root hands the next cycle back to
  `run-cycle.legacy.sh`, for as long as that file is kept.
