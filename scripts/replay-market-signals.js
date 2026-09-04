// Read-only evaluation. Production never reconstructs dates from display labels.
import { readFileSync } from 'node:fs'
import { normalizeMarkets, selectMarketSignals } from './lib/market-signals.js'
const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1] }
if (!arg('--markets') && !process.argv.includes('--stdin')) {
  console.log('Usage: node scripts/replay-market-signals.js --markets snapshot.json [--trends trends.json] [--legacy-research]\nOr --stdin accepts { markets, trends }. No files or LLM calls are written.')
  process.exit(0)
}
const input = process.argv.includes('--stdin') ? JSON.parse(readFileSync(0,'utf8')) :
  { markets:JSON.parse(readFileSync(arg('--markets'),'utf8')), trends:arg('--trends') ? JSON.parse(readFileSync(arg('--trends'),'utf8')) : {} }
const legacy = process.argv.includes('--legacy-research')
function researchDates(source) {
  const year = Number(source.asOf?.slice(0,4))
  const periods = source.series?.periods || source.periods || []
  const values = source.series?.values || source.values || []
  const dates = periods.map((label) => {
    let d = new Date(`${label} ${year} 00:00:00 UTC`)
    if (!Number.isFinite(d.getTime())) return ''
    if (d.toISOString().slice(0,10) > source.asOf) d = new Date(`${label} ${year-1} 00:00:00 UTC`)
    return d.toISOString().slice(0,10)
  })
  return { values, dates, completed:dates.map((d)=>d < source.asOf) }
}
if (legacy) {
  for (const s of input.markets.exchanges || []) s.series = {...s.series, ...researchDates(s)}
  for (const s of input.trends?.indicators || []) Object.assign(s,researchDates(s))
}
const markets = normalizeMarkets(input.markets || {},input.trends || {})
const dates = [...new Set(markets.flatMap((m)=>m.dates || []))].sort()
let state = {}, previousIds = [], newEvents = 0
for (const date of dates) {
  const truncated = markets.map((m)=>{
    const n = (m.dates || []).filter((d)=>d<=date).length
    return {...m, values:m.values?.slice(0,n), dates:m.dates?.slice(0,n), completed:m.completed?.slice(0,n)}
  })
  const result = selectMarketSignals(truncated,state,Date.parse(`${date}T23:59:59Z`))
  const ids = result.selected.map((s)=>s.eventId)
  const entering = ids.filter((id)=>!previousIds.includes(id)).length
  newEvents += entering
  console.log(JSON.stringify({ date, researchOnly:legacy, selected:result.selected.map((s)=>({id:s.id,pattern:s.pattern.kind,changePct:+s.pattern.changePct.toFixed(2)})), entering,
    excluded:result.reports.filter((r)=>r.reason!=='qualified').map(({id,reason})=>({id,reason})) }))
  previousIds=ids; state=result.state
}
console.log(JSON.stringify({evaluatedDates:dates.length,newEvents,researchOnly:legacy, note:'No LLM calls. News relevance unavailable unless supplied by production; expected calls depend on evidence and revision changes.'}))
