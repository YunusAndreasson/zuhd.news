// Run: node --test scripts/lib/dispatch.test.js
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  coverageRow, dryRun, feedRow, judgeAnswer, loadPrompt, offeredArticles, offeredStories, openCache, promptWithInput,
  runDispatch, staleKeys, stampRun, storedStanding, threadsFor,
} from './dispatch.js'
import { matchesAnyTag } from './entity-registry.js'

// ── offeredArticles, offeredStories ───────────────────────────────────────

/** A `loadArticles` row, as far as the join reads one. */
const article = (slug, title, { entityIds = [], countries = [] } = {}) => ({ slug, title, hay: title.toLowerCase(), entityIds, countries })
/** A `loadFeedWindow` row. */
const story = (title, conceptTitles = []) => ({ title, hay: title.toLowerCase(), conceptTitles })

/** The Bombay exchange as `content/.markets.json` carries it. */
const BSE = { topicTags: ['sensex', 'bombay stock exchange', 'india', 'mumbai', 'rupee'], countryTags: ['IN'] }

test('a country code is never matched as a word: IN is not "in"', () => {
  const riyadh = article('riyadh', 'Three People Killed in Attacks on Riyadh Airport', { countries: ['SA'] })
  const sensex = article('sensex', 'Sensex Slides', { entityIds: ['mkt:bse'] })
  const rbi = article('rbi', "India's Central Bank Hikes Rates", { countries: ['IN'] })
  const tata = article('tata', 'Green Card Freeze Hits Tata', { countries: ['US', 'IN'] })
  const articles = [riyadh, tata, rbi, sensex]

  // What the exchange's tags were while its codes were folded into them.
  assert.ok(matchesAnyTag([...BSE.topicTags, ...BSE.countryTags], riyadh.hay), 'the bug: a tag is lowercased and "in" is a word')

  const offered = offeredArticles(articles, { direct: (a) => a.entityIds.includes('mkt:bse'), ...BSE })
  // About it, then tagged, then its country's — and the airport nowhere.
  assert.deepEqual(offered.map((a) => a.slug), ['sensex', 'rbi', 'tata'])
})

test('an item with no countries is offered what it always was', () => {
  const articles = [article('a', 'Oil Slides on OPEC Talk'), article('b', 'Brent Tops $90', { entityIds: ['brent'] }), article('c', 'Rain in Spain')]
  const offered = offeredArticles(articles, { direct: (a) => a.entityIds.includes('brent'), topicTags: ['oil', 'opec'] })
  assert.deepEqual(offered.map((a) => a.slug), ['b', 'a'])
  assert.deepEqual(offeredArticles(articles, { topicTags: ['spain'] }).map((a) => a.slug), ['c'], 'no direct tier at all, as for an event')
})

test('feed stories: tags first, then the country by name, never by code', () => {
  const feed = [
    story('Three People Killed in Attacks on Riyadh Airport'),
    story('Israel Cabinet Meets on Budget'),
    story('TASE Halts Trading After Glitch'),
    story("India's Central Bank Raises Repo Rate"),
  ]
  assert.deepEqual(offeredStories(feed, BSE).map((s) => s.title), ["India's Central Bank Raises Repo Rate"])
  // Tel Aviv's tags name neither the country nor the city; its country does.
  const tase = { topicTags: ['tel aviv stock exchange', 'ta-125', 'tase'], countryTags: ['IL'] }
  assert.deepEqual(offeredStories(feed, tase).map((s) => s.title), ['TASE Halts Trading After Glitch', 'Israel Cabinet Meets on Budget'])
})

test('an attention series joins on the Wikipedia title alone', () => {
  const feed = [story('Tehran Reopens Talks', ['iran', 'tehran']), story('Iran in the Headlines'), story('Oil Falls', ['brent crude'])]
  const offered = offeredStories(feed, { wikiTitle: 'iran', topicTags: ['iran', 'oil'] })
  assert.deepEqual(offered.map((s) => s.title), ['Tehran Reopens Talks'])
})

// ── storedStanding ────────────────────────────────────────────────────────

test('a definition stands while its fingerprint does', () => {
  // `brent`, content/.indicator-dispatch.json: one fingerprint on 2026-10-07,
  // 08 and 09, and a different sentence each day, because the `standing` that
  // came back with each refreshed `recent` replaced the one before.
  const items = {
    brent: {
      standingFingerprint: '46b7c3b0f3c54c37',
      standing: 'Crude from the North Sea, and the reference against which about two-thirds of internationally traded oil is priced.',
    },
  }
  assert.equal(storedStanding(items, 'brent', '46b7c3b0f3c54c37'), items.brent.standing)
  assert.equal(storedStanding(items, 'brent', 'a-new-identity'), '', 'a changed identity is written again')
  assert.equal(storedStanding(items, 'wti', '46b7c3b0f3c54c37'), '', 'another key is not looked at unless asked')
  assert.equal(storedStanding({ brent: { standingFingerprint: 'x', standing: '' } }, 'brent', 'x'), '', 'an empty one is no definition')
})

test('entries that share an identity come to share one sentence', () => {
  // content/.events-dispatch.json on 2026-10-09: the October and December
  // ECB decisions under one fingerprint, saying the council "meets eight
  // times a year" and "about every six weeks".
  const items = {
    'ecb-2026-10': { standingFingerprint: '644eb225dab9953a', prompt: 'p1', standing: 'The euro area’s central bank, whose Governing Council meets eight times a year.' },
    'ecb-2026-12': { standingFingerprint: '644eb225dab9953a', prompt: 'p1', standing: 'The Governing Council, which meets about every six weeks.' },
  }
  const opts = { shared: true, prompt: 'p1' }
  const first = items['ecb-2026-10'].standing
  assert.equal(storedStanding(items, 'ecb-2026-10', '644eb225dab9953a', opts), first)
  assert.equal(storedStanding(items, 'ecb-2026-12', '644eb225dab9953a', opts), first, 'the first in the file, for both')
  assert.equal(storedStanding(items, 'ecb-2027-01', '644eb225dab9953a', opts), first, 'and for a meeting never seen')
})

test('a definition written under another prompt is not kept', () => {
  // The events fingerprint is the identity alone. Without this a rewritten
  // rubric would reach `recent` and never a definition.
  const items = {
    'fomc-2026-10': { standingFingerprint: 'f', prompt: 'old', standing: 'Written under the old rubric.' },
    'fomc-2026-12': { standingFingerprint: 'f', standing: 'Written before entries recorded a prompt.' },
  }
  assert.equal(storedStanding(items, 'fomc-2026-10', 'f', { shared: true, prompt: 'new' }), '')
  assert.equal(storedStanding(items, 'fomc-2026-10', 'f', { shared: true, prompt: 'old' }), 'Written under the old rubric.')
})

// ── staleKeys ─────────────────────────────────────────────────────────────

/** The indicator dispatch's four payloads, by the prefix each one mints. */
const sourceOf = (key) =>
  key.startsWith('cp:') ? 'chokepoints' : key.startsWith('mkt:') ? 'markets' : key.startsWith('co:') ? 'companies' : 'trends'

test('a key no source carries any more is dropped, a live one never', () => {
  const { drop, held } = staleKeys(['brent', 'poly-old', 'cp:suez', 'cp:gone'], ['brent', 'cp:suez', 'wiki-new'], sourceOf)
  assert.deepEqual(drop, ['poly-old', 'cp:gone'])
  assert.deepEqual(held, {})
})

test('a source that gave nothing loses nothing, and the others are still pruned', () => {
  // The chokepoint payload did not load: no `cp:` key is live. Its eleven
  // paragraphs stay; a Polymarket question that closed still goes.
  const cached = ['brent', 'poly-closed', 'cp:hormuz', 'cp:suez', 'mkt:bist']
  const { drop, held } = staleKeys(cached, ['brent', 'mkt:bist'], sourceOf)
  assert.deepEqual(drop, ['poly-closed'])
  assert.deepEqual(held, { chokepoints: 2 })
})

test('a cache that has grown does not stop its own prune', () => {
  // 2026-10-09, the daily pass: 157 live items against 390 cached, 233 of
  // them instruments that had left every payload. A floor on live/cached
  // (0.40 here, under its 0.6) declined the prune, as it had every day in the
  // logs; none had run since 2026-09-21.
  const live = Array.from({ length: 157 }, (_, i) => (i < 11 ? `cp:${i}` : i < 41 ? `mkt:${i}` : i < 61 ? `co:${i}` : `ind-${i}`))
  const dead = Array.from({ length: 233 }, (_, i) => (i < 121 ? `poly-gone-${i}` : `stocks:GONE${i}`))
  const { drop, held } = staleKeys([...live, ...dead], live, sourceOf)
  assert.equal(drop.length, 233)
  assert.deepEqual(held, {})
})

test('nothing live at all holds everything: one source, and it did not load', () => {
  // The events dispatch has one source, the snapshot's `events`.
  const { drop, held } = staleKeys(['fomc-2026-10', 'ecb-2026-10'], [])
  assert.deepEqual(drop, [])
  assert.deepEqual(held, { '': 2 })
})

// ── stampRun ──────────────────────────────────────────────────────────────

test('a new-only pass that wrote nothing leaves the stamp alone and has nothing to write', () => {
  // b5b81136, "Indicator dispatch 2026-10-08T10:18": one changed line,
  // `generatedAt`, from a pass that selected no item.
  const now = new Date('2026-10-08T10:18:03.994Z')
  const cache = { items: {}, generatedAt: '2026-10-08T05:26:23.958Z', windowDays: 14 }
  assert.equal(stampRun(cache, { newOnly: true, generated: 0, windowDays: 14, now }), false)
  assert.equal(cache.generatedAt, '2026-10-08T05:26:23.958Z')

  // It found a new instrument: the file changed, and says when.
  assert.equal(stampRun(cache, { newOnly: true, generated: 2, windowDays: 14, now }), true)
  assert.equal(cache.generatedAt, '2026-10-08T10:18:03.994Z')
})

test('the daily pass stamps whatever it wrote', () => {
  // Every item a cache hit is still the day's pass, and its prune may have
  // changed the file.
  const cache = { items: {} }
  assert.equal(stampRun(cache, { generated: 0, windowDays: 14, now: new Date('2026-10-09T05:26:00.000Z') }), true)
  assert.deepEqual(cache, { items: {}, generatedAt: '2026-10-09T05:26:00.000Z', windowDays: 14 })
})

// ── The prompt, and the rows the model is shown ───────────────────────────

test('the INPUT wrapper is the text each stage used to spell, byte for byte', () => {
  // Three scripts carried this template. It is the prompt: a space moved is
  // a different request to the model.
  const bundle = { a: 1 }
  assert.equal(
    promptWithInput('BASE', bundle),
    'BASE\n\n## INPUT (this is the only material `recent` may draw from)\n\n```json\n{\n  "a": 1\n}\n```\n\n' +
      'Output ONLY the JSON object `{ "standing": "...", "recent": "...", "citations": [...] }`. No markdown, no fences.',
  )
  assert.equal(
    promptWithInput('BASE', bundle, { note: 'this is the only material you may draw from', shape: '{ "narrative": "..." }' }),
    'BASE\n\n## INPUT (this is the only material you may draw from)\n\n```json\n{\n  "a": 1\n}\n```\n\n' +
      'Output ONLY the JSON object `{ "narrative": "..." }`. No markdown, no fences.',
  )
})

test('a row is the keys the prompt names, in the order they have always been sent', () => {
  // Key order is the bytes of the prompt, and `slug` and `headline` are what
  // the fingerprints hash.
  const a = { slug: '2026-10-05-hormuz-talks', title: 'Hormuz Talks Resume', date: '2026-10-05T08:00:00Z', location: 'Muscat', lead: 'Muscat — Talks resumed.', hay: 'x', entityIds: [] }
  assert.equal(JSON.stringify(coverageRow(a)), '{"slug":"2026-10-05-hormuz-talks","title":"Hormuz Talks Resume","date":"2026-10-05","dateline":"Muscat","lead":"Muscat — Talks resumed."}')
  const s = { title: 'Tanker rates climb', date: '2026-10-04', source: 'Lloyd’s List', outlets: 40, hay: 'x', conceptTitles: [] }
  assert.equal(JSON.stringify(feedRow(s)), '{"headline":"Tanker rates climb","date":"2026-10-04","source":"Lloyd’s List","outlets":40}')
})

test('threads are the ledger rows a tag names, three at most', () => {
  /** @type {any[]} */
  const ledger = [1, 2, 3, 4].map((n) => ({ label: `Hormuz closure ${n}`, arc: 'escalating', summary: `S${n}`, slugs: [] }))
  ledger.push({ label: 'Sudan ceasefire', arc: 'stalled', summary: 'T' }, { summary: 'no label' })
  assert.deepEqual(threadsFor(ledger, ['hormuz']), [1, 2, 3].map((n) => ({ label: `Hormuz closure ${n}`, arc: 'escalating', summary: `S${n}` })))
  assert.deepEqual(threadsFor(ledger, ['brent']), [])
})

test('a prompt file gives its text and its own worked examples; a missing one says which', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-'))
  try {
    const path = join(dir, 'prompt.md')
    writeFileSync(path, '# Rules\n\n> The price of a tonne of thermal coal loaded at Newcastle, Australia, and\n> the benchmark Asian power stations buy against.\n\nMore.\n')
    const prompt = loadPrompt(path)
    assert.match(prompt.text, /^# Rules/)
    assert.equal(prompt.examples.length, 1)
    assert.throws(() => loadPrompt(join(dir, 'gone.md')), /gone\.md/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── judgeAnswer ───────────────────────────────────────────────────────────

/** What the indicator dispatch hands the model for Brent, cut down. */
const BRENT = {
  instrument: { kind: 'indicator', label: 'Brent crude', unit: '$/bbl' },
  series: { windowDays: 61, latest: 125.4, changePctOverSeries: 12.3, extremes: { high: { value: 131.2, on: 'Sep 30' }, low: { value: 98.6, on: 'Aug 12' } } },
  coverage: [
    { slug: '2026-10-05-hormuz-talks-resume', title: 'Hormuz Talks Resume', date: '2026-10-05', dateline: 'Muscat', lead: 'Muscat — Iran and Oman reopened talks on tanker passage.' },
    { slug: '2026-10-03-opec-holds-output', title: 'OPEC Holds Output', date: '2026-10-03', dateline: 'Vienna', lead: 'Vienna — OPEC kept quotas unchanged for November.' },
  ],
  feedWindow: [],
  threads: [],
}
/** The ✓ example of `narrate-indicators-prompt.md`, as `promptExamples` reads it. */
const EXAMPLE = "The peso's firming tracked the copper price it lives on: Escondida's union settled without a stoppage, and the government published a June-quarter figure that was flattered by a cut to the prior-year base, so the ratio rose without extra output."
const STANDING = 'Crude from the North Sea, and the reference most traded oil is priced against.'
/** @returns {any} either arm of the verdict: each test knows which it asked for */
const judge = (out, standing = STANDING) => judgeAnswer(out, BRENT, { examples: [EXAMPLE], standing })

test('a grounded answer is kept, with the citations it was offered and no others', () => {
  const kept = judge({
    recent: '  "Talks between Iran and Oman on tanker passage reopened in Muscat, and OPEC kept its quotas unchanged."  ',
    citations: ['2026-10-05-hormuz-talks-resume', 'a-slug-it-made-up', 42, '2026-10-03-opec-holds-output'],
  })
  assert.deepEqual(kept, {
    rejected: false,
    standing: STANDING,
    recent: 'Talks between Iran and Oman on tanker passage reopened in Muscat, and OPEC kept its quotas unchanged.',
    citations: ['2026-10-05-hormuz-talks-resume', '2026-10-03-opec-holds-output'],
    recentRaw: 'Talks between Iran and Oman on tanker passage reopened in Muscat, and OPEC kept its quotas unchanged.',
    dropped: null,
    standingEcho: null,
    chartEchoes: [],
  })
})

test('a refused `recent` is not a refused item: the definition stays, the paragraph and its citations go', () => {
  const invented = judge({ recent: 'Quotas were cut by 777,000 barrels a day.', citations: ['2026-10-03-opec-holds-output'] })
  assert.equal(invented.rejected, false)
  assert.equal(invented.standing, STANDING)
  assert.equal(invented.recent, '')
  assert.deepEqual(invented.citations, [], 'a list with no sentence behind it is not shipped')
  assert.equal(invented.dropped, 'number "777,000" not in input')
  assert.equal(invented.recentRaw, 'Quotas were cut by 777,000 barrels a day.', 'kept for the log')

  const actor = judge({ recent: 'The rise followed a bid from Aban Tether.' })
  assert.match(actor.dropped, /name "Aban" not in input/)

  // Handing back the prompt's illustration is not an answer: this one gates.
  const copied = judge({ recent: EXAMPLE })
  assert.equal(copied.recent, '')
  assert.equal(copied.dropped, 'reproduces a prompt example (100%)')

  // 1.4 times the cap is the limit, not the cap.
  assert.equal(judge({ recent: 'the talks went on and on '.repeat(15).trim() }).dropped, null, '374 characters, over 360, is kept')
  assert.equal(judge({ recent: 'the talks went on and on '.repeat(21).trim() }).dropped, 'over cap')

  assert.equal(judge({ recent: '' }).dropped, null, 'an empty one was not dropped: the model had nothing to say')
  assert.equal(judge({}).recent, '')
})

test('an echo in `standing` is counted, never dropped; a chart read aloud is measured', () => {
  // A dropped `standing` drops the item, and the app drops a card with no
  // prose: the count is how the log says the prompt needs work.
  const echoed = judge({ recent: '' }, EXAMPLE)
  assert.equal(echoed.rejected, false)
  assert.equal(echoed.standing, EXAMPLE)
  assert.equal(echoed.standingEcho, 1)

  const chart = judge({ recent: 'Brent sits near 125.4 after a 12.3% rise, as talks on tanker passage reopened.' })
  assert.equal(chart.dropped, null, 'the figures are in the bundle, so it is grounded')
  assert.deepEqual(chart.chartEchoes, ['125.4', '12.3'])
})

test('no definition, or one far over its cap, rejects the item', () => {
  const none = judge({ recent: 'Talks reopened.', citations: ['2026-10-03-opec-holds-output'] }, '')
  assert.equal(none.rejected, true)
  assert.deepEqual([none.recent, none.citations], ['', []], 'nothing of a rejected item is to be stored')
  assert.equal(judge({ recent: 'Talks reopened.' }, 'x'.repeat(337)).rejected, true, '240 × 1.4 is 336')
  assert.equal(judge({ recent: 'Talks reopened.' }, 'x'.repeat(336)).rejected, false)
})

// ── runDispatch ───────────────────────────────────────────────────────────

/** Run `fn` with `console.log` kept: the loop prints a line an item, and a
 *  test file's stdout is the runner's channel. Returns what it would have printed. */
async function quietly(fn) {
  const lines = []
  const log = console.log
  console.log = (...args) => lines.push(args.join(' '))
  try {
    await fn()
  } finally {
    console.log = log
  }
  return lines
}

/**
 * A pass over toy items in a scratch directory, and what it asked for.
 *
 * @param {{ cache?: any, items: any[], selected?: any[],
 *   answer?: (bundle: any, seen: { onDisk: number | null }) => any, [option: string]: any }} run
 */
async function pass({ cache = { items: {} }, items, selected = items, answer = () => ({ out: { standing: 'What it is.', recent: 'What happened.', citations: [] }, costUsd: 0.25 }), ...rest }) {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-'))
  const cachePath = join(dir, 'cache.json')
  const asked = []
  let counts
  try {
    const log = await quietly(async () => {
      counts = await runDispatch({
        cachePath,
        cache,
        items,
        selected,
        bundleOf: (item) => ({ coverage: [], feedWindow: [], threads: [], key: item.key }),
        fingerprintsOf: (item) => ({ standing: `s-${item.identity ?? item.key}`, recent: `r-${item.key}-${item.story ?? 0}` }),
        ask: async (bundle) => {
          asked.push(bundle.key)
          await new Promise((resolve) => setImmediate(resolve))
          return answer(bundle, { onDisk: existsSync(cachePath) ? Object.keys(JSON.parse(readFileSync(cachePath, 'utf8')).items).length : null })
        },
        examples: [],
        standingOf: (_item, written) => written,
        ...rest,
      })
    })
    return { counts, asked, cache, log, written: existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : null }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const entry = (key, extra = {}) => ({ standingFingerprint: `s-${key}`, recentFingerprint: `r-${key}-0`, standing: 'Kept.', recent: 'Kept too.', citations: [], generatedAt: '2026-10-08T05:00:00.000Z', ...extra })

test('an item whose two fingerprints stand is not asked for; the others are written as they always were', async () => {
  const cache = { items: { old: entry('old'), moved: entry('moved') } }
  const { counts, asked, written } = await pass({ cache, items: [{ key: 'old' }, { key: 'moved', story: 1 }, { key: 'new' }] })
  assert.deepEqual(asked, ['moved', 'new'])
  assert.deepEqual(counts, { generated: 2, cacheHits: 1, rejected: 0, failed: 0, recentDropped: 0, chartEchoes: 0, promptEchoes: 0, costUsd: 0.5 })
  assert.deepEqual(written.items.old, entry('old'), 'a hit is not touched')
  // The entry's keys, and their order: the file is committed and diffed.
  assert.deepEqual(Object.keys(written.items.new), ['standingFingerprint', 'recentFingerprint', 'standing', 'recent', 'citations', 'generatedAt'])
  assert.equal(written.items.moved.recentFingerprint, 'r-moved-1')
  assert.equal(written.items.moved.recent, 'What happened.')
  assert.equal(written.windowDays, 14)
  assert.match(written.generatedAt, /^\d{4}-\d\d-\d\dT/)
})

test('a failed call and a missing definition store nothing, and say so in the counts', async () => {
  const { counts, written } = await pass({
    items: [{ key: 'down' }, { key: 'blank' }, { key: 'fine' }],
    answer: (bundle) => (bundle.key === 'down' ? { error: 'claude timed out after 120s' } : { out: { standing: bundle.key === 'blank' ? '' : 'What it is.', recent: '' } }),
  })
  assert.equal(counts.failed, 1)
  assert.equal(counts.rejected, 1)
  assert.equal(counts.generated, 1)
  assert.deepEqual(Object.keys(written.items), ['fine'])
})

test('the cache is on disk every ten new items, so a killed pass keeps what it finished', async () => {
  // The events stage wrote once, at the end: a pass killed at its timeout
  // kept nothing. Both stages go through this loop now.
  const seen = []
  const before = process.listenerCount('SIGTERM')
  const { counts } = await pass({
    items: Array.from({ length: 24 }, (_, i) => ({ key: `item-${i}` })),
    answer: (_bundle, { onDisk }) => {
      seen.push(onDisk)
      return { out: { standing: 'What it is.', recent: '' } }
    },
  })
  assert.equal(counts.generated, 24)
  assert.ok(seen.includes(10) && seen.includes(20), `asks saw ${[...new Set(seen)].join(', ')} entries on disk`)
  assert.equal(process.listenerCount('SIGTERM'), before, 'the flush on SIGTERM is taken down with the pass')
})

test('the full pass prunes by source and stamps; a new-only pass does neither when it writes nothing', async () => {
  const sourceOf = (key) => (key.startsWith('cp:') ? 'chokepoints' : 'trends')
  const stale = () => ({ items: { brent: entry('brent'), 'poly-closed': entry('poly-closed'), 'cp:suez': entry('cp:suez') } })

  const daily = await pass({ cache: stale(), items: [{ key: 'brent' }], sourceOf })
  assert.deepEqual(Object.keys(daily.written.items), ['brent', 'cp:suez'], 'the closed question goes; no chokepoint loaded, so its paragraph stays')
  assert.ok(daily.written.generatedAt)
  assert.ok(daily.log.includes('  pruned 1 stale entries'))
  assert.ok(daily.log.some((line) => /prune held 1 stale entries: chokepoints gave no items/.test(line)), 'and the log names the source that gave nothing')

  const newOnly = await pass({ cache: stale(), items: [{ key: 'brent' }], selected: [], sourceOf, newOnly: true })
  assert.equal(newOnly.written, null, 'nothing new, nothing written')
  assert.deepEqual(Object.keys(newOnly.cache.items), ['brent', 'poly-closed', 'cp:suez'])
  assert.equal(newOnly.cache.generatedAt, undefined)

  const found = await pass({ cache: stale(), items: [{ key: 'brent' }, { key: 'wiki-new' }], selected: [{ key: 'wiki-new' }], sourceOf, newOnly: true })
  assert.deepEqual(Object.keys(found.written.items), ['brent', 'poly-closed', 'cp:suez', 'wiki-new'], 'written, stamped, and still not pruned')
  assert.ok(found.written.generatedAt)
})

test('the stage chooses the definition, and may add a key to the entry', async () => {
  // The events stage: one sentence for one identity, and the prompt it was
  // written under recorded beside it.
  let n = 0
  const cache = { items: {} }
  const { written, asked } = await pass({
    cache,
    items: [{ key: 'fomc-2026-10', identity: 'fomc' }, { key: 'fomc-2026-12', identity: 'fomc' }],
    answer: () => ({ out: { standing: `Definition ${++n}.`, recent: '' } }),
    standingOf: (item, text, fingerprint) => storedStanding(cache.items, item.key, fingerprint, { shared: true, prompt: 'p1' }) || text,
    entryExtra: { prompt: 'p1' },
  })
  assert.deepEqual(asked, ['fomc-2026-10', 'fomc-2026-12'])
  assert.equal(written.items['fomc-2026-10'].standing, 'Definition 1.')
  assert.equal(written.items['fomc-2026-12'].standing, 'Definition 1.', 'the second row takes the first row’s sentence')
  assert.deepEqual(Object.keys(written.items['fomc-2026-12']), ['standingFingerprint', 'recentFingerprint', 'prompt', 'standing', 'recent', 'citations', 'generatedAt'])
})
test('forced, every item is asked for whatever the cache holds', async () => {
  const { asked, counts } = await pass({ cache: { items: { old: entry('old') } }, items: [{ key: 'old' }], force: true })
  assert.deepEqual(asked, ['old'])
  assert.equal(counts.cacheHits, 0)
})

// ── dryRun, openCache ─────────────────────────────────────────────────────

test('a dry run says what each item would cost, and asks for nothing', async () => {
  const cache = { items: { hit: entry('hit'), story: entry('story'), identity: entry('identity') } }
  let rows
  const log = await quietly(() => {
    rows = dryRun({
      cache,
      selected: [{ key: 'hit' }, { key: 'story', story: 2 }, { key: 'identity', identity: 'renamed' }, { key: 'new' }],
      bundleOf: (item) => ({ coverage: item.key === 'new' ? [] : [{ slug: 'a' }], feedWindow: [], threads: [] }),
      fingerprintsOf: (item) => ({ standing: `s-${item.identity ?? item.key}`, recent: `r-${item.key}-${item.story ?? 0}` }),
    })
  })
  assert.equal(log.at(-1), '3/4 items would be asked for')
  assert.deepEqual(rows.map((r) => [r.key, r.would]), [
    ['hit', 'cached'],
    ['story', 'call (story moved)'],
    ['identity', 'call (identity or prompt moved)'],
    ['new', 'call (new)'],
  ])
  assert.deepEqual(cache.items.hit, entry('hit'), 'the cache is read, never written')
})

test('a cache that is missing, or has no items yet, opens empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-'))
  try {
    assert.deepEqual(openCache(join(dir, 'none.json')), { items: {} })
    writeFileSync(join(dir, 'bare.json'), JSON.stringify({ generatedAt: '2026-10-09T05:26:00.000Z' }))
    assert.deepEqual(openCache(join(dir, 'bare.json')), { generatedAt: '2026-10-09T05:26:00.000Z', items: {} })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
