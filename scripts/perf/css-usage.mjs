// Which CSS rules never matched anything, measured in a real browser.
//
//   node scripts/perf/css-usage.mjs [outfile]
//
// The gap this fills is named in `build.md`: knip catches an unused file, Biome
// catches an unused variable, and **nothing has ever looked at style.css**,
// which is 6,900 lines and 159 distinct `.map-*` classes. The five dead things
// removed with the top strip on 2026-08-03 — `--map-status-w`, `--legend-x`,
// the `max-width: 1250px` block, `.map-filters { display: contents }` and
// `.map-status`'s absolute positioning — were found by reading, because there
// was nothing else to find them with.
//
// ── Why a browser, and why this cannot be static ──────────────────────────
// A static "is this class name in the source anywhere" grep is worse than
// nothing here. Class names are assembled in the islands (`map-markets-spark${
// toneClass(pct)}`), handed over as `--cat` custom properties, and set from
// data — so a grep finds strings that never render and misses rules that do.
// What is true is only observable at runtime: did this rule ever match an
// element? Chrome answers that through `CSS.startRuleUsageTracking`, the same
// mechanism behind DevTools' Coverage panel.
//
// ── What this reports is a CANDIDATE LIST, never a verdict ────────────────
// A rule that no state in the sweep below reached is reported unused, and
// "unused" here means exactly "no state this script drove made it match". A
// rule for a card that only opens on a GDACS alert, a scrubber that has been
// dragged, or a pane the reader folded is dead *to this run* and alive on the
// site. That is why the report prints the state list it drove alongside the
// findings: the reader has to be able to ask "which of these did I not
// exercise?" before deleting anything. `build.md` carries the protocol.
//
// The output is deliberately not a threshold, a ratchet or a CI gate. It is a
// list to read.

import { chromium } from 'playwright'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serveDist } from '../lib/serve-dist.js'

const ROOT = new URL('../..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const outFile = process.argv[2] || join(ROOT, '.css-usage.txt')

/**
 * The state sweep, and it is the whole accuracy of this instrument.
 *
 * Every entry is a *route plus a set of gestures*, because a stylesheet this
 * one's size is mostly rules for things behind a press. Adding a state can only
 * *cover more bytes*; leaving one out can only leave live rules looking dead —
 * the failure mode is a false "unused", never a false "used", which is what
 * makes the output safe to read as a candidate list and unsafe to act on unread.
 *
 * Note that the **span count is not monotonic** even though the coverage is:
 * adding the 1024 and reduced-motion states below took coverage from 104,716 to
 * 105,143 bytes and the span count from 95 to *105*, because covering the middle
 * of a large gap splits it into two smaller ones. Read the byte figure, not the
 * count, when judging whether a new state helped.
 *
 * `label` is what the report prints when it lists what it drove.
 */
const STATES = [
  {
    label: 'map · desktop 1440 · at rest',
    path: '/',
    width: 1440,
    height: 900,
  },
  {
    label: 'map · desktop 1440 · key panel open, layers toggled, both panes folded',
    path: '/',
    width: 1440,
    height: 900,
    async drive(page) {
      await page.click('.map-more')
      await page.waitForTimeout(300)
      for (const chip of await page.$$('.map-filter:not(.is-locked)')) {
        await chip.click().catch(() => {})
      }
      await page.waitForTimeout(200)
      for (const t of await page.$$('.map-seam-toggle')) {
        await t.click().catch(() => {})
      }
      await page.waitForTimeout(400)
    },
  },
  {
    label: 'map · desktop 1440 · story card, place card, markets panel, scrubber dragged',
    path: '/',
    width: 1440,
    height: 900,
    async drive(page) {
      const row = await page.$('.map-feed-item a, .map-feed-item')
      if (row) {
        await row.click().catch(() => {})
        await page.waitForTimeout(1800)
      }
      const summary = await page.$('.map-markets-summary')
      if (summary) {
        await summary.click().catch(() => {})
        await page.waitForTimeout(400)
      }
      // The scrubber's own states — `is-scrubbed`, the live button, the window
      // band — exist only once the head has been moved off the live edge.
      const track = await page.$('.map-timeline-track')
      if (track) {
        const box = await track.boundingBox()
        if (box) {
          await page.mouse.move(box.x + box.width * 0.55, box.y + box.height / 2)
          await page.mouse.down()
          await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 8 })
          await page.mouse.up()
          await page.waitForTimeout(500)
        }
      }
      // Hovering a country is the `feature-state` path and the country card.
      await page.mouse.move(700, 500)
      await page.waitForTimeout(300)
      await page.mouse.click(700, 500).catch(() => {})
      await page.waitForTimeout(900)
    },
  },
  {
    label: 'map · phone 390 · layers panel open, story drawer pulled up',
    path: '/',
    width: 390,
    height: 844,
    async drive(page) {
      await page.click('.map-more')
      await page.waitForTimeout(300)
      const handle = await page.$('.map-feed-head')
      if (handle) {
        await handle.click().catch(() => {})
        await page.waitForTimeout(500)
      }
    },
  },
  {
    label: 'article · desktop 1440 · doc sheet and share bar opened',
    path: null, // resolved at run time — the newest article
    width: 1440,
    height: 900,
    async drive(page) {
      for (const sel of ['[data-island="share-bar"] button', '.doc-link', 'footer a']) {
        const el = await page.$(sel)
        if (el) {
          await el.click().catch(() => {})
          await page.waitForTimeout(500)
          break
        }
      }
    },
  },
  // The band between the phone and a wide desktop, which nothing else here
  // covers — the first run reported the rail ladder's own `(min-width: 901px)
  // and (max-width: 1199px)` block as dead, correctly, because no viewport in
  // the sweep was inside it. A finding about the instrument, not the stylesheet.
  { label: 'map · desktop 1024 · at rest', path: '/', width: 1024, height: 768 },
  // Reduced motion is a whole `@media` block — 4.4 KB, the largest single span
  // in the first report — and no amount of driving reaches it from a context
  // that has not asked for it.
  {
    label: 'map · desktop 1440 · prefers-reduced-motion',
    path: '/',
    width: 1440,
    height: 900,
    reducedMotion: /** @type {const} */ ('reduce'),
  },
  { label: 'article · phone 390 · at rest', path: null, width: 390, height: 844 },
  { label: 'category /c/politics · desktop 1440', path: '/c/politics', width: 1440, height: 900 },
  { label: 'country /country/PS · desktop 1440', path: '/country/PS', width: 1440, height: 900 },
  { label: 'indicator page · desktop 1440', path: null, width: 1440, height: 900, entity: true },
  { label: 'about · desktop 1440', path: '/about', width: 1440, height: 900 },
  // The article state's own doc-sheet attempt tries `[data-island="share-bar"]
  // button` and `.doc-link` first — neither selector exists anywhere in the
  // codebase (share-bar mounts via `data-island-auto`, not `data-island`, and
  // `.doc-link` was never a real class) — so it falls through to a bare
  // `footer a`, whichever anchor that resolves to. A dedicated state with the
  // real trigger (`site-chrome.js`'s `data-island="doc-sheet"`) is what
  // actually opens `.doc-sheet` and its `::backdrop` on purpose.
  {
    label: 'map · desktop 1440 · doc sheet opened from the footer',
    path: '/',
    width: 1440,
    height: 900,
    async drive(page) {
      const link = await page.$('[data-island="doc-sheet"]')
      if (link) {
        await link.click().catch(() => {})
        await page.waitForTimeout(600)
      }
    },
  },
]

/** The newest built article and one indicator page, so the sweep has real routes. */
async function resolveRoutes() {
  const feed = JSON.parse(await readFile(join(DIST, 'api/articles.json'), 'utf8'))
  const slug = feed.articles?.[0]?.slug
  const entity = (await readdir(join(DIST, 'e')))
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.replace(/\.html$/, ''))[0]
  if (!slug) throw new Error('no articles in dist/api/articles.json — build first')
  return { article: `/a/${slug}`, entity: entity ? `/e/${entity}` : null }
}

const sourceCss = await readFile(join(ROOT, 'public/style.css'), 'utf8')

/**
 * The stylesheet goes back to the page unminified, and that is what makes a
 * finding locatable.
 *
 * `build.js:373` inlines `style.css` through esbuild's `minify`, so the built
 * page carries an 86 KB `<style>` block made from 240 KB of source — and every
 * byte offset the coverage API reports is an offset into that block, not into
 * the file anyone edits. Swapping it back means an offset *is* a position in
 * `public/style.css`. Nothing about which rules match changes: minification is
 * selector-preserving.
 */
const { base, close } = await serveDist({
  transformHtml: (html) => html.replace(/<style>[\s\S]*?<\/style>/, () => `<style>${sourceCss}</style>`),
})
const routes = await resolveRoutes()
const browser = await chromium.launch()

// Used byte ranges into the served stylesheet, unioned across every state.
//
// **Byte ranges, not selectors, and that was the correction.** The first two
// versions tried to name what was used by slicing each covered range and taking
// the text before its `{`. That is a CSS parser written badly: a covered range
// can span a *grouping* rule, so the "selector" came back as `(min-width:
// 641px)` or `(prefers-color-scheme: dark)`, and `.article-sources` — plainly
// on the article page, plainly covered — never produced a key that could cancel
// the one the CSSOM produced. It reported 273 dead rules of which the first
// dozen checked were all alive.
//
// DevTools' Coverage panel reports unused *bytes* for exactly this reason, and
// so does Puppeteer's `stopCSSCoverage`. Since the server hands the browser the
// unminified source, a byte range is a range in `public/style.css` and the
// report can be line numbers with no reconstruction anywhere.
const usedRanges = []
const drivenStates = []
const consoleErrors = []

for (const state of STATES) {
  const path = state.entity ? routes.entity : (state.path ?? routes.article)
  if (!path) continue

  const ctx = await browser.newContext({
    viewport: { width: state.width, height: state.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    ...(state.reducedMotion ? { reducedMotion: state.reducedMotion } : {}),
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => consoleErrors.push(`${state.label}: ${e}`))

  const cdp = await ctx.newCDPSession(page)
  const sheets = new Map()
  cdp.on('CSS.styleSheetAdded', ({ header }) => sheets.set(header.styleSheetId, header.sourceURL))
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  // Before the navigation, or the stylesheet is parsed and its rules matched
  // while nothing is counting — the run then reports the whole file unused.
  await cdp.send('CSS.startRuleUsageTracking')

  await page.goto(base + path, { waitUntil: 'load' })
  // The map fetches its payloads and paints on its own schedule; a state driven
  // before the island has mounted measures an empty page.
  await page.waitForTimeout(path === '/' ? 5500 : 2000)
  if (state.drive) await state.drive(page).catch(() => {})
  await page.waitForTimeout(400)

  const { ruleUsage } = await cdp.send('CSS.stopRuleUsageTracking')
  // Every sheet on these pages is ours and every one is inline — the build
  // inlines the stylesheet into a `<style>` block rather than linking it, which
  // is why matching on a `/style.css` sourceURL found nothing and the first run
  // of this reported a stylesheet of zero rules.
  for (const r of ruleUsage) {
    if (r.used && sheets.has(r.styleSheetId)) usedRanges.push([r.startOffset, r.endOffset])
  }

  drivenStates.push(`${state.label}  →  ${path}`)
  await ctx.close()
}

await browser.close()
close()

/**
 * The uncovered spans of `public/style.css`, as line ranges.
 *
 * `usedRanges` is a bag of overlapping intervals from ten states; sorting and
 * merging them once gives the covered set, and the gaps between them are what
 * nothing matched. Because the server handed the browser the source, these are
 * offsets in the file — the line number is a newline count, not a lookup.
 *
 * The gaps are mostly **comment**: this stylesheet is more prose than
 * declaration in places, and comments are never "covered". A gap whose text is
 * only comment and whitespace is dropped, which is the difference between a
 * report of 200 real spans and one of 2,000 mostly saying "the paragraph above
 * `.map-hud` is not a rule". That filter is a regex over `/* ... *\/`, which is
 * removing text rather than understanding it.
 */
const merged = []
for (const [a, b] of usedRanges.sort((x, y) => x[0] - y[0])) {
  const last = merged[merged.length - 1]
  if (last && a <= last[1]) last[1] = Math.max(last[1], b)
  else merged.push([a, b])
}

const lineAt = (offset) => sourceCss.slice(0, offset).split('\n').length
const gaps = []
let cursor = 0
for (const [a, b] of [...merged, [sourceCss.length, sourceCss.length]]) {
  if (a > cursor) {
    const text = sourceCss.slice(cursor, a)
    const bare = text.replace(/\/\*[\s\S]*?\*\//g, '').trim()
    if (bare) {
      // The label is the first line with something on it, so a span is
      // recognisable without opening the file.
      const first = bare.split('\n').find((l) => l.trim()) ?? ''
      gaps.push({
        from: lineAt(cursor + (text.length - text.trimStart().length)),
        to: lineAt(a),
        bytes: bare.length,
        label: first.trim().slice(0, 90),
      })
    }
  }
  cursor = Math.max(cursor, b)
}
gaps.sort((x, y) => y.bytes - x.bytes)

const coveredBytes = merged.reduce((n, [a, b]) => n + (b - a), 0)
const pct = ((coveredBytes / sourceCss.length) * 100).toFixed(1)

const report = [
  'Spans of public/style.css that no state in this sweep ever matched.',
  '',
  'READ THIS AS A CANDIDATE LIST, NOT A VERDICT. "Unused" means only that no',
  'state below made the rule match. A span for a state this script does not',
  'drive — a GDACS peek card, a metric with no figure, an experiment flag — is',
  'alive on the site and reported here. The protocol for acting on it is in',
  '.claude/rules/web/build.md ("Deleting code safely").',
  '',
  `${sourceCss.length} bytes of source, ${coveredBytes} matched (${pct}%), ${gaps.length} uncovered spans.`,
  'Largest first — a big span is a whole block, which is the cheapest thing to check.',
  '',
  'States driven:',
  ...drivenStates.map((s) => `  · ${s}`),
  '',
  ...(consoleErrors.length
    ? [
        'Page errors during the sweep (the run is suspect if these are not expected):',
        ...consoleErrors.map((e) => `  ! ${e}`),
        '',
      ]
    : []),
  'Never matched:',
  ...gaps.map((g) => `  style.css:${g.from}-${g.to}  (${g.bytes}b)  ${g.label}`),
  '',
].join('\n')

await writeFile(outFile, report)
console.log(report.split('\nNever matched:')[0])
console.log(`Uncovered spans: ${gaps.length} — full list written to ${outFile}`)
