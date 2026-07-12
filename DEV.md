# DEV.md — Developer & Operator Reference

**Live:** https://zuhd.news

## Key Documents

| Document | Location |
|----------|----------|
| Foundation manifesto | `foundation.md` |
| Foundation (Notion) | [Notion](https://www.notion.so/Foundation-Manifesto-307e4123a255814cb5d5fac97ac210ac) |
| Project tasks | [Notion DB](https://www.notion.so/307e4123a25581759d59ee259ae389ac) |
| Build retrospective | [Notion](https://www.notion.so/Build-Retrospective-307e4123a255812ebdd3e3201536be52) |
| Notion skill | `~/.claude/commands/notion.md` |

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
| `scripts/run-cycle.sh` | Cycle orchestrator: all stages including build, commit, deploy |
| `scripts/lib/frontmatter.js` | Shared YAML frontmatter parser |
| `templates/article.html` | Article page template |
| `templates/index.html` | Homepage template |
| `public/style.css` | Typography-first CSS design system |
| `public/reader.js` | Spatial keyboard/touch navigation engine |
| `content/.last-cycle.json` | Published articles from last cycle (selector dedup signal) |
| `content/.story-ledger.json` | Cross-cycle story deduplication ledger |

## Sources (41)

Al Jazeera, BBC World, BBC Business, France 24, Deutsche Welle, AllAfrica, Al Monitor, Hacker News, The Hindu, Yonhap, CoinDesk, Bellingcat, Haaretz, Nature, Quanta Magazine, New Scientist, STAT News, Ars Technica Science, Moscow Times, Rest of World, MIT Technology Review, 404 Media, Carbon Brief, Malay Mail, Antara News, Premium Times, Dawn, Daily Star, South China Morning Post, Middle East Eye, Sveriges Radio, Daily Maverick, Buenos Aires Times, MercoPress, CBC News, Fox News, ABC News Australia, RNZ Pacific, Mada Masr, Medyascope, TSA, The Record

## Hosting & Deploy

- **Cloudflare Pages**, direct upload via `wrangler pages deploy dist --branch master`
- Production branch: `master` (custom domain `zuhd.news` only serves production deployments)
- **Cycle:** systemd timer (`zuhd-news-cycle.timer`) 5x daily (04:00, 08:00, 12:00, 17:00, 22:00 UTC)
- **Manual run:** `env -u CLAUDECODE bash scripts/run-cycle.sh`
- **Design:** Source Sans 3, 20px base, 80ch measure, no decoration
- **Logs:** `logs/cycle-YYYY-MM-DD_HHMM.log` (kept 7 days)
- **Social (X/Twitter):** after the breaking-news push, `scripts/post-to-twitter.js` posts the same story as one plain-text tweet (Claude-condensed, OAuth 1.0a, no link → pay-per-use ~$0.015/tweet). Requires `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` in server-side `.env` (git-ignored); skips silently if unset. Deduped via committed `content/.tweet-log.json`. The X app must have **Read+Write** permission and access tokens regenerated *after* enabling write.
- **Social (Instagram):** after the tweet, `scripts/post-to-instagram.js` publishes the same story as a single 4:5 image card — the article headline over a delicate orthographic globe, same visual language as the OG card, rendered at build time to `dist/api/ig/{slug}.jpg` (+ a 9:16 `.story.jpg`) by `scripts/lib/ig-image.js`. It posts the feed image with a Claude-written wire caption (no hashtags), drops the article URL as the first comment, and cross-posts the Story. Uses the Instagram Graph API (container → publish, plain fetch). Requires `IG_USER_ID`, `IG_ACCESS_TOKEN` in server-side `.env` (git-ignored); skips silently if unset. Deduped via committed `content/.instagram-log.json`. Setup: an IG **Business/Creator** account (@zuhdnews) linked to the *Zuhd News* Facebook Page, a token with `instagram_basic` + `instagram_content_publish` (a non-expiring **system-user** token is best for the unattended cron; Development-mode publishing needs no App Review for your own account), and the IG numeric user id from `GET /{page-id}?fields=instagram_business_account`. Set the IG bio link to `https://zuhd.news/get`. Note: Instagram's publish API needs a **public JPEG URL**, which is why the card is a build artifact (deployed before the post runs) and PNG isn't used. Preview any card without credentials: `node scripts/post-to-instagram.js --slug <slug> --dry-run` (writes to `.cache/ig-preview/`).

## Working With Notion

Use `curl` for creating pages and databases (MCP `parent` serialization bug). MCP works for search, reads, and block appends. See `/notion` skill for templates.

**Always create Notion tasks** in the [Project Tasks DB](https://www.notion.so/307e4123a25581759d59ee259ae389ac) when implementing features or changes. Tasks are the system of record.

