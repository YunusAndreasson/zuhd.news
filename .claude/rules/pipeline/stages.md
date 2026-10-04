---
paths:
  - "scripts/run-cycle.sh"
  - "scripts/*.js"
  - "scripts/*-prompt.md"
---

# The cycle's stages

`scripts/run-cycle.sh` is the authority. This is the spine; it has more stages
between these (the ledger, layer snapshots, entity extraction, translation,
scoring). What the stages assume about each other is `cycle.md`.

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

The daily hour is `DAILY_HOUR` in `run-cycle.sh`.
