// market-signal-state contains cleanMarket's completed exchange-local bars.
// An intraday catalogue quote or a story's venue is never a close.
import { createHash } from 'node:crypto'
import { widgetExchanges } from './widget-exchanges.js'
import { validDay } from './period.js'

const DAY = 86400000
const revision = data => createHash('sha256').update(JSON.stringify(data)).digest('hex')

function completedClose(id, signal, edition) {
  if (!signal || signal.id !== id || signal.asOf !== edition) return null
  const { title, exchange, country, label } = widgetExchanges[id]
  if (signal.title !== title || signal.exchange !== exchange || signal.country !== country) return null
  const { dates, values, completed } = signal.series ?? {}
  if (completed !== undefined && (!Array.isArray(completed) || completed.length !== dates?.length ||
      completed.some(value => value !== true))) return null
  if (!Array.isArray(dates) || !Array.isArray(values) || dates.at(-1) !== edition ||
      dates.length !== values.length || dates.some((d, i) => !validDay(d) || (i && d <= dates[i - 1]) ||
        !Number.isFinite(values[i]) || values[i] <= 0)) return null
  const anchor = dates.findLastIndex(date => Date.parse(edition) - Date.parse(date) >= 7 * DAY)
  const week = anchor >= 0 && Date.parse(edition) - Date.parse(dates[anchor]) <= 10 * DAY
    ? dates.slice(anchor).map((date, i) => ({ date, value: values[anchor + i] })) : undefined
  const close = { id, label, unit: 'index points', completed: true, sessionDate: edition, value: values.at(-1),
    ...(week && { observations: week }) }
  return { ...close, sourceRevision: revision(close) }
}

export function widgetCandidate(edition, events, briefing, previousExchange, openerExchange, now) {
  if (!validDay(edition) || !Number.isFinite(now) || Date.parse(edition) > now) return null
  let close = null
  for (const id of new Set([previousExchange, openerExchange, ...Object.keys(widgetExchanges).sort()])) {
    if (!Object.hasOwn(widgetExchanges, id)) continue
    close = completedClose(id, events?.[id]?.signal, edition)
    if (close) break
  }
  const generated = briefing?.generated
  const recorded = briefing?.available === true && briefing.date === edition &&
    typeof generated === 'string' && generated.startsWith(`${edition}T`) &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(generated) &&
    Date.parse(generated) <= now
  if (!close && !recorded) return null
  const audio = recorded ? {
    status: 'available', date: edition, generated,
    ...(Number.isSafeInteger(briefing.duration) && briefing.duration > 0 && { durationSeconds: briefing.duration }),
  } : { status: 'unavailable' }
  const data = { version: 1, edition, ...(close && { close }), audio }
  return { ...data, sourceRevision: revision(data) }
}
