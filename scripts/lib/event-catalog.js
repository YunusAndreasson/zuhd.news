// Curated catalog of scheduled macro/political events surfaced on the
// situational map's money rail — the events a live API does not give us.
//
// `fetchFredReleaseCalendar` (`trends-sources/fred.js`) is the only *live*
// forward-looking source this site holds, and it is US-federal-only (CPI,
// jobs, GDP, FOMC…). Nothing fetches ECB, BoE, BoJ, OPEC+ or non-US releases.
// Those institutions publish their own meeting calendars 6-18 months ahead —
// FOMC and ECB dates for a full year are public before the year starts — so
// the gap is closed the way `MARKET_CATALOG` closes the equivalent gap for
// exchanges the free data commons does not cover: a small hand-maintained
// list, each entry dated against its own institution's published calendar,
// revisited on a schedule rather than silently going stale.
//
// Shape: { id, title, institution, kind, date, topicTags, countryTags, sourceUrl }
//   - date        — ISO 'YYYY-MM-DD', the day the decision/release/event lands
//                    (for a two-day meeting, the day of the decision/statement).
//   - kind        — 'central-bank' | 'opec' | 'econ-release' | 'summit-election'
//   - topicTags / countryTags — matched against article title+concepts+location
//                    the same way `MARKET_CATALOG`'s tags are, for the sheet's
//                    related-coverage join and for `narrate-events.js`'s
//                    grounding bundle.
//   - sourceUrl   — the institution's own calendar page, so the next refresh
//                    starts from a citable source rather than a search.
//
// Why OPEC+ has no entries past its own last confirmed date
// -----------------------------------------------------------
// Central banks publish a full year's meeting calendar at once; OPEC+ does
// not — verified 2026-08-08 against opec.org and three independent trackers,
// the confirmed schedule runs only to the 7 June 2026 ministerial meeting,
// with the JMMC and the eight-country group meeting on a rolling two-monthly
// and monthly cadence whose exact dates are "announced closer to the time".
// Inventing a plausible date here would be exactly the failure `MARKET_CATALOG`
// and `shared/genocide.ts` both warn against — a gap that quietly becomes a
// fact about our coverage. Add the next OPEC+ entry the day OPEC actually
// announces it, from opec.org's own press releases.
//
// Maintenance
// -----------
// Re-verify every quarter against each institution's own calendar page
// (`sourceUrl`), and whenever a reader-facing event reads as missing or wrong.
// A meeting can be rescheduled after publication — Umm al-Qura's Eid windows
// are the same class of problem elsewhere in this codebase, solved the same
// way, by keeping the window wide rather than the date exact.

/**
 * One scheduled event. Every field is described in the prose above; this
 * restates the shape so a typechecker can hold the table to it — the same
 * reason `MarketEntry` is typed in `market-metadata.js`.
 *
 * @typedef {Object} EventEntry
 * @property {string} id
 * @property {string} title
 * @property {string} institution
 * @property {'central-bank'|'opec'|'econ-release'|'summit-election'} kind
 * @property {string} date          ISO 'YYYY-MM-DD'.
 * @property {string[]} topicTags
 * @property {string[]} countryTags
 * @property {string} sourceUrl
 */

/** @type {EventEntry[]} */
export const EVENT_CATALOG = [
  // ─── Central bank decisions ────────────────────────────────────────────
  {
    id: 'fomc-2026-09',
    title: 'FOMC rate decision',
    institution: 'Federal Reserve',
    kind: 'central-bank',
    date: '2026-09-16',
    topicTags: ['fomc', 'federal reserve', 'fed', 'interest rate', 'interest rates'],
    countryTags: ['US'],
    sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
  },
  {
    id: 'fomc-2026-10',
    title: 'FOMC rate decision',
    institution: 'Federal Reserve',
    kind: 'central-bank',
    date: '2026-10-28',
    topicTags: ['fomc', 'federal reserve', 'fed', 'interest rate', 'interest rates'],
    countryTags: ['US'],
    sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
  },
  {
    id: 'fomc-2026-12',
    title: 'FOMC rate decision',
    institution: 'Federal Reserve',
    kind: 'central-bank',
    date: '2026-12-09',
    topicTags: ['fomc', 'federal reserve', 'fed', 'interest rate', 'interest rates'],
    countryTags: ['US'],
    sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
  },
  {
    id: 'ecb-2026-09',
    title: 'ECB rate decision',
    institution: 'European Central Bank',
    kind: 'central-bank',
    date: '2026-09-10',
    topicTags: ['ecb', 'european central bank', 'interest rate', 'interest rates', 'eurozone'],
    countryTags: ['DE', 'FR', 'IT', 'ES'],
    sourceUrl: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html',
  },
  {
    id: 'ecb-2026-10',
    title: 'ECB rate decision',
    institution: 'European Central Bank',
    kind: 'central-bank',
    date: '2026-10-29',
    topicTags: ['ecb', 'european central bank', 'interest rate', 'interest rates', 'eurozone'],
    countryTags: ['DE', 'FR', 'IT', 'ES'],
    sourceUrl: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html',
  },
  {
    id: 'ecb-2026-12',
    title: 'ECB rate decision',
    institution: 'European Central Bank',
    kind: 'central-bank',
    date: '2026-12-17',
    topicTags: ['ecb', 'european central bank', 'interest rate', 'interest rates', 'eurozone'],
    countryTags: ['DE', 'FR', 'IT', 'ES'],
    sourceUrl: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html',
  },
  {
    id: 'boe-2026-09',
    title: 'Bank of England rate decision',
    institution: 'Bank of England',
    kind: 'central-bank',
    date: '2026-09-17',
    topicTags: ['bank of england', 'boe', 'mpc', 'interest rate', 'interest rates'],
    countryTags: ['GB'],
    sourceUrl: 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates',
  },
  {
    id: 'boe-2026-11',
    title: 'Bank of England rate decision',
    institution: 'Bank of England',
    kind: 'central-bank',
    date: '2026-11-05',
    topicTags: ['bank of england', 'boe', 'mpc', 'interest rate', 'interest rates'],
    countryTags: ['GB'],
    sourceUrl: 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates',
  },
  {
    id: 'boe-2026-12',
    title: 'Bank of England rate decision',
    institution: 'Bank of England',
    kind: 'central-bank',
    date: '2026-12-17',
    topicTags: ['bank of england', 'boe', 'mpc', 'interest rate', 'interest rates'],
    countryTags: ['GB'],
    sourceUrl: 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates',
  },
  {
    id: 'boj-2026-09',
    title: 'Bank of Japan rate decision',
    institution: 'Bank of Japan',
    kind: 'central-bank',
    date: '2026-09-18',
    topicTags: ['bank of japan', 'boj', 'interest rate', 'interest rates', 'yen'],
    countryTags: ['JP'],
    sourceUrl: 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm',
  },
  {
    id: 'boj-2026-10',
    title: 'Bank of Japan rate decision',
    institution: 'Bank of Japan',
    kind: 'central-bank',
    date: '2026-10-30',
    topicTags: ['bank of japan', 'boj', 'interest rate', 'interest rates', 'yen'],
    countryTags: ['JP'],
    sourceUrl: 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm',
  },
  {
    id: 'boj-2026-12',
    title: 'Bank of Japan rate decision',
    institution: 'Bank of Japan',
    kind: 'central-bank',
    date: '2026-12-18',
    topicTags: ['bank of japan', 'boj', 'interest rate', 'interest rates', 'yen'],
    countryTags: ['JP'],
    sourceUrl: 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm',
  },

  // ─── Major non-US releases ──────────────────────────────────────────────
  {
    id: 'uk-cpi-2026-10',
    title: 'UK consumer price inflation (September)',
    institution: 'Office for National Statistics',
    kind: 'econ-release',
    date: '2026-10-21',
    topicTags: ['uk inflation', 'consumer price index', 'cpi'],
    countryTags: ['GB'],
    sourceUrl: 'https://www.ons.gov.uk/releases/consumerpriceinflationukseptember2026',
  },

  // ─── Summits / elections ────────────────────────────────────────────────
  {
    id: 'g20-2026-miami',
    title: 'G20 leaders summit',
    institution: 'G20 (US presidency)',
    kind: 'summit-election',
    date: '2026-12-14',
    topicTags: ['g20', 'summit'],
    countryTags: ['US'],
    sourceUrl: 'https://g20.org/',
  },
]

/**
 * Which of FRED's raw `releases/dates` rows are worth surfacing, and what to
 * call them — the same editorial shortlist that used to live in
 * `_map/markets.ts`'s client-side `nextRelease()`, moved server-side so the
 * catalog's central-bank rows and FRED's live feed can be de-duplicated
 * before either reaches the client (see `mergeEvents` in `fetch-trends.js`).
 *
 * FOMC is deliberately absent here: `EVENT_CATALOG` already carries every
 * 2026 FOMC date from the Fed's own published calendar, and matching it again
 * off FRED's feed would print the same decision twice a quarter.
 *
 * Every label carries `US`, and that is not decoration — see `map.md`'s note
 * on the same rule: these are all US federal releases, and an unqualified
 * "CPI" on a world calendar claims a scope it has not got. `^` anchors the
 * price indices because FRED also publishes "Research Consumer Price Index",
 * a methodological series nobody is waiting for.
 */
/**
 * Typed explicitly, or TypeScript infers the array's element type from
 * whichever tuple it finds first — the same trap `MarketEntry` in
 * `market-metadata.js` exists to close — and every other row's `institution`/
 * `topicTags` collapses to `string | string[] | RegExp` at the destructure
 * below.
 *
 * @type {Array<[test: RegExp, title: string, institution: string, topicTags: string[]]>}
 */
const FRED_RELEASE_LABELS = [
  [/^consumer price index/i, 'US CPI', 'Bureau of Labor Statistics', ['cpi', 'consumer price index', 'inflation']],
  [/^producer price index/i, 'US PPI', 'Bureau of Labor Statistics', ['ppi', 'producer price index']],
  [/^employment situation/i, 'US jobs report', 'Bureau of Labor Statistics', ['jobs report', 'employment situation', 'payrolls', 'unemployment rate']],
  [/^gross domestic product/i, 'US GDP', 'Bureau of Economic Analysis', ['gdp', 'gross domestic product']],
  [/^personal income and outlays/i, 'US PCE', 'Bureau of Economic Analysis', ['pce', 'personal consumption expenditures']],
  [/^advance monthly sales|^retail sales/i, 'US retail sales', 'Census Bureau', ['retail sales']],
]

/**
 * `{date, release}` (FRED's own name) → a catalog-shaped event, or `null` for
 * a release not on the shortlist above.
 */
export const matchFredRelease = ({ date, release }) => {
  const hit = FRED_RELEASE_LABELS.find(([re]) => re.test(String(release || '')))
  if (!hit) return null
  const [, title, institution, topicTags] = hit
  return {
    id: `fred-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${date}`,
    title,
    institution,
    kind: 'econ-release',
    date,
    topicTags,
    countryTags: ['US'],
    sourceUrl: 'https://www.federalreserve.gov/newsevents/calendar.htm',
  }
}
