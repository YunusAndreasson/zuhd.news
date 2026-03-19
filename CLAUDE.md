# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
Stage 0: node fetch-news.js → /tmp/zuhd-feed.json
Stage 1: Claude CLI selector (select-prompt.md) → /tmp/zuhd-selection.json
Stage 1.5: node prefetch-articles.js → enriches selection with fetched content
Stage 2: Claude CLI writer (write-prompt.md) → content/articles/*.md
Stage 3: Claude CLI editor (check-prompt.md) → style fixes
Stage 3b: validate-articles.js → build.js → git commit → wrangler deploy
Stage 4: node generate-briefing.js (05:00 UTC only) → content/audio/ → redeploy
Stage 5: Claude CLI reflect (reflect-prompt.md) (Sunday 22:00 UTC only)
```

**Sources (40):** Al Jazeera, BBC World, BBC Business, France 24, Deutsche Welle, AllAfrica, Al Monitor, Hacker News, The Hindu, Yonhap, CoinDesk, Bellingcat, Haaretz, Nature, Quanta Magazine, New Scientist, STAT News, Ars Technica Science, Moscow Times, Rest of World, MIT Technology Review, 404 Media, Carbon Brief, Malay Mail, Antara News, Premium Times, Dawn, Daily Star, South China Morning Post, Middle East Eye, Sveriges Radio, Daily Maverick, Buenos Aires Times, MercoPress, CBC News, Fox News, ABC News Australia, RNZ Pacific, Mada Masr, Medyascope, TSA

- **Hosting:** Cloudflare Pages, direct upload via `wrangler pages deploy dist --branch master`
- **Cycle:** systemd timer (`zuhd-news-cycle.timer`) 5x daily (04:00, 08:00, 12:00, 17:00, 22:00 UTC) → `scripts/run-cycle.sh` → Claude CLI
- **Manual run:** `env -u CLAUDECODE bash scripts/run-cycle.sh`
- **Content:** markdown + YAML frontmatter in `content/articles/`, built to `dist/`
- **Design:** Source Sans 3, 20px base, 80ch measure, no decoration
- **Logs:** `logs/cycle-YYYY-MM-DD_HHMM.log` (kept 7 days)

## Key Files

| File | Purpose |
|------|---------|
| `scripts/fetch-news.js` | Multi-source RSS fetcher with cross-source dedup |
| `scripts/prefetch-articles.js` | Pre-fetches article content for writer (eliminates WebFetch tool calls) |
| `scripts/build.js` | Markdown → HTML static site generator (custom, ~145 lines) |
| `scripts/validate-articles.js` | Validates frontmatter/structure before deploy; moves malformed articles aside |
| `scripts/write-last-cycle.js` | Writes `content/.last-cycle.json` from validated articles (selector dedup signal) |
| `scripts/coverage-map.js` | Generates compact topic-group coverage map injected into selector prompt |
| `scripts/generate-briefing.js` | Google TTS audio briefing, output to `content/audio/` |
| `scripts/select-prompt.md` | Selector prompt: read pre-fetched feed, pick stories, save selection JSON |
| `scripts/write-prompt.md` | Writer prompt: read selection + prefetched content, draft markdown |
| `scripts/check-prompt.md` | Editor prompt: check new articles for style violations only |
| `scripts/reflect-prompt.md` | Weekly reflection prompt: audit editorial quality, write notes |
| `scripts/run-cycle.sh` | Cycle orchestrator: all stages including build, commit, deploy |
| `scripts/lib/frontmatter.js` | Shared YAML frontmatter parser |
| `templates/article.html` | Article page template |
| `templates/index.html` | Homepage template |
| `public/style.css` | Typography-first CSS design system |
| `public/reader.js` | Spatial keyboard/touch navigation engine |
| `content/.last-cycle.json` | Published articles from last cycle (selector dedup signal) |
| `content/.story-ledger.json` | Cross-cycle story deduplication ledger |
| `content/.editorial-notes.md` | Weekly reflection output |

## Decisions

- Single-family sans-serif typography, no images unless informational
- Smart Brevity format: lead, why it matters, details, what's next, sources
- No CMS, no database, no framework — just files and a 145-line SSG
- English first, global hard news only
- Categories: politics, economy, science, tech
- Direct Cloudflare upload (not git-connected) for headless operation
- Pages production branch: `master` (custom domain `zuhd.news` only serves production deployments)

## Next Iteration (v0.2)

Priority improvements identified in the [build retrospective](https://www.notion.so/Build-Retrospective-307e4123a255812ebdd3e3201536be52):

1. **Harden editorial cycle** — test end-to-end autonomous run, fix env issues (mise PATH, wrangler auth, Claude CLI auth in systemd)
2. **Homepage rolling window** — show only last 24h on homepage, add `/archive` page with date grouping
3. ~~**Add news sources**~~ — Done: 9 sources (Al Jazeera, BBC World, BBC Business, France 24, DW, CGTN, AllAfrica, Al Monitor, HN)
4. ~~**Story deduplication**~~ — Done: cross-source fingerprint dedup + existing article fuzzy matching
5. **Health check** — simple monitoring that alerts if site hasn't updated in 6+ hours
6. ~~**Clean up editorial prompt**~~ — Done: split into writer + editor prompts with cognitive load rules

## Working With Notion

Use `curl` for creating pages and databases (MCP `parent` serialization bug). MCP works for search, reads, and block appends. See `/notion` skill for templates.

**Always create Notion tasks** in the [Project Tasks DB](https://www.notion.so/307e4123a25581759d59ee259ae389ac) when implementing features or changes. Tasks are the system of record.
