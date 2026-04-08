import { getMeta } from './cache.js'

const SOURCES = [
  { name: 'Al Jazeera', country: 'QA', region: 'Middle East', type: 'Public broadcaster' },
  { name: 'BBC World', country: 'GB', region: 'Europe', type: 'Public broadcaster' },
  { name: 'BBC Business', country: 'GB', region: 'Europe', type: 'Public broadcaster' },
  { name: 'France 24', country: 'FR', region: 'Europe', type: 'Public broadcaster' },
  { name: 'Deutsche Welle', country: 'DE', region: 'Europe', type: 'Public broadcaster' },
  { name: 'AllAfrica', country: 'ZA', region: 'Africa', type: 'Aggregator' },
  { name: 'Al Monitor', country: 'US', region: 'Middle East', type: 'Independent' },
  { name: 'Hacker News', country: 'US', region: 'North America', type: 'Community' },
  { name: 'The Hindu', country: 'IN', region: 'South Asia', type: 'Newspaper' },
  { name: 'Yonhap', country: 'KR', region: 'East Asia', type: 'News agency' },
  { name: 'CoinDesk', country: 'US', region: 'North America', type: 'Specialist' },
  { name: 'Bellingcat', country: 'NL', region: 'Europe', type: 'Investigative' },
  { name: 'Haaretz', country: 'IL', region: 'Middle East', type: 'Newspaper' },
  { name: 'Nature', country: 'GB', region: 'Europe', type: 'Academic journal' },
  { name: 'Quanta Magazine', country: 'US', region: 'North America', type: 'Science journalism' },
  { name: 'New Scientist', country: 'GB', region: 'Europe', type: 'Science journalism' },
  { name: 'STAT News', country: 'US', region: 'North America', type: 'Health journalism' },
  { name: 'Ars Technica', country: 'US', region: 'North America', type: 'Tech journalism' },
  { name: 'Moscow Times', country: 'RU', region: 'Europe', type: 'Independent' },
  { name: 'Rest of World', country: 'US', region: 'Global', type: 'Tech journalism' },
  { name: 'MIT Technology Review', country: 'US', region: 'North America', type: 'Tech journalism' },
  { name: '404 Media', country: 'US', region: 'North America', type: 'Investigative' },
  { name: 'Carbon Brief', country: 'GB', region: 'Europe', type: 'Climate journalism' },
  { name: 'Malay Mail', country: 'MY', region: 'Southeast Asia', type: 'Newspaper' },
  { name: 'Antara News', country: 'ID', region: 'Southeast Asia', type: 'News agency' },
  { name: 'Premium Times', country: 'NG', region: 'Africa', type: 'Newspaper' },
  { name: 'Dawn', country: 'PK', region: 'South Asia', type: 'Newspaper' },
  { name: 'Daily Star', country: 'BD', region: 'South Asia', type: 'Newspaper' },
  { name: 'South China Morning Post', country: 'HK', region: 'East Asia', type: 'Newspaper' },
  { name: 'Middle East Eye', country: 'GB', region: 'Middle East', type: 'Independent' },
  { name: 'Sveriges Radio', country: 'SE', region: 'Europe', type: 'Public broadcaster' },
  { name: 'Daily Maverick', country: 'ZA', region: 'Africa', type: 'Independent' },
  { name: 'Buenos Aires Times', country: 'AR', region: 'Latin America', type: 'Newspaper' },
  { name: 'MercoPress', country: 'UY', region: 'Latin America', type: 'News agency' },
  { name: 'CBC News', country: 'CA', region: 'North America', type: 'Public broadcaster' },
  { name: 'Fox News', country: 'US', region: 'North America', type: 'Cable news' },
  { name: 'ABC News Australia', country: 'AU', region: 'Oceania', type: 'Public broadcaster' },
  { name: 'RNZ Pacific', country: 'NZ', region: 'Oceania', type: 'Public broadcaster' },
  { name: 'Mada Masr', country: 'EG', region: 'Middle East', type: 'Independent' },
  { name: 'Medyascope', country: 'TR', region: 'Middle East', type: 'Independent' },
  { name: 'TSA', country: 'DZ', region: 'Africa', type: 'Independent' }
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
Updated 5 times daily (04:00, 08:00, 12:00, 17:00, 22:00 UTC).
40+ sources from 25+ countries.`

export function registerResources(server) {

  server.registerResource('meta', 'zuhd://meta', {
    description: 'Site metadata: article counts per category, last update time, briefing availability',
    mimeType: 'application/json'
  }, async () => {
    const meta = await getMeta()
    return { contents: [{ uri: 'zuhd://meta', text: JSON.stringify(meta, null, 2) }] }
  })

  server.registerResource('sources', 'zuhd://sources', {
    description: 'Complete list of all 40+ news sources with countries, regions, and types',
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
