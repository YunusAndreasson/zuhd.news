// Run: node --test scripts/lib/rss-sources.test.js
//
// The four lists an RSS outlet was declared in, as they stood at ae59340d
// (three in `scripts/fetch-news.js`, one in `lib/dedup.js`), and the one table
// held to each of them: the outlets, their order, their feeds, countries,
// desks and caps. The list is editorial, and moving it was not to change it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NICHE_SOURCES } from './dedup.js'
import { HACKER_NEWS, MAX_PER_SOURCE, RSS_SOURCES, RSS_SOURCE_NAMES, capFor, sourceCountry } from './rss-sources.js'

const SOURCES_WAS = [
  { name: '404 Media',      url: 'https://404media.co/rss/',                   format: 'rss2', defaultCategory: 'tech' },
  { name: 'Bellingcat',     url: 'https://www.bellingcat.com/feed/',            format: 'rss2' },
  { name: 'Mada Masr',      url: 'https://www.madamasr.com/en/feed/',          format: 'rss2' },
  { name: 'Salaam Gateway', url: 'https://salaamgateway.com/feed',             format: 'atom', defaultCategory: 'economy' },
  { name: 'InSight Crime',  url: 'https://insightcrime.org/feed/',              format: 'rss2' },
  { name: 'Declassified UK', url: 'https://declassifieduk.org/feed/',          format: 'rss2' },
  { name: 'Responsible Statecraft', url: 'https://responsiblestatecraft.org/feed/', format: 'rss2' },
  { name: 'Drop Site News', url: 'https://www.dropsitenews.com/feed',          format: 'rss2' },
  { name: 'SMEX',           url: 'https://smex.org/feed/',                     format: 'rss2', defaultCategory: 'tech' },
  { name: 'SciDev.Net',     url: 'https://www.scidev.net/global/global_rss.xml', format: 'rss2', defaultCategory: 'science' },
  { name: 'The Record',     url: 'https://therecord.media/feed',                format: 'rss2', defaultCategory: 'tech' },
  { name: 'Phys.org',       url: 'https://phys.org/rss-feed/',                  format: 'rss2', defaultCategory: 'science' },
  { name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/',       format: 'rss2', defaultCategory: 'science' },
  { name: 'Carbon Brief',   url: 'https://www.carbonbrief.org/feed/',           format: 'rss2', defaultCategory: 'science' },
  { name: 'New Lines Magazine', url: 'https://newlinesmag.com/feed/',            format: 'rss2' },
  { name: 'The War Zone',  url: 'https://www.twz.com/feed',                     format: 'rss2' },
  { name: 'CODA Story',    url: 'https://www.codastory.com/feed/',              format: 'rss2' },
  { name: 'European Spaceflight', url: 'https://europeanspaceflight.com/feed/',  format: 'rss2', defaultCategory: 'science' },
  { name: 'Undark',        url: 'https://undark.org/feed/',                      format: 'rss2', defaultCategory: 'science' },
  { name: 'Inkstick',      url: 'https://inkstickmedia.com/feed/',              format: 'rss2' },
  { name: 'Noema',        url: 'https://www.noemamag.com/feed/',               format: 'rss2' },
  { name: 'Rest of World', url: 'https://restofworld.org/feed/latest/',        format: 'rss2', defaultCategory: 'tech' },
  { name: 'The Diplomat', url: 'https://thediplomat.com/feed/',                format: 'rss2' },
  { name: 'Lowy Interpreter', url: 'https://www.lowyinstitute.org/the-interpreter/rss.xml', format: 'rss2' },
  { name: 'Dialogue Earth', url: 'https://dialogue.earth/en/feed/',            format: 'rss2', defaultCategory: 'science' },
  { name: 'Global Voices', url: 'https://globalvoices.org/feed/',              format: 'rss2' },
]

const SOURCE_COUNTRY_WAS = {
  '404 Media': 'US',
  'Bellingcat': 'NL',
  'Mada Masr': 'EG',
  'Salaam Gateway': 'AE',
  'InSight Crime': 'US',
  'Declassified UK': 'GB',
  'Responsible Statecraft': 'US',
  'Drop Site News': 'US',
  'SMEX': 'LB',
  'SciDev.Net': 'GB',
  'The Record': 'US',
  'Phys.org': 'GB',
  'Quanta Magazine': 'US',
  'Carbon Brief': 'GB',
  'New Lines Magazine': 'US',
  'The War Zone': 'US',
  'CODA Story': 'US',
  'European Spaceflight': 'FR',
  'Undark': 'US',
  'Inkstick': 'US',
  'Noema': 'US',
  'Rest of World': 'US',
  'The Diplomat': 'US',
  'Lowy Interpreter': 'AU',
  'Dialogue Earth': 'GB',
  'Global Voices': 'NL',
  'Hacker News': 'US',
}

const MAX_PER_SOURCE_WAS = 3
const PER_SOURCE_CAP_WAS = { 'Phys.org': 1, 'The Record': 1 }
const capForWas = (name) => PER_SOURCE_CAP_WAS[name] ?? MAX_PER_SOURCE_WAS

const NICHE_SOURCES_WAS = new Set([
  '404 Media', 'Bellingcat', 'Mada Masr', 'Salaam Gateway', 'InSight Crime',
  'Declassified UK', 'Responsible Statecraft', 'Drop Site News', 'SMEX',
  'SciDev.Net', 'The Record', 'Phys.org', 'Quanta Magazine', 'Carbon Brief',
  'New Lines Magazine', 'The War Zone', 'CODA Story', 'European Spaceflight',
  'Undark', 'Inkstick', 'Noema', 'Rest of World', 'The Diplomat',
  'Lowy Interpreter', 'Dialogue Earth', 'Global Voices', 'Hacker News',
])

test('the feeds are the twenty-six they were, in their order, at their addresses, read the same way, for the same desks', () => {
  const asDeclared = RSS_SOURCES.map(({ name, url, format, defaultCategory }) => (defaultCategory ? { name, url, format, defaultCategory } : { name, url, format }))
  assert.deepEqual(asDeclared, SOURCES_WAS)
  assert.equal(RSS_SOURCES.length, 26)
  for (const row of RSS_SOURCES) assert.deepEqual(Object.keys(row).filter((k) => !['name', 'url', 'format', 'country', 'defaultCategory', 'cap'].includes(k)), [], row.name)
})

test('each outlet is in the country it was, Hacker News with them, and a name that is none of them is in none', () => {
  assert.deepEqual(Object.fromEntries(RSS_SOURCE_NAMES.map((name) => [name, sourceCountry(name)])), SOURCE_COUNTRY_WAS)
  assert.deepEqual(RSS_SOURCE_NAMES, Object.keys(SOURCE_COUNTRY_WAS), 'the same names in the same order')
  for (const row of RSS_SOURCES) assert.equal(row.country, SOURCE_COUNTRY_WAS[row.name], row.name)
  // What the fetcher wrote for a name it did not know: `SOURCE_COUNTRY[name] || null`.
  assert.equal(sourceCountry('Reuters'), null)
  assert.equal(sourceCountry(''), null)
})

test('a cycle takes as many of each outlet\'s items as it did', () => {
  assert.equal(MAX_PER_SOURCE, MAX_PER_SOURCE_WAS)
  for (const name of [...RSS_SOURCE_NAMES, 'Reuters']) assert.equal(capFor(name), capForWas(name), name)
  assert.deepEqual(RSS_SOURCES.filter((s) => s.cap !== undefined).map((s) => [s.name, s.cap]).sort(), Object.entries(PER_SOURCE_CAP_WAS).sort())
  // 24 feeds at three and two at one, plus three from Hacker News: the 77 of every `Raw items:` line.
  assert.equal(RSS_SOURCES.reduce((n, s) => n + capFor(s.name), 0) + capFor(HACKER_NEWS.name), 77)
})

test('the niche outlets are these, and the set the dedup tests against is made from them', () => {
  assert.deepEqual([...NICHE_SOURCES], [...NICHE_SOURCES_WAS])
  assert.deepEqual([...NICHE_SOURCES], RSS_SOURCE_NAMES)
  assert.ok(!NICHE_SOURCES.has('Reuters'))
})
