# CLAUDE.md

Minimalist typography-first global news site. Philosophy in `foundation.md`.

## Decisions

- Single-family sans-serif typography, no images unless informational
- Smart Brevity format: lead, why it matters, details, what's next, sources
- English first, global hard news only
- Categories: politics, economy, science, tech
- No CMS, no database, no framework — just files and a 145-line SSG
- Content: markdown + YAML frontmatter in `content/articles/`, built to `dist/`

## Architecture

```
Stage 0: node fetch-news.js → /tmp/zuhd-feed.json
Stage 1: Claude CLI selector (select-prompt.md) → /tmp/zuhd-selection.json
Stage 1.5: node prefetch-articles.js → enriches selection with fetched content
Stage 2: Claude CLI writer (write-prompt.md) → content/articles/*.md
Stage 3: Claude CLI editor (check-prompt.md) → style fixes
Stage 3b: validate-articles.js → build.js → git commit → wrangler deploy
Stage 4: node generate-briefing.js (04:00/16:00 UTC) → content/audio/ → redeploy
Stage 5: Claude CLI reflect (reflect-prompt.md) (Sunday 22:00 UTC only)
```

## Dev Reference

Developer/operator details (key files, sources, hosting, Notion workflow, roadmap) are in `DEV.md`.
