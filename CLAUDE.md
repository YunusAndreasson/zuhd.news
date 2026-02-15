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
Multi-source RSS → fetch-news.js → Claude CLI selector (select-prompt.md) → /tmp/zuhd-selection.json
                                                    ↓
                                   Claude CLI writer (write-prompt.md) → markdown articles
                                                    ↓
                                   Claude CLI editor (check-prompt.md) → rewrite violations
                                                    ↓
                                             build.js → dist/ → wrangler pages deploy
```

**Sources (40):** Al Jazeera, BBC World, BBC Business, France 24, Deutsche Welle, AllAfrica, Al Monitor, Hacker News, The Hindu, Yonhap, CoinDesk, Bellingcat, Haaretz, Nature, Quanta Magazine, Moscow Times, Rest of World, MIT Technology Review, 404 Media, Carbon Brief, Malay Mail, Antara News, Premium Times, Dawn, Daily Star, South China Morning Post, Middle East Eye, Sveriges Radio, Daily Maverick, The East African, Buenos Aires Times, MercoPress, CBC News, Politico, Fox News, ABC News Australia, RNZ Pacific, Mada Masr, Medyascope, TSA

- **Hosting:** Cloudflare Pages, direct upload via `wrangler pages deploy dist`
- **Cycle:** systemd timer (`zuhd-news-cycle.timer`) 4x daily (00:00, 06:00, 12:00, 18:00 UTC) → `scripts/run-cycle.sh` → Claude CLI
- **Content:** markdown + YAML frontmatter in `content/articles/`, built to `dist/`
- **Design:** Source Serif 4 + Source Sans 3, 18px base, 64ch measure, no decoration

## Key Files

| File | Purpose |
|------|---------|
| `scripts/fetch-news.js` | Multi-source RSS fetcher with cross-source dedup |
| `scripts/build.js` | Markdown → HTML static site generator |
| `scripts/select-prompt.md` | Selector prompt: fetch news, pick stories, save selection JSON |
| `scripts/write-prompt.md` | Writer prompt: read selection, fetch full articles, draft markdown |
| `scripts/check-prompt.md` | Editor prompt: check new articles, fix violations, build, commit, deploy |
| `scripts/run-cycle.sh` | Cycle wrapper: selector → writer → editor as three Claude CLI sessions |
| `templates/article.html` | Article page template |
| `templates/index.html` | Homepage template |
| `public/style.css` | Typography-first CSS design system |
| `public/reader.js` | Spatial keyboard/touch navigation engine |

## Decisions

- Serif-led typography, no images unless informational, no dark mode
- Smart Brevity format: lead, why it matters, details, what's next, sources
- No CMS, no database, no framework — just files and a 145-line SSG
- English first, global hard news only
- Categories: politics, conflict, economy, science, tech
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
