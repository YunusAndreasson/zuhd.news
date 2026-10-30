import { getMeta } from './cache.js'

// Every outlet the cycle reads for itself, held to `scripts/lib/rss-sources.js`
// by mcp-sources.test.js. A `country` is that table's: where the outlet is based.
const READ_DIRECTLY = [
  { name: '404 Media', country: 'US', region: 'North America', type: 'Investigative' },
  { name: 'Bellingcat', country: 'NL', region: 'Europe', type: 'Investigative' },
  { name: 'Mada Masr', country: 'EG', region: 'Middle East', type: 'Independent' },
  { name: 'Salaam Gateway', country: 'AE', region: 'Middle East', type: 'Specialist' },
  { name: 'InSight Crime', country: 'US', region: 'Latin America', type: 'Specialist' },
  { name: 'Declassified UK', country: 'GB', region: 'Europe', type: 'Investigative' },
  { name: 'Responsible Statecraft', country: 'US', region: 'North America', type: 'Think tank publication' },
  { name: 'Drop Site News', country: 'US', region: 'North America', type: 'Independent' },
  { name: 'SMEX', country: 'LB', region: 'Middle East', type: 'Digital rights' },
  { name: 'SciDev.Net', country: 'GB', region: 'Global', type: 'Science journalism' },
  { name: 'The Record', country: 'US', region: 'North America', type: 'Specialist' },
  { name: 'Phys.org', country: 'GB', region: 'Global', type: 'Aggregator' },
  { name: 'Quanta Magazine', country: 'US', region: 'North America', type: 'Science journalism' },
  { name: 'Carbon Brief', country: 'GB', region: 'Europe', type: 'Climate journalism' },
  { name: 'New Lines Magazine', country: 'US', region: 'Global', type: 'Magazine' },
  { name: 'The War Zone', country: 'US', region: 'North America', type: 'Specialist' },
  { name: 'European Spaceflight', country: 'FR', region: 'Europe', type: 'Specialist' },
  { name: 'Inkstick', country: 'US', region: 'North America', type: 'Magazine' },
  { name: 'Rest of World', country: 'US', region: 'Global', type: 'Tech journalism' },
  { name: 'The Diplomat', country: 'US', region: 'Asia-Pacific', type: 'Magazine' },
  { name: 'Lowy Interpreter', country: 'AU', region: 'Oceania', type: 'Think tank publication' },
  { name: 'Dialogue Earth', country: 'GB', region: 'Global', type: 'Climate journalism' },
  { name: 'Global Voices', country: 'NL', region: 'Global', type: 'Citizen media' },
  { name: 'Payload', country: 'US', region: 'North America', type: 'Specialist' },
  { name: 'C4ISRNET', country: 'US', region: 'North America', type: 'Specialist' },
  { name: 'TechNode', country: 'CN', region: 'East Asia', type: 'Tech journalism' },
  { name: 'Latin America Reports', country: 'CO', region: 'Latin America', type: 'Independent' },
  { name: 'Mondoweiss', country: 'US', region: 'Middle East', type: 'Independent' },
  { name: 'netzpolitik.org', country: 'DE', region: 'Europe', type: 'Digital rights' },
  { name: 'Agência Pública', country: 'BR', region: 'Latin America', type: 'Investigative' },
  { name: 'Contracorriente', country: 'HN', region: 'Latin America', type: 'Independent' },
  { name: 'Focos', country: 'SV', region: 'Latin America', type: 'Independent' },
  { name: 'Kloop', country: 'KG', region: 'Central Asia', type: 'Independent' },
  { name: 'TMTPost', country: 'CN', region: 'East Asia', type: 'Tech journalism' },
  { name: 'Zhidx', country: 'CN', region: 'East Asia', type: 'Tech journalism' },
  { name: 'Pekingnology', country: 'CN', region: 'East Asia', type: 'Think tank publication' },
  { name: 'Hacker News', country: 'US', region: 'North America', type: 'Community' }
]

// A selection: the news API names hundreds of outlets, and there is no fixed
// roster. Each name is one the articles' `sources` carry.
const THROUGH_NEWS_API = [
  { name: 'Al Jazeera', country: 'QA', region: 'Middle East', type: 'Public broadcaster' },
  { name: 'BBC', country: 'GB', region: 'Europe', type: 'Public broadcaster' },
  { name: 'France 24', country: 'FR', region: 'Europe', type: 'Public broadcaster' },
  { name: 'Deutsche Welle', country: 'DE', region: 'Europe', type: 'Public broadcaster' },
  { name: 'AllAfrica', country: 'ZA', region: 'Africa', type: 'Aggregator' },
  { name: 'Al-Monitor', country: 'US', region: 'Middle East', type: 'Independent' },
  { name: 'The Hindu', country: 'IN', region: 'South Asia', type: 'Newspaper' },
  { name: 'Yonhap News Agency', country: 'KR', region: 'East Asia', type: 'News agency' },
  { name: 'CoinDesk', country: 'US', region: 'North America', type: 'Specialist' },
  { name: 'Haaretz', country: 'IL', region: 'Middle East', type: 'Newspaper' },
  { name: 'Nature', country: 'GB', region: 'Europe', type: 'Academic journal' },
  { name: 'New Scientist', country: 'GB', region: 'Europe', type: 'Science journalism' },
  { name: 'STAT', country: 'US', region: 'North America', type: 'Health journalism' },
  { name: 'Ars Technica', country: 'US', region: 'North America', type: 'Tech journalism' },
  { name: 'The Moscow Times', country: 'RU', region: 'Europe', type: 'Independent' },
  { name: 'MIT Technology Review', country: 'US', region: 'North America', type: 'Tech journalism' },
  { name: 'Malay Mail', country: 'MY', region: 'Southeast Asia', type: 'Newspaper' },
  { name: 'Antara News', country: 'ID', region: 'Southeast Asia', type: 'News agency' },
  { name: 'Premium Times Nigeria', country: 'NG', region: 'Africa', type: 'Newspaper' },
  { name: 'Dawn', country: 'PK', region: 'South Asia', type: 'Newspaper' },
  { name: 'The Daily Star', country: 'BD', region: 'South Asia', type: 'Newspaper' },
  { name: 'South China Morning Post', country: 'HK', region: 'East Asia', type: 'Newspaper' },
  { name: 'Middle East Eye', country: 'GB', region: 'Middle East', type: 'Independent' },
  { name: 'Daily Maverick', country: 'ZA', region: 'Africa', type: 'Independent' },
  { name: 'Buenos Aires Times', country: 'AR', region: 'Latin America', type: 'Newspaper' },
  { name: 'MercoPress', country: 'UY', region: 'Latin America', type: 'News agency' },
  { name: 'CBC News', country: 'CA', region: 'North America', type: 'Public broadcaster' },
  { name: 'Fox News', country: 'US', region: 'North America', type: 'Cable news' },
  { name: 'ABC News Australia', country: 'AU', region: 'Oceania', type: 'Public broadcaster' },
  { name: 'RNZ Pacific', country: 'NZ', region: 'Oceania', type: 'Public broadcaster' }
]

export const SOURCES = [
  ...READ_DIRECTLY.map(s => ({ ...s, via: 'direct' })),
  ...THROUGH_NEWS_API.map(s => ({ ...s, via: 'news-api' }))
]

const ABOUT = `zuhd.news — News for all humans.

Zuhd (زهد) is the Arabic concept of detachment from excess — not deprivation, but liberation. Applied to news: the modern information landscape is defined by excess. Every element competes for attention that should belong to the story.

zuhd.news begins from the position that news is words, and words deserve a design that serves them.

First Principles:
- Accurate: Verified before published. Sources cited. Corrections issued openly.
- Unbiased: Facts presented without editorial injection. Context without agenda.
- Ad-free: No advertising. No sponsored content. The reader is never the product.
- Easy to read: Typography optimized for sustained, comfortable reading.
- Quick to read: Respect the reader's time. Say what matters, then stop.
- Global: News that crosses borders. Written for humans, not demographics.

Categories: politics, economy, science, tech.
Updated 5 times daily (05:00, 10:00, 14:00, 18:00, 22:00 UTC).
There is no fixed roster: each cycle looks for the voices closest to the story.`

export function registerResources(server) {

  server.registerResource('meta', 'zuhd://meta', {
    description: 'Site metadata: article counts per category, last update time, briefing availability',
    mimeType: 'application/json'
  }, async () => {
    const meta = await getMeta()
    return { contents: [{ uri: 'zuhd://meta', text: JSON.stringify(meta, null, 2) }] }
  })

  server.registerResource('sources', 'zuhd://sources', {
    description: 'Every outlet the site reads directly (via: "direct"), and a selection of those its news API brings (via: "news-api"), with countries, regions, and types. Not a complete list: the API names hundreds of outlets, and an article can cite any of them.',
    mimeType: 'application/json'
  }, async () => {
    return { contents: [{ uri: 'zuhd://sources', text: JSON.stringify(SOURCES, null, 2) }] }
  })

  server.registerResource('about', 'zuhd://about', {
    description: 'Editorial philosophy and principles of zuhd.news',
    mimeType: 'text/plain'
  }, async () => {
    return { contents: [{ uri: 'zuhd://about', text: ABOUT }] }
  })
}
