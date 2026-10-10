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
    // The third miss ends the event, and an ended event is not kept: nothing
    // reads it again, and it held a whole series for as long as the market traded.
    if (i < 3) assert.equal(repeat.state.nasdaq100.misses, i)
    else assert.equal(repeat.state.nasdaq100, undefined)
    state = repeat.state
  }
})
test('a series that goes backwards does not move the signal it already has', () => {
  // `mkt:bist`, published payloads: asOf 2026-10-08 at 18:16 UTC, 2026-10-07 at
  // 22:21, 2026-10-08 again at 05:13. The fetch lost the newest session for a
  // night, the selector read the shorter series as the truth, and the card
  // went a day back and then forward: two revisions for no session at all.
  const m = market(Array(20).fill(0.4), 'bist')
  const first = selectMarketSignals([m], {}, NOW)
  const shorter = { ...m, values: m.values.slice(0, -1), dates: m.dates.slice(0, -1), completed: m.completed.slice(0, -1) }
  assert.ok(detectPatterns(cleanMarket(shorter, NOW)).length > 0, 'the shorter series still qualifies, a session earlier')

  const back = selectMarketSignals([shorter], first.state, NOW)
  assert.equal(back.selected[0].asOf, m.dates.at(-1), 'the session already read stands')
  assert.deepEqual(back.selected[0], first.selected[0])
  assert.deepEqual(back.state, first.state, 'nothing is learnt from a series that lost a day')
  assert.deepEqual(back.reports.find((r) => r.id === 'bist'), { id: 'bist', reason: 'series regressed', asOf: shorter.dates.at(-1), lastDate: m.dates.at(-1) })

  // The session returns, and it is the same event at the same reading.
  const returned = selectMarketSignals([m], back.state, NOW)
  assert.equal(returned.selected[0].eventId, first.selected[0].eventId)
  assert.equal(returned.selected[0].pattern.changePct, first.selected[0].pattern.changePct)
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
test('a reported forecast is not a forecast: the rule is for the commentary looking ahead itself', () => {
  // The article offered for Istanbul's slide, and its lead. The old rule was
  // `/will |could |may |buy |sell |forecast|price target/i`, so repeating the
  // fact this article reports was itself the offence.
  const ankara = {
    slug: '2026-09-13-ankara-writes-the-war-into-the-forecast',
    title: 'Ankara Cuts Growth Forecast',
    date: '2026-09-13',
    lead: 'Ankara — Turkey revised its medium-term growth forecast downward.',
  }
  const bundle = {
    instrument: { index: 'BIST 100', exchange: 'Borsa İstanbul', country: 'TR' },
    facts: 'BIST 100 fell 14.1% over 20 sessions (2026-09-08 to 2026-10-06), and 16.4% to 2026-10-07.',
    coverage: [ankara],
  }
  const evidence = [{ slug: ankara.slug, quote: 'Turkey revised its medium-term growth forecast downward' }]
  const verdict = (recent) => {
    const reasons = []
    return validateMarketComment({ recent, evidence }, bundle, reasons) ? 'kept' : reasons[0]
  }

  // Two of the sentences this rule refused, from cycle-2026-10-07_2204.log and
  // cycle-2026-10-08_0501.log, as far as the log kept them and closed there.
  assert.equal(verdict('Turkish stocks on Borsa İstanbul lost 14.1% over 20 sessions to 6 October. Early in that stretch Ankara revised its medium-term growth forecast downward.'), 'kept')
  assert.equal(verdict('Turkish stocks on Borsa İstanbul fell 16.4% over 20 sessions to 2026-10-07. Early in that stretch, Ankara revised its medium-term growth forecast downward.'), 'kept')
  // What the substrings also caught: a month, two ordinary words, a reported sale.
  assert.equal(verdict('The slide ran from 8 May to 6 October.'), 'kept')
  assert.equal(verdict('The central bank moved to sell dollars, a goodwill gesture met with dismay.'), 'kept')

  // The commentary's own look ahead and its advice are refused as before, and
  // the reason says which words.
  assert.equal(verdict('Turkish stocks could fall further after the cut.'), 'forecasts or advises ("could")')
  assert.equal(verdict('The index will recover.'), 'forecasts or advises ("will")')
  assert.equal(verdict('The lira may weaken.'), 'forecasts or advises ("may")')
  assert.equal(verdict('Shares might slide again.'), 'forecasts or advises ("might")')
  assert.equal(verdict('The index is expected to fall.'), 'forecasts or advises ("is expected to")')
  assert.equal(verdict('Brokers raised their price target.'), 'forecasts or advises ("price target")')
  assert.equal(verdict('Investors should buy the dip.'), 'forecasts or advises ("should buy")')
})
test('fallback contains computed dates and not invented news', () => {
  const s = selectMarketSignals([market([2])],{},NOW).selected[0]
  assert.match(factualSummary(s), /2.0%/)
  assert.ok(factualSummary(s).includes(s.pattern.startDate))
})

test('pipeline writes factual fallback when the model has nothing to say, and reuses an unchanged revision', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zuhd-market-test-'))
  try {
    mkdirSync(join(root,'content/trends'), {recursive:true})
    const m = market([2])
    writeFileSync(join(root,'content/.markets.json'), JSON.stringify({exchanges:[]}))
    const file = join(root,'content/trends/2026-09-04.json')
    writeFileSync(file,JSON.stringify({indicators:[{...m,label:m.title}]}))
    let calls = 0
    const article = {slug:'report',title:'NASDAQ-100',date:'2026-09-04',lead:'The central bank held its policy rate unchanged.',entityIds:['nasdaq100'],hay:'nasdaq'}
    // An answer, and the one the prompt asks for when the news supports nothing.
    const options = {root,now:NOW,suppliedArticles:[article],callModel:()=>{ calls++; return {elapsedMs:0,out:{recent:'',evidence:[]}} }}
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

/** A root holding one index's series, the story about it, and a model that explains it. */
function oneSignal() {
  const root = mkdtempSync(join(tmpdir(), 'zuhd-market-asked-'))
  mkdirSync(join(root, 'content/trends'), { recursive: true })
  writeFileSync(join(root, 'content/.markets.json'), JSON.stringify({ exchanges: [] }))
  const article = { slug: 'report', title: 'NASDAQ-100', date: '2026-09-04', lead: 'The central bank held its policy rate unchanged.', entityIds: ['nasdaq100'], hay: 'nasdaq' }
  const answer = { elapsedMs: 0, out: { recent: article.lead, evidence: [{ slug: 'report', quote: article.lead }] } }
  /** Write the series, `days` sessions on from the fixture's. */
  const publish = (days = 0) => {
    const m = market([2])
    const dates = m.dates.map((d) => new Date(Date.parse(d) + days * DAY).toISOString().slice(0, 10))
    writeFileSync(join(root, 'content/trends/2026-09-04.json'), JSON.stringify({ indicators: [{ ...m, dates, label: m.title }] }))
  }
  publish()
  return { root, article, answer, publish }
}

test('a model that could not be reached is asked again, and its silence is not kept as an answer', async () => {
  // A failed call used to be stored like a refusal: this window's coverage
  // hash and no comment. One cycle with the CLI down, and the card had no
  // explanation until a new article happened to change the hash.
  const { root, article, answer } = oneSignal()
  try {
    let calls = 0
    let up = false
    const options = { root, now: NOW, suppliedArticles: [article], callModel: () => { calls++; return up ? answer : { error: 'claude exit 1: unavailable', elapsedMs: 0 } } }
    const down = await runMarketSignals(options)
    assert.equal(down.published[0].commentary, '')
    const stillDown = await runMarketSignals(options)
    assert.equal(calls, 2, 'asked again')
    assert.equal(stillDown.published[0].revision, down.published[0].revision, 'and a failure is no revision')
    up = true
    const back = await runMarketSignals(options)
    assert.equal(calls, 3)
    assert.equal(back.published[0].commentary, article.lead)
    assert.notEqual(back.published[0].revision, down.published[0].revision)
    const settled = await runMarketSignals(options)
    assert.equal(calls, 3, 'an answer is kept')
    assert.equal(settled.published[0].commentary, article.lead)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a comment whose window has moved on is asked for again, not dropped', async () => {
  // A comment is shown only on the window it was written for, and the window
  // moves with every session. Six published payloads lost theirs that way
  // (`mkt:b3` on 2026-09-10, 14, 17 and 18, `mkt:idx`, `mkt:twse`): same
  // event, same kind, same coverage, so nothing asked, and nothing shown.
  const { root, article, answer, publish } = oneSignal()
  try {
    let calls = 0
    const callModel = () => { calls++; return answer }
    const first = await runMarketSignals({ root, now: NOW, suppliedArticles: [article], callModel })
    assert.equal(first.published[0].commentary, article.lead)
    publish(1)
    const next = await runMarketSignals({ root, now: NOW + DAY, suppliedArticles: [article], callModel })
    assert.notEqual(next.published[0].pattern.endDate, first.published[0].pattern.endDate, 'the window moved a session')
    assert.equal(next.published[0].eventId, first.published[0].eventId, 'and nothing else did')
    assert.equal(calls, 2)
    assert.equal(next.published[0].commentary, article.lead)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a signal with nothing to say is not asked again each session', async () => {
  // The other half of the rule above: only a comment that is showing makes
  // its window's move a reason to ask.
  const { root, article, publish } = oneSignal()
  try {
    let calls = 0
    const callModel = () => { calls++; return { elapsedMs: 0, out: { recent: '', evidence: [] } } }
    await runMarketSignals({ root, now: NOW, suppliedArticles: [article], callModel })
    publish(1)
    const next = await runMarketSignals({ root, now: NOW + DAY, suppliedArticles: [article], callModel })
    assert.equal(calls, 1)
    assert.equal(next.published[0].commentary, '')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('an exchange signal carries who the index belongs to, with or without a comment', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zuhd-market-identity-'))
  try {
    mkdirSync(join(root,'content/trends'), {recursive:true})
    const m = market([2], 'bist')
    // The exchange payload's own field names, which is what `normalizeMarkets`
    // reads: `indexName` is the ticker on the card, `name` the exchange under it.
    writeFileSync(join(root,'content/.markets.json'), JSON.stringify({exchanges:[{
      id:'bist', name:'Borsa İstanbul', indexName:'BIST 100', city:'Istanbul', iso2:'TR',
      lat:41.0082, lng:28.9784,
      blurb:'Türkiye’s only exchange.', sourceLabel:'Yahoo Finance · IST', topicTags:[],
      series:{values:m.values, dates:m.dates, completed:m.completed},
    }]}))
    writeFileSync(join(root,'content/trends/2026-09-04.json'), JSON.stringify({indicators:[]}))
    writeFileSync(join(root,'content/.indicator-dispatch.json'), JSON.stringify({items:{
      'mkt:bist': {standing:'The 100 largest companies on Borsa İstanbul, Türkiye’s only exchange.'},
    }}))
    // No coverage, so no model call and no commentary — the ordinary day, and
    // the one the card used to render as a bare ticker over an empty paragraph.
    const out = await runMarketSignals({root, now:NOW, suppliedArticles:[],
      callModel:()=>{throw Error('must not run')}})
    const signal = out.published[0]
    assert.equal(signal.title, 'BIST 100')
    assert.equal(signal.exchange, 'Borsa İstanbul')
    assert.equal(signal.city, 'Istanbul')
    assert.equal(signal.country, 'TR')
    // Carried from the catalog so the app's globe can place the exchange —
    // 25 of the 30 cities are missing from shared/globe/coordinates.ts, so a
    // client-side city lookup would miss most of them.
    assert.equal(signal.lat, 41.0082)
    assert.equal(signal.lng, 28.9784)
    assert.equal(signal.commentary, '')
    assert.match(signal.standing, /Borsa İstanbul/)
  } finally { rmSync(root,{recursive:true,force:true}) }
})
test('an index with no exchange publishes no coordinates — absent, never 0,0', async () => {
  // The two indices that arrive from the trends feed rather than the exchange
  // catalog have no place. `0, 0` is the Gulf of Guinea, and a mark there
  // would be the app asserting a location the data does not have.
  const root = mkdtempSync(join(tmpdir(), 'zuhd-market-noplace-'))
  try {
    mkdirSync(join(root,'content/trends'), {recursive:true})
    writeFileSync(join(root,'content/.markets.json'), JSON.stringify({exchanges:[]}))
    writeFileSync(join(root,'content/trends/2026-09-04.json'), JSON.stringify({indicators:[market([2])]}))
    writeFileSync(join(root,'content/.indicator-dispatch.json'), JSON.stringify({items:{}}))
    const out = await runMarketSignals({root, now:NOW, suppliedArticles:[],
      callModel:()=>{throw Error('must not run')}})
    // Guard against a vacuous pass: the assertion below means nothing if no
    // signal was published at all.
    assert.equal(out.published.length, 1)
    const signal = out.published[0]
    assert.equal(signal.id, 'nasdaq100')
    assert.equal('lat' in signal, false)
    assert.equal('lng' in signal, false)
  } finally { rmSync(root,{recursive:true,force:true}) }
})

test('an exchange with no dispatch entry falls back to its catalog blurb', () => {
  const [signal] = normalizeMarkets({exchanges:[{id:'tase', name:'Tel Aviv Stock Exchange',
    indexName:'TA-125', city:'Tel Aviv', iso2:'IL', blurb:'Trades Sunday to Thursday.'}]}, {})
  assert.equal(signal.standing, 'Trades Sunday to Thursday.')
  assert.equal(signal.exchange, 'Tel Aviv Stock Exchange')
})
test('an exchange with no story naming it still gets its own country\'s coverage', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zuhd-market-country-'))
  try {
    mkdirSync(join(root,'content/trends'), {recursive:true})
    const m = market([2], 'tase')
    writeFileSync(join(root,'content/.markets.json'), JSON.stringify({exchanges:[{
      id:'tase', name:'Tel Aviv Stock Exchange', indexName:'TA-125', city:'Tel Aviv', iso2:'IL',
      // The real catalog entry: no country and no city among the tags, which is
      // why this exchange drew 0 articles from a 327-story window while every
      // other one matched on its city.
      topicTags:['tel aviv stock exchange','ta-125','tase'], countryTags:['IL'],
      sourceLabel:'Yahoo Finance · TLV', series:{values:m.values, dates:m.dates, completed:m.completed},
    }]}))
    writeFileSync(join(root,'content/trends/2026-09-04.json'), JSON.stringify({indicators:[]}))
    // Names the index nowhere; links the country in its body, as ~half the corpus does.
    const article = {slug:'gaza-evac', title:'Medical evacuation', date:'2026-09-04',
      lead:'Permission to leave became the constraint, following the closure of the crossing.',
      entityIds:[], hay:'medical evacuation gaza', countries:['IL']}
    let seen = null
    await runMarketSignals({root, now:NOW, suppliedArticles:[article],
      callModel:(p)=>{ seen = p; return {error:'unavailable', elapsedMs:0} }})
    assert.ok(seen, 'the model was never called — the country arm did not fire')
    assert.match(seen, /gaza-evac/)
    // The cap is `RECENT_CAP` now, spelled into the prompt: the text is the same.
    assert.match(seen, /^Write at most 360 characters of plain-language context for this observed stock-index pattern\.\n/)
  } finally { rmSync(root,{recursive:true,force:true}) }
})
test('a rejected comment says why, instead of looking like a quiet day', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zuhd-market-reasons-'))
  try {
    mkdirSync(join(root,'content/trends'), {recursive:true})
    const m = market([2])
    writeFileSync(join(root,'content/.markets.json'), JSON.stringify({exchanges:[]}))
    writeFileSync(join(root,'content/trends/2026-09-04.json'), JSON.stringify({indicators:[{...m,label:m.title}]}))
    const article = {slug:'report', title:'NASDAQ-100', date:'2026-09-04',
      lead:'The central bank held its policy rate unchanged after a long debate.',
      entityIds:['nasdaq100'], hay:'nasdaq', countries:[]}
    const reasons = []
    const validateWith = (out) => { const r = []; validateMarketComment(out, {coverage:[article]}, r); return r[0] }
    // Each rejection now names itself rather than all returning a bare null.
    assert.match(validateWith({recent:'', evidence:[]}), /missing, empty or over 360/)
    assert.match(validateWith({recent:'The index moved this week.', evidence:[]}), /evidence missing/)
    assert.match(validateWith({recent:'The index moved.', evidence:[{slug:'nope', quote:article.lead}]}), /not offered/)
    assert.match(validateWith({recent:'The index moved.', evidence:[{slug:'report', quote:'too short'}]}), /under 20 chars/)
    assert.match(validateWith({recent:'It rose because of the bank.', evidence:[{slug:'report', quote:'The central bank held its policy rate unchanged'}]}), /asserts a cause/)
    assert.match(validateWith({recent:'The index will rise.', evidence:[{slug:'report', quote:'The central bank held its policy rate unchanged'}]}), /forecasts/)
    // And the stage surfaces them rather than swallowing the model's failure.
    const out = await runMarketSignals({root, now:NOW, suppliedArticles:[article],
      callModel:()=>({error:'claude exit 1: timeout', elapsedMs:0})})
    assert.ok(out.published.length === 1)
    void reasons
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
