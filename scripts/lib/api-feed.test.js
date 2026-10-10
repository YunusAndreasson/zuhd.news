// Run: node --test scripts/lib/api-feed.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerHolds, articleSocialScore, countryOf, extractConcepts, hasHeadline, mapCategory, redact, resultsAt, sourceName, storyFrom, toSource } from './api-feed.js'
import { slugify } from './utils.js'

// --- an answer with no list is not an answer with an empty one --------------
test('a list that is there is returned, empty or not, with nothing to say', () => {
  assert.deepEqual(resultsAt({ events: { results: [{ uri: 'eng-1' }, { uri: 'eng-2' }], totalResults: 2 } }, ['events', 'results']), { results: [{ uri: 'eng-1' }, { uri: 'eng-2' }] })
  assert.deepEqual(resultsAt({ articles: { results: [] } }, ['articles', 'results']), { results: [] })
  assert.deepEqual(resultsAt({ 'eng-1': { articles: { results: [{ uri: 'a' }] } } }, ['eng-1', 'articles', 'results']), { results: [{ uri: 'a' }] })
})

test('what is in a list and is not an object is not a result', () => {
  assert.deepEqual(resultsAt({ articles: { results: [{ uri: 'a' }, null, 'x', { uri: 'b' }] } }, ['articles', 'results']).results, [{ uri: 'a' }, { uri: 'b' }])
})

test('an answer with no list says what it holds instead', () => {
  assert.deepEqual(resultsAt({ error: 'The user has used all available tokens' }, ['events', 'results']), {
    results: [],
    saw: 'no events; it holds error (error: "The user has used all available tokens")',
  })
  assert.deepEqual(resultsAt({ events: { totalResults: 0, pages: 0 } }, ['events', 'results']), { results: [], saw: 'no events.results; it holds totalResults, pages' })
  // A per-event answer with no articles under the event's id: whatever is there is named.
  // (The shape is made up. The fetcher has never logged what a redirected event answers.)
  assert.deepEqual(resultsAt({ 'eng-1': { newEventUri: 'eng-9' } }, ['eng-1', 'articles', 'results']), { results: [], saw: 'no eng-1.articles; it holds newEventUri' })
  assert.deepEqual(resultsAt({ articles: { results: { 0: 'a' } } }, ['articles', 'results']), { results: [], saw: 'articles.results is not a list; it is 0' })
  assert.deepEqual(resultsAt(null, ['articles', 'results']), { results: [], saw: 'no articles; it holds a null' })
  assert.deepEqual(resultsAt('Too many requests', ['articles', 'results']), { results: [], saw: 'no articles; it holds a string' })
})

test('an answer is described by its keys, and by its error when it has one', () => {
  assert.equal(answerHolds({}), 'no keys')
  assert.equal(answerHolds({ a: 1, b: 2 }), 'a, b')
  assert.equal(answerHolds({ error: 'x'.repeat(500) }).length, 'error (error: "")'.length + 200)
  assert.equal(answerHolds(undefined), 'a undefined')
})

test('the key never reaches a line of the log', () => {
  const key = '00000000-aaaa-bbbb-cccc-000000000000'
  assert.equal(redact(`Supplied API key '${key}' is not recognised (${key})`, key), "Supplied API key '[key]' is not recognised ([key])")
  assert.equal(redact('nothing to hide', key), 'nothing to hide')
  assert.equal(redact('no key set', undefined), 'no key set')
})

// --- a location's country ---------------------------------------------------
test('a country is itself, a place is in one, and what the table lacks is no country', () => {
  const country = (eng) => ({ type: 'country', label: { eng } })
  const place = (eng, inCountry) => ({ type: 'place', label: { eng }, country: inCountry === undefined ? undefined : country(inCountry) })
  assert.equal(countryOf(country('Iran')), 'IR')
  assert.equal(countryOf(place('Karachi', 'Pakistan')), 'PK')
  assert.equal(countryOf(country('United States')), 'US')
  // A place's own name is never looked up, even when it is a country's.
  assert.equal(countryOf(place('Georgia', 'United States')), 'US')
  assert.equal(countryOf(place('Georgia')), null)
  // Not in the table: Meduza's Latvia, and the two gap countries the fetcher asks for by name.
  for (const name of ['Latvia', 'Yemen', 'Somalia', 'constructor', '']) assert.equal(countryOf(country(name)), null, name)
  for (const none of [null, undefined, {}, { type: 'country' }, { type: 'country', label: {} }, { country: {} }]) assert.equal(countryOf(none), null)
})

// The two functions the fetcher had, as they were, against the one it has.
test('it answers as both of the functions it replaces did', () => {
  const LOOKUP = { Iran: 'IR', Pakistan: 'PK' }
  const getCountryCode = (source) => {
    const loc = source?.location
    if (!loc) return null
    const countryName = loc.type === 'country' ? loc.label?.eng : loc.country?.label?.eng
    return countryName ? (LOOKUP[countryName] || null) : null
  }
  const getCountryFromLoc = (loc) => {
    if (!loc) return null
    if (loc.type === 'country') return LOOKUP[loc.label?.eng] || null
    if (loc.country) return LOOKUP[loc.country?.label?.eng] || null
    return null
  }
  const locations = [
    null, undefined, {}, { type: 'country' }, { type: 'country', label: {} }, { type: 'country', label: { eng: 'Iran' } }, { type: 'country', label: { eng: 'Atlantis' } },
    { type: 'place', label: { eng: 'Karachi' }, country: { label: { eng: 'Pakistan' } } }, { type: 'place', label: { eng: 'Karachi' } }, { type: 'place', country: {} },
    { type: 'place', country: { label: { eng: 'Atlantis' } } }, { country: { label: { eng: 'Iran' } } }, { type: 'country', label: { eng: 'Iran' }, country: { label: { eng: 'Pakistan' } } },
  ]
  for (const location of locations) {
    assert.equal(countryOf(location), getCountryFromLoc(location), JSON.stringify(location))
    assert.equal(countryOf(location), getCountryCode({ location }), JSON.stringify(location))
  }
  assert.equal(getCountryCode(null), null)
  assert.equal(getCountryCode({}), null)
})

test('an article with no headline is not a story of its own', () => {
  assert.equal(hasHeadline({ title: 'Fed raises rates' }), true)
  for (const article of [{}, { title: null }, { title: '' }, { title: '   ' }, { title: 42 }, null, undefined]) assert.equal(hasHeadline(article), false)
})

// --- a source and a story, against what the fetcher spelled out -------------
// Articles as Event Registry returns them, annotated as the fetcher annotates
// them (`_sourceCountry`), and the four object literals `fetch-news-api.js` had
// at c9bf77f9, to hold the builders to.
const article = (over = {}) => {
  const a = {
    uri: '900001',
    title: 'Iraq devalues currency as war and Hormuz closure squeeze cash',
    url: 'https://www.reuters.com/world/middle-east/iraq-devalues-dinar-2026-10-07/',
    body: `${'Iraq cut the dinar\'s official rate on Tuesday. '.repeat(40)}`,
    dateTimePub: '2026-10-07T08:14:09Z',
    dateTime: '2026-10-07T08:20:00Z',
    eventUri: 'eng-12071776',
    sentiment: -0.2156862745,
    image: 'https://www.reuters.com/resizer/dinar.jpg',
    socialScore: 412,
    categories: [{ uri: 'news/Business', wgt: 100 }],
    concepts: [
      { uri: 'http://en.wikipedia.org/wiki/Iraq', label: { eng: 'Iraq' }, score: 5 },
      { uri: 'http://en.wikipedia.org/wiki/Iraqi_dinar', label: { eng: 'Iraqi dinar' }, score: 4 },
      { label: { eng: 'Devaluation' }, score: 3 },
    ],
    location: { type: 'place', label: { eng: 'Baghdad' }, country: { label: { eng: 'Iraq' } } },
    source: { uri: 'reuters.com', title: 'Reuters', ranking: { importanceRank: 105 }, location: { type: 'country', label: { eng: 'United Kingdom' } } },
    ...over,
  }
  return { ...a, _sourceCountry: countryOf(a.source?.location) }
}
const REUTERS = article()
const SHAFAQ = article({
  uri: '900002', title: 'Central Bank of Iraq sets new dinar rate at 1,500', url: 'https://shafaq.com/en/Economy/dinar-1500', sentiment: 0.1, image: null, socialScore: undefined,
  dateTimePub: '2026-10-07T07:40:00Z', body: 'The Central Bank of Iraq announced the rate. '.repeat(30),
  source: { uri: 'shafaq.com', title: 'Shafaq News', ranking: { importanceRank: 21000 }, location: { type: 'place', label: { eng: 'Erbil' }, country: { label: { eng: 'Iraq' } } } },
})
const PAPER = article({
  uri: '900003', title: 'Robots get a planner-independent task interface', url: 'https://www.nature.com/articles/s41598-026-12345-6', eventUri: null, sentiment: undefined, socialScore: undefined,
  shares: { facebook: 3, twitter: 4 }, categories: [{ uri: 'news/Science' }], concepts: [{ uri: 'http://en.wikipedia.org/wiki/Robot', label: { eng: 'Robot' }, score: 2 }, { label: { eng: 'Planner' }, score: 9 }],
  location: null, source: { uri: 'nature.com', title: 'Nature', ranking: { importanceRank: 2400 }, location: null },
})

const WAS = {
  source: (a) => ({
    name: sourceName(a),
    url: a.url || '',
    country: a._sourceCountry,
    body: (a.body || '').slice(0, 10000),
    importanceRank: a.source?.ranking?.importanceRank || null,
    sentiment: a.sentiment != null ? +a.sentiment.toFixed(2) : null,
    image: a.image || null,
  }),
  avg: (nums) => (nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : null),
  spread: (articles) => {
    const sentiments = articles.map((a) => a.sentiment).filter((s) => s != null)
    return sentiments.length < 2 ? null : +(Math.max(...sentiments) - Math.min(...sentiments)).toFixed(2)
  },
  panelStory: ({ uri, eventDate, totalArticles, socialScore, eventCategories, concepts, location }, panel, storyTitle) => {
    const primary = panel[0]
    return {
      title: storyTitle,
      description: (primary.body || '').slice(0, 300),
      link: primary.url || '',
      pubDate: primary.dateTimePub || primary.dateTime || `${eventDate}T00:00:00Z`,
      eventDate: eventDate,
      socialScore: socialScore ?? null,
      category: mapCategory(primary.categories || eventCategories),
      source: sourceName(primary),
      suggestedSlug: slugify(storyTitle, primary.dateTimePub || eventDate),
      eventUri: uri,
      eventCoverage: totalArticles,
      sources: panel.map(WAS.source),
      concepts,
      location,
      sentiment: WAS.avg(panel.map((a) => a.sentiment).filter((s) => s != null)),
      sentimentDivergence: WAS.spread(panel),
      origin: 'api',
    }
  },
  trackedStory: (panel, storyTitle) => {
    const primary = panel[0]
    return {
      title: storyTitle,
      description: (primary.body || '').slice(0, 300),
      link: primary.url || '',
      pubDate: primary.dateTimePub || primary.dateTime,
      category: mapCategory(primary.categories || []),
      source: sourceName(primary),
      suggestedSlug: slugify(storyTitle, primary.dateTimePub || primary.dateTime),
      eventUri: primary.eventUri || null,
      eventCoverage: null,
      socialScore: articleSocialScore(primary),
      sources: panel.map(WAS.source),
      concepts: extractConcepts(panel),
      location: primary.location?.label?.eng || null,
      sentiment: WAS.avg(panel.map((a) => a.sentiment).filter((s) => s != null)),
      sentimentDivergence: WAS.spread(panel),
      origin: 'api',
    }
  },
  standaloneStory: (a) => ({
    title: a.title,
    description: (a.body || '').slice(0, 300),
    link: a.url || '',
    pubDate: a.dateTimePub || a.dateTime,
    category: mapCategory(a.categories || []),
    source: sourceName(a),
    suggestedSlug: slugify(a.title, a.dateTimePub || a.dateTime),
    eventUri: a.eventUri || null,
    eventCoverage: null,
    socialScore: articleSocialScore(a),
    sources: [{
      name: sourceName(a),
      url: a.url || '',
      country: a._sourceCountry,
      body: (a.body || '').slice(0, 10000),
      importanceRank: a.source?.ranking?.importanceRank || null,
      image: a.image || null,
    }],
    concepts: (a.concepts || []).slice(0, 5).map((c) => c.label?.eng || '').filter(Boolean),
    location: a.location?.label?.eng || null,
    sentiment: a.sentiment,
    origin: 'api',
  }),
}
// What the feed file holds: the bytes, key order and all.
const written = (story) => JSON.stringify(story, null, 2)

test('a panel source and a tracked source are what they were', () => {
  for (const a of [REUTERS, SHAFAQ, PAPER]) assert.equal(written(toSource(a)), written(WAS.source(a)))
  assert.equal(toSource(REUTERS).sentiment, -0.22)
  assert.equal(toSource(PAPER).name, 'Scientific Reports', 'by the article number in its address, not by the outlet\'s name')
  assert.equal(toSource({ ...REUTERS, body: 'x'.repeat(12000) }).body.length, 10000)
  assert.equal(toSource({ ...REUTERS, sentiment: '0.4' }).sentiment, null, 'a tone that is not a number is no tone; it threw')
})

test('a story about a charted series is what it was, to the byte', () => {
  /** @type {[any[], string][]} */
  const groups = [[[REUTERS, SHAFAQ], 'Central Bank of Iraq sets new dinar rate at 1,500'], [[SHAFAQ], SHAFAQ.title], [[PAPER], PAPER.title]]
  for (const [panel, title] of groups) {
    assert.equal(written(storyFrom(panel[0], panel, { title })), written(WAS.trackedStory(panel, title)))
  }
})

test('an event\'s story is what it was, to the byte, its date and score where they were', () => {
  const event = { uri: 'eng-12071776', eventDate: '2026-10-07', totalArticles: 244, socialScore: 1830, eventCategories: [{ uri: 'news/Politics' }], concepts: [{ label: 'Iraq', uri: 'http://en.wikipedia.org/wiki/Iraq' }], location: 'Baghdad' }
  const build = (ev, panel, storyTitle) => {
    const primary = panel[0]
    return storyFrom(primary, panel, {
      title: storyTitle,
      pubDate: primary.dateTimePub || primary.dateTime || `${ev.eventDate}T00:00:00Z`,
      eventDate: ev.eventDate,
      category: mapCategory(primary.categories || ev.eventCategories),
      suggestedSlug: slugify(storyTitle, primary.dateTimePub || ev.eventDate),
      eventUri: ev.uri,
      eventCoverage: ev.totalArticles,
      socialScore: ev.socialScore ?? null,
      concepts: ev.concepts,
      location: ev.location,
    })
  }
  assert.equal(written(build(event, [SHAFAQ, REUTERS], REUTERS.title)), written(WAS.panelStory(event, [SHAFAQ, REUTERS], REUTERS.title)))
  // An article with neither time nor categories takes the event's; no score is null.
  const bare = article({ dateTimePub: undefined, dateTime: undefined, categories: undefined })
  const quiet = { ...event, socialScore: undefined }
  assert.equal(written(build(quiet, [bare], bare.title)), written(WAS.panelStory(quiet, [bare], bare.title)))
  assert.deepEqual(Object.keys(build(event, [REUTERS], REUTERS.title)).slice(0, 7), ['title', 'description', 'link', 'pubDate', 'eventDate', 'socialScore', 'category'])
})

test('an article standing alone is what it was, but for the tone on its source', () => {
  for (const a of [REUTERS, SHAFAQ, PAPER]) {
    const story = storyFrom(a, [a], {
      concepts: (a.concepts || []).slice(0, 5).map((c) => c.label?.eng || '').filter(Boolean),
      sentiment: a.sentiment,
      sentimentDivergence: undefined,
    })
    const was = WAS.standaloneStory(a)
    // The one difference: the source says what the story already did.
    assert.deepEqual(story.sources, [{ ...was.sources[0], sentiment: typeof a.sentiment === 'number' ? +a.sentiment.toFixed(2) : null }])
    assert.deepEqual(Object.keys(story.sources[0]), ['name', 'url', 'country', 'body', 'importanceRank', 'sentiment', 'image'])
    assert.equal(written({ ...story, sources: was.sources }), written(was), 'every other key, value and position')
  }
})
