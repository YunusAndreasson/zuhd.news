// Curated catalog of stock exchanges surfaced on the situational map.
//
// Shape: { id, name, indexName, city, iso2, gdp?, lat, lng, symbol, currency, tz,
//          sessionStart, sessionEnd, days, blurb, topicTags, countryTags,
//          available, reason? }
//   - gdp        — the country's output in current US dollars, on the tracked
//                  rows only: what its market's week weighs in the app's
//                  `world stocks` (`worldStocks`, `mobile/lib/markets.ts`),
//                  so Dubai does not count as much as New York. See "The
//                  weights" below.
//   - symbol     — Yahoo Finance ticker, passed verbatim to fetchYahooStock.
//   - currency   — the currency Yahoo reports for this symbol. This is an
//                  ASSERTION, not a label: the fetcher rejects a response that
//                  disagrees. See "Why the expectations are pinned" below.
//   - tz         — IANA zone Yahoo reports. Same assertion, and also what the
//                  island uses to work out whether the exchange is trading.
//   - sessionStart/End — local wall-clock "HH:MM" of the regular session,
//                  used only for the trading-now state. Lunch breaks are not
//                  modelled; a market on its midday break reads as open.
//   - days       — trading weekdays, JS getDay() convention (0 = Sunday).
//                  Not decoration: Riyadh and Yafa run Sunday–Thursday while
//                  Dubai moved to Monday–Friday in 2022, and a map that shows
//                  the Gulf shut on a Sunday is wrong about the thing this
//                  layer exists to show.
//   - holidays   — 'islamic' means this exchange shuts for the two Eids, and
//                  the island suppresses its "trading now" state for the
//                  window (see `_map/hijri.ts`). Editorial rather than derived
//                  from iso2: an exchange in a Muslim-majority country need
//                  not close for Eid and one elsewhere might. No other holiday
//                  is modelled anywhere in this file — Christmas, national
//                  days and unscheduled halts all still read as trading.
//   - topicTags / countryTags — matched against article concepts/title and
//                  ISO2 respectively, for the sheet's related coverage and for
//                  the market-signal stage's causal bundle. See "A tag that is
//                  also an English word" below.
//   - available  — false means recorded but not drawn, and `reason` says why.
//
// A tag that is also an English word
// ----------------------------------
// `topicTags` is substring-matched on a word boundary against an article's
// title, dateline and concepts. That stops `smi` matching "transmission" — the
// bug `build.js` documents — but a whole-word match cannot save a tag that is
// itself a whole English word, and two were:
//
//   - **`real`** on Ibovespa. Measured on the 2026-09-05 signal, the only two
//     articles offered to the model as explanations for a 5.4% rally in São
//     Paulo were a piece on European housing ("renting **real** estate
//     economics") and one on the Pentagon's maintenance backlog ("the
//     Pentagon's **real** estate decays").
//   - **`won`** on the KOSPI, which is the past tense of "win" and matches
//     every election, every court case and every match report in the corpus.
//
// Both are gone. The rule they leave behind: a currency name earns a tag only
// when it is not also ordinary English — `lira`, `rupiah`, `ringgit` and
// `renminbi` are fine, and `peso`, `krona` and `rand` are borderline enough to
// be worth re-measuring if one of those cards ever explains itself oddly.
//
// **Country names stay, and the duplication with `countryTags` is deliberate.**
// It looks redundant and is not: `countryTags` is matched against the ISO-2
// codes an article links in its body, and only about half the corpus carries
// one. Removing `turkey` from BIST's tags was tried and measurably cost a
// Black Sea shipping story that the country arm could not see.
//
// The weights
// -----------
// `gdp` is the World Bank's GDP in current US dollars (`NY.GDP.MKTP.CD`) for
// 2025, read on 2026-10-10. Two are not that: the United Arab Emirates' is
// 2024, the newest it had, and Taiwan's is the shared country table's
// (`shared/countries/country-data.ts`), because the World Bank publishes none
// for Taiwan. It is a weight and is never printed, so three figures are
// plenty: a year's revision moves a market's share by a fraction of a point.
// Read them again once a year.
//
// Weighted by the economy and not by the market's value, on purpose. By value
// the United States is well over half of the world's shares and the number is
// Wall Street's week under another name; by output it is under a third, and
// China a fifth. No payload carries a market's value either.
//
// Why the expectations are pinned
// -------------------------------
// Yahoo answers a symbol it does not have by returning a DIFFERENT instrument
// rather than a 404, with a plausible level, a currency and a timezone. Probing
// this set turned up three: `^PSI` returns a PIMCO fund, `^NGX` returns the
// Nasdaq Next Generation 100, and `^MSI` returns a USD figure that is not the
// Muscat index. Any of them would have put an invented number on the map with
// nothing thrown and nothing logged. So every entry pins the currency and zone
// its symbol is known to report, and the fetcher discards a mismatch.
//
// Why entries are kept with available: false
// ------------------------------------------
// The exchanges we cannot source are concentrated in exactly the part of the
// world this layer exists for — the Gulf, Pakistan, Bangladesh, North Africa,
// Nigeria. That is a fact about the free data commons, not about those markets,
// and deleting the rows would quietly turn it into a fact about our coverage.
// They are kept here, with a reason each, so the gap is revisited rather than
// forgotten — the same treatment `shared/genocide.ts` gives its `risk` entries,
// which are recorded and deliberately not drawn.

/**
 * One exchange. Every field is described in the prose above; this restates the
 * shape so a typechecker can hold the table to it.
 *
 * It is not a formality. TypeScript infers an array's element type from what it
 * finds, so before this existed the catalog's type was whatever the *first*
 * entry happened to carry — Tadawul, which is `available: true` and therefore
 * has no `reason`. Every `reason` in the twelve unavailable rows, and the
 * `holidays` on the four other Islamic-calendar exchanges, read as an unknown
 * property. The fields the file's own header spends a paragraph each on were
 * the ones nothing could check.
 *
 * @typedef {Object} MarketEntry
 * @property {string} id
 * @property {string} name
 * @property {string} indexName
 * @property {string} city
 * @property {string} iso2
 * @property {number} [gdp]         The country's GDP in current US dollars. On
 *       every tracked row (`quote-snapshot.test.js`).
 * @property {number} lat
 * @property {number} lng
 * @property {string|null} symbol   Null on a row with no usable Yahoo symbol.
 * @property {string|null} currency
 * @property {string|null} tz         IANA zone Yahoo is known to report.
 * @property {string|null} sessionStart Local wall-clock "HH:MM".
 * @property {string|null} sessionEnd  Local wall-clock "HH:MM".
 * @property {number[]} days          JS getDay() convention, 0 = Sunday.
 * @property {string} blurb
 * @property {string[]} topicTags
 * @property {string[]} countryTags
 * @property {boolean} available      False means recorded but not drawn.
 * @property {'islamic'} [holidays]   Shuts for the two Eids. Editorial, never
 *       derived from iso2 — TASE runs Sunday–Thursday exactly as Tadawul does.
 * @property {string} [reason]        Why an `available: false` row is not drawn.
 *       Required in spirit on every one of them; the gap is the point.
 */

/** @type {MarketEntry[]} */
export const MARKET_CATALOG = [
  // ─── Muslim-majority markets ──────────────────────────────────────────────
  {
    id: 'tadawul',
    name: 'Saudi Exchange',
    indexName: 'TASI',
    city: 'Riyadh',
    iso2: 'SA',
    gdp: 1_277e9,
    lat: 24.7136,
    lng: 46.6753,
    symbol: '^TASI.SR',
    currency: 'SAR',
    tz: 'Asia/Riyadh',
    sessionStart: '10:00',
    sessionEnd: '15:00',
    holidays: 'islamic',
    days: [0, 1, 2, 3, 4],
    blurb:
      'The Arab world’s largest exchange by market value, dominated by Aramco. Trades Sunday to Thursday, so it opens the global week before Tokyo.',
    topicTags: ['tadawul', 'saudi exchange', 'tasi', 'saudi arabia', 'aramco', 'riyadh'],
    countryTags: ['SA'],
    available: true,
  },
  {
    id: 'bist',
    name: 'Borsa İstanbul',
    indexName: 'BIST 100',
    city: 'Istanbul',
    iso2: 'TR',
    gdp: 1_597e9,
    lat: 41.0082,
    lng: 28.9784,
    symbol: 'XU100.IS',
    currency: 'TRY',
    tz: 'Europe/Istanbul',
    sessionStart: '10:00',
    sessionEnd: '18:00',
    holidays: 'islamic',
    days: [1, 2, 3, 4, 5],
    blurb:
      'Türkiye’s only exchange. Priced in lira, so its index level carries the country’s inflation as much as its earnings — read the direction, not the number.',
    topicTags: ['borsa istanbul', 'bist', 'turkey', 'türkiye', 'lira', 'istanbul'],
    countryTags: ['TR'],
    available: true,
  },
  {
    id: 'dfm',
    name: 'Dubai Financial Market',
    indexName: 'DFM General',
    city: 'Dubai',
    iso2: 'AE',
    gdp: 552e9,
    lat: 25.2048,
    lng: 55.2708,
    symbol: 'DFMGI.AE',
    currency: 'AED',
    tz: 'Asia/Dubai',
    sessionStart: '10:00',
    sessionEnd: '15:00',
    holidays: 'islamic',
    days: [1, 2, 3, 4, 5],
    blurb:
      'The Gulf’s main listing venue for property and banking. Moved from a Sunday–Thursday week to Monday–Friday in 2022, unlike Riyadh.',
    topicTags: ['dubai financial market', 'dfm', 'dubai', 'uae', 'emirates'],
    countryTags: ['AE'],
    available: true,
  },
  {
    id: 'bursa-malaysia',
    name: 'Bursa Malaysia',
    indexName: 'FTSE Bursa Malaysia KLCI',
    city: 'Kuala Lumpur',
    iso2: 'MY',
    gdp: 472e9,
    lat: 3.139,
    lng: 101.6869,
    symbol: '^KLSE',
    currency: 'MYR',
    tz: 'Asia/Kuala_Lumpur',
    sessionStart: '09:00',
    sessionEnd: '17:00',
    holidays: 'islamic',
    days: [1, 2, 3, 4, 5],
    blurb:
      'The world’s largest market for Islamic finance instruments, and the centre of the global sukuk trade.',
    topicTags: ['bursa malaysia', 'klci', 'malaysia', 'kuala lumpur', 'sukuk', 'ringgit'],
    countryTags: ['MY'],
    available: true,
  },
  {
    id: 'idx',
    name: 'Indonesia Stock Exchange',
    indexName: 'IDX Composite',
    city: 'Jakarta',
    iso2: 'ID',
    gdp: 1_446e9,
    lat: -6.2088,
    lng: 106.8456,
    symbol: '^JKSE',
    currency: 'IDR',
    tz: 'Asia/Jakarta',
    sessionStart: '09:00',
    sessionEnd: '16:00',
    holidays: 'islamic',
    days: [1, 2, 3, 4, 5],
    blurb:
      'The exchange of the world’s largest Muslim-majority country, heavily weighted to commodities and banking.',
    topicTags: ['indonesia stock exchange', 'idx', 'jakarta', 'indonesia', 'rupiah'],
    countryTags: ['ID'],
    available: true,
  },

  // ─── Asia-Pacific ─────────────────────────────────────────────────────────
  {
    id: 'tse',
    name: 'Tokyo Stock Exchange',
    indexName: 'Nikkei 225',
    city: 'Tokyo',
    iso2: 'JP',
    gdp: 4_435e9,
    lat: 35.6762,
    lng: 139.6503,
    symbol: '^N225',
    currency: 'JPY',
    tz: 'Asia/Tokyo',
    sessionStart: '09:00',
    sessionEnd: '15:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'Asia’s largest exchange, and the first major market to price each trading day.',
    topicTags: ['tokyo stock exchange', 'nikkei', 'japan', 'tokyo', 'yen'],
    countryTags: ['JP'],
    available: true,
  },
  {
    id: 'hkex',
    name: 'Hong Kong Stock Exchange',
    indexName: 'Hang Seng',
    city: 'Hong Kong',
    iso2: 'HK',
    gdp: 427e9,
    lat: 22.3193,
    lng: 114.1694,
    symbol: '^HSI',
    currency: 'HKD',
    tz: 'Asia/Hong_Kong',
    sessionStart: '09:30',
    sessionEnd: '16:00',
    days: [1, 2, 3, 4, 5],
    blurb:
      'Where mainland Chinese companies meet foreign capital — the clearest daily read on sentiment toward China.',
    topicTags: ['hang seng', 'hong kong', 'hkex', 'china'],
    countryTags: ['HK', 'CN'],
    available: true,
  },
  {
    id: 'sse',
    name: 'Shanghai Stock Exchange',
    indexName: 'SSE Composite',
    city: 'Shanghai',
    iso2: 'CN',
    gdp: 19_498e9,
    lat: 31.2304,
    lng: 121.4737,
    symbol: '000001.SS',
    currency: 'CNY',
    tz: 'Asia/Shanghai',
    sessionStart: '09:30',
    sessionEnd: '15:00',
    days: [1, 2, 3, 4, 5],
    blurb:
      'Mainland China’s main board. Largely closed to foreign investors, so it tracks domestic policy more than global risk appetite.',
    topicTags: ['shanghai composite', 'shanghai stock exchange', 'china', 'yuan', 'renminbi'],
    countryTags: ['CN'],
    available: true,
  },
  {
    id: 'krx',
    name: 'Korea Exchange',
    indexName: 'KOSPI',
    city: 'Seoul',
    iso2: 'KR',
    gdp: 1_872e9,
    lat: 37.5665,
    lng: 126.978,
    symbol: '^KS11',
    currency: 'KRW',
    tz: 'Asia/Seoul',
    sessionStart: '09:00',
    sessionEnd: '15:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'Dominated by Samsung and SK Hynix — a proxy for the global semiconductor cycle.',
    topicTags: ['kospi', 'korea exchange', 'south korea', 'seoul', 'samsung'],
    countryTags: ['KR'],
    available: true,
  },
  {
    id: 'bse',
    name: 'Bombay Stock Exchange',
    indexName: 'SENSEX',
    city: 'Mumbai',
    iso2: 'IN',
    gdp: 3_956e9,
    lat: 19.076,
    lng: 72.8777,
    symbol: '^BSESN',
    currency: 'INR',
    tz: 'Asia/Kolkata',
    sessionStart: '09:15',
    sessionEnd: '15:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'Asia’s oldest exchange, founded 1875, and the benchmark for Indian equities.',
    topicTags: ['sensex', 'bombay stock exchange', 'india', 'mumbai', 'rupee'],
    countryTags: ['IN'],
    available: true,
  },
  {
    id: 'sgx',
    name: 'Singapore Exchange',
    indexName: 'Straits Times Index',
    city: 'Singapore',
    iso2: 'SG',
    gdp: 604e9,
    lat: 1.3521,
    lng: 103.8198,
    symbol: '^STI',
    currency: 'SGD',
    tz: 'Asia/Singapore',
    sessionStart: '09:00',
    sessionEnd: '17:00',
    days: [1, 2, 3, 4, 5],
    blurb: 'Southeast Asia’s financial hub, weighted to banks and regional property.',
    topicTags: ['straits times index', 'singapore exchange', 'singapore', 'sgx'],
    countryTags: ['SG'],
    available: true,
  },
  {
    id: 'twse',
    name: 'Taiwan Stock Exchange',
    indexName: 'TAIEX',
    city: 'Taipei',
    iso2: 'TW',
    gdp: 790e9,
    lat: 25.033,
    lng: 121.5654,
    symbol: '^TWII',
    currency: 'TWD',
    tz: 'Asia/Taipei',
    sessionStart: '09:00',
    sessionEnd: '13:30',
    days: [1, 2, 3, 4, 5],
    blurb:
      'TSMC alone is roughly a third of the index, which makes this the most concentrated major market on the map.',
    topicTags: ['taiex', 'taiwan stock exchange', 'taiwan', 'taipei', 'tsmc'],
    countryTags: ['TW'],
    available: true,
  },
  {
    id: 'set',
    name: 'Stock Exchange of Thailand',
    indexName: 'SET Index',
    city: 'Bangkok',
    iso2: 'TH',
    gdp: 577e9,
    lat: 13.7563,
    lng: 100.5018,
    symbol: '^SET.BK',
    currency: 'THB',
    tz: 'Asia/Bangkok',
    sessionStart: '10:00',
    sessionEnd: '16:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'Thailand’s benchmark, sensitive to tourism flows and regional energy prices.',
    topicTags: ['set index', 'stock exchange of thailand', 'thailand', 'bangkok', 'baht'],
    countryTags: ['TH'],
    available: true,
  },
  {
    id: 'pse',
    name: 'Philippine Stock Exchange',
    indexName: 'PSEi',
    city: 'Manila',
    iso2: 'PH',
    gdp: 487e9,
    lat: 14.5995,
    lng: 120.9842,
    symbol: 'PSEI.PS',
    currency: 'PHP',
    tz: 'Asia/Manila',
    sessionStart: '09:30',
    sessionEnd: '15:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'A small, domestically-driven market where remittance flows move the index.',
    topicTags: ['psei', 'philippine stock exchange', 'philippines', 'manila', 'peso'],
    countryTags: ['PH'],
    available: true,
  },
  {
    id: 'asx',
    name: 'Australian Securities Exchange',
    indexName: 'S&P/ASX 200',
    city: 'Sydney',
    iso2: 'AU',
    gdp: 1_799e9,
    lat: -33.8688,
    lng: 151.2093,
    symbol: '^AXJO',
    currency: 'AUD',
    tz: 'Australia/Sydney',
    sessionStart: '10:00',
    sessionEnd: '16:00',
    days: [1, 2, 3, 4, 5],
    blurb: 'Mining and banking. Often the first major market to react to Chinese demand data.',
    topicTags: ['asx', 'australian securities exchange', 'australia', 'sydney'],
    countryTags: ['AU'],
    available: true,
  },

  // ─── Africa, the Americas ─────────────────────────────────────────────────
  {
    id: 'jse',
    name: 'Johannesburg Stock Exchange',
    indexName: 'FTSE/JSE All Share',
    city: 'Johannesburg',
    iso2: 'ZA',
    gdp: 427e9,
    lat: -26.2041,
    lng: 28.0473,
    symbol: '^J203.JO',
    currency: 'ZAR',
    tz: 'Africa/Johannesburg',
    sessionStart: '09:00',
    sessionEnd: '17:00',
    days: [1, 2, 3, 4, 5],
    blurb:
      'Africa’s largest exchange by far, and the continent’s only one with a usable public daily series.',
    topicTags: ['jse', 'johannesburg stock exchange', 'south africa', 'rand'],
    countryTags: ['ZA'],
    available: true,
  },
  {
    id: 'b3',
    name: 'B3',
    indexName: 'Ibovespa',
    city: 'São Paulo',
    iso2: 'BR',
    gdp: 2_280e9,
    lat: -23.5505,
    lng: -46.6333,
    symbol: '^BVSP',
    currency: 'BRL',
    tz: 'America/Sao_Paulo',
    sessionStart: '10:00',
    sessionEnd: '18:00',
    days: [1, 2, 3, 4, 5],
    blurb: 'Latin America’s largest exchange, driven by iron ore, oil and Brazilian rates.',
    topicTags: ['ibovespa', 'b3', 'brazil', 'sao paulo'],
    countryTags: ['BR'],
    available: true,
  },
  {
    id: 'bmv',
    name: 'Bolsa Mexicana de Valores',
    indexName: 'IPC',
    city: 'Mexico City',
    iso2: 'MX',
    gdp: 1_833e9,
    lat: 19.4326,
    lng: -99.1332,
    symbol: '^MXX',
    currency: 'MXN',
    tz: 'America/Mexico_City',
    sessionStart: '08:30',
    sessionEnd: '15:00',
    days: [1, 2, 3, 4, 5],
    blurb: 'Mexico’s benchmark, tightly coupled to US demand and the peso.',
    topicTags: ['ipc', 'bolsa mexicana', 'mexico', 'peso'],
    countryTags: ['MX'],
    available: true,
  },
  {
    id: 'byma',
    name: 'Bolsas y Mercados Argentinos',
    indexName: 'MERVAL',
    city: 'Buenos Aires',
    iso2: 'AR',
    gdp: 683e9,
    lat: -34.6037,
    lng: -58.3816,
    symbol: '^MERV',
    // Yahoo reports an empty currency for this symbol, so the fetcher cannot
    // assert one here; the zone is specific enough to identify the instrument.
    currency: 'ARS',
    tz: 'America/Argentina/Buenos_Aires',
    sessionStart: '11:00',
    sessionEnd: '17:00',
    days: [1, 2, 3, 4, 5],
    blurb:
      'Priced in a currency that has lost most of its value repeatedly, so the index rises even in bad years. Direction over a day means something; the level does not.',
    topicTags: ['merval', 'argentina', 'buenos aires'],
    countryTags: ['AR'],
    available: true,
  },
  {
    id: 'tsx',
    name: 'Toronto Stock Exchange',
    indexName: 'S&P/TSX Composite',
    city: 'Toronto',
    iso2: 'CA',
    gdp: 2_320e9,
    lat: 43.6532,
    lng: -79.3832,
    symbol: '^GSPTSE',
    currency: 'CAD',
    tz: 'America/Toronto',
    sessionStart: '09:30',
    sessionEnd: '16:00',
    days: [1, 2, 3, 4, 5],
    blurb: 'Energy, mining and banks — a commodity index wearing an equity index’s clothes.',
    topicTags: ['tsx', 'toronto stock exchange', 'canada', 'toronto'],
    countryTags: ['CA'],
    available: true,
  },
  {
    id: 'nyse',
    // Both New York exchanges: the index is not the NYSE's, and its largest
    // members (Nvidia, Apple, Microsoft) list on Nasdaq.
    name: 'NYSE and Nasdaq',
    indexName: 'S&P 500',
    city: 'New York',
    iso2: 'US',
    gdp: 30_770e9,
    lat: 40.7069,
    lng: -74.0113,
    symbol: '^GSPC',
    currency: 'USD',
    tz: 'America/New_York',
    sessionStart: '09:30',
    sessionEnd: '16:00',
    days: [1, 2, 3, 4, 5],
    blurb:
      'The largest equity market on earth. Its close sets the tone every other market opens against.',
    topicTags: ['s&p 500', 'new york stock exchange', 'wall street', 'nyse', 'united states'],
    countryTags: ['US'],
    available: true,
  },

  // ─── Europe ───────────────────────────────────────────────────────────────
  {
    id: 'lse',
    name: 'London Stock Exchange',
    indexName: 'FTSE 100',
    city: 'London',
    iso2: 'GB',
    gdp: 4_003e9,
    lat: 51.5155,
    lng: -0.0922,
    symbol: '^FTSE',
    currency: 'GBP',
    tz: 'Europe/London',
    sessionStart: '08:00',
    sessionEnd: '16:30',
    days: [1, 2, 3, 4, 5],
    blurb:
      'Most FTSE 100 revenue is earned abroad, so a falling pound tends to push the index up.',
    topicTags: ['ftse', 'london stock exchange', 'united kingdom', 'london', 'sterling'],
    countryTags: ['GB'],
    available: true,
  },
  {
    id: 'xetra',
    name: 'Deutsche Börse',
    indexName: 'DAX',
    city: 'Frankfurt',
    iso2: 'DE',
    gdp: 5_051e9,
    lat: 50.1109,
    lng: 8.6821,
    symbol: '^GDAXI',
    currency: 'EUR',
    tz: 'Europe/Berlin',
    sessionStart: '09:00',
    sessionEnd: '17:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'Germany’s industrial and chemical base — Europe’s clearest export barometer.',
    topicTags: ['dax', 'deutsche borse', 'germany', 'frankfurt'],
    countryTags: ['DE'],
    available: true,
  },
  {
    id: 'euronext-paris',
    name: 'Euronext Paris',
    indexName: 'CAC 40',
    city: 'Paris',
    iso2: 'FR',
    gdp: 3_366e9,
    lat: 48.8566,
    lng: 2.3522,
    symbol: '^FCHI',
    currency: 'EUR',
    tz: 'Europe/Paris',
    sessionStart: '09:00',
    sessionEnd: '17:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'Luxury goods and energy dominate — unusually exposed to Chinese consumer demand.',
    topicTags: ['cac 40', 'euronext', 'france', 'paris'],
    countryTags: ['FR'],
    available: true,
  },
  {
    id: 'euronext-amsterdam',
    name: 'Euronext Amsterdam',
    indexName: 'AEX',
    city: 'Amsterdam',
    iso2: 'NL',
    gdp: 1_333e9,
    lat: 52.3676,
    lng: 4.9041,
    symbol: '^AEX',
    currency: 'EUR',
    tz: 'Europe/Amsterdam',
    sessionStart: '09:00',
    sessionEnd: '17:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'The world’s oldest exchange, now carried largely by ASML.',
    topicTags: ['aex', 'euronext amsterdam', 'netherlands', 'amsterdam', 'asml'],
    countryTags: ['NL'],
    available: true,
  },
  {
    id: 'bme',
    name: 'Bolsa de Madrid',
    indexName: 'IBEX 35',
    city: 'Madrid',
    iso2: 'ES',
    gdp: 1_906e9,
    lat: 40.4168,
    lng: -3.7038,
    symbol: '^IBEX',
    currency: 'EUR',
    tz: 'Europe/Madrid',
    sessionStart: '09:00',
    sessionEnd: '17:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'Spanish banks with heavy Latin American exposure make this a proxy for both regions.',
    topicTags: ['ibex', 'bolsa de madrid', 'spain', 'madrid'],
    countryTags: ['ES'],
    available: true,
  },
  {
    id: 'borsa-italiana',
    name: 'Borsa Italiana',
    indexName: 'FTSE MIB',
    city: 'Milan',
    iso2: 'IT',
    gdp: 2_552e9,
    lat: 45.4642,
    lng: 9.19,
    symbol: 'FTSEMIB.MI',
    currency: 'EUR',
    tz: 'Europe/Rome',
    sessionStart: '09:00',
    sessionEnd: '17:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'Banks and utilities, and the market most sensitive to Italian sovereign debt spreads.',
    topicTags: ['ftse mib', 'borsa italiana', 'italy', 'milan'],
    countryTags: ['IT'],
    available: true,
  },
  {
    id: 'six',
    name: 'SIX Swiss Exchange',
    indexName: 'SMI',
    city: 'Zurich',
    iso2: 'CH',
    gdp: 1_044e9,
    lat: 47.3769,
    lng: 8.5417,
    symbol: '^SSMI',
    currency: 'CHF',
    tz: 'Europe/Zurich',
    sessionStart: '09:00',
    sessionEnd: '17:30',
    days: [1, 2, 3, 4, 5],
    blurb:
      'Nestlé, Roche and Novartis carry the index, which makes it defensive when the world turns risk-off.',
    topicTags: ['smi', 'six swiss exchange', 'switzerland', 'zurich', 'franc'],
    countryTags: ['CH'],
    available: true,
  },
  {
    id: 'nasdaq-stockholm',
    name: 'Nasdaq Stockholm',
    indexName: 'OMXS30',
    city: 'Stockholm',
    iso2: 'SE',
    gdp: 669e9,
    lat: 59.3293,
    lng: 18.0686,
    symbol: '^OMX',
    currency: 'SEK',
    tz: 'Europe/Stockholm',
    sessionStart: '09:00',
    sessionEnd: '17:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'Nordic industrials and telecoms, and a useful early read on European capital spending.',
    topicTags: ['omxs30', 'nasdaq stockholm', 'sweden', 'stockholm', 'krona'],
    countryTags: ['SE'],
    available: true,
  },

  // ─── Yafa ─────────────────────────────────────────────────────────────────
  // The city is printed Yafa, per shared/place-names.ts, which is what the
  // basemap and the articles already say. `city` stays the untranslated
  // source string so the join and the display can't disagree — the map
  // translates at the display layer, the same way it does everywhere else.
  {
    id: 'tase',
    name: 'Tel Aviv Stock Exchange',
    indexName: 'TA-125',
    city: 'Tel Aviv',
    iso2: 'IL',
    gdp: 611e9,
    lat: 32.0853,
    lng: 34.7818,
    symbol: '^TA125.TA',
    currency: 'ILS',
    tz: 'Asia/Jerusalem',
    sessionStart: '09:00',
    sessionEnd: '17:30',
    days: [0, 1, 2, 3, 4],
    blurb: 'Trades Sunday to Thursday. Heavily weighted to banks, defence and technology.',
    topicTags: ['tel aviv stock exchange', 'ta-125', 'tase'],
    countryTags: ['IL'],
    available: true,
  },

  // ─── Recorded, not drawn ──────────────────────────────────────────────────
  // Every one of these was probed against Yahoo. None returns a usable daily
  // series. They are listed so the gap stays visible and so a future source can
  // be measured against a known list rather than rediscovered.
  {
    id: 'egx',
    name: 'Egyptian Exchange',
    indexName: 'EGX 30',
    city: 'Cairo',
    iso2: 'EG',
    lat: 30.0444,
    lng: 31.2357,
    symbol: '^CASE30',
    currency: 'EGP',
    tz: 'Africa/Cairo',
    sessionStart: '10:00',
    sessionEnd: '14:30',
    days: [0, 1, 2, 3, 4],
    blurb: 'The Arab world’s oldest exchange, founded in Alexandria in 1883.',
    topicTags: ['egx', 'egyptian exchange', 'egypt', 'cairo'],
    countryTags: ['EG'],
    available: false,
    reason:
      'Yahoo returns a live EGP level and the correct zone but exactly one close at every range, so no daily change can be computed.',
  },
  {
    id: 'casablanca',
    name: 'Bourse de Casablanca',
    indexName: 'MASI',
    city: 'Casablanca',
    iso2: 'MA',
    lat: 33.5731,
    lng: -7.5898,
    symbol: 'MASI.CS',
    currency: 'MAD',
    tz: 'Africa/Casablanca',
    sessionStart: '09:30',
    sessionEnd: '15:30',
    days: [1, 2, 3, 4, 5],
    blurb: 'North Africa’s second-largest exchange.',
    topicTags: ['masi', 'bourse de casablanca', 'morocco', 'casablanca'],
    countryTags: ['MA'],
    available: false,
    reason:
      'The symbol exists but Yahoo answers it with HTTP 429 on both hosts, persistently and across retries. Worth re-probing.',
  },
  .../** @type {[string, string, string, string, string, number, number][]} */ ([
    ['qse', 'Qatar Stock Exchange', 'QE Index', 'Doha', 'QA', 25.2854, 51.531],
    ['adx', 'Abu Dhabi Securities Exchange', 'FTSE ADX General', 'Abu Dhabi', 'AE', 24.4539, 54.3773],
    ['boursa-kuwait', 'Boursa Kuwait', 'Premier Market Index', 'Kuwait City', 'KW', 29.3759, 47.9774],
    ['bahrain-bourse', 'Bahrain Bourse', 'Bahrain All Share', 'Manama', 'BH', 26.2285, 50.586],
    ['msx', 'Muscat Stock Exchange', 'MSX 30', 'Muscat', 'OM', 23.588, 58.3829],
    ['psx', 'Pakistan Stock Exchange', 'KSE 100', 'Karachi', 'PK', 24.8607, 67.0011],
    ['dse', 'Dhaka Stock Exchange', 'DSEX', 'Dhaka', 'BD', 23.8103, 90.4125],
    ['bvmt', 'Bourse de Tunis', 'TUNINDEX', 'Tunis', 'TN', 36.8065, 10.1815],
    ['ase', 'Amman Stock Exchange', 'ASE Index', 'Amman', 'JO', 31.9454, 35.9284],
    ['ngx', 'Nigerian Exchange', 'NGX All-Share', 'Lagos', 'NG', 6.5244, 3.3792],
    ['moex', 'Moscow Exchange', 'IMOEX', 'Moscow', 'RU', 55.7558, 37.6173],
  ]).map(([id, name, indexName, city, iso2, lat, lng]) => ({
    id,
    name,
    indexName,
    city,
    iso2,
    lat,
    lng,
    symbol: null,
    currency: null,
    tz: null,
    sessionStart: null,
    sessionEnd: null,
    days: [],
    blurb: '',
    topicTags: [city.toLowerCase(), name.toLowerCase()],
    countryTags: [iso2],
    available: false,
    reason:
      id === 'moex'
        ? 'Yahoo carries a live level for IMOEX.ME but no daily series.'
        : 'No usable symbol on Yahoo Finance — every candidate form returns 404 or an unrelated instrument.',
  })),
]

export const MARKET_BY_ID = Object.fromEntries(MARKET_CATALOG.map((m) => [m.id, m]))

/** The entries the fetcher actually requests. */
export const MARKET_TRACKED = MARKET_CATALOG.filter((m) => m.available)

/**
 * Does this Yahoo response identify as the instrument we asked for?
 *
 * Returns null when it does, or a human-readable reason when it does not. Lives
 * here rather than inline in the fetcher so it can be tested against the known
 * impostors (`^PSI` → a PIMCO fund, `^NGX` → Nasdaq Next Generation 100) — a
 * guard against silent wrongness is worth little if nothing proves it fires.
 *
 * An absent currency is not a contradicting one: Yahoo reports none at all for
 * ^MERV, and treating silence as a mismatch would drop a good series. The zone
 * is specific enough to pin the instrument on its own.
 *
 * @param {{ symbol: string, currency: string|null, tz: string|null }} entry
 * @param {{ currencyReported?: string, timezone?: string }} data
 * @returns {string | null}
 */
export function instrumentMismatch(entry, data) {
  if (data.currencyReported && data.currencyReported !== entry.currency) {
    return `currency ${data.currencyReported} ≠ ${entry.currency}`
  }
  if (data.timezone && data.timezone !== entry.tz) {
    return `timezone ${data.timezone} ≠ ${entry.tz}`
  }
  return null
}

/**
 * One exchange as `content/.markets.json` holds it: the catalog's entry with
 * its quote, or the reason it has none. Exactly one of the two is set, as
 * `companyRecord` returns for a share (`lib/companies.js`).
 *
 * It was forty lines in the middle of `fetch-markets.js`, a script that runs
 * when it is imported, so the rule this layer most needs kept had no test:
 *
 * **The day's change is the last two closes, never Yahoo's
 * `chartPreviousClose`.** That is the close before the *window*, so against a
 * three-month range it reports the quarter's move as the day's.
 *
 * The level has to be above zero as well as finite. The app's validator takes
 * the markets payload whole or not at all and refuses any exchange at or under
 * zero (`isMarketsSnapshot`, `mobile/lib/markets.ts`), so one such row
 * published is the whole layer refused. No index has printed one; the check is
 * for a response that is wrong, and it costs that exchange only.
 *
 * The keys, and their order, are the published file's. `/api/markets.json` is
 * this record with the build's stories joined on.
 *
 * @param {MarketEntry} m
 * @param {any} data  `fetchYahooStock`'s result
 * @param {{ stale?: boolean }} [opts]
 * @returns {{ record: Record<string, unknown> | null, rejected: string | null }}
 */
export function exchangeRecord(m, data, { stale = false } = {}) {
  const refuse = (/** @type {string} */ rejected) => ({ record: null, rejected })

  // The wrong-instrument guard. Yahoo answers an unknown symbol with a
  // *different* instrument rather than a 404 — probing this catalog turned up
  // three (`^PSI` → a PIMCO fund, `^NGX` → Nasdaq Next Generation 100, `^MSI` →
  // a USD figure that is not Muscat). Those three happen to be caught upstream
  // by the ≥5-closes rule in stocks.js, because each carries almost no history.
  // This guard is for the case that rule cannot see: an impostor with a full,
  // healthy series, which would otherwise publish an invented index level with
  // nothing thrown and nothing logged. Verified to reject ^N225 and ^FTSE when
  // asked for under the NYSE entry.
  const mismatch = instrumentMismatch(m, data)
  if (mismatch) return refuse(mismatch)

  const values = data.values
  if (values.length < 2) return refuse(`${values.length} usable close(s), cannot derive a change`)
  const level = values[values.length - 1]
  const previous = values[values.length - 2]
  if (!Number.isFinite(level) || !Number.isFinite(previous) || previous === 0 || !(level > 0)) {
    return refuse(`unusable closes ${previous} → ${level}`)
  }

  return {
    rejected: null,
    record: {
      id: m.id,
      name: m.name,
      indexName: m.indexName,
      city: m.city,
      iso2: m.iso2,
      lat: m.lat,
      lng: m.lng,
      level,
      changePct: Number((((level - previous) / previous) * 100).toFixed(3)),
      currency: m.currency,
      tz: m.tz,
      sessionStart: m.sessionStart,
      sessionEnd: m.sessionEnd,
      days: m.days,
      series: { periods: data.periods, values, dates: data.dates, completed: data.completed },
      asOf: data.asOf,
      sourceLabel: `Yahoo Finance · ${data.exchange || m.indexName}`,
      blurb: m.blurb,
      topicTags: m.topicTags,
      countryTags: m.countryTags,
      // After every key an installed app reads, and optional as `stale` is.
      ...(m.gdp ? { gdp: m.gdp } : {}),
      ...(stale ? { stale: true } : {}),
    },
  }
}
