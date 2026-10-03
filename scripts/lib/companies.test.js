import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COMPANY_STORIES,
  companiesPayload,
  companyMismatch,
  companyRecord,
  completedCloses,
} from './companies.js'
import { COMPANY_TRACKED } from './company-metadata.js'

const NVIDIA = COMPANY_TRACKED.find((c) => c.id === 'nvidia')
const NOW = Date.UTC(2026, 9, 3)

/** A response shaped as `fetchYahooStock` returns one. */
const quote = (over = {}) => ({
  values: [220, 225.5, 233.95],
  periods: ['Sep 30', 'Oct 1', 'Oct 2'],
  dates: ['2026-09-30', '2026-10-01', '2026-10-02'],
  completed: [true, true, true],
  asOf: '2026-10-02',
  name: 'NVIDIA Corporation',
  currencyReported: 'USD',
  timezone: 'America/New_York',
  exchange: 'NMS',
  ...over,
})

// ── the catalog ────────────────────────────────────────────────────────────

test('every company has what its card and its join need', () => {
  const ids = new Set()
  const symbols = new Set()
  for (const c of COMPANY_TRACKED) {
    for (const key of ['id', 'name', 'about', 'symbol', 'exchange', 'iso2', 'currency', 'currencyName', 'tz', 'match', 'blurb']) {
      assert.ok(typeof c[key] === 'string' && c[key].trim(), `${c.id}: ${key}`)
    }
    assert.ok(!ids.has(c.id), `${c.id} listed twice`)
    assert.ok(!symbols.has(c.symbol), `${c.symbol} listed twice`)
    ids.add(c.id)
    symbols.add(c.symbol)
    assert.match(c.iso2, /^[A-Z]{2}$/)
    assert.equal(c.match, c.match.toLowerCase(), `${c.id}: match is compared lowercased`)
    // The home listing is one of the tickers a story may name it by.
    assert.ok(c.tickers.includes(c.symbol), `${c.id}: tickers lack ${c.symbol}`)
    // The app drops a card with nothing under its chart.
    assert.ok(c.blurb.length > 40, `${c.id}: blurb`)
    // The narration stage keeps the blurb as `standing` and refuses an item
    // whose standing is over its cap — which would leave the company without
    // an account of its share, and re-ask the model for one every day.
    assert.ok(c.blurb.length <= 240, `${c.id}: blurb is ${c.blurb.length} characters, cap 240`)
    for (const tag of c.topicTags) assert.equal(tag, tag.toLowerCase(), `${c.id}: tag ${tag}`)
  }
})

test('no tag is a word a story uses for something else', () => {
  // `apple` the fruit, `amazon` the river, `meta` the prefix, `alphabet` the
  // letters: each would hang unrelated stories off a share price.
  const ordinary = new Set(['apple', 'amazon', 'meta', 'alphabet', 'visa', 'intel', 'oracle'])
  for (const c of COMPANY_TRACKED) {
    for (const tag of c.topicTags) assert.ok(!ordinary.has(tag), `${c.id}: ${tag}`)
    // Such a name is `commonName`, which never lists a story by itself.
    if (ordinary.has(c.name.toLowerCase())) assert.equal(c.commonName, c.name.toLowerCase())
  }
})

// ── the wrong-instrument guard ─────────────────────────────────────────────

test('companyMismatch passes the company asked for', () => {
  assert.equal(companyMismatch(NVIDIA, quote()), null)
})

test('companyMismatch catches another New York share by its name', () => {
  // Same currency, same zone: the exchange catalog's check sees nothing.
  assert.match(
    companyMismatch(NVIDIA, quote({ name: 'PIMCO Income Strategy Fund' })) ?? '',
    /does not contain "nvidia"/,
  )
  assert.match(companyMismatch(NVIDIA, quote({ name: '' })) ?? '', /does not contain/)
})

test('companyMismatch keeps the currency and zone checks', () => {
  assert.match(companyMismatch(NVIDIA, quote({ currencyReported: 'EUR' })) ?? '', /currency/)
  assert.match(companyMismatch(NVIDIA, quote({ timezone: 'Asia/Tokyo' })) ?? '', /timezone/)
})

// ── completed sessions ─────────────────────────────────────────────────────

test('completedCloses drops a session still trading', () => {
  const live = quote({
    values: [220, 225.5, 233.95, 240.1],
    periods: ['Sep 30', 'Oct 1', 'Oct 2', 'Oct 3'],
    completed: [true, true, true, false],
  })
  assert.deepEqual(completedCloses(live), {
    values: [220, 225.5, 233.95],
    periods: ['Sep 30', 'Oct 1', 'Oct 2'],
  })
})

test('completedCloses keeps a series that carries no flags', () => {
  const { completed: _completed, ...bare } = quote()
  assert.equal(completedCloses(bare).values.length, 3)
})

test('companyRecord publishes the last completed close as the level', () => {
  const live = quote({
    values: [220, 225.5, 233.95, 240.1],
    periods: ['Sep 30', 'Oct 1', 'Oct 2', 'Oct 3'],
    completed: [true, true, true, false],
  })
  const built = companyRecord(NVIDIA, live)
  assert.equal(built.rejected, null)
  assert.equal(built.record.level, 233.95)
  assert.equal(built.record.asOf, '2026-10-02')
  assert.deepEqual(built.record.series.periods.at(-1), 'Oct 2')
  // The exchange in words, never the quote source's code for it (`NMS`).
  assert.equal(built.record.sourceLabel, 'Yahoo Finance · Nasdaq')
  assert.equal(built.record.stale, undefined)
  assert.equal(companyRecord(NVIDIA, live, { stale: true }).record.stale, true)
})

test('companyRecord refuses an impostor and a series with nothing to chart', () => {
  const impostor = companyRecord(NVIDIA, quote({ name: 'Some Fund' }))
  assert.equal(impostor.record, null)
  assert.match(impostor.rejected, /does not contain "nvidia"/)
  const oneClose = quote({ values: [233.95], periods: ['Oct 2'], completed: [true] })
  assert.match(companyRecord(NVIDIA, oneClose).rejected, /1 completed close/)
})

// ── the build's join ───────────────────────────────────────────────────────

const APPLE = COMPANY_TRACKED.find((c) => c.id === 'apple')
const ARAMCO = COMPANY_TRACKED.find((c) => c.id === 'aramco')

const article = (slug, date, over = {}) => ({
  slug,
  title: over.title ?? slug,
  dateFormatted: 'Oct 1, 2026',
  concepts: over.concepts ?? [],
  meta: {
    date,
    location: over.location ?? '',
    entities: over.entities ?? [],
    ...(over.subjects ? { subjects: over.subjects } : {}),
  },
})

const raw = (entry = NVIDIA, over = {}) => ({
  generated: '2026-10-03T05:00:00.000Z',
  companies: [
    {
      ...companyRecord(entry, quote({ name: entry.match, currencyReported: entry.currency, timezone: entry.tz }))
        .record,
      ...over,
    },
  ],
})

const joined = (entry, articles) =>
  companiesPayload(raw(entry), articles, { now: NOW }).companies[0].relatedArticles.map((a) => a.slug)

test('companiesPayload lists a story whose title names the company', () => {
  const articles = [
    article('named', '2026-10-02T10:00:00Z', { title: "Nvidia's Record Share Buyback" }),
    article('inside-a-word', '2026-09-30T10:00:00Z', { title: 'Envidiable Harvest in Spain' }),
  ]
  const [company] = companiesPayload(raw(), articles, { now: NOW }).companies
  assert.deepEqual(company.relatedArticles, [
    {
      slug: 'named',
      title: "Nvidia's Record Share Buyback",
      date: '2026-10-02T10:00:00Z',
      dateFormatted: 'Oct 1, 2026',
    },
  ])
})

test('a ticker among the entities is a mention, and does not list the story', () => {
  // Both seen on the first run: Microsoft attended a forum in Baku, and the
  // entity stage gave Foxconn TSMC's ticker.
  const articles = [
    article('forum', '2026-10-01T10:00:00Z', {
      title: 'Baku Courts Investors',
      entities: [{ mention: 'Nvidia', indicatorId: 'stocks:NVDA', kind: 'stock' }],
    }),
  ]
  assert.deepEqual(joined(NVIDIA, articles), [])
})

test('a concept lists the story only from the front of the list', () => {
  const articles = [
    // The title names the port; the story is the company's pipeline.
    article('pipeline', '2026-10-01T10:00:00Z', {
      title: 'Yanbu Oil Loadings Resume',
      concepts: ['East-West Pipeline', { label: 'Saudi Aramco' }],
    }),
    // The tail of the list is noise: this was a euro-zone inflation story.
    article('noise', '2026-09-30T10:00:00Z', {
      title: 'Euro Zone Inflation Surges',
      concepts: ['Inflation', 'Eurozone', 'European Central Bank', 'Saudi Aramco'],
    }),
  ]
  assert.deepEqual(joined(ARAMCO, articles), ['pipeline'])
})

test('a name that is an ordinary word needs the story to agree it is the company', () => {
  const articles = [
    article('by-ticker', '2026-10-02T10:00:00Z', {
      title: 'Apple Restricts Mac Disk Access',
      entities: [{ mention: 'Apple', indicatorId: 'stocks:AAPL', kind: 'stock' }],
    }),
    article('by-concept', '2026-10-01T10:00:00Z', {
      title: 'Apple Owes $5.7 Billion',
      concepts: ['Tax', 'European Commission', 'Apple Inc.'],
    }),
    article('the-fruit', '2026-09-30T10:00:00Z', {
      title: 'Apple Harvest Fails in Kashmir',
      concepts: ['Kashmir', 'Agriculture'],
    }),
    // A product is a tag of its own and needs nothing else.
    article('product', '2026-09-29T10:00:00Z', { title: 'iPhone Sales Fall in China' }),
  ]
  assert.deepEqual(joined(APPLE, articles), ['by-ticker', 'by-concept', 'product'])
})

// ── the model's judgement ──────────────────────────────────────────────────

const TSMC = COMPANY_TRACKED.find((c) => c.id === 'tsmc')

test('a story the model judged to be about the company is listed, whatever its title', () => {
  const articles = [
    article('judged', '2026-10-03T10:00:00Z', {
      title: 'Yanbu Oil Loadings Resume',
      entities: [{ mention: 'Aramco', indicatorId: 'stocks:2222.SR', kind: 'stock' }],
      subjects: ['stocks:2222.SR'],
    }),
  ]
  assert.deepEqual(joined(ARAMCO, articles), ['judged'])
})

test('a judged story that only mentions the company is not listed', () => {
  const articles = [
    // Named, with its ticker, in a story the model read and called about
    // nothing: the leading concept would have listed it unread.
    article('mention', '2026-10-03T10:00:00Z', {
      title: 'Baku Courts Investors',
      concepts: ['Saudi Aramco', 'Baku'],
      entities: [{ mention: 'Aramco', indicatorId: 'stocks:2222.SR', kind: 'stock' }],
      subjects: [],
    }),
    // And the fruit, in a story about Kashmir.
    article('fruit', '2026-10-03T09:00:00Z', {
      title: 'Apple Harvest Fails in Kashmir',
      concepts: ['Apple Inc.'],
      subjects: [],
    }),
  ]
  assert.deepEqual(joined(ARAMCO, articles), [])
  assert.deepEqual(joined(APPLE, articles), [])
})

test('a subject is believed only when its words name the company', () => {
  // Seen on the first run: the entity stage gave Foxconn TSMC's ticker.
  const articles = [
    article('wrong-ticker', '2026-10-03T10:00:00Z', {
      title: 'Saudi Arabia Launches Carmaker',
      entities: [{ mention: 'Foxconn', indicatorId: 'stocks:2330.TW', kind: 'stock' }],
      subjects: ['stocks:2330.TW'],
    }),
    // The receipt's ticker is the company too.
    article('receipt', '2026-10-02T10:00:00Z', {
      title: 'Arizona Fab Opens Early',
      entities: [{ mention: 'TSMC', indicatorId: 'stocks:TSM', kind: 'stock' }],
      subjects: ['stocks:TSM'],
    }),
  ]
  assert.deepEqual(joined(TSMC, articles), ['receipt'])
})

test('a title that names the company lists a judged story too', () => {
  // The model can miss; a headline that says Nvidia is about Nvidia.
  const articles = [
    article('missed', '2026-10-03T10:00:00Z', {
      title: 'Nvidia Brings Rust To CUDA',
      subjects: [],
    }),
  ]
  assert.deepEqual(joined(NVIDIA, articles), ['missed'])
})

test('companiesPayload lists only stories inside the charted quarter, newest first, capped', () => {
  const articles = [
    ...Array.from({ length: COMPANY_STORIES + 2 }, (_, i) =>
      article(`story-${i}`, new Date(NOW - (i + 1) * 86400_000).toISOString(), {
        title: 'Nvidia Again',
      }),
    ),
    article('last-winter', '2026-01-10T10:00:00Z', { title: 'Nvidia in January' }),
  ]
  const [company] = companiesPayload(raw(), articles, { now: NOW }).companies
  assert.equal(company.relatedArticles.length, COMPANY_STORIES)
  assert.equal(company.relatedArticles[0].slug, 'story-0')
  assert.ok(!company.relatedArticles.some((a) => a.slug === 'last-winter'))
})

test('companiesPayload publishes no field only the join needed', () => {
  const payload = companiesPayload(raw(), [], { now: NOW })
  const [company] = payload.companies
  assert.equal(payload.generated, '2026-10-03T05:00:00.000Z')
  assert.equal(company.tickers, undefined)
  assert.equal(company.topicTags, undefined)
  const [apple] = companiesPayload(raw(APPLE), [], { now: NOW }).companies
  assert.equal(apple.commonName, undefined)
  assert.deepEqual(company.relatedArticles, [])
  assert.deepEqual(Object.keys(company.series), ['values', 'periods'])
})

// ── the desk's account ─────────────────────────────────────────────────────

test('companiesPayload carries the dispatch paragraph and the stories it was built from', () => {
  const articles = [
    article('about-it', '2026-10-02T10:00:00Z', { title: "Nvidia's Record Share Buyback" }),
    article('the-cause', '2026-10-01T10:00:00Z', { title: 'Chip Export Rules Tighten' }),
  ]
  const dispatch = {
    'co:nvidia': {
      standing: 'unused: the catalog sentence is the definition',
      recent: 'Washington tightened the rules on chip sales, and the company answered with a buyback. ',
      citations: ['the-cause', 'withdrawn-since'],
    },
  }
  const [company] = companiesPayload(raw(), articles, { now: NOW, dispatch }).companies
  assert.equal(
    company.recent,
    'Washington tightened the rules on chip sales, and the company answered with a buyback.',
  )
  // The account's own evidence, resolved against the corpus: a slug that has
  // since been withdrawn is dropped, and the stories merely about the company
  // step back.
  assert.deepEqual(company.relatedArticles.map((a) => a.slug), ['the-cause'])
  assert.equal(company.standing, undefined)
})

test('with no account, a company keeps the stories about it and gains no field', () => {
  const articles = [article('about-it', '2026-10-02T10:00:00Z', { title: 'Nvidia Books Record Orders' })]
  for (const dispatch of [undefined, {}, { 'co:nvidia': { recent: '', citations: ['about-it'] } }]) {
    const [company] = companiesPayload(raw(), articles, { now: NOW, dispatch }).companies
    // Absent, never an empty string: the app falls back on absence.
    assert.equal('recent' in company, false)
    assert.deepEqual(company.relatedArticles.map((a) => a.slug), ['about-it'])
  }
})

test('an account that cites nothing still lists the stories about the company', () => {
  const articles = [article('about-it', '2026-10-02T10:00:00Z', { title: 'Nvidia Books Record Orders' })]
  const dispatch = { 'co:nvidia': { recent: 'Orders rose.', citations: [] } }
  const [company] = companiesPayload(raw(), articles, { now: NOW, dispatch }).companies
  assert.equal(company.recent, 'Orders rose.')
  assert.deepEqual(company.relatedArticles.map((a) => a.slug), ['about-it'])
})

test('companiesPayload is the same bytes for the same inputs', () => {
  // The stamp is held on a hash of the payload (`stable-stamp.js`): anything
  // that varied between two builds of one snapshot would defeat it.
  const articles = [article('a', '2026-10-01T10:00:00Z', { title: 'Nvidia Books Record Orders' })]
  assert.equal(
    JSON.stringify(companiesPayload(raw(), articles, { now: NOW })),
    JSON.stringify(companiesPayload(raw(), articles, { now: NOW + 3600_000 })),
  )
})
