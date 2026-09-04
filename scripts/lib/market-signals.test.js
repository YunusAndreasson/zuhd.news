import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanMarket, detectPatterns, selectMarketSignals, normalizeMarkets, factualSummary } from './market-signals.js'
import { validateMarketComment, runMarketSignals } from '../narrate-market-signals.js'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const DAY = 86400000
const NOW = Date.parse('2026-09-04T23:00:00Z')
function market(tail = [2], id = 'nasdaq100') {
  const returns = [...Array.from({length: 60}, (_, i) => i % 2 ? -0.2 : 0.2), ...tail]
  const values = [100]
  for (const r of returns) values.push(values.at(-1) * (1 + r / 100))
  const dates = values.map((_, i) => new Date(NOW - (values.length - 1 - i) * DAY).toISOString().slice(0, 10))
  return { id, title: 'NASDAQ-100', sourceLabel: 'FRED', values, dates, completed: values.map(() => true), topicTags: [] }
}
test('sharp, streak, sustained and reversal candidates have explicit windows', () => {
  assert.ok(detectPatterns(market([2])).some((p) => p.kind === 'sharp'))
  assert.ok(detectPatterns(market([0.6,0.6,0.6,0.6])).some((p) => p.kind === 'streak'))
  assert.ok(detectPatterns(market(Array(20).fill(0.4))).some((p) => p.kind === 'monthly'))
  assert.ok(detectPatterns(market([...Array(15).fill(-0.4), ...Array(5).fill(0.9)])).some((p) => p.kind === 'reversal'))
})
test('tiny streaks and flat histories are quiet', () => {
  assert.deepEqual(detectPatterns(market([0.01,0.01,0.01,0.01])), [])
  const m = market(); m.values.fill(100)
  assert.deepEqual(detectPatterns(m), [])
})
test('invalid, stale, future, missing-date and provisional data fail safely', () => {
  const m = market()
  assert.equal(cleanMarket({...m, stale:true}, NOW), null)
  assert.equal(cleanMarket({...m, dates:undefined}, NOW), null)
  assert.equal(cleanMarket({...m, values:[0,...m.values.slice(1)]}, NOW), null)
  assert.equal(cleanMarket({...m, dates:m.dates.map(()=>'2026-09-04')}, NOW), null)
  assert.equal(cleanMarket(m, NOW - 10 * DAY), null)
  assert.equal(cleanMarket(m, NOW + 10 * DAY), null)
  const complete = [...m.completed]; complete[complete.length - 1] = false
  const clean = cleanMarket({...m, completed:complete}, NOW)
  assert.equal(clean.values.length, m.values.length - 1)
  assert.deepEqual(detectPatterns(clean), [])
})
test('ranking is deterministic, budgeted and does not mutate source histories', () => {
  const inputs = ['c','a','b','d'].map((id) => market([2], id))
  const before = JSON.stringify(inputs)
  const result = selectMarketSignals(inputs, {}, NOW)
  assert.deepEqual(result.selected.map((s)=>s.id), ['a','b','c'])
  assert.equal(JSON.stringify(inputs), before)
  assert.equal(selectMarketSignals([], {}, NOW).selected.length, 0)
})
test('same-event revisions stay stable and opposite moves start a new event', () => {
  const m = market([2])
  const first = selectMarketSignals([m], {}, NOW)
  const again = selectMarketSignals([m], first.state, NOW)
  assert.equal(again.selected[0].eventId, first.selected[0].eventId)
  const opposite = market([-2])
  assert.notEqual(selectMarketSignals([opposite], first.state, NOW).selected[0].eventId, first.selected[0].eventId)
})
test('expiry advances by observations, never repeated fetches', () => {
  const first = selectMarketSignals([market([2])], {}, NOW)
  let state = first.state
  const quiet = market([0])
  for (let i=1;i<=3;i++) {
    const m = {...quiet, dates:quiet.dates.map((d)=>new Date(Date.parse(d)+i*DAY).toISOString().slice(0,10))}
    const r = selectMarketSignals([m], state, NOW+i*DAY)
    assert.equal(r.selected.length, i < 3 ? 1 : 0)
    const repeat = selectMarketSignals([m], r.state, NOW+i*DAY)
    assert.equal(repeat.state.nasdaq100.misses, i)
    state = repeat.state
  }
})
test('divergence requires identical dates and suppresses a duplicate S&P card', () => {
  const n = market(Array(5).fill(0.7))
  const s = market(Array(5).fill(-0.1), 'sp500')
  const result = selectMarketSignals([n,s], {}, NOW)
  // Divergence is a candidate even when the individually stronger trend wins.
  assert.ok(result.reports.find((r)=>r.id==='nasdaq100').patterns.some((p)=>p.kind==='divergence'))
  const shifted = {...s, dates:s.dates.map((d)=>new Date(Date.parse(d)-DAY).toISOString().slice(0,10))}
  assert.ok(!selectMarketSignals([n,shifted], {}, NOW).reports.find((r)=>r.id==='nasdaq100').patterns.some((p)=>p.kind==='divergence'))
})
test('canonical S&P source is not duplicated', () => {
  const normalized = normalizeMarkets({exchanges:[{id:'nyse',indexName:'S&P 500'}]}, {indicators:[{id:'sp500',label:'S&P 500'}]})
  assert.deepEqual(normalized.map((m)=>m.id), ['sp500'])
})
test('grounding rejects missing evidence, invented citations and numbers', () => {
  const bundle = { facts:'NASDAQ-100 rose 2%.', coverage:[{slug:'news',title:'Policy decision',date:'2026-09-04',lead:'The central bank held its policy rate unchanged.'}] }
  assert.equal(validateMarketComment({recent:'The market rose 99%.', evidence:[]},bundle),null)
  assert.equal(validateMarketComment({recent:'The central bank held its policy rate unchanged.',evidence:[{slug:'fake',quote:bundle.coverage[0].lead}]},bundle),null)
  assert.equal(validateMarketComment({recent:'The market rose because of the central bank.',evidence:[{slug:'news',quote:bundle.coverage[0].lead}]},bundle),null)
  const valid = validateMarketComment({recent:bundle.coverage[0].lead,evidence:[{slug:'news',quote:bundle.coverage[0].lead}]},bundle)
  assert.equal(valid.citations[0].url,'https://zuhd.news/a/news')
})
test('fallback contains computed dates and not invented news', () => {
  const s = selectMarketSignals([market([2])],{},NOW).selected[0]
  assert.match(factualSummary(s), /2.0%/)
  assert.ok(factualSummary(s).includes(s.pattern.startDate))
})

test('pipeline writes factual fallback on model failure and reuses unchanged revision', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zuhd-market-test-'))
  try {
    mkdirSync(join(root,'content/trends'), {recursive:true})
    const m = market([2])
    writeFileSync(join(root,'content/.markets.json'), JSON.stringify({exchanges:[]}))
    const file = join(root,'content/trends/2026-09-04.json')
    writeFileSync(file,JSON.stringify({indicators:[{...m,label:m.title}]}))
    let calls = 0
    const article = {slug:'report',title:'NASDAQ-100',date:'2026-09-04',lead:'The central bank held its policy rate unchanged.',entityIds:['nasdaq100'],hay:'nasdaq'}
    const options = {root,now:NOW,suppliedArticles:[article],callModel:()=>{ calls++; return {error:'unavailable',elapsedMs:0} }}
    const first = await runMarketSignals(options)
    assert.equal(calls,1)
    assert.equal(first.published[0].commentary,'')
    assert.match(first.published[0].facts,/2.0%/)
    const again = await runMarketSignals(options)
    assert.equal(calls,1)
    assert.equal(again.published[0].revision,first.published[0].revision)
    // Background refresh alone cannot increment editorial revision.
    const payload = JSON.parse(readFileSync(join(root,'content/.market-signals.json'),'utf8'))
    assert.equal(payload.signals.length,1)
    const changed = market([4.5])
    writeFileSync(file,JSON.stringify({indicators:[{...changed,label:changed.title}]}))
    const update = await runMarketSignals(options)
    assert.equal(calls,2)
    assert.notEqual(update.published[0].revision,first.published[0].revision)
    assert.equal(update.published[0].eventId,first.published[0].eventId)
  } finally { rmSync(root,{recursive:true,force:true}) }
})
test('dry run never invokes model or creates output', async () => {
  const root = mkdtempSync(join(tmpdir(),'zuhd-market-dry-'))
  try {
    const result = await runMarketSignals({root,now:NOW,dryRun:true, suppliedArticles:[],callModel:()=>{throw Error('must not run')}})
    assert.deepEqual(result.selected,[])
    assert.throws(()=>readFileSync(join(root,'content/.market-signals.json')))
  } finally { rmSync(root,{recursive:true,force:true}) }
})
