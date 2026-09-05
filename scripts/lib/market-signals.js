// Deterministic editorial selection. No forecasts, imputation, or look-ahead.
export const SIGNAL_RULES = Object.freeze({ daily: 1.5, weekly: 3, monthly: 5, streak: 2, limit: 3 })
const DAY = 86400000
const pct = (values, n) => 100 * (values.at(-1) / values.at(-1 - n) - 1)
const sign = (n) => Math.abs(n) < 0.01 ? 0 : Math.sign(n)
const sd = (v) => {
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1))
}

/**
 * Who the instrument is, alongside what it did.
 *
 * `title` is the *index* — `TA-125`, `BIST 100`, `MASI`, `IPC` — because that is
 * what the card headlines and what the series belongs to. On its own it is four
 * characters that mean nothing to a reader who has not met the ticker, which is
 * the complaint this block answers: the card said an index fell 4.8% and never
 * said what the index was, where it trades, or what it counts.
 *
 * So `exchange`, `city`, `country` and `standing` ride along. Two things need
 * them, and they are different needs:
 *
 *  - **The card**, which can now name the exchange under the ticker and carry
 *    the definitional sentence whether or not a model was called. Commentary
 *    is written only when the window carries coverage, so on an ordinary day
 *    it is empty — and an empty comment used to leave `BIST 100` unexplained
 *    on its own card.
 *  - **The model**, whose every proper noun must appear in the INPUT bundle
 *    (`validateProperNouns`). Before this it could not write "Borsa İstanbul"
 *    or "Türkiye" into a sentence about `mkt:bist` without being rejected for
 *    inventing them.
 *
 * `standing` comes from the indicator dispatch, keyed by the same `mkt:{id}`
 * these ids are minted as, so the definition on this card and the one on
 * `/e/mkt:bist` are the same string rather than two paraphrases.
 */
export function normalizeMarkets(markets, trends, dispatch = {}) {
  const exchanges = (markets.exchanges || []).filter((m) => m.indexName !== 'S&P 500').map((m) => ({
    id: `mkt:${m.id}`, title: m.indexName, sourceLabel: m.sourceLabel,
    exchange: m.name, city: m.city, country: m.iso2,
    standing: dispatch[`mkt:${m.id}`]?.standing || m.blurb || '',
    topicTags: m.topicTags || [], countryTags: m.countryTags || [],
    values: m.series?.values, dates: m.series?.dates,
    completed: m.series?.completed, stale: m.stale,
  }))
  const indices = (trends.indicators || []).filter((m) => ['sp500', 'nasdaq100'].includes(m.id)).map((m) => ({
    id: m.id, title: m.label, sourceLabel: m.sourceLabel, topicTags: m.topicTags || [],
    countryTags: m.countryTags || [], standing: dispatch[m.id]?.standing || '',
    values: m.values, dates: m.dates, completed: m.completed, stale: m.stale,
  }))
  return [...exchanges, ...indices]
}

export function cleanMarket(m, now = Date.now()) {
  if (m.stale || !Array.isArray(m.values) || !Array.isArray(m.dates) ||
      !Array.isArray(m.completed) || m.values.length !== m.dates.length ||
      m.values.length !== m.completed.length) return null
  const pairs = []
  for (let i = 0; i < m.values.length; i++) {
    const date = m.dates[i]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
        !Number.isFinite(m.values[i]) || m.values[i] <= 0 ||
        (i > 0 && date <= m.dates[i - 1])) return null
    if (Date.parse(date) > now) return null
    if (m.completed[i] === true) pairs.push({ date, value: m.values[i] })
  }
  if (pairs.length < 22 || now - Date.parse(pairs.at(-1).date) > 7 * DAY) return null
  // A missing week is not a sequence of consecutive sessions.
  if (pairs.some((p, i) => i > 0 && Date.parse(p.date) - Date.parse(pairs[i - 1].date) > 7 * DAY)) return null
  return { ...m, values: pairs.map((p) => p.value), dates: pairs.map((p) => p.date) }
}

export function detectPatterns(m) {
  const v = m.values
  const returns = v.slice(1).map((x, i) => 100 * (x / v[i] - 1))
  const out = []
  const add = (kind, n, floor, multiple) => {
    if (returns.length < n + 20) return
    const baseline = returns.slice(Math.max(0, returns.length - n - 60), -n)
    const vol = Math.max(sd(baseline), 0.1)
    const change = pct(v, n)
    const strength = Math.min(Math.abs(change) / floor, Math.abs(change) / (multiple * vol * Math.sqrt(n)))
    if (strength < 1) return
    out.push({ kind, sessions: n, changePct: change, direction: sign(change), score: strength,
      startDate: m.dates.at(-1 - n), endDate: m.dates.at(-1) })
  }
  add('sharp', 1, SIGNAL_RULES.daily, 2)
  add('weekly', 5, SIGNAL_RULES.weekly, 1.5)
  add('monthly', 20, SIGNAL_RULES.monthly, 1.5)
  const direction = sign(returns.at(-1))
  let streak = 0
  if (direction) for (let i = returns.length - 1; i >= 0 && sign(returns[i]) === direction; i--) streak++
  if (streak >= 4) add('streak', streak, SIGNAL_RULES.streak, 1)
  const week = out.find((p) => p.kind === 'weekly')
  if (week && v.length >= 21) {
    const previous = 100 * (v.at(-6) / v.at(-21) - 1)
    if (Math.abs(previous) >= 3 && sign(previous) === -week.direction) out.push({ ...week, kind: 'reversal', score: week.score + 0.25 })
  }
  return out.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind))
}

export function patternLabel(pattern) {
  return ({ sharp: 'Sharp move', weekly: 'Week-long trend', monthly: 'Month-long trend',
    reversal: 'Reversal', divergence: 'Markets diverge',
    streak: pattern.direction > 0 ? 'Rising streak' : 'Falling streak' })[pattern.kind]
}

export function factualSummary(signal) {
  const p = signal.pattern
  const change = Math.abs(p.changePct).toFixed(1)
  const verb = p.direction > 0 ? 'rose' : 'fell'
  if (p.kind === 'divergence') return `${signal.title} ${verb} ${change}% over ${p.sessions} sessions, while the S&P 500 moved ${p.peerChangePct.toFixed(1)}%. Their returns differed by ${p.gapPct.toFixed(1)} percentage points (${p.startDate} to ${p.endDate}).`
  return `${signal.title} ${verb} ${change}% over ${p.sessions} ${p.kind === 'streak' ? 'consecutive ' : ''}session${p.sessions === 1 ? '' : 's'} (${p.startDate} to ${p.endDate}).`
}

// Previous events survive two non-qualifying observations, not two fetches.
// Their original evidence window is retained; no stale explanation is attached
// to a new window. They expire on the third observed session without a signal.
/** @param {any[]} raw @param {Record<string, any>} previous */
export function selectMarketSignals(raw, previous = {}, now = Date.now(), articles = []) {
  const markets = raw.map((m) => cleanMarket(m, now)).filter(Boolean)
  /** @type {{ id: string, reason: string, misses?: number, patterns?: any[] }[]} */
  const reports = raw.filter((m) => !markets.some((x) => x.id === m.id)).map((m) => ({ id: m.id, reason: 'invalid, stale, provisional or insufficient history' }))
  const candidates = markets.map((m) => ({ m, patterns: detectPatterns(m) }))
  const nasdaq = candidates.find((c) => c.m.id === 'nasdaq100')
  const sp = markets.find((m) => m.id === 'sp500')
  if (nasdaq && sp) {
    const dates = nasdaq.m.dates.slice(-6)
    if (dates.length === 6 && JSON.stringify(dates) === JSON.stringify(sp.dates.slice(-6))) {
      const a = pct(nasdaq.m.values, 5), b = pct(sp.values, 5)
      if (sign(a) * sign(b) === -1 && Math.abs(a - b) >= 3) {
        nasdaq.patterns.push({ kind: 'divergence', sessions: 5, changePct: a, direction: sign(a),
          peerChangePct: b, gapPct: Math.abs(a - b), score: Math.abs(a - b) / 3,
          startDate: dates[0], endDate: dates.at(-1) })
        nasdaq.patterns.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind))
      }
    }
  }
  const state = { ...previous }
  const active = []
  for (const { m, patterns } of candidates) {
    const pattern = patterns[0]
    const prev = previous[m.id]
    const asOf = m.dates.at(-1)
    if (!pattern) {
      const misses = (prev?.misses || 0) + (prev?.lastDate !== asOf ? 1 : 0)
      if (prev) state[m.id] = { ...prev, misses, lastDate: asOf }
      if (prev?.signal && misses < 3 && now - Date.parse(prev.signal.asOf) <= 7 * DAY) active.push(prev.signal)
      reports.push({ id: m.id, reason: 'below thresholds', misses })
      continue
    }
    const sameEvent = prev?.signal && prev.misses < 3 && prev.signal.pattern.direction === pattern.direction
    const eventId = sameEvent ? prev.signal.eventId : `${m.id}:${pattern.endDate}:${pattern.direction}`
    const news = articles.filter((a) => a.entityIds?.includes(m.id) && a.date >= pattern.startDate && a.date <= pattern.endDate)
    const signal = { id: m.id, eventId, title: m.title, sourceLabel: m.sourceLabel || 'Market data',
      exchange: m.exchange || '', city: m.city || '', country: m.country || '', standing: m.standing || '',
      asOf, pattern, series: { values: m.values, dates: m.dates }, directNews: news.map((a) => a.slug),
      topicTags: m.topicTags || [], countryTags: m.countryTags || [] }
    state[m.id] = { signal, lastDate: asOf, misses: 0 }
    active.push(signal)
    reports.push({ id: m.id, reason: 'qualified', patterns })
  }
  active.sort((a, b) => b.pattern.score - a.pattern.score || b.directNews.length - a.directNews.length || a.id.localeCompare(b.id))
  const selected = []
  const usedArticles = new Set()
  for (const signal of active) {
    if (signal.pattern.kind === 'divergence') {
      const duplicate = selected.findIndex((s) => s.id === 'sp500')
      if (duplicate >= 0) selected.splice(duplicate, 1)
    }
    if (selected.some((s) => s.pattern.kind === 'divergence' && signal.id === 'sp500')) {
      reports.push({ id: signal.id, reason: 'duplicate divergence' }); continue
    }
    const newsKey = signal.directNews[0] ? `${signal.pattern.direction}:${signal.directNews[0]}` : null
    if (newsKey && usedArticles.has(newsKey)) { reports.push({ id: signal.id, reason: 'shared explanatory story' }); continue }
    if (selected.length === SIGNAL_RULES.limit) { reports.push({ id: signal.id, reason: 'card budget' }); continue }
    if (newsKey) usedArticles.add(newsKey)
    selected.push(signal)
  }
  return { selected, state, reports }
}
