// Rava Bursátil: an Argentine index's daily closes, from the CSV of its whole
// history. Endpoint: https://www.rava.com/perfil/descarga-historicos/<especie>
// Free, no key, robots.txt allows everything; about 110 KB a call.
//
// The one series the site takes from here is BYMA's main index. Yahoo's
// `^MERV` was the S&P MERVAL, which ended with the session of 2026-10-16;
// from the 19th BYMA's index is the MSCI Merval, started at 100,000 on the
// S&P's last close (2,848,945.2), and Yahoo has answered `^MERV` with null
// closes ever since. Rava carries the new index with its history rescaled
// onto that base: each of Yahoo's last six months of closes is Rava's times
// 28.48945, and the closes since the 19th are MSCI's own levels. So a quarter
// read here is one series, never the old and the new spliced, which would draw
// a fall of 96%. BYMA's own data service does not answer this server.
//
// What comes back has the shape `fetchYahooStock` returns, so `fetchQuotes`
// and `exchangeRecord` take it unchanged. Rava reports no currency and no
// zone, so those stay empty and `instrumentMismatch` has nothing to compare;
// the guard here is that every row names the index asked for.

import { csvObjects } from '../csv.js'
import { pathOf } from '../datasets.js'
import { BROWSER_UA, fetchOk } from '../http.js'
import { dayLabel } from '../period.js'
import { readCachedSeries, seriesAsOf, writeCache } from './stocks.js'

const BASE = 'https://www.rava.com/perfil/descarga-historicos/'

/** BYMA's zone; the CSV's `fecha` is the session's own day there. */
const ZONE = 'America/Argentina/Buenos_Aires'

/** BYMA's session ends at 17:00; today's row counts as a close a quarter-hour after. */
const CLOSED_AFTER = '17:15'

/**
 * A quarter of an index's closes from Rava's CSV. Pure, so it has a test.
 *
 * @param {string} csv the file as served, with its byte-order mark
 * @param {string} especie what the rows must name, `MERVAL`
 * @param {{ range?: string, now?: number }} [opts] `range` is Yahoo's token, `3mo` or `1mo`
 */
export function ravaSeries(csv, especie, { range = '3mo', now = Date.now() } = {}) {
  const rows = csvObjects(csv.replace(/^﻿/, ''), ['especie', 'fecha', 'cierre'])
  const months = Number(/^(\d+)mo$/.exec(range)?.[1] ?? 3)
  const from = new Date(now)
  from.setUTCMonth(from.getUTCMonth() - months)
  const start = from.toISOString().slice(0, 10)
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const parts = Object.fromEntries(local.formatToParts(now).map((p) => [p.type, p.value]))
  const today = `${parts.year}-${parts.month}-${parts.day}`
  const closed = `${parts.hour}:${parts.minute}` >= CLOSED_AFTER

  const kept = []
  for (const row of rows) {
    if (row.especie !== especie) throw new Error(`a row for ${row.especie || '(none)'}, not ${especie}`)
    const close = Number(row.cierre)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.fecha) || !(close > 0) || row.fecha < start) continue
    kept.push({ date: row.fecha, close })
  }
  kept.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  if (kept.length < 5) throw new Error(`${kept.length} closes since ${start}`)

  const dates = kept.map((r) => r.date)
  const values = kept.map((r) => Number(r.close.toFixed(2)))
  const completed = dates.map((d) => d < today || (d === today && closed))
  return {
    values,
    periods: dates.map((d) => dayLabel(Date.parse(`${d}T00:00:00Z`))),
    dates,
    completed,
    asOf: seriesAsOf(dates, completed),
    name: especie,
    currency: 'ARS',
    currencyReported: '',
    exchange: 'BYMA',
    timezone: '',
    marketPrice: values[values.length - 1],
    source: 'Rava Bursátil',
  }
}

/**
 * Fetch one index from Rava. On a failure, a series cached within the week is
 * served marked `stale`, as `fetchYahooStock` does; with none, `null`.
 *
 * @param {string} especie
 * @param {{ range?: string, fetchText?: (url: string) => Promise<string>, cachePath?: string, now?: number }} [opts]
 *   `fetchText`, `cachePath` and `now` are what a test holds it by
 */
export async function fetchRavaIndex(especie, opts = {}) {
  const range = opts.range || '3mo'
  const now = opts.now ?? Date.now()
  const key = `rava:${especie}@${range}`
  const cachePath = opts.cachePath ?? pathOf('stocksCache')
  const get = opts.fetchText ?? (async (url) => (await fetchOk(url, { timeoutMs: 20_000, headers: { 'user-agent': BROWSER_UA } })).text())
  try {
    const series = ravaSeries(await get(`${BASE}${encodeURIComponent(especie)}`), especie, { range, now })
    writeCache(cachePath, key, series, now)
    return series
  } catch (err) {
    const cached = readCachedSeries(cachePath, key, now)
    const why = /** @type {Error} */ (err).message
    if (cached) {
      console.error(`  ⚠ rava:${especie}: ${why} — serving cached series from ${cached.asOf}`)
      return cached
    }
    console.error(`  ✗ rava:${especie}: ${why}`)
    return null
  }
}
