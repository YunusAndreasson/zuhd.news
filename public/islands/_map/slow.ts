/**
 * The readings that do not follow the rail's range: the monthly economy
 * series and the AI labs' scores.
 *
 * Everything else on the rail is a daily series, windowed by the one range
 * control. A policy rate, an inflation figure and a grain price are published
 * once a month, and a lab's best score changes a few times a year, so at the
 * map's opening range every one of them would be a dotted rule. Each reads
 * over its own period instead, the block's heading names that period once,
 * and the blocks stand under the daily ones.
 *
 * These are the app's figures, made the app's way (`mobile/lib/world-summary.ts`,
 * `mobile/lib/ai-models.ts`), so a list on the web and the same list in the
 * app cannot disagree. Arithmetic only: `_map/markets.ts` formats and draws.
 */

import { DAY_MS } from './series-window'
import type { TrendIndicator } from './markets'
import type { AiLab } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `Sep 2026` as a count of months, so the month before is one less. */
const monthKey = (label: string | undefined): number | null => {
  const m = /^([A-Z][a-z]{2}) (\d{4})$/.exec(label ?? '')
  if (!m?.[1] || !m[2]) return null
  const month = MONTHS.indexOf(m[1])
  return month < 0 ? null : Number(m[2]) * 12 + month
}

const monthName = (key: number): string => MONTHS[key % 12] ?? ''

/** A monthly series by month. Empty for one labelled any other way. */
const byMonth = (ind: TrendIndicator): Map<number, number> => {
  const out = new Map<number, number>()
  const periods = ind.periods ?? []
  for (let i = 0; i < periods.length; i++) {
    const key = monthKey(periods[i])
    const value = ind.values[i]
    if (key !== null && typeof value === 'number' && Number.isFinite(value)) out.set(key, value)
  }
  return out
}

const rounded = (n: number, places: number): number => Number(n.toFixed(places))

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid] ?? 0
  return sorted.length % 2 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2
}

/** A change over a month, which the rail's range does not reach. */
export interface SlowMove {
  /** Points for a series in per cent, percent for a price. */
  delta: number
  kind: 'points' | 'percent'
  /** The month the reading is of, and the month it is set against. */
  month: string
  against: string
}

export type EconomyKey = 'rates' | 'inflation' | 'food' | 'jobs'

interface EconomyDef {
  key: EconomyKey
  /** The rail's row. */
  label: string
  /** The list's title, and the group a card is filed under. */
  title: string
  /** How the list becomes one figure. */
  measure: 'median' | 'average'
  /** The places a series in per cent is published to. */
  places: number
  items: ReadonlyArray<{ id: string; iso2?: string }>
}

/**
 * The monthly lists, in the app's order: what a central bank sets, what
 * prices did, what a job is worth.
 *
 * Rates run largest economy first, and the median stands for them because a
 * mean would be Turkey's rate with eight rounding errors attached. `jobs` is
 * one series, so its row opens that series' card and not a list of one.
 */
const ECONOMY: readonly EconomyDef[] = [
  {
    key: 'rates',
    label: 'rates',
    title: 'central bank rates',
    measure: 'median',
    places: 2,
    items: [
      { id: 'fed-funds', iso2: 'US' },
      { id: 'ecb-rate', iso2: 'EU' },
      { id: 'pboc-rate', iso2: 'CN' },
      { id: 'boj-rate', iso2: 'JP' },
      { id: 'boe-rate', iso2: 'GB' },
      { id: 'bcb-rate', iso2: 'BR' },
      { id: 'cbr-rate', iso2: 'RU' },
      { id: 'bi-rate', iso2: 'ID' },
      { id: 'tcmb-rate', iso2: 'TR' },
    ],
  },
  {
    key: 'inflation',
    label: 'inflation',
    title: 'inflation',
    measure: 'average',
    places: 1,
    items: [
      { id: 'us-cpi', iso2: 'US' },
      { id: 'ez-cpi', iso2: 'EU' },
    ],
  },
  {
    key: 'food',
    label: 'food',
    title: 'food',
    measure: 'average',
    places: 1,
    items: [{ id: 'wheat' }, { id: 'rice' }],
  },
  {
    key: 'jobs',
    label: 'US jobless',
    title: 'unemployment',
    measure: 'average',
    places: 1,
    items: [{ id: 'us-unemployment', iso2: 'US' }],
  },
]

export interface EconomyRow {
  ind: TrendIndicator
  iso2?: string | undefined
  /** The newest month's value, at the places it is published to. */
  level: number
  /** Null where the month before is missing: a gap is never bridged. */
  move: SlowMove | null
  /** The month `level` is of, for a row with no move to say it. */
  month: string
}

export interface EconomyGroup {
  key: EconomyKey
  label: string
  title: string
  measure: 'median' | 'average'
  places: number
  rows: EconomyRow[]
  /**
   * The list as one figure: its median or average at the newest month every
   * row has, against the month before, over the same rows at both ends.
   */
  move: SlowMove | null
}

/** A change between two readings, in the terms of the series' unit. */
const moveBetween = (
  now: number,
  before: number,
  unit: string | undefined,
  places: number,
): { delta: number; kind: SlowMove['kind'] } | null => {
  // The difference of the two printed readings, so a level and its move agree.
  if (unit === '%') return { delta: rounded(now, places) - rounded(before, places), kind: 'points' }
  return before === 0 ? null : { delta: ((now - before) / Math.abs(before)) * 100, kind: 'percent' }
}

const economyRow = (
  ind: TrendIndicator,
  iso2: string | undefined,
  places: number,
): EconomyRow | null => {
  const months = byMonth(ind)
  if (!months.size) return null
  const at = Math.max(...months.keys())
  const value = months.get(at) as number
  const before = months.get(at - 1)
  const change = before === undefined ? null : moveBetween(value, before, ind.unit, places)
  return {
    ind,
    iso2,
    level: ind.unit === '%' ? rounded(value, places) : value,
    month: monthName(at),
    move: change && { ...change, month: monthName(at), against: monthName(at - 1) },
  }
}

const groupMove = (def: EconomyDef, rows: EconomyRow[]): SlowMove | null => {
  const histories = rows.map((r) => byMonth(r.ind))
  const first = histories[0]
  if (!first) return null
  const shared = [...first.keys()].filter((k) => histories.every((h) => h.has(k)))
  if (!shared.length) return null
  const at = Math.max(...shared)
  if (!histories.every((h) => h.has(at - 1))) return null
  const names = { month: monthName(at), against: monthName(at - 1) }
  const rates = rows.every((r) => r.ind.unit === '%')
  if (rates) {
    const combine = def.measure === 'median' ? median : mean
    const level = (key: number) => combine(histories.map((h) => h.get(key) as number))
    const change = moveBetween(level(at), level(at - 1), '%', def.places)
    return change && { ...change, ...names }
  }
  // Prices in different units: each one's own change, then the average.
  const changes = histories.flatMap((h, i) => {
    const change = moveBetween(h.get(at) as number, h.get(at - 1) as number, rows[i]?.ind.unit, 0)
    return change ? [change.delta] : []
  })
  return changes.length === rows.length
    ? { delta: mean(changes), kind: 'percent', ...names }
    : null
}

/** The monthly lists the payload can fill, in the table's order. */
export const economyGroups = (indicators: readonly TrendIndicator[]): EconomyGroup[] => {
  const byId = new Map(indicators.map((i) => [i.id, i]))
  return ECONOMY.flatMap((def) => {
    const rows = def.items.flatMap((item) => {
      const ind = byId.get(item.id)
      const row = ind ? economyRow(ind, item.iso2, def.places) : null
      return row ? [row] : []
    })
    if (!rows.length) return []
    const { key, label, title, measure, places } = def
    return [{ key, label, title, measure, places, rows, move: groupMove(def, rows) }]
  })
}

// --- AI labs ---------------------------------------------------------------

/** The window a lab's score moves over, where its line reaches back that far. */
export const AI_CHANGE_DAYS = 90

export interface AiChange {
  /** In the index's own points, never a percentage: its zero means nothing. */
  points: number
  /** Whether the lab has the whole window behind it. */
  full: boolean
  /** The day of its first scored model, which a short line is measured from. */
  since: string
}

/**
 * How far a lab's best has risen. A release's score stands until a newer one
 * replaces it, so the reading 90 days ago is the last release on or before
 * that day.
 */
export const aiScoreChange = (
  series: Pick<AiLab['series'], 'periods' | 'values'>,
  now = Date.now(),
): AiChange | null => {
  const cutoff = now - AI_CHANGE_DAYS * DAY_MS
  let first: { value: number; period: string } | undefined
  let before: number | undefined
  let latest: number | undefined
  let observations = 0
  for (let i = 0; i < series.periods.length; i++) {
    const period = series.periods[i] ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) continue
    const at = Date.parse(period)
    const value = series.values[i]
    if (!Number.isFinite(at) || at > now || typeof value !== 'number' || !Number.isFinite(value)) {
      continue
    }
    first ??= { value, period }
    observations++
    if (at <= cutoff) before = value
    latest = value
  }
  if (!first || latest === undefined) return null
  if (before === undefined && observations < 2) return null
  return { points: latest - (before ?? first.value), full: before !== undefined, since: first.period }
}

export interface AiSummary {
  /** The labs' best scores, averaged. */
  mean: number
  /** The average gain over the window, of the labs that have all of it. */
  gain: number | null
  /** How many labs `gain` is of. */
  counted: number
}

/** The list as one figure. Null under two labs: one score is not a field. */
export const aiSummary = (labs: readonly AiLab[], now = Date.now()): AiSummary | null => {
  const scores = labs.map((l) => l.score).filter((s) => Number.isFinite(s))
  if (scores.length < 2) return null
  // A fixed cohort: a lab without the whole window is left out, never
  // averaged in over a shorter one.
  const gains = labs.flatMap((lab) => {
    const change = aiScoreChange(lab.series, now)
    return change?.full ? [change.points] : []
  })
  return {
    mean: mean(scores),
    gain: gains.length >= 2 ? mean(gains) : null,
    counted: gains.length,
  }
}
