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
| `scripts/fetch-news.js` | RSS fetcher for the niche outlets (`scripts/lib/rss-sources.js`); the feeds are deduplicated later, by `merge-feeds.js` and `prefilter-feed.js` |
| `scripts/build.js` | Markdown → HTML static site generator (custom) |
| `scripts/validate-articles.js` | Validates frontmatter/structure before deploy; moves malformed articles aside |
| `scripts/write-last-cycle.js` | Writes `content/.last-cycle.json` from validated articles (selector dedup signal) |
| `scripts/coverage-map.js` | Generates compact topic-group coverage map injected into selector prompt |
| `scripts/generate-briefing.js` | Daily audio briefing: a model writes the script, Gemini TTS reads it (Chirp 3 HD for any section Gemini cannot, or for all of it without a Gemini key), output to `content/audio/` |
| `scripts/select-prompt.md` | Selector prompt: read pre-fetched feed, pick stories, save selection JSON |
| `scripts/write-prompt.md` | Writer prompt: read selection + prefetched content, draft markdown |
| `scripts/check-prompt.md` | Editor prompt: check new articles for style violations only |
| `scripts/run-cycle.sh` | Takes the lock and starts the cycle; the stages, build, commit and deploy are the list in `scripts/cycle/stages.js` |
| `scripts/lib/frontmatter.js` | Shared YAML frontmatter parser |
| `templates/article.html` | Article page template |
| `templates/index.html` | Homepage template |
| `public/style.css` | Typography-first CSS design system |
| `public/islands/situation-map.ts` | The homepage map (replaced `public/reader.js`, deleted 2026-07-24) |
| `content/.last-cycle.json` | Published articles from last cycle (selector dedup signal) |
| `content/.story-ledger.json` | Cross-cycle story deduplication ledger |

## Sources

Two halves, merged by `merge-feeds.js`:

- **By RSS** (28 outlets and Hacker News, `scripts/lib/rss-sources.js`): 404 Media, Bellingcat, Mada Masr, Salaam Gateway, InSight Crime, Declassified UK, Responsible Statecraft, Drop Site News, SMEX, SciDev.Net, The Record, Phys.org, Quanta Magazine, Carbon Brief, New Lines Magazine, The War Zone, European Spaceflight, Inkstick, Rest of World, The Diplomat, Lowy Interpreter, Dialogue Earth, Global Voices, Payload, C4ISRNET, TechNode, Latin America Reports, Mondoweiss
- **By NewsAPI.ai**: the wires and the large outlets, from `CURATED_SOURCES` and the queries in `scripts/fetch-news-api.js`

## Hosting & Deploy

- **Cloudflare Pages**, direct upload via `wrangler pages deploy dist --branch master`
- Production branch: `master` (custom domain `zuhd.news` only serves production deployments)
- **Cycle:** systemd timer (`zuhd-news-cycle.timer`) 5x daily (05:00, 10:00, 14:00, 18:00, 22:00 UTC — timed to when news is published; 05:00 runs the daily jobs, `DAILY_HOUR` in `scripts/lib/cycle-run.js`)
- **Manual run:** `env -u CLAUDECODE bash scripts/run-cycle.sh`
- **Design:** Source Sans 3, 20px base, 80ch measure, no decoration
- **Logs:** `logs/cycle-YYYY-MM-DD_HHMM.log` (kept 7 days)
- **Social (X/Twitter):** after the breaking-news push, `scripts/post-to-twitter.js` posts the same story as a single **image tweet** — the **4:5 card** Instagram gets, rendered by `scripts/lib/ig-image.js`, uploaded via v1.1 `media/upload` (OAuth 1.0a) and tweeted **image-only** (a Claude-condensed text tweet is only a fallback if the image can't post). Requires `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` in server-side `.env` (git-ignored); skips with one line if unset. A post X refuses is logged, exits 1, and the cycle prints `⚠ tweet step failed (non-fatal)`. Deduped via committed `content/.tweet-log.json`. The X app must have **Read+Write** permission and access tokens regenerated *after* enabling write.
- **Social (Instagram):** after the tweet, `scripts/post-to-instagram.js` publishes the same story as a single **dark 4:5 card** — the article headline + story lead (dek) over a delicate orthographic globe, with a soft text shadow, rendered at build time to `dist/api/ig/{slug}.jpg` (+ a 9:16 `.story.jpg`) by `scripts/lib/ig-image.js`. It posts the feed image with a Claude-written wire caption (no hashtags), drops the article URL as the first comment, and cross-posts the Story. Uses the Instagram Graph API (container → publish, plain fetch). Requires `IG_USER_ID`, `IG_ACCESS_TOKEN` in server-side `.env` (git-ignored); skips silently if unset. Deduped via committed `content/.instagram-log.json`. Setup: an IG **Business/Creator** account (@zuhdnews) linked to the *Zuhd News* Facebook Page, a token with `instagram_basic` + `instagram_content_publish` (a non-expiring **system-user** token is best for the unattended cron; Development-mode publishing needs no App Review for your own account), and the IG numeric user id from `GET /{page-id}?fields=instagram_business_account`. Set the IG bio link to `https://zuhd.news/get`. Note: Instagram's publish API needs a **public JPEG URL**, which is why the card is a build artifact (deployed before the post runs) and PNG isn't used. Preview any card without credentials: `node scripts/post-to-instagram.js --slug <slug> --dry-run` (writes to `.cache/ig-preview/`).

## Environment

What the pipeline reads from its environment. A missing key skips its source with one line; it never fails a cycle, except `NEWSAPI_KEY`, without which the API half of the feed is empty and the cycle runs on RSS alone.

| Key | Read by | Without it |
|-----|---------|------------|
| `NEWSAPI_KEY` | `fetch-news-api.js` | no API feed |
| `FRED_API_KEY`, `OER_APP_ID` | `fetch-trends.js` (`lib/trends-registry.js`) | that source's rows are carried from the last snapshot |
| `COINGECKO_API_KEY` | `lib/trends-sources/crypto.js` | the shared, rate-limited pool |
| `FIRMS_MAP_KEY` | `fetch-firms.js` | the thermal layer keeps its previous snapshot |
| `CLOUDFLARE_API_TOKEN` | `fetch-analytics.js`, `wrangler` | no analytics; no deploy |
| `GEMINI` or `GEMINI_API_KEY` | `lib/gemini-tts.js` | the briefing is read by Chirp 3 HD |
| `GOOGLE_APPLICATION_CREDENTIALS` | the Google TTS client in `generate-briefing.js` | no fallback voice |
| `PUSH_SECRET` | `lib/cycle-steps.js` | no push notifications |
| `X_*`, `IG_*` | the two posters | no post |

Knobs for a run by hand. The unit file and `.env` set none of them.

| Variable | Default | Effect |
|----------|---------|--------|
| `ZUHD_MODEL`, `ZUHD_SELECTOR_MODEL`, `ZUHD_BRIEFING_MODEL`, `ZUHD_DISPATCH_MODEL`, `ZUHD_EVENTS_MODEL`, `ZUHD_SV_MODEL`, `ZUHD_SOCIAL_PICK_MODEL`, `PM_TITLE_MODEL` | the pins in `scripts/lib/models.js` | one caller's model |
| `ZUHD_EDITOR_EFFORT`, `ZUHD_SV_EFFORT`, `PM_TITLE_EFFORT` | `low`, `high`, `low` | that caller's effort |
| `NARRATE_INDICATORS_FORCE`, `NARRATE_EVENTS_FORCE`, `NARRATE_GDACS_FORCE`, `ZUHD_SV_FORCE` | off; `1` to set | write again what the cache already holds |
| `NARRATE_INDICATORS_MAX`, `NARRATE_EVENTS_MAX`, `NARRATE_GDACS_MAX` | no limit | at most this many items written in one run |
| `NARRATE_GDACS_INCLUDE_GREEN` | off | narrate Green alerts too |
| `FORCE`, `WINDOW_DAYS` | off, `7` | `fetch-conflict.js`: fetch although the six-hour cache is fresh; the days of the dataset kept |
| `IODA_RECENT_DAYS`, `IODA_BASELINE_DAYS` | `2`, `90` | `fetch-ioda.js`: the window scored, and what it is scored against |
| `PM_HAIKU_TIMEOUT_MS` | `100000` | the Polymarket title call's deadline |
| `SKIP_OG` | off (`1` under `npm run dev`) | build without share cards |
| `ZUHD_BUILD_VERBOSE` | off; `1` to set | one `Built:` line per article in the build's output |

## Working With Notion

Use `curl` for creating pages and databases (MCP `parent` serialization bug). MCP works for search, reads, and block appends. See `/notion` skill for templates.

**Always create Notion tasks** in the [Project Tasks DB](https://www.notion.so/307e4123a25581759d59ee259ae389ac) when implementing features or changes. Tasks are the system of record.

