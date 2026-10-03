// The companies the app's `largest companies` list quotes.
//
// Shape: { id, name, about, symbol, exchange, tickers, iso2, currency, currencyName, tz,
//          match, blurb, topicTags }
//   - name       — the name a reader knows it by, not the registered one:
//                  `Nvidia`, not `NVIDIA Corporation`.
//   - about      — what it is known for, in a few plain words. The list prints
//                  it under the name with the country (`AI chips · US`), where
//                  an exchange's row prints its index and city. A ticker would
//                  be a code only a reader who already follows the share knows.
//   - symbol     — Yahoo Finance ticker of the **home listing**, passed
//                  verbatim to fetchYahooStock. TSMC is `2330.TW` in Taiwan
//                  dollars and not its New York receipt, so the week's move is
//                  the share's and not the share's plus the exchange rate's.
//   - exchange   — where that listing trades, in words, for the card's source
//                  line. The quote source reports a code (`NMS`, `KSC`), which
//                  is the vendor's and nobody else's.
//   - tickers    — every ticker a story's `entities[]` may carry for it. The
//                  entity stage names a company by whichever listing the model
//                  knew (`stocks:TSM`). Corroboration only, never a join on its
//                  own: see `companiesPayload`.
//   - currency / tz — what Yahoo reports for the symbol. Assertions, as in
//                  `market-metadata.js`: the fetcher drops a response that
//                  disagrees.
//   - match      — a lowercase fragment the reported name must contain. The
//                  currency and zone cannot tell one New York share from
//                  another, and fifteen of these are New York shares; a ticker
//                  reassigned to a fund would otherwise publish that fund's
//                  price under this company's name with nothing thrown.
//   - currencyName — the price's currency in words, plural, for the line under
//                  the number: `Taiwan dollars a share`.
//   - blurb      — what the company is, in a sentence or two, written to stay
//                  true: no rank, no price, no year. It is the paragraph under
//                  the chart, and the app drops a card that has none.
//   - topicTags  — matched on a word boundary against an article's title and
//                  its leading concepts. A tag earns its place only when it is
//                  not also ordinary English (`market-metadata.js`, "A tag that
//                  is also an English word").
//   - commonName — the name, where the name *is* ordinary English: `apple`,
//                  `amazon`, `meta`, `alphabet`. It counts only in a title, and
//                  only when the story's entities or concepts agree it is the
//                  company — an Amazon deforestation story names no AMZN.
//
// Which companies
// ---------------
// The twenty largest listed companies by market value, as ranked on
// 2026-10-03. The list is editorial and fixed: the quote source carries no
// market value, so nothing here can re-rank itself, and a list that reshuffled
// with every close would move rows the reader had learned the place of. The
// app says "twenty of the world's largest", which stays true while the order
// underneath drifts. Revisit it when a company falls well out of the top
// thirty — and when adding one, probe its symbol first and pin what it reports.
//
// Not the daily narration. An exchange gets a paragraph a day from the
// indicator dispatch; these do not, on purpose — twenty more instruments for
// the model to read coverage against, for a list that is looked up rather than
// followed. The blurb is the standing sentence, and the stories that name the
// company are joined on at build time (`lib/companies.js`).

/**
 * @typedef {Object} CompanyEntry
 * @property {string} id
 * @property {string} name
 * @property {string} about
 * @property {string} symbol
 * @property {string} exchange
 * @property {string[]} tickers
 * @property {string} iso2
 * @property {string} currency
 * @property {string} currencyName
 * @property {string} tz
 * @property {string} match
 * @property {string} blurb
 * @property {string[]} topicTags
 * @property {string} [commonName]
 */

/** @type {CompanyEntry[]} */
export const COMPANY_TRACKED = [
  {
    id: 'nvidia',
    name: 'Nvidia',
    about: 'AI chips',
    symbol: 'NVDA',
    exchange: 'Nasdaq',
    tickers: ['NVDA'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'nvidia',
    blurb:
      'Designs the processors that most artificial-intelligence models are trained and run on, and sells them to the companies building data centres. It designs chips and does not make them: TSMC does.',
    topicTags: ['nvidia'],
  },
  {
    id: 'apple',
    name: 'Apple',
    about: 'iPhones & computers',
    symbol: 'AAPL',
    exchange: 'Nasdaq',
    tickers: ['AAPL'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'apple',
    blurb:
      'Makes the iPhone, which brings in about half its sales, along with Mac computers, iPads and watches, and takes a cut of what is sold through its App Store.',
    topicTags: ['apple inc', 'iphone', 'app store'],
    commonName: 'apple',
  },
  {
    id: 'alphabet',
    name: 'Alphabet',
    about: 'Google & YouTube',
    symbol: 'GOOGL',
    exchange: 'Nasdaq',
    tickers: ['GOOGL', 'GOOG'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'alphabet',
    blurb:
      'Owns Google and YouTube. Most of its money comes from advertising beside search results and videos; it also sells cloud computing and builds its own AI models.',
    topicTags: ['alphabet inc', 'google', 'youtube'],
    commonName: 'alphabet',
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    about: 'software & cloud',
    symbol: 'MSFT',
    exchange: 'Nasdaq',
    tickers: ['MSFT'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'microsoft',
    blurb:
      'Sells Windows and Office, and rents out computing power through Azure, one of the largest clouds. It holds a large stake in OpenAI.',
    topicTags: ['microsoft', 'copilot'],
  },
  {
    id: 'amazon',
    name: 'Amazon',
    about: 'online retail & cloud',
    symbol: 'AMZN',
    exchange: 'Nasdaq',
    tickers: ['AMZN'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'amazon',
    blurb:
      'An online retailer, and through Amazon Web Services the largest seller of cloud computing, which earns most of its profit.',
    topicTags: ['amazon.com', 'amazon (company)', 'amazon web services', 'aws'],
    commonName: 'amazon',
  },
  {
    id: 'tsmc',
    name: 'TSMC',
    about: 'chip manufacturing',
    symbol: '2330.TW',
    exchange: 'Taiwan Stock Exchange',
    tickers: ['2330.TW', 'TSM'],
    iso2: 'TW',
    currency: 'TWD',
    currencyName: 'Taiwan dollars',
    tz: 'Asia/Taipei',
    match: 'taiwan semiconductor',
    blurb:
      'Manufactures the chips other companies design, among them Apple’s, Nvidia’s and AMD’s, and makes most of the world’s most advanced ones, in Taiwan.',
    topicTags: ['tsmc', 'taiwan semiconductor'],
  },
  {
    id: 'spacex',
    name: 'SpaceX',
    about: 'rockets & satellite internet',
    symbol: 'SPCX',
    exchange: 'Nasdaq',
    tickers: ['SPCX'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'space exploration',
    blurb:
      'Builds reusable rockets, launches satellites and astronauts for governments and companies, and runs Starlink, a satellite internet network.',
    topicTags: ['spacex', 'starlink', 'starship'],
  },
  {
    id: 'meta',
    name: 'Meta',
    about: 'Facebook, Instagram & WhatsApp',
    symbol: 'META',
    exchange: 'Nasdaq',
    tickers: ['META'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'meta platforms',
    blurb:
      'Owns Facebook, Instagram and WhatsApp, used by more than three billion people, and earns nearly all its money from advertising on them.',
    topicTags: ['meta platforms', 'facebook', 'instagram', 'whatsapp'],
    commonName: 'meta',
  },
  {
    id: 'broadcom',
    name: 'Broadcom',
    about: 'network & AI chips',
    symbol: 'AVGO',
    exchange: 'Nasdaq',
    tickers: ['AVGO'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'broadcom',
    blurb:
      'Makes the networking chips that connect data centres and designs custom AI chips for companies such as Google. It also owns the software firm VMware.',
    topicTags: ['broadcom'],
  },
  {
    id: 'aramco',
    name: 'Saudi Aramco',
    about: 'oil & gas',
    symbol: '2222.SR',
    exchange: 'Saudi Exchange',
    tickers: ['2222.SR'],
    iso2: 'SA',
    currency: 'SAR',
    currencyName: 'Saudi riyals',
    tz: 'Asia/Riyadh',
    match: 'saudi arabian oil',
    blurb:
      'Saudi Arabia’s state oil company, which pumps more oil than any other company. The government owns nearly all of it, and its dividends pay for much of the kingdom’s budget.',
    topicTags: ['aramco'],
  },
  {
    id: 'tesla',
    name: 'Tesla',
    about: 'electric cars',
    symbol: 'TSLA',
    exchange: 'Nasdaq',
    tickers: ['TSLA'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'tesla',
    blurb:
      'Makes electric cars, and the batteries that store power for homes and electricity grids. Led by Elon Musk, who also leads SpaceX.',
    topicTags: ['tesla'],
  },
  {
    id: 'samsung',
    name: 'Samsung Electronics',
    about: 'memory chips & phones',
    symbol: '005930.KS',
    exchange: 'Korea Exchange',
    tickers: ['005930.KS', 'SSNLF'],
    iso2: 'KR',
    currency: 'KRW',
    currencyName: 'Korean won',
    tz: 'Asia/Seoul',
    match: 'samsung electronics',
    blurb:
      'One of the three companies that make most of the world’s memory chips, and one of the largest makers of smartphones and televisions.',
    topicTags: ['samsung'],
  },
  {
    id: 'micron',
    name: 'Micron',
    about: 'memory chips',
    symbol: 'MU',
    exchange: 'Nasdaq',
    tickers: ['MU'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'micron',
    blurb:
      'The one large American maker of memory chips, the kind that hold data in phones, computers and AI data centres. Its two main rivals are Samsung and SK Hynix.',
    topicTags: ['micron technology', 'micron'],
  },
  {
    id: 'berkshire',
    name: 'Berkshire Hathaway',
    about: 'insurance & investments',
    symbol: 'BRK-B',
    exchange: 'New York Stock Exchange',
    tickers: ['BRK-B', 'BRK-A', 'BRK.B', 'BRK.A'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'berkshire',
    blurb:
      'A holding company built by Warren Buffett. It owns insurers, a railway and energy utilities outright, and holds large stakes in companies such as Apple and Coca-Cola.',
    topicTags: ['berkshire hathaway', 'berkshire', 'buffett'],
  },
  {
    id: 'amd',
    name: 'AMD',
    about: 'processors & AI chips',
    symbol: 'AMD',
    exchange: 'Nasdaq',
    tickers: ['AMD'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'advanced micro devices',
    blurb:
      'Designs processors for computers and data centres, where it competes with Intel, and AI chips, where it competes with Nvidia. Like Nvidia, it has TSMC make them.',
    topicTags: ['advanced micro devices', 'amd'],
  },
  {
    id: 'lilly',
    name: 'Eli Lilly',
    about: 'medicines',
    symbol: 'LLY',
    exchange: 'New York Stock Exchange',
    tickers: ['LLY'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'eli lilly',
    blurb:
      'An American drugmaker. Its diabetes and weight-loss medicines, sold as Mounjaro and Zepbound, account for much of its growth.',
    topicTags: ['eli lilly', 'mounjaro', 'zepbound'],
  },
  {
    id: 'skhynix',
    name: 'SK Hynix',
    about: 'memory chips',
    symbol: '000660.KS',
    exchange: 'Korea Exchange',
    tickers: ['000660.KS'],
    iso2: 'KR',
    currency: 'KRW',
    currencyName: 'Korean won',
    tz: 'Asia/Seoul',
    match: 'hynix',
    blurb:
      'A South Korean maker of memory chips, and the main supplier of the high-speed memory that Nvidia’s AI chips need.',
    topicTags: ['sk hynix', 'hynix'],
  },
  {
    id: 'jpmorgan',
    name: 'JPMorgan Chase',
    about: 'banking',
    symbol: 'JPM',
    exchange: 'New York Stock Exchange',
    tickers: ['JPM'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'jpmorgan',
    blurb:
      'The largest bank in the United States by assets, serving households, companies and governments.',
    topicTags: ['jpmorgan', 'jp morgan'],
  },
  {
    id: 'walmart',
    name: 'Walmart',
    about: 'retail',
    symbol: 'WMT',
    exchange: 'Nasdaq',
    tickers: ['WMT'],
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    tz: 'America/New_York',
    match: 'walmart',
    blurb:
      'The world’s largest retailer by sales, with thousands of stores in the United States and abroad.',
    topicTags: ['walmart'],
  },
  {
    id: 'asml',
    name: 'ASML',
    about: 'chipmaking machines',
    symbol: 'ASML.AS',
    exchange: 'Euronext Amsterdam',
    tickers: ['ASML.AS', 'ASML'],
    iso2: 'NL',
    currency: 'EUR',
    currencyName: 'euros',
    tz: 'Europe/Amsterdam',
    match: 'asml',
    blurb:
      'A Dutch company, and the only maker of the machines needed to print the most advanced chips. Every leading chipmaker buys from it, and its sales to China are restricted.',
    topicTags: ['asml'],
  },
]
