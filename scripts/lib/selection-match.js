// Matches selector output back onto feed stories, so the writer gets real source
// bodies for the stories the selector picked.
//
// Five layers, tried in order. The first four are exact and cheap; the fifth is
// a heuristic and is where the danger lives.
//   1. link          — the feed entry's primary link
//   2. slug          — suggestedSlug
//   3. sourceUrl     — the selector sometimes cites a source URL, not the link
//   4. fingerprint   — normalised title
//   5. keyword       — distinctive-word overlap, for paraphrased titles
//
// On 2026-08-30 layer 5 was a bare `overlap >= 3` over title+description+concepts
// and it silently poisoned a cycle: the Sudan drone-war, Ethiopia Fano-TPLF and
// India data-centre selections ALL matched the same "Kenya, Ethiopia dominate
// 2026 Enugu International Marathon" report, and a child heat-stress study
// matched a Robinhood brokerage piece. The writer read the bodies, saw they
// described unrelated events, and wrote 2 of 11 rather than fabricate. Three
// shared words is noise: a 300-char description gives any entry that many
// chances at it.
//
// Erring strict is deliberate. A miss is honest — the writer skips the slot. A
// false match burns writer turns and invites a fabricated article.

// Generic newswire vocabulary carries no evidence: "military", "leader" and
// "regional" co-occurring is exactly what a Sudan dispatch and a Nigerian
// marathon report have in common.
const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'been', 'will', 'said', 'says', 'after',
  'over', 'into', 'more', 'than', 'their', 'they', 'which', 'when', 'what', 'about',
  'would', 'could', 'also', 'other', 'some', 'such', 'only', 'were', 'there', 'these',
  'those', 'then', 'them', 'your', 'just', 'like', 'make', 'made', 'many', 'most',
  'much', 'need', 'news', 'report', 'reports', 'year', 'years', 'time', 'first',
  'last', 'amid', 'against', 'while', 'still', 'between', 'during', 'under', 'where',
])

// A word is evidence only if few stories use it — at most this share of the feed.
const RARE_SHARE = 0.15
// The match must explain this much of the ENTRY, not a slice of a long feed blob.
// This is the guard the marathon failed: 3 shared words out of 14.
const MIN_RATIO = 0.4
// At least this many rare words must be shared.
const MIN_RARE = 2
// The winner must beat the best RIVAL by this factor, or it is too ambiguous.
const MARGIN = 1.5
// Two candidates matching this much of the same rare vocabulary are the same
// event carried twice, not two stories competing for one selection.
const SAME_EVENT_OVERLAP = 0.6

/** Are these two candidates the same event, rather than rivals? */
function sameEvent(a, b) {
  const as = new Set(a.rare)
  const bs = new Set(b.rare)
  if (as.size === 0 || bs.size === 0) return false
  const shared = [...as].filter(w => bs.has(w)).length
  return shared / Math.min(as.size, bs.size) >= SAME_EVENT_OVERLAP
}

function fingerprint(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50)
}

function words(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w))
}

function storyText(s) {
  return [s.title, s.description, ...(s.concepts || []).map(c => (typeof c === 'string' ? c : c.label))]
    .filter(Boolean)
    .join(' ')
}

/**
 * Build a matcher over the feed. The returned matcher is stateful: it remembers
 * which stories the keyword layer has already claimed, so one feed story can
 * never be the source for two different selections.
 */
export function createMatcher(allStories) {
  const byLink = new Map()
  const bySlug = new Map()
  const bySourceUrl = new Map()
  const byFingerprint = new Map()

  // Every key is guarded against falsy values. An unguarded '' key is not a
  // miss, it is a *universal hit*: one link-less story would become the match
  // for every link-less entry, at a layer that logs no warning at all.
  for (const s of allStories) {
    if (s.link) byLink.set(s.link, s)
    if (s.suggestedSlug) bySlug.set(s.suggestedSlug, s)
    if (fingerprint(s.title)) byFingerprint.set(fingerprint(s.title), s)
    for (const src of s.sources || []) {
      if (src.url) bySourceUrl.set(src.url, s)
    }
  }

  // Precomputed once, not per entry: the word set per story, and how many
  // stories each word appears in.
  const storyWords = new Map(allStories.map(s => [s, new Set(words(storyText(s)))]))
  const docFreq = new Map()
  for (const set of storyWords.values()) {
    for (const w of set) docFreq.set(w, (docFreq.get(w) || 0) + 1)
  }
  const rareMax = Math.max(2, Math.ceil(allStories.length * RARE_SHARE))
  const claimed = new Set()

  return function match(entry) {
    if (entry.link && byLink.has(entry.link)) return { story: byLink.get(entry.link), layer: 'link' }
    if (entry.suggestedSlug && bySlug.has(entry.suggestedSlug)) return { story: bySlug.get(entry.suggestedSlug), layer: 'slug' }
    if (entry.link && bySourceUrl.has(entry.link)) return { story: bySourceUrl.get(entry.link), layer: 'sourceUrl' }
    const fp = fingerprint(entry.title)
    if (fp && byFingerprint.has(fp)) return { story: byFingerprint.get(fp), layer: 'fingerprint' }

    const entryWords = new Set(words([entry.title, entry.suggestedSlug?.replace(/-/g, ' ')].filter(Boolean).join(' ')))
    if (entryWords.size < 3) return null

    const candidates = []
    for (const s of allStories) {
      if (claimed.has(s)) continue
      const shared = [...storyWords.get(s)].filter(w => entryWords.has(w))
      const rare = shared.filter(w => (docFreq.get(w) || 0) <= rareMax)
      const ratio = shared.length / entryWords.size
      if (rare.length < MIN_RARE || ratio < MIN_RATIO) continue
      candidates.push({ story: s, score: rare.length + ratio, ratio, rare })
    }
    if (candidates.length === 0) return null
    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]

    // The margin is about a *rival* story, not a second copy of the winner.
    // `allStories` is multiSourceStories concatenated with nicheStories, where
    // the same event routinely appears twice — that is what the dedup layers
    // exist for. Measuring the runner-up blindly meant the commonest case, an
    // event the feed carried twice, scored a near-tie against itself and the
    // correct match was thrown away as ambiguous. So the runner-up is the best
    // candidate that is a materially *different* story.
    const rival = candidates.slice(1).find(c => !sameEvent(c, best))
    if (rival && best.score < rival.score * MARGIN) {
      return { story: null, layer: 'keyword', rejected: 'ambiguous', candidate: best.story }
    }
    claimed.add(best.story)
    return {
      story: best.story,
      layer: 'keyword',
      detail: `${(best.ratio * 100).toFixed(0)}% of title, ${best.rare.length} rare: ${best.rare.slice(0, 4).join('/')}`,
    }
  }
}
