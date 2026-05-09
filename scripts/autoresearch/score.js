// Reader Value Score (RVS) — composite over 5 clusters, 0–100 each, weighted.
//
// Cluster weights (v1):
//   picking 30 / writing 20 / briefing 20 / sourcing 15 / coverage 15
//
// Per-cycle scorer. Caller passes the worktree path + the list of new article
// files produced by this iteration. We score ONLY those articles + the briefs
// produced for them, not the full corpus — production measure-quality.js runs
// over a 7-day window which would be insensitive to per-iteration changes.

import { existsSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { MODELS, REPO_ROOT } from './replay-utils.js'

const SELECTION_JUDGE_PROMPT = readFileSync(
  join(REPO_ROOT, 'scripts/autoresearch/judge-prompts/selection-quality.md'),
  'utf-8',
)
const FABRICATION_JUDGE_PROMPT = readFileSync(
  join(REPO_ROOT, 'scripts/autoresearch/judge-prompts/fabrication-check.md'),
  'utf-8',
)
const TARGET_BALANCE = JSON.parse(readFileSync(
  join(REPO_ROOT, 'scripts/autoresearch/target-balance.json'),
  'utf-8',
))

const CLUSTER_WEIGHTS = { picking: 0.30, writing: 0.20, briefing: 0.20, sourcing: 0.15, coverage: 0.15 }

// ── Public entry point ─────────────────────────────────────────────────────

export async function scoreReplay({ worktree, newArticles, cycle, cycleDir, skipJudges = false }) {
  const articles = loadArticles(worktree, newArticles)
  const briefs = loadBriefsForArticles(worktree, articles.map((a) => a.slug))

  const guardrails = checkGuardrails(articles, briefs)
  const writing = scoreWriting(articles)
  const sourcing = scoreSourcing(articles)
  const coverage = scoreCoverage(articles)
  const briefing = await scoreBriefing(briefs, { skipJudges })
  const picking = await scorePicking(worktree, articles, cycle, { skipJudges })

  // Per-article rollup — actionable form of the metric. For each article
  // we attach the deterministic clusters that scope down (writing, sourcing,
  // coverage, briefing). Picking is a cycle-level judge so it doesn't split
  // per article.
  const perArticle = articles.map((a) => {
    const w = writing.detail?.perArticle?.[a.slug]
    const s = sourcing.detail?.perArticle?.[a.slug]
    const c = coverage.detail?.perArticle?.[a.slug]
    const b = briefs[a.slug]
    return {
      slug: a.slug,
      title: a.title,
      category: a.category,
      sourceCount: a.sourceNames.length,
      hasBrief: !!b,
      blockCount: b ? (b.timeline || []).reduce((n, e) => n + (e.blocks?.length || 0), 0) : 0,
      writing: w ?? null,
      sourcing: s ?? null,
      coverage: c ?? null,
    }
  })

  // Replay drift — how far the replay's publish count is from production's
  // for this cycle's snapshot. Surfaces stale-snapshot dedup distortions.
  const drift = computeReplayDrift(cycle.id, articles.length)

  const clusters = {
    picking: picking.score,
    writing: writing.score,
    briefing: briefing.score,
    sourcing: sourcing.score,
    coverage: coverage.score,
  }

  const rvs =
    clusters.picking * CLUSTER_WEIGHTS.picking +
    clusters.writing * CLUSTER_WEIGHTS.writing +
    clusters.briefing * CLUSTER_WEIGHTS.briefing +
    clusters.sourcing * CLUSTER_WEIGHTS.sourcing +
    clusters.coverage * CLUSTER_WEIGHTS.coverage

  return {
    rvs,
    clusters,
    detail: { picking, writing, briefing, sourcing, coverage },
    guardrailFailures: guardrails,
    articleCount: articles.length,
    briefCount: Object.keys(briefs).length,
    perArticle,
    replayDrift: drift,
  }
}

// ── Loaders ────────────────────────────────────────────────────────────────

function loadArticles(worktree, fileList) {
  const out = []
  for (const f of fileList) {
    if (!f.endsWith('.md')) continue
    const full = join(worktree, f)
    if (!existsSync(full)) continue
    const raw = readFileSync(full, 'utf-8')
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!fm) continue
    const yaml = fm[1]
    const body = fm[2].trim()
    out.push({
      file: f,
      slug: basename(f, '.md'),
      title: yget(yaml, 'title') || '',
      category: yget(yaml, 'category') || '',
      location: yget(yaml, 'location') || '',
      lat: ynum(yaml, 'lat'),
      lng: ynum(yaml, 'lng'),
      sourceNames: [...yaml.matchAll(/^\s+- name:\s*"([^"]+)"/gm)].map((m) => m[1]),
      sourceCountries: [...yaml.matchAll(/^\s+country:\s*"?(null|[A-Z]{2})"?/gm)].map((m) => m[1]),
      sourceUrls: [...yaml.matchAll(/^\s+url:\s*"([^"]+)"/gm)].map((m) => m[1]),
      pubDate: yget(yaml, 'date') || '',
      sourcePubDate: yget(yaml, 'sourcePubDate') || yget(yaml, 'pubDate') || '',
      body,
    })
  }
  return out
}

function yget(yaml, key) {
  const m = yaml.match(new RegExp(`^${key}:\\s*"([^"]+)"`, 'm'))
  return m ? m[1] : null
}

function ynum(yaml, key) {
  const m = yaml.match(new RegExp(`^${key}:\\s*(-?\\d+(?:\\.\\d+)?)`, 'm'))
  return m ? Number(m[1]) : null
}

function loadBriefsForArticles(worktree, slugs) {
  const path = join(worktree, 'content/.context-briefs.json')
  if (!existsSync(path)) return {}
  const all = JSON.parse(readFileSync(path, 'utf-8'))
  const out = {}
  for (const slug of slugs) if (all[slug]) out[slug] = all[slug]
  return out
}

// ── Guardrails (hard binary checks) ────────────────────────────────────────

function checkGuardrails(articles, briefs) {
  const failures = []
  // Validate-articles is run by the orchestrator; we re-derive from articles
  // here with a soft check (frontmatter present + body non-empty).
  for (const a of articles) {
    if (!a.title || !a.category || !a.body || a.body.length < 50) {
      failures.push(`article ${a.slug} missing fields or body too short`)
    }
    if (a.sourceCountries.includes('null')) {
      failures.push(`article ${a.slug} has source with country:null`)
    }
  }
  if (articles.length < 8) failures.push(`publish count ${articles.length} below floor 8`)
  // Category floor (matches scripts/lib/dedup.js CATEGORY_FLOORS at v1)
  const catCounts = tally(articles.map((a) => a.category))
  for (const [cat, floor] of Object.entries({ politics: 3, economy: 3, science: 2, tech: 2 })) {
    if ((catCounts[cat] || 0) < floor) failures.push(`category ${cat} below floor ${floor} (got ${catCounts[cat] || 0})`)
  }
  return failures
}

// ── Writing cluster: voice + smart-brevity adherence ───────────────────────

function scoreWriting(articles) {
  if (articles.length === 0) return { score: 0, detail: { reason: 'no articles' } }
  const visibleLen = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').length
  const hookOf = (b) => b.replace(/^[^—]+—\s*/, '').split(/\.\s+/)[0] || ''

  const perArticle = {}
  for (const a of articles) {
    const len = visibleLen(a.body)
    const wc = a.body.split(/\s+/).filter(Boolean).length
    const hook = hookOf(a.body)
    const flags = {
      charInRange: len <= 350,
      wordInRange: wc >= 35 && wc <= 60,
      passive: /^[A-Z][\w\s',.-]{0,40}\s+(was|were)\s+\w+(ed|en)\b/.test(hook),
      hedge: /\b(could\s+reshape|may\s+signal|is\s+poised\s+to|raising\s+questions|significant(ly)?|amid)\b/i.test(a.body),
      pressEra: /\b(at\s+press\s+time|this\s+(morning|afternoon|evening|week))\b/i.test(a.body),
      titleEcho: (() => {
        const tw = new Set(a.title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2))
        const hw = hook.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2)
        if (tw.size === 0 || hw.length === 0) return false
        return hw.filter((w) => tw.has(w)).length / tw.size >= 0.5
      })(),
    }
    const brevPts = ((flags.charInRange ? 1 : 0) + (flags.wordInRange ? 1 : 0)) / 2 * 50
    const voicePenalty = (flags.passive + flags.hedge + flags.pressEra + flags.titleEcho) / 2
    const voicePts = (1 - clamp01(voicePenalty)) * 50
    perArticle[a.slug] = { score: brevPts + voicePts, charLen: len, wordCount: wc, ...flags }
  }
  const charInRange = articles.filter((a) => perArticle[a.slug].charInRange).length / articles.length
  const wordInRange = articles.filter((a) => perArticle[a.slug].wordInRange).length / articles.length
  const passive = articles.filter((a) => perArticle[a.slug].passive).length / articles.length
  const hedge = articles.filter((a) => perArticle[a.slug].hedge).length / articles.length
  const pressEra = articles.filter((a) => perArticle[a.slug].pressEra).length / articles.length
  const titleEcho = articles.filter((a) => perArticle[a.slug].titleEcho).length / articles.length
  const brevity = ((charInRange + wordInRange) / 2) * 50
  const voice = (1 - clamp01((passive + hedge + pressEra + titleEcho) / 2)) * 50
  const score = brevity + voice
  return { score, detail: { brevity, voice, charInRange, wordInRange, passive, hedge, pressEra, titleEcho, perArticle } }
}

// ── Sourcing cluster: multi-source + diversity ────────────────────────────

function scoreSourcing(articles) {
  if (articles.length === 0) return { score: 0, detail: { reason: 'no articles' } }
  const all = articles.flatMap((a) => a.sourceNames)
  const tally = new Map()
  for (const n of all) tally.set(n, (tally.get(n) || 0) + 1)
  const top3 = [...tally.values()].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0)
  const top3Share = all.length ? top3 / all.length : 0

  // Per-article sourcing score: multi-source weight (60) + diversity weight
  // (40 if no source appears in this article that's also in the cycle's
  // top-3 concentration set; 0 otherwise — concentrated outlets penalize).
  const top3Outlets = new Set([...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n))
  const perArticle = {}
  for (const a of articles) {
    const isMulti = a.sourceNames.length >= 2
    const isFromTop3 = a.sourceNames.some((n) => top3Outlets.has(n))
    const score = (isMulti ? 60 : 0) + (isFromTop3 ? 0 : 40)
    perArticle[a.slug] = { score, sourceCount: a.sourceNames.length, isMulti, isFromTop3, sources: a.sourceNames }
  }
  const multi = articles.filter((a) => perArticle[a.slug].isMulti).length / articles.length
  const score = multi * 60 + (1 - top3Share) * 40
  return { score, detail: { multiSourceRate: multi, top3Share, uniqueOutlets: tally.size, perArticle } }
}

// ── Coverage cluster: freshness + regional KL ─────────────────────────────

function scoreCoverage(articles) {
  if (articles.length === 0) return { score: 0, detail: { reason: 'no articles' } }
  // Per-article freshness + region attribution
  const perArticle = {}
  const ages = []
  for (const a of articles) {
    const src = Date.parse(a.sourcePubDate)
    const pub = Date.parse(a.pubDate)
    const ageDays = !isNaN(src) && !isNaN(pub) ? Math.max(0, (pub - src) / 86400_000) : null
    if (ageDays !== null) ages.push(ageDays)
    const region = locationToRegion(a)
    perArticle[a.slug] = { ageDays, region, freshness: ageDays !== null ? 1 / (1 + ageDays) : null }
  }
  ages.sort((a, b) => a - b)
  const medianAge = ages.length ? ages[Math.floor(ages.length / 2)] : 0
  const freshness = 1 / (1 + medianAge) // 1 if same-day, ~0.5 at 1d, ~0.25 at 3d

  // Regional balance: KL divergence from target
  const observedRegions = regionMix(articles)
  const targetRegions = TARGET_BALANCE.regions
  const klRegion = klDivergence(observedRegions, targetRegions)
  const regionFit = Math.exp(-klRegion) // 1 when perfectly matched, decays

  // Ummah floor: fraction of articles in ummah-weighted regions
  const ummahShare = TARGET_BALANCE.ummahWeightedRegions.reduce(
    (sum, r) => sum + (observedRegions[r] || 0),
    0,
  )
  const ummahMet = ummahShare >= TARGET_BALANCE.ummahFloor ? 1 : ummahShare / TARGET_BALANCE.ummahFloor

  const score = freshness * 40 + regionFit * 30 + ummahMet * 30
  return { score, detail: { medianAgeDays: medianAge, freshness, klRegion, regionFit, ummahShare, ummahMet, observedRegions, perArticle } }
}

// ── Briefing cluster: weighted block density × entropy × (1 − fabrication) ─

async function scoreBriefing(briefs, { skipJudges = false } = {}) {
  const slugs = Object.keys(briefs)
  if (slugs.length === 0) return { score: 0, detail: { reason: 'no briefs' } }

  const SHAPE_SPECIFIC = new Set(['timeline', 'rank', 'sankey', 'treemap'])
  const ALWAYS_CHEAP = new Set(['prose', 'quiz', 'locations', 'compare', 'actors', 'quote'])

  let totalEntries = 0
  let totalBlocks = 0
  let weightedBlocks = 0
  const allTypeCounts = {}
  const shapeBlocks = []

  const perBriefEntropy = []
  for (const slug of slugs) {
    const b = briefs[slug]
    const entries = b.timeline || []
    totalEntries += entries.length
    const types = []
    for (const e of entries) {
      for (const blk of e.blocks || []) {
        totalBlocks++
        types.push(blk.type)
        allTypeCounts[blk.type] = (allTypeCounts[blk.type] || 0) + 1
        if (SHAPE_SPECIFIC.has(blk.type)) {
          weightedBlocks += 2
          shapeBlocks.push({ slug, entry: e.heading, block: blk })
        } else if (ALWAYS_CHEAP.has(blk.type)) {
          weightedBlocks += 1
        }
        // chart/trend: 1.5
        if (['trend', 'chart', 'multi-chart'].includes(blk.type)) weightedBlocks += 1.5
      }
    }
    perBriefEntropy.push(shannon(types))
  }
  const weightedDensity = totalEntries ? weightedBlocks / totalEntries : 0
  const meanEntropy = perBriefEntropy.length
    ? perBriefEntropy.reduce((a, b) => a + b, 0) / perBriefEntropy.length
    : 0

  // Fabrication-flag rate over shape-specific blocks (sample up to 12 to cap cost)
  const sample = skipJudges ? [] : shapeBlocks.slice(0, 12)
  let fabrications = 0
  let judged = 0
  const judgements = []
  for (const item of sample) {
    try {
      const flag = await fabricationJudge(item, briefs[item.slug])
      judged++
      if (flag.fabricated) fabrications++
      judgements.push({
        slug: item.slug,
        entry: item.entry,
        blockType: item.block.type,
        fabricated: flag.fabricated,
        confidence: flag.confidence,
        reason: flag.reason,
      })
    } catch (err) {
      judgements.push({ slug: item.slug, entry: item.entry, blockType: item.block.type, error: err.message })
    }
  }
  const fabricationRate = judged > 0 ? fabrications / judged : 0

  // Compose: density (50pts capped at 1.5/entry) + entropy (30pts capped at log2(5)) − fab penalty (×20pts max)
  const densityNorm = Math.min(1, weightedDensity / 1.5) // 1.5 weighted blocks/entry = full credit
  const entropyNorm = Math.min(1, meanEntropy / Math.log2(5))
  const score = (densityNorm * 50 + entropyNorm * 30 + (1 - fabricationRate) * 20)
  return {
    score,
    detail: {
      briefCount: slugs.length,
      totalEntries,
      totalBlocks,
      weightedDensity,
      meanEntropy,
      fabricationRate,
      fabricationsJudged: judged,
      typeCounts: allTypeCounts,
      judgements,
    },
  }
}

// ── Picking cluster: judge selection vs feed; headline novelty ────────────

async function scorePicking(worktree, articles, cycle, { skipJudges = false } = {}) {
  let judgeScore = 50 // default if judge fails
  let judgeDetail = { error: null }
  if (!skipJudges) {
    try {
      const feedSnap = JSON.parse(readFileSync(join(REPO_ROOT, cycle.feedSnapshot), 'utf-8'))
      const judge = await selectionJudge(feedSnap, articles, worktree)
      judgeScore = clamp(judge.score, 0, 100)
      judgeDetail = { score: judge.score, missed: judge.missed?.length || 0, weakPicks: judge.weakPicks?.length || 0, rationale: judge.rationale }
    } catch (err) {
      judgeDetail = { error: err.message }
    }
  } else {
    judgeDetail = { skipped: true }
  }
  // Headline novelty: cheap intra-set duplication check (replay set is small;
  // skip the cross-corpus embed pass in v1 — too costly for marginal signal).
  let nearDup = 0
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      if (jaccardTitle(articles[i].title, articles[j].title) > 0.6) nearDup++
    }
  }
  const headlineNovelty = articles.length > 1 ? 1 - nearDup / (articles.length * (articles.length - 1) / 2) : 1
  // 80% judge + 20% headline novelty
  const score = judgeScore * 0.8 + headlineNovelty * 100 * 0.2
  return { score, detail: { judge: judgeDetail, headlineNovelty, nearDupPairs: nearDup } }
}

// ── Judge invocations ─────────────────────────────────────────────────────

async function selectionJudge(feedSnap, articles, worktree) {
  const stories = (feedSnap.stories || []).slice(0, 50).map((s) => ({
    title: s.title,
    category: s.category,
    sources: (s.sources || []).map((x) => x.name),
    pubDate: s.pubDate,
  }))
  const selection = articles.map((a) => ({ title: a.title, category: a.category, sources: a.sourceNames }))
  const prompt = `${SELECTION_JUDGE_PROMPT}\n\n## Feed (${stories.length} stories)\n${JSON.stringify(stories, null, 2)}\n\n## Selection (${selection.length} stories)\n${JSON.stringify(selection, null, 2)}\n\nReturn the JSON object only.`
  const out = callJudge(prompt, MODELS.judgeOpus)
  return parseJudgeJson(out)
}

async function fabricationJudge(item, brief) {
  const payload = {
    type: item.block.type,
    label: item.block.label,
    metric: item.block.metric,
    peers: item.block.peers,
    nodes: item.block.nodes,
    links: item.block.links,
    items: item.block.items,
  }
  const prompt = `${FABRICATION_JUDGE_PROMPT}\n\n## Article\nTitle: ${brief.label || item.slug}\nEntry heading: ${item.entry}\n\n## Block (${item.block.type})\n${JSON.stringify(payload, null, 2)}\n\nReturn the JSON object only.`
  const out = callJudge(prompt, MODELS.judgeSonnet)
  return parseJudgeJson(out)
}

function callJudge(prompt, model) {
  const env = { ...process.env }
  delete env.CLAUDECODE
  const res = spawnSync(
    'claude',
    [
      '--no-session-persistence',
      '--effort', 'medium',
      '--model', model,
      '--max-turns', '1',
      '--tools', '',
      '-p', prompt,
    ],
    { encoding: 'utf-8', env, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 },
  )
  if (res.status !== 0) throw new Error(`judge ${model} exit ${res.status}: ${(res.stderr || '').slice(0, 200)}`)
  return res.stdout || ''
}

function parseJudgeJson(out) {
  // Strip code fences if present
  const cleaned = out.replace(/```(?:json)?/g, '').trim()
  // Find first { and last } to be tolerant of leading/trailing prose
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`judge output not JSON: ${cleaned.slice(0, 100)}`)
  return JSON.parse(cleaned.slice(start, end + 1))
}

// ── Helpers ───────────────────────────────────────────────────────────────

// Replay drift — compare the replayed cycle's publish count against the
// production cycle's actual publish count. Stale-snapshot dedup distortions
// (dedup-selection.js running against the current `.last-cycle.json`) often
// drop articles that "would have" been published in the original cycle, so
// any replay metric of an old snapshot needs this caveat surfaced.
function computeReplayDrift(cycleId, replayCount) {
  // cycleId: "2026-04-22T22-02"  →  log file: "logs/cycle-2026-04-22_2202.log"
  const m = cycleId.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})$/)
  if (!m) return { available: false, reason: 'cycle id not parseable' }
  const logName = `logs/cycle-${m[1]}_${m[2]}${m[3]}.log`
  const logPath = join(REPO_ROOT, logName)
  let actualCount = null
  try {
    const log = readFileSync(logPath, 'utf-8')
    const pub = log.match(/^Published:\s+(\d+)/m)
    if (pub) actualCount = parseInt(pub[1], 10)
  } catch {
    return { available: false, reason: 'log not found', logPath: logName }
  }
  if (actualCount === null) return { available: false, reason: 'no Published line in log', logPath: logName }
  const ratio = actualCount > 0 ? replayCount / actualCount : null
  return {
    available: true,
    replayPublishCount: replayCount,
    actualPublishCount: actualCount,
    ratio,
    interpretable: ratio !== null && ratio >= 0.7,
  }
}

function tally(arr) {
  const o = {}
  for (const x of arr) o[x] = (o[x] || 0) + 1
  return o
}

function shannon(types) {
  if (types.length === 0) return 0
  const counts = tally(types)
  const n = types.length
  let h = 0
  for (const c of Object.values(counts)) {
    const p = c / n
    h -= p * Math.log2(p)
  }
  return h
}

function regionMix(articles) {
  const obs = {}
  for (const a of articles) {
    const r = locationToRegion(a)
    obs[r] = (obs[r] || 0) + 1
  }
  const n = articles.length
  for (const k of Object.keys(obs)) obs[k] /= n
  return obs
}

const REGION_MAP = {
  ME: ['SA', 'AE', 'EG', 'IL', 'IR', 'IQ', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA', 'SY', 'TR', 'YE', 'BH'],
  AS: ['IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'AF', 'CN', 'JP', 'KR', 'KP', 'MN', 'TW', 'HK', 'ID', 'MY', 'PH', 'SG', 'TH', 'VN', 'KH', 'LA', 'MM', 'TJ', 'UZ', 'KG', 'TM', 'KZ'],
  AF: ['DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CM', 'CV', 'CF', 'TD', 'KM', 'CG', 'CD', 'DJ', 'GQ', 'ER', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'CI', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RW', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'SZ', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW'],
  EU: ['AL', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'MD', 'NL', 'NO', 'PL', 'PT', 'RO', 'RU', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'BY', 'BA', 'MK', 'ME', 'XK'],
  AM: ['AR', 'BO', 'BR', 'CA', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'SV', 'GT', 'GY', 'HT', 'HN', 'JM', 'MX', 'NI', 'PA', 'PY', 'PE', 'SR', 'TT', 'US', 'UY', 'VE', 'BS'],
  OC: ['AU', 'NZ', 'FJ', 'PG', 'SB', 'VU', 'WS', 'TO'],
}
// Bbox match used by production compute-metrics.js — story-location signal.
function coordsToRegion(lat, lng) {
  if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) return null
  if (lat > 15 && lat < 45 && lng > 25 && lng < 75) return 'ME'
  if (lat > -10 && lat < 55 && lng > 60 && lng < 150) return 'AS'
  if (lat > -40 && lat < 40 && lng > -20 && lng < 55) return 'AF'
  if (lat > 35 && lat < 72 && lng > -25 && lng < 60) return 'EU'
  if (lat > -60 && lat < 75 && lng > -170 && lng < -30) return 'AM'
  if (lat > -50 && lat < -10 && lng > 110 && lng < 180) return 'OC'
  return 'GL'
}

// Region attribution prefers the article's lat/lng (what the story is
// about) over the source's country (where the outlet is HQ'd). Falls back
// to source-CC when coordinates are missing — covers older articles only;
// the writer pipeline has emitted lat/lng since long before this scorer
// landed.
function locationToRegion(article) {
  const r = coordsToRegion(article.lat, article.lng)
  if (r) return r
  const cc = (article.sourceCountries || []).find((c) => c && c !== 'null')
  if (cc) {
    for (const [region, codes] of Object.entries(REGION_MAP)) {
      if (codes.includes(cc)) return region
    }
  }
  return 'GL'
}

function klDivergence(observed, target) {
  let kl = 0
  const eps = 1e-9
  for (const k of Object.keys(target)) {
    const p = (observed[k] || 0) + eps
    const q = target[k] + eps
    kl += p * Math.log(p / q)
  }
  return kl
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)) }
function clamp01(x) { return clamp(x, 0, 1) }

function jaccardTitle(a, b) {
  const ta = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3))
  const tb = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3))
  const inter = [...ta].filter((x) => tb.has(x)).length
  const uni = new Set([...ta, ...tb]).size
  return uni ? inter / uni : 0
}
