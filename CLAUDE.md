# zuhd.news

Minimalist typography-first news site. Read `foundation.md` for the philosophy.

**Live:** https://zuhd-news.pages.dev/

## Key Documents

| Document | Location |
|----------|----------|
| Foundation manifesto | `foundation.md` |
| Foundation (Notion) | [Notion](https://www.notion.so/Foundation-Manifesto-307e4123a255814cb5d5fac97ac210ac) |
| Project tasks | [Notion DB](https://www.notion.so/307e4123a25581759d59ee259ae389ac) |
| Build retrospective | [Notion](https://www.notion.so/Build-Retrospective-307e4123a255812ebdd3e3201536be52) |
| Notion skill | `~/.claude/commands/notion.md` |

## Architecture

```
Al Jazeera RSS → fetch-news.js → Claude CLI (editorial-prompt.md) → markdown articles
                                      ↓
                               build.js → dist/ → wrangler pages deploy
```

- **Hosting:** Cloudflare Pages, direct upload via `wrangler pages deploy dist`
- **Cycle:** systemd timer (`zuhd-news-cycle.timer`) every 3 hours → `scripts/run-cycle.sh` → Claude CLI
- **Content:** markdown + YAML frontmatter in `content/articles/`, built to `dist/`
- **Design:** Source Serif 4 + Source Sans 3, 18px base, 64ch measure, no decoration

## Key Files

| File | Purpose |
|------|---------|
| `scripts/fetch-news.js` | Fetches Al Jazeera RSS, filters, deduplicates, outputs JSON |
| `scripts/build.js` | Markdown → HTML static site generator |
| `scripts/editorial-prompt.md` | Claude CLI instructions for autonomous article writing |
| `scripts/run-cycle.sh` | Cron wrapper: launches Claude CLI, logs output |
| `templates/article.html` | Article page template |
| `templates/index.html` | Homepage template |
| `public/style.css` | Typography-first CSS design system |
| `public/reader.js` | Spatial keyboard/touch navigation engine |

## Decisions

- Serif-led typography, no images unless informational, no dark mode
- Smart Brevity format: lead, why it matters, details, what's next, sources
- No CMS, no database, no framework — just files and a 145-line SSG
- English first, global hard news only
- Categories: politics, conflict, economics, climate, health, rights, science
- Direct Cloudflare upload (not git-connected) for headless operation

## Next Iteration (v0.2)

Priority improvements identified in the [build retrospective](https://www.notion.so/Build-Retrospective-307e4123a255812ebdd3e3201536be52):

1. **Harden editorial cycle** — test end-to-end autonomous run, fix env issues (mise PATH, wrangler auth, Claude CLI auth in systemd)
2. **Homepage rolling window** — show only last 24h on homepage, add `/archive` page with date grouping
3. **Add news sources** — Reuters and/or AP RSS alongside Al Jazeera for redundancy and breadth
4. **Story deduplication** — detect when the same story appears across cycles and skip rather than duplicate
5. **Health check** — simple monitoring that alerts if site hasn't updated in 6+ hours
6. **Clean up editorial prompt** — remove stale placeholder notes, tighten instructions based on first cycle output quality

## Working With Notion

Use `curl` for creating pages and databases (MCP `parent` serialization bug). MCP works for search, reads, and block appends. See `/notion` skill for templates.

**Always create Notion tasks** in the [Project Tasks DB](https://www.notion.so/307e4123a25581759d59ee259ae389ac) when implementing features or changes. Tasks are the system of record.
