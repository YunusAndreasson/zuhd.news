#!/usr/bin/env node
// One-shot audience-fit tests against zuhd.news article corpus.
// Tests 1 (OIC regional share), 2 (domain concentration), 4 (title echo).

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'

const ARTICLES = '/root/zuhd.news/content/articles'

// OIC member country ISO2 codes (57 members).
const OIC = new Set('AF AL DZ AZ BH BD BJ BN BF CM TD KM CI DJ EG GA GM GH GN GW GY ID IR IQ JO KZ KW KG LB LY MY MV ML MR MA MZ NE NG OM PK PS QA SA SN SL SO SD SR SY TJ TG TN TR TM UG UZ AE YE'.split(' '))

// Source-name → classification.
//   region: ISO2 of host country if regional / OIC-anchored
//   tier:   "regional-oic" | "western-global" | "regional-non-oic" | "other"
const SOURCE_MAP = {
  // OIC-region outlets
  'Dawn': { region: 'PK', tier: 'regional-oic' },
  'Geo': { region: 'PK', tier: 'regional-oic' },
  'Express Tribune': { region: 'PK', tier: 'regional-oic' },
  'Anadolu Ajansı': { region: 'TR', tier: 'regional-oic' },
  'Anadolu Agency': { region: 'TR', tier: 'regional-oic' },
  'TRT World': { region: 'TR', tier: 'regional-oic' },
  'Daily Sabah': { region: 'TR', tier: 'regional-oic' },
  'Hurriyet Daily News': { region: 'TR', tier: 'regional-oic' },
  'Al Jazeera': { region: 'QA', tier: 'regional-oic' },
  'Al Jazeera Online': { region: 'QA', tier: 'regional-oic' },
  'Al Jazeera Arabic': { region: 'QA', tier: 'regional-oic' },
  'The National UAE': { region: 'AE', tier: 'regional-oic' },
  'The National': { region: 'AE', tier: 'regional-oic' },
  'Khaleej Times': { region: 'AE', tier: 'regional-oic' },
  'Gulf News': { region: 'AE', tier: 'regional-oic' },
  'Arab News': { region: 'SA', tier: 'regional-oic' },
  'Saudi Gazette': { region: 'SA', tier: 'regional-oic' },
  'Mada Masr': { region: 'EG', tier: 'regional-oic' },
  'Egypt Independent': { region: 'EG', tier: 'regional-oic' },
  'Al-Ahram': { region: 'EG', tier: 'regional-oic' },
  'Premium Times Nigeria': { region: 'NG', tier: 'regional-oic' },
  'Premium Times': { region: 'NG', tier: 'regional-oic' },
  'Tehran Times': { region: 'IR', tier: 'regional-oic' },
  'Press TV': { region: 'IR', tier: 'regional-oic' },
  'IRNA': { region: 'IR', tier: 'regional-oic' },
  'Mehr News': { region: 'IR', tier: 'regional-oic' },
  'The Jakarta Post': { region: 'ID', tier: 'regional-oic' },
  'Tempo': { region: 'ID', tier: 'regional-oic' },
  'New Straits Times': { region: 'MY', tier: 'regional-oic' },
  'Malay Mail': { region: 'MY', tier: 'regional-oic' },
  'Daily Star Lebanon': { region: 'LB', tier: 'regional-oic' },
  'L\'Orient Le Jour': { region: 'LB', tier: 'regional-oic' },
  'Asharq Al-Awsat': { region: 'SA', tier: 'regional-oic' },
  'The New Arab': { region: 'QA', tier: 'regional-oic' },
  'Middle East Monitor': { region: 'UK', tier: 'regional-oic' }, // UK-based but MENA-focused
  'Middle East Eye': { region: 'UK', tier: 'regional-oic' },
  'Morocco World News': { region: 'MA', tier: 'regional-oic' },
  'Hespress English': { region: 'MA', tier: 'regional-oic' },
  'Daily News Egypt': { region: 'EG', tier: 'regional-oic' },
  'Times of Oman': { region: 'OM', tier: 'regional-oic' },
  'Gulf Times': { region: 'QA', tier: 'regional-oic' },
  'The Express Tribune': { region: 'PK', tier: 'regional-oic' },

  // Western global wires / mainstream
  'Reuters': { region: 'GLOBAL', tier: 'western-global' },
  'Associated Press': { region: 'US', tier: 'western-global' },
  'AP': { region: 'US', tier: 'western-global' },
  'Agence France-Presse': { region: 'FR', tier: 'western-global' },
  'AFP': { region: 'FR', tier: 'western-global' },
  'BBC': { region: 'UK', tier: 'western-global' },
  'BBC News': { region: 'UK', tier: 'western-global' },
  'The New York Times': { region: 'US', tier: 'western-global' },
  'Bloomberg Business': { region: 'US', tier: 'western-global' },
  'Bloomberg': { region: 'US', tier: 'western-global' },
  'Financial Times News': { region: 'UK', tier: 'western-global' },
  'Financial Times': { region: 'UK', tier: 'western-global' },
  'The Guardian': { region: 'UK', tier: 'western-global' },
  'The Wall Street Journal': { region: 'US', tier: 'western-global' },
  'Wall Street Journal': { region: 'US', tier: 'western-global' },
  'The Washington Post': { region: 'US', tier: 'western-global' },
  'Deutsche Welle': { region: 'DE', tier: 'western-global' },
  'CNN': { region: 'US', tier: 'western-global' },
  'NBC News': { region: 'US', tier: 'western-global' },
  'Politico': { region: 'US', tier: 'western-global' },
  'The Independent': { region: 'UK', tier: 'western-global' },
  'The Times': { region: 'UK', tier: 'western-global' },
  'The Telegraph': { region: 'UK', tier: 'western-global' },
  'Daily Mail Online': { region: 'UK', tier: 'western-global' },
  'Daily Mail': { region: 'UK', tier: 'western-global' },
  'Yahoo News': { region: 'US', tier: 'western-global' },
  'Aol': { region: 'US', tier: 'western-global' },
  'NPR': { region: 'US', tier: 'western-global' },
  'France 24': { region: 'FR', tier: 'western-global' },

  // Tech / specialty (Western)
  'Hacker News': { region: 'US', tier: 'western-global' },
  '404 Media': { region: 'US', tier: 'western-global' },
  'Ars Technica': { region: 'US', tier: 'western-global' },
  'TechCrunch': { region: 'US', tier: 'western-global' },
  'Wired': { region: 'US', tier: 'western-global' },
  'MIT Technology Review': { region: 'US', tier: 'western-global' },
  'The Verge': { region: 'US', tier: 'western-global' },
  'CoinDesk': { region: 'US', tier: 'western-global' },
  'The Record': { region: 'US', tier: 'western-global' },
  'Krebs on Security': { region: 'US', tier: 'western-global' },
  'Bleeping Computer': { region: 'US', tier: 'western-global' },
  'Tom\'s Hardware': { region: 'US', tier: 'western-global' },

  // Science (Western)
  'Nature': { region: 'UK', tier: 'western-global' },
  'New Scientist': { region: 'UK', tier: 'western-global' },
  'Science': { region: 'US', tier: 'western-global' },
  'Phys.org': { region: 'US', tier: 'western-global' },
  'STAT': { region: 'US', tier: 'western-global' },
  'SciDev.Net': { region: 'UK', tier: 'western-global' },
  'Carbon Brief': { region: 'UK', tier: 'western-global' },
  'EurekAlert!': { region: 'US', tier: 'western-global' },
  'Science Daily': { region: 'US', tier: 'western-global' },
  'Quanta Magazine': { region: 'US', tier: 'western-global' },

  // Regional non-OIC
  'Hindustan Times': { region: 'IN', tier: 'regional-non-oic' },
  'NDTV': { region: 'IN', tier: 'regional-non-oic' },
  'The Times of India': { region: 'IN', tier: 'regional-non-oic' },
  'Times of India': { region: 'IN', tier: 'regional-non-oic' },
  'India Today': { region: 'IN', tier: 'regional-non-oic' },
  'News18': { region: 'IN', tier: 'regional-non-oic' },
  'MoneyControl': { region: 'IN', tier: 'regional-non-oic' },
  'Economic Times': { region: 'IN', tier: 'regional-non-oic' },
  'The Hindu': { region: 'IN', tier: 'regional-non-oic' },
  'South China Morning Post': { region: 'HK', tier: 'regional-non-oic' },
  'Caixin Global': { region: 'CN', tier: 'regional-non-oic' },
  'The Diplomat': { region: 'US', tier: 'western-global' }, // US-based Asia coverage
  'Daily Maverick': { region: 'ZA', tier: 'regional-non-oic' },
  'TASS': { region: 'RU', tier: 'regional-non-oic' },
  'RT': { region: 'RU', tier: 'regional-non-oic' },
  'Українська правда': { region: 'UA', tier: 'regional-non-oic' },
  'Kyiv Independent': { region: 'UA', tier: 'regional-non-oic' },
  'The Times of Israel': { region: 'IL', tier: 'regional-non-oic' },
  'Times of Israel': { region: 'IL', tier: 'regional-non-oic' },
  'Haaretz': { region: 'IL', tier: 'regional-non-oic' },
  'Jerusalem Post': { region: 'IL', tier: 'regional-non-oic' },
  '+972 Magazine': { region: 'IL', tier: 'regional-non-oic' }, // Israeli, even if anti-occupation

  // Other / advocacy / hard to classify
  'Drop Site News': { region: 'US', tier: 'western-global' },
  'Bellingcat': { region: 'UK', tier: 'western-global' },
  'Global Voices': { region: 'GLOBAL', tier: 'other' },
  'Responsible Statecraft': { region: 'US', tier: 'western-global' },
  'Foreign Policy': { region: 'US', tier: 'western-global' },
  'Foreign Affairs': { region: 'US', tier: 'western-global' },
  'The Intercept': { region: 'US', tier: 'western-global' },
  'Mother Jones': { region: 'US', tier: 'western-global' },
  'The Conversation': { region: 'AU', tier: 'western-global' },

  // === Extensions (added after first run to cut 24% unmapped → <5%) ===
  // Regional-OIC additions
  'Radio Dabanga': { region: 'SD', tier: 'regional-oic' },
  'SMEX': { region: 'LB', tier: 'regional-oic' },
  'Salaam Gateway': { region: 'SG', tier: 'regional-oic' },
  'Mehr News Agency': { region: 'IR', tier: 'regional-oic' },
  'Punch Newspapers': { region: 'NG', tier: 'regional-oic' },
  'Vanguard': { region: 'NG', tier: 'regional-oic' },
  'Wamda': { region: 'AE', tier: 'regional-oic' },
  'Free Malaysia Today': { region: 'MY', tier: 'regional-oic' },
  'Haberler.com': { region: 'TR', tier: 'regional-oic' },
  'Daily Trust': { region: 'NG', tier: 'regional-oic' },
  'Bdnews24': { region: 'BD', tier: 'regional-oic' },
  "L'Orient Today": { region: 'LB', tier: 'regional-oic' },
  'Almayadeen': { region: 'LB', tier: 'regional-oic' },
  'The Pakistan Today': { region: 'PK', tier: 'regional-oic' },
  'Pakistan Today': { region: 'PK', tier: 'regional-oic' },

  // Western-global additions
  'New Lines Magazine': { region: 'US', tier: 'western-global' },
  'Rest of World': { region: 'US', tier: 'western-global' },
  'Dialogue Earth': { region: 'UK', tier: 'western-global' },
  'Fox News': { region: 'US', tier: 'western-global' },
  'Newsweek': { region: 'US', tier: 'western-global' },
  'Yahoo! Finance': { region: 'US', tier: 'western-global' },
  'Yahoo': { region: 'US', tier: 'western-global' },
  'The War Zone': { region: 'US', tier: 'western-global' },
  'U.S. News & World Report': { region: 'US', tier: 'western-global' },
  'CNBC': { region: 'US', tier: 'western-global' },
  'CBS News': { region: 'US', tier: 'western-global' },
  'New York Post': { region: 'US', tier: 'western-global' },
  'The Hill': { region: 'US', tier: 'western-global' },
  'THE DECODER': { region: 'DE', tier: 'western-global' },
  'Declassified UK': { region: 'UK', tier: 'western-global' },
  'Inkstick': { region: 'US', tier: 'western-global' },
  'Mirror': { region: 'UK', tier: 'western-global' },
  'TheRegister.com': { region: 'UK', tier: 'western-global' },
  'Le Monde.fr': { region: 'FR', tier: 'western-global' },
  'HuffPost': { region: 'US', tier: 'western-global' },
  'Investing.com': { region: 'IL', tier: 'western-global' },
  'Lowy Interpreter': { region: 'AU', tier: 'western-global' },
  'CODA Story': { region: 'US', tier: 'western-global' },
  'Undark': { region: 'US', tier: 'western-global' },
  'Al-Monitor': { region: 'US', tier: 'western-global' },
  'InSight Crime': { region: 'US', tier: 'western-global' },
  'RTE.ie': { region: 'IE', tier: 'western-global' },
  'Nature Communications': { region: 'UK', tier: 'western-global' },
  'European Spaceflight': { region: 'EU', tier: 'western-global' },
  'STAT News': { region: 'US', tier: 'western-global' },
  'Euronews English': { region: 'FR', tier: 'western-global' },

  // Regional non-OIC additions
  'The Indian Express': { region: 'IN', tier: 'regional-non-oic' },
  'The Straits Times': { region: 'SG', tier: 'regional-non-oic' },
  'Nikkei Asia': { region: 'JP', tier: 'regional-non-oic' },
  'Chosun.com': { region: 'KR', tier: 'regional-non-oic' },
  'Yonhap News Agency': { region: 'KR', tier: 'regional-non-oic' },
  'ABP Live': { region: 'IN', tier: 'regional-non-oic' },
  'Rediff.com': { region: 'IN', tier: 'regional-non-oic' },
  'Rediff.com India Ltd.': { region: 'IN', tier: 'regional-non-oic' },
  'ThePrint': { region: 'IN', tier: 'regional-non-oic' },
  'TimesNow': { region: 'IN', tier: 'regional-non-oic' },
  'India.com': { region: 'IN', tier: 'regional-non-oic' },
  'Mint': { region: 'IN', tier: 'regional-non-oic' },
  'mint': { region: 'IN', tier: 'regional-non-oic' },
  'haaretz.com': { region: 'IL', tier: 'regional-non-oic' },
  'KyivPost': { region: 'UA', tier: 'regional-non-oic' },
  'Ukrainska Pravda': { region: 'UA', tier: 'regional-non-oic' },
  'Meduza': { region: 'RU', tier: 'regional-non-oic' },
  'The Financial Express': { region: 'IN', tier: 'regional-non-oic' },
  'ANSA.it': { region: 'IT', tier: 'regional-non-oic' },
  '毎日新聞': { region: 'JP', tier: 'regional-non-oic' },
  'GMA Network': { region: 'PH', tier: 'regional-non-oic' },
  'Rappler': { region: 'PH', tier: 'regional-non-oic' },

  // Global / other
  'OCCRP': { region: 'GLOBAL', tier: 'other' },
}

function classify(name) {
  if (SOURCE_MAP[name]) return SOURCE_MAP[name]
  return { region: 'UNKNOWN', tier: 'unknown' }
}

// --- Load corpus ---
const files = readdirSync(ARTICLES).filter(f => f.endsWith('.md')).sort()
const articles = []
for (const f of files) {
  const raw = readFileSync(join(ARTICLES, f), 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) continue
  let meta
  try { meta = yaml.load(m[1].replace(/",\s*$/gm, '"')) ?? {} } catch { continue }
  const body = m[2].trim()
  const sources = Array.isArray(meta.sources) ? meta.sources : []
  const countries = [...new Set([...body.matchAll(/\(country:([A-Z]{2})\)/g)].map(x => x[1]))]
  articles.push({
    file: f,
    title: meta.title || '',
    category: meta.category || 'unknown',
    date: meta.date || '',
    sources: sources.map(s => s.name).filter(Boolean),
    countries,
    body,
  })
}

console.log(`Corpus: ${articles.length} articles\n`)

// === TEST 1: OIC regional source share ===
console.log('=== TEST 1: OIC regional-source share ===')
const oicArticles = articles.filter(a => a.countries.some(c => OIC.has(c)))
console.log(`OIC-tagged articles: ${oicArticles.length} / ${articles.length} (${(100*oicArticles.length/articles.length).toFixed(1)}%)`)

const shares = []
let zeroRegional = 0
let atLeastOneRegional = 0
const oicNoSources = []
for (const a of oicArticles) {
  if (a.sources.length === 0) { oicNoSources.push(a.file); continue }
  const tiers = a.sources.map(classify)
  const regional = tiers.filter(t => t.tier === 'regional-oic').length
  const share = regional / a.sources.length
  shares.push(share)
  if (regional === 0) zeroRegional++
  else atLeastOneRegional++
}
shares.sort((a,b)=>a-b)
const median = shares.length ? shares[Math.floor(shares.length/2)] : 0
const mean = shares.length ? shares.reduce((s,x)=>s+x,0)/shares.length : 0

console.log(`  Median regional-OIC share on OIC stories: ${(100*median).toFixed(1)}%`)
console.log(`  Mean regional-OIC share on OIC stories:   ${(100*mean).toFixed(1)}%`)
console.log(`  OIC stories with 0 regional sources:      ${zeroRegional} / ${shares.length} (${(100*zeroRegional/shares.length).toFixed(1)}%)`)
console.log(`  OIC stories with ≥1 regional source:      ${atLeastOneRegional} / ${shares.length} (${(100*atLeastOneRegional/shares.length).toFixed(1)}%)`)
console.log(`  OIC stories with 0 sources at all:        ${oicNoSources.length}`)

// === TEST 2: Source domain concentration ===
console.log('\n=== TEST 2: Source-domain concentration ===')
const totals = {}
let totalCitations = 0
for (const a of articles) {
  for (const s of a.sources) {
    totals[s] = (totals[s] || 0) + 1
    totalCitations++
  }
}
const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1])
const top3 = sorted.slice(0,3)
const top10 = sorted.slice(0,10)
const top3Share = top3.reduce((s,[,n])=>s+n,0) / totalCitations
const top10Share = top10.reduce((s,[,n])=>s+n,0) / totalCitations
const distinctDomains = sorted.length
// Herfindahl-Hirschman Index on shares
const hhi = sorted.reduce((s,[,n])=>{const p=n/totalCitations; return s+p*p},0)

console.log(`  Total citations: ${totalCitations}`)
console.log(`  Distinct sources: ${distinctDomains}`)
console.log(`  Top-3 share: ${(100*top3Share).toFixed(1)}%   [${top3.map(([n,c])=>`${n}=${c}`).join(', ')}]`)
console.log(`  Top-10 share: ${(100*top10Share).toFixed(1)}%`)
console.log(`  HHI (×10000): ${(hhi*10000).toFixed(0)}   (1500-2500 = moderate concentration; >2500 = high)`)

// Tier breakdown of all citations
const tierTotals = { 'regional-oic': 0, 'western-global': 0, 'regional-non-oic': 0, 'other': 0, 'unknown': 0 }
for (const [name, count] of sorted) {
  tierTotals[classify(name).tier] += count
}
console.log(`  Tier mix:`)
for (const [t, n] of Object.entries(tierTotals)) {
  console.log(`    ${t.padEnd(20)} ${n} (${(100*n/totalCitations).toFixed(1)}%)`)
}

// === TEST 4: Title echo on S1 ===
console.log('\n=== TEST 4: Title-echo (S1 vs Title content-word overlap) ===')
const STOP = new Set('a an the of for to in on at by with from is are was were be been being has have had do does did will would shall should may might can could that this these those it its as and or but if then than which who whom whose what when where why how he she they we you i me my his her their our your not no yes very more most less least over under into onto out up down off about against between through during before after above below'.split(' '))

function tokens(s) {
  return s.toLowerCase()
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // strip md links, keep text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP.has(w))
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b)
  const inter = [...A].filter(x => B.has(x)).length
  const union = new Set([...A, ...B]).size
  return union ? inter / union : 0
}

let highEcho = 0     // jaccard >= 0.5
let modEcho = 0      // jaccard 0.3-0.5
let lowEcho = 0      // jaccard < 0.3
const echoExamples = []
for (const a of articles) {
  if (!a.title || !a.body) continue
  // S1 = first sentence after frontmatter, dropping the leading "City — " prefix
  const firstPara = a.body.split(/\n\n/)[0]
  const s1 = firstPara.split(/(?<=[.!?])\s+/)[0]
  const s1Clean = s1.replace(/^[A-Z][\w\s,.-]+ — /, '') // strip "Tehran — " prefix
  const j = jaccard(tokens(a.title), tokens(s1Clean))
  if (j >= 0.5) { highEcho++; if (echoExamples.length < 5) echoExamples.push({ file: a.file, j: j.toFixed(2), title: a.title, s1: s1Clean.slice(0, 100) }) }
  else if (j >= 0.3) modEcho++
  else lowEcho++
}
const total = highEcho + modEcho + lowEcho
console.log(`  Articles scored: ${total}`)
console.log(`  High echo (jaccard ≥0.50): ${highEcho} (${(100*highEcho/total).toFixed(1)}%)`)
console.log(`  Moderate    (0.30–0.50):  ${modEcho} (${(100*modEcho/total).toFixed(1)}%)`)
console.log(`  Low / clean (<0.30):       ${lowEcho} (${(100*lowEcho/total).toFixed(1)}%)`)
console.log(`  Examples of high echo:`)
for (const e of echoExamples) {
  console.log(`    [${e.j}] ${e.title}`)
  console.log(`           S1: ${e.s1}…`)
}

// === Project possible improvement under specific interventions ===
// Intervention A: enforce ≥1 regional-OIC source on every OIC-tagged article.
// For each currently-zero OIC story, add one regional-OIC citation; recompute
// medians, tier shares, and "≥1 regional" share.
const projectedShares = []
let projectedTotalCitations = totalCitations
let projectedRegionalOicCitations = tierTotals['regional-oic']
let projectedAtLeastOne = 0
for (const a of oicArticles) {
  if (a.sources.length === 0) continue
  const tiers = a.sources.map(classify)
  const regional = tiers.filter(t => t.tier === 'regional-oic').length
  let denom = a.sources.length, num = regional
  if (regional === 0) {
    num = 1
    denom = a.sources.length + 1
    projectedTotalCitations++
    projectedRegionalOicCitations++
  }
  projectedShares.push(num / denom)
  if (num >= 1) projectedAtLeastOne++
}
projectedShares.sort((a,b)=>a-b)
const projMedian = projectedShares.length ? projectedShares[Math.floor(projectedShares.length/2)] : 0
const projOicAtLeastOne = projectedAtLeastOne / projectedShares.length
const projRegionalOicTierShare = projectedRegionalOicCitations / projectedTotalCitations
const projWesternTierShare = tierTotals['western-global'] / projectedTotalCitations

// === Final dense table ===
console.log('\n=== Comparison: base vs possible improvement ===')
console.log('  Intervention A: enforce ≥1 regional-OIC source on every OIC-tagged article')
console.log('  Intervention B: writer prompt title-echo self-check (already registered, evaluates 2026-05-08)\n')
const rows = [
  ['Test', 'Current', 'After fix', 'Δ', 'Threshold gap', 'Threshold healthy', 'Verdict'],
  [
    'OIC regional-source share (median)',
    `${(100*median).toFixed(1)}%`,
    `${(100*projMedian).toFixed(1)}%`,
    `+${(100*(projMedian-median)).toFixed(1)}pp`,
    '<15%',
    '≥30%',
    projMedian >= 0.30 ? '→ HEALTHY' : projMedian >= 0.20 ? '→ improved' : 'still borderline',
  ],
  [
    'OIC stories with ≥1 regional source',
    `${(100*atLeastOneRegional/shares.length).toFixed(1)}%`,
    `${(100*projOicAtLeastOne).toFixed(1)}%`,
    `+${(100*(projOicAtLeastOne-atLeastOneRegional/shares.length)).toFixed(1)}pp`,
    '<40%',
    '≥70%',
    projOicAtLeastOne >= 0.99 ? '→ FIXED' : '→ improved',
  ],
  [
    'Regional-OIC tier share (corpus-wide)',
    `${(100*tierTotals['regional-oic']/totalCitations).toFixed(1)}%`,
    `${(100*projRegionalOicTierShare).toFixed(1)}%`,
    `+${(100*(projRegionalOicTierShare-tierTotals['regional-oic']/totalCitations)).toFixed(1)}pp`,
    '<10%',
    '≥20%',
    'incremental',
  ],
  [
    'Western-global tier share',
    `${(100*tierTotals['western-global']/totalCitations).toFixed(1)}%`,
    `${(100*projWesternTierShare).toFixed(1)}%`,
    `${(100*(projWesternTierShare-tierTotals['western-global']/totalCitations)).toFixed(1)}pp`,
    '>70%',
    '<55%',
    'already healthy',
  ],
  [
    'Top-3 domain share',
    `${(100*top3Share).toFixed(1)}%`,
    'n/a',
    '—',
    '>50%',
    '<30%',
    'no fix needed',
  ],
  [
    'HHI (×10000)',
    `${(hhi*10000).toFixed(0)}`,
    'n/a',
    '—',
    '>2500',
    '<1500',
    'no fix needed',
  ],
  [
    'Title-echo (jaccard ≥0.5) rate',
    `${(100*highEcho/total).toFixed(1)}%`,
    'pending',
    '—',
    '>25%',
    '<10%',
    'experiment running, evaluates 2026-05-08',
  ],
]
const widths = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)))
for (const r of rows) {
  console.log('  ' + r.map((c, i) => c.padEnd(widths[i])).join('  '))
}

// Coverage / unknown audit so caller sees how solid the source-tier mapping is
console.log('\n=== Source-mapping coverage audit ===')
const unknownSources = sorted.filter(([n]) => classify(n).tier === 'unknown')
const unknownCitations = unknownSources.reduce((s,[,n])=>s+n,0)
console.log(`  Unmapped sources: ${unknownSources.length} (${unknownCitations} citations, ${(100*unknownCitations/totalCitations).toFixed(1)}% of corpus)`)
console.log(`  Top 15 unmapped:`)
for (const [n, c] of unknownSources.slice(0, 15)) {
  console.log(`    ${c.toString().padStart(4)}  ${n}`)
}
