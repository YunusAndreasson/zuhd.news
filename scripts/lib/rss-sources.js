// The outlets the cycle reads by RSS, one row each: where the feed is, how to
// read it, and what the pipeline holds about the outlet.
//
// An outlet was declared in four places that had to be edited together: its
// feed in `fetch-news.js` (`SOURCES`), its country there too (`SOURCE_COUNTRY`),
// its cap inside that script's `main` (`PER_SOURCE_CAP`), and its name in
// `lib/dedup.js` (`NICHE_SOURCES`, "must mirror SOURCES"), which a test held
// to the script by reading the script as text, because the script ran when
// imported. They are the columns of one row now, and `rss-sources.test.js`
// holds the rows to the four lists as they stood.
//
// The list is editorial: an outlet joins or leaves it by the owner's decision,
// and `rss-sources.test.js` holds the list as last decided.

/**
 * @typedef {object} RssSource
 * @property {string} name as the feed story and the article's source carry it
 * @property {string} url the feed
 * @property {'rss2' | 'atom'} format
 * @property {string} country ISO alpha-2: where the outlet is legally based, its editorial HQ.
 *   So an RSS-sourced article does not land with `country: null`.
 * @property {'tech' | 'economy' | 'science'} [defaultCategory] the desk its stories are filed under, where the outlet has one
 * @property {number} [cap] how many of its items a cycle takes, where that is not `MAX_PER_SOURCE`
 */

// Only sources NOT reliably indexed by NewsAPI.ai.
// Nature, OCCRP, Wamda moved to API curated list (they return articles there).
//
// `cap`: aggregator-style feeds that flood a single category. Phys.org
// republishes journal press releases and was landing 29% of science primaries;
// The Record (cyber) was landing 19% of tech primaries. Lowering their cap
// rebalances toward Nature/Carbon Brief/SciDev and 404/Ars.
// TechNode publishes three or four items a day, product notes among them.
/** @type {RssSource[]} */
export const RSS_SOURCES = [
  // Hacker News fetched via Algolia API — see fetchHackerNews() in fetch-news.js
  { name: '404 Media',      url: 'https://404media.co/rss/',                   format: 'rss2', country: 'US', defaultCategory: 'tech' },
  { name: 'Bellingcat',     url: 'https://www.bellingcat.com/feed/',            format: 'rss2', country: 'NL' },
  { name: 'Mada Masr',      url: 'https://www.madamasr.com/en/feed/',          format: 'rss2', country: 'EG' },
  { name: 'Salaam Gateway', url: 'https://salaamgateway.com/feed',             format: 'atom', country: 'AE', defaultCategory: 'economy' },
  { name: 'InSight Crime',  url: 'https://insightcrime.org/feed/',              format: 'rss2', country: 'US' },
  { name: 'Declassified UK', url: 'https://declassifieduk.org/feed/',          format: 'rss2', country: 'GB' },
  { name: 'Responsible Statecraft', url: 'https://responsiblestatecraft.org/feed/', format: 'rss2', country: 'US' },
  { name: 'Drop Site News', url: 'https://www.dropsitenews.com/feed',          format: 'rss2', country: 'US' },
  { name: 'SMEX',           url: 'https://smex.org/feed/',                     format: 'rss2', country: 'LB', defaultCategory: 'tech' },
  { name: 'SciDev.Net',     url: 'https://www.scidev.net/global/global_rss.xml', format: 'rss2', country: 'GB', defaultCategory: 'science' },
  { name: 'The Record',     url: 'https://therecord.media/feed',                format: 'rss2', country: 'US', defaultCategory: 'tech', cap: 1 },
  { name: 'Phys.org',       url: 'https://phys.org/rss-feed/',                  format: 'rss2', country: 'GB', defaultCategory: 'science', cap: 1 },
  { name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/',       format: 'rss2', country: 'US', defaultCategory: 'science' },
  { name: 'Carbon Brief',   url: 'https://www.carbonbrief.org/feed/',           format: 'rss2', country: 'GB', defaultCategory: 'science' },
  { name: 'New Lines Magazine', url: 'https://newlinesmag.com/feed/',            format: 'rss2', country: 'US' },
  { name: 'The War Zone',  url: 'https://www.twz.com/feed',                     format: 'rss2', country: 'US' },
  { name: 'European Spaceflight', url: 'https://europeanspaceflight.com/feed/',  format: 'rss2', country: 'FR', defaultCategory: 'science' },
  { name: 'Inkstick',      url: 'https://inkstickmedia.com/feed/',              format: 'rss2', country: 'US' },
  { name: 'Rest of World', url: 'https://restofworld.org/feed/latest/',        format: 'rss2', country: 'US', defaultCategory: 'tech' },
  { name: 'The Diplomat', url: 'https://thediplomat.com/feed/',                format: 'rss2', country: 'US' },
  { name: 'Lowy Interpreter', url: 'https://www.lowyinstitute.org/the-interpreter/rss.xml', format: 'rss2', country: 'AU' },
  // thethirdpole.net 403s since the Dialogue Earth rebrand — it had failed every
  // cycle in the log window (41/41) with the whole science feed silently lost.
  { name: 'Dialogue Earth', url: 'https://dialogue.earth/en/feed/',            format: 'rss2', country: 'GB', defaultCategory: 'science' },
  { name: 'Global Voices', url: 'https://globalvoices.org/feed/',              format: 'rss2', country: 'NL' },
  { name: 'Payload',      url: 'https://payloadspace.com/feed/',               format: 'rss2', country: 'US', defaultCategory: 'science' },
  { name: 'C4ISRNET',     url: 'https://www.c4isrnet.com/arc/outboundfeeds/rss/?outputType=xml', format: 'rss2', country: 'US' },
  { name: 'TechNode',     url: 'https://technode.com/feed/',                   format: 'rss2', country: 'CN', defaultCategory: 'tech', cap: 2 },
  { name: 'Latin America Reports', url: 'https://latinamericareports.com/feed/', format: 'rss2', country: 'CO' },
  // The news desk's feed: the site's own carries its opinion and culture pages.
  { name: 'Mondoweiss',   url: 'https://mondoweiss.net/news/feed/',            format: 'rss2', country: 'US' },
]

/** Hacker News is read through Algolia, not from a feed, and is a source like the rest once it has been. */
export const HACKER_NEWS = { name: 'Hacker News', country: 'US' }

/** How many of an outlet's items a cycle takes, unless its row says otherwise. */
export const MAX_PER_SOURCE = 3

const BY_NAME = new Map([...RSS_SOURCES, HACKER_NEWS].map((s) => [s.name, s]))

/**
 * How many of an outlet's items a cycle takes.
 *
 * @param {string} name
 */
export const capFor = (name) => /** @type {{ cap?: number } | undefined} */ (BY_NAME.get(name))?.cap ?? MAX_PER_SOURCE

/**
 * The country an outlet is based in, or null for a name that is not one of them.
 *
 * @param {string} name
 * @returns {string | null}
 */
export const sourceCountry = (name) => BY_NAME.get(name)?.country ?? null

/**
 * Every outlet read here, by name: the feeds in their order, then Hacker
 * News. A story whose every source is one of these is niche-only
 * (`NICHE_SOURCES`, `lib/dedup.js`).
 */
export const RSS_SOURCE_NAMES = [...RSS_SOURCES.map((s) => s.name), HACKER_NEWS.name]
