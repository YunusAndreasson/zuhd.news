// Run: node --test scripts/lib/cycle-run.test.js
//
// What the engine and the list can be asked without running a cycle. That the
// runner does what the shell script did is `npm run test:cycle`, which runs
// both against the same recordings.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { STAGES } from '../cycle/stages.js'
import { captured, kindOf, lineCount, pathspec, plan, runStage, when } from './cycle-run.js'
import { lineArgv, sessionArgv } from './cycle-steps.js'
import { DATASETS } from './datasets.js'
import { ROOT } from './paths.js'

test('a moment is written in the forms the script took from date', () => {
  const evening = new Date('2026-10-08T18:04:59Z')
  assert.equal(when.stamp(evening), '2026-10-08_1804')
  assert.equal(when.iso(evening), '2026-10-08T18:04:59Z')
  assert.equal(when.minute(evening), '2026-10-08T18:04')
  assert.equal(when.spoken(evening), '2026-10-08 18:04 UTC')
  assert.equal(when.day(evening), '2026-10-08')
  assert.equal(when.hour(evening), '18')
  assert.equal(when.hour(new Date('2026-10-09T05:01:27Z')), '05', 'the hour keeps its zero')
  assert.equal(when.weekday(evening), '4')
  assert.equal(when.weekday(new Date('2026-10-11T22:03:05Z')), '7', 'Sunday is 7, not 0')
})

// `lib/cycle-log.js` reads the Started and Finished lines in this form.
test('the bare form is date\'s own, twelve-hour and space-padded', () => {
  assert.equal(when.bare(new Date('2026-10-08T18:04:59Z')), 'Thu Oct  8 06:04:59 PM UTC 2026')
  assert.equal(when.bare(new Date('2026-10-11T00:00:00Z')), 'Sun Oct 11 12:00:00 AM UTC 2026')
  assert.equal(when.bare(new Date('2026-01-01T12:30:05Z')), 'Thu Jan  1 12:30:05 PM UTC 2026')
})

test('what a command printed is read as the shell read it', () => {
  assert.equal(captured('13 multi + 47 niche\n'), '13 multi + 47 niche')
  assert.equal(captured('a\n\nb\n\n\n'), 'a\n\nb')
  assert.equal(captured(''), '')
  assert.equal(lineCount('a\nb\nc'), 3)
  assert.equal(lineCount('a'), 1)
})

test('a dataset is named to git by its path, a directory with its slash', () => {
  assert.equal(pathspec('articles'), 'content/articles/')
  assert.equal(pathspec('audio'), 'content/audio/')
  assert.equal(pathspec('lastCycle'), 'content/.last-cycle.json')
  assert.equal(pathspec('dailyAuditNotes'), 'content/.daily-audit.md')
})

test('the hour and the weekday decide which cycle it is', () => {
  assert.deepEqual(kindOf('05', '4'), { daily: true, 'not-daily': false, tuning: false, weekly: false })
  assert.deepEqual(kindOf('18', '4'), { daily: false, 'not-daily': true, tuning: false, weekly: false })
  assert.deepEqual(kindOf('22', '4'), { daily: false, 'not-daily': true, tuning: true, weekly: false })
  assert.deepEqual(kindOf('22', '7'), { daily: false, 'not-daily': true, tuning: true, weekly: true })
  assert.deepEqual(kindOf('07', '7'), { daily: false, 'not-daily': true, tuning: false, weekly: false }, 'a catch-up run at an hour the schedule does not know')
})

// ── The list ─────────────────────────────────────────────────────────

test('every stage has a name of its own', () => {
  const ids = STAGES.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const s of STAGES) assert.ok(s.run || s.command, `${s.id} runs nothing`)
})

// The recordings are made with a stand-in for `node`: a script named here that
// does not exist would pass every one of them and fail in the first real cycle.
test('every script the cycle starts is a file that is there', () => {
  const inList = STAGES.flatMap((s) => s.command ?? []).filter((a) => a.startsWith('scripts/'))
  const inSteps = readFileSync(join(ROOT, 'scripts', 'lib', 'cycle-steps.js'), 'utf8').match(/'scripts\/[\w/-]+\.js'/g)?.map((a) => a.slice(1, -1)) ?? []
  const inEngine = ['scripts/build.js', 'scripts/cycle/alert.js', 'scripts/cycle/record.js']
  assert.ok(inList.length > 25 && inSteps.length > 10, 'the list or the steps were not read')
  for (const script of new Set([...inList, ...inSteps, ...inEngine])) assert.ok(existsSync(join(ROOT, script)), `${script} is not there`)
})

test('what a stage commits is in the catalog', () => {
  for (const s of STAGES) for (const name of s.commit?.datasets ?? []) assert.ok(name in DATASETS, `${s.id}: no dataset named ${name}`)
})

// While both exist, the list and the script it replaced start the same
// scripts. The recordings prove the order and the arguments; this is the list
// of names, which a recording made on one path of the cycle does not cover.
const LEGACY = join(ROOT, 'scripts', 'run-cycle.legacy.sh')
test('the list starts every script the shell script started, and no other', { skip: !existsSync(LEGACY) && 'the legacy script is gone' }, () => {
  const script = readFileSync(LEGACY, 'utf8')
  const code = script.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  const inScript = new Set(code.match(/(?<=node (?:"\$SCRIPT_DIR\/|scripts\/))[\w/-]+\.js/g)?.map((n) => `scripts/${n}`))
  const steps = readFileSync(join(ROOT, 'scripts', 'lib', 'cycle-steps.js'), 'utf8').match(/'scripts\/[\w/-]+\.js'/g)?.map((a) => a.slice(1, -1)) ?? []
  const inRunner = new Set([...STAGES.flatMap((s) => s.command ?? []).filter((a) => a.startsWith('scripts/')), ...steps, 'scripts/build.js', 'scripts/cycle/alert.js', 'scripts/cycle/record.js'])
  assert.deepEqual([...inRunner].sort(), [...inScript].sort())
})

test('a plan names what a cycle at an hour would run', () => {
  const regular = plan(STAGES, '18', '4')
  assert.match(regular, /^A cycle starting 18:00 UTC on weekday 4:\n/)
  assert.match(regular, /\n {2}3\.4 {4}fetch-trends {13}180s {3}if articles {2}node scripts\/fetch-trends\.js\n/)
  assert.ok(regular.includes('narrate-indicators-new') && !regular.includes('briefing') && !regular.includes('tuning') && !regular.includes('measure-quality'))
  const daily = plan(STAGES, '05', '5')
  assert.ok(daily.includes('with the daily jobs') && daily.includes('narrate-events') && daily.includes('briefing') && !daily.includes('narrate-indicators-new'))
  const sunday = plan(STAGES, '22', '7')
  assert.ok(sunday.includes('with the tuning and the weekly scan') && sunday.includes('measure-quality') && sunday.includes('tuning'))
})

// ── One stage ────────────────────────────────────────────────────────

/** A cycle that writes down what it is asked to do. @param {Record<string, any>} [state] */
function fake(state = {}, hour = '18', exit = 0) {
  /** @type {string[]} */
  const did = []
  let t = 0
  const cycle = {
    did,
    state,
    startHour: hour,
    clock: () => new Date('2026-10-08T18:04:59Z'),
    timer: () => () => ++t * 10,
    say: (/** @type {string} */ line = '') => did.push(`say ${line}`),
    header: (/** @type {string} */ h) => did.push(`header ${h}`),
    run: async (/** @type {string[]} */ argv, /** @type {any} */ opts) => {
      did.push(`run ${argv.join(' ')} [${opts?.route ?? 'tee'}]`)
      return exit
    },
    commitOnly: async (/** @type {string} */ message, /** @type {string[]} */ datasets) => did.push(`commit "${message}" ${datasets.join(',')}`),
  }
  return /** @type {any} */ (cycle)
}

test('a stage is its header, its command under a deadline, and what the log says of it', async () => {
  const cycle = fake({ articles: 'a.md' })
  await runStage(cycle, { id: 'fetch-trends', number: '3.4', title: 'Trends fetch', needs: 'articles', command: ['node', 'scripts/fetch-trends.js'], timeout: 180, route: 'log', exit: 'Trends', timed: true })
  assert.deepEqual(cycle.did, ['header Stage 3.4: Trends fetch', 'run timeout 180 node scripts/fetch-trends.js [log]', 'say Trends exit: 0 — 10s'])
})

test('a failure is a line in the log, before the exit line, and the stage still commits', async () => {
  const cycle = fake({}, '18', 1)
  await runStage(cycle, {
    id: 'x', command: ['node', 'scripts/x.js'], warning: 'WARNING: x failed', exit: 'X', took: 'X took',
    before: (c) => /** @type {any} */ (c).did.push('before'), after: (c) => /** @type {any} */ (c).did.push('after'),
    commit: { message: 'X', datasets: ['rvsTrend'] },
  })
  assert.deepEqual(cycle.did, ['before', 'run node scripts/x.js [tee]', 'say WARNING: x failed', 'say X exit: 1', 'say X took — 10s', 'commit "X 2026-10-08T18:04" rvsTrend', 'after'])
})

test('a stage for another kind of cycle is passed over, with a header when it has one to say so', async () => {
  const cycle = fake()
  await runStage(cycle, { id: 'briefing', on: 'daily', number: '4', title: 'Audio briefing', run: () => assert.fail('ran'), skipped: (c) => `skipped — ${c.startHour}:xx UTC` })
  await runStage(cycle, { id: 'fetch-analytics', on: 'daily', number: '3.9', title: 'Analytics fetch', command: ['node', 'x'] })
  assert.deepEqual(cycle.did, ['header Stage 4: Audio briefing (skipped — 18:xx UTC)'])
  const daily = fake({}, '05')
  await runStage(daily, { id: 'narrate-indicators-new', on: 'not-daily', command: ['node', 'x'] })
  assert.deepEqual(daily.did, [])
})

test('a stage whose need is not met is passed over in silence', async () => {
  /** @param {Record<string, any>} state @param {'articles' | 'built' | 'deployed'} needs */
  const ran = async (state, needs) => {
    const cycle = fake(state)
    await runStage(cycle, { id: 'x', number: '9', title: 'X', needs, command: ['node', 'x'] })
    return cycle.did.length > 0
  }
  assert.equal(await ran({}, 'articles'), false)
  assert.equal(await ran({ articles: 'a.md' }, 'articles'), true)
  assert.equal(await ran({ articles: 'a.md' }, 'built'), false)
  assert.equal(await ran({ articles: 'a.md', buildExit: 1 }, 'built'), false)
  assert.equal(await ran({ articles: 'a.md', buildExit: 0 }, 'built'), true)
  assert.equal(await ran({ articles: 'a.md', buildExit: 0 }, 'deployed'), false)
  assert.equal(await ran({ articles: 'a.md', buildExit: 0, deployExit: 1 }, 'deployed'), false)
  assert.equal(await ran({ articles: 'a.md', buildExit: 0, deployExit: 0 }, 'deployed'), true)
  assert.equal(await ran({ buildExit: 0, deployExit: 0 }, 'deployed'), false, 'a build left over means nothing without articles')
})

// ── Sessions ─────────────────────────────────────────────────────────

test('a session is started with the flags the script gave it, in its order', () => {
  assert.deepEqual(sessionArgv({ timeout: 1200, effort: 'medium', model: 'opus', fallback: 'sonnet', tools: 'Read,Write,Glob,Grep', turns: 35, prompt: 'P' }), [
    'timeout', '1200', 'claude', '--no-session-persistence', '--setting-sources', 'project', '--disable-slash-commands', '--strict-mcp-config',
    '--effort', 'medium', '--model', 'opus', '--fallback-model', 'sonnet', '--allowedTools', 'Read,Write,Glob,Grep',
    '--max-turns', '35', '--exclude-dynamic-system-prompt-sections', '-p', 'P',
  ])
  assert.deepEqual(sessionArgv({ timeout: 1800, effort: 'low', model: 'sonnet', tools: 'Read,Edit,Glob,Grep', tmp: true, turns: 50, prompt: 'P' }).slice(8), [
    '--effort', 'low', '--model', 'sonnet', '--allowedTools', 'Read,Edit,Glob,Grep', '--add-dir', '/tmp', '--max-turns', '50', '--exclude-dynamic-system-prompt-sections', '-p', 'P',
  ])
  assert.deepEqual(lineArgv('sonnet', 'P').slice(8), ['--model', 'sonnet', '--effort', 'medium', '--tools', '', '-p', 'P'])
})

// ── The entry script ─────────────────────────────────────────────────

test('run.js prints a plan and runs nothing', () => {
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts/cycle/run.js'), '--plan', '--at', '5', '--dow', '1'], { encoding: 'utf8' })
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /^A cycle starting 05:00 UTC on weekday 1, with the daily jobs:\n/)
})

// Safe to start here: without the wrapper's descriptor it stops before it does
// anything, whether or not a cycle is running on this machine.
test('run.js refuses to run a cycle it was not started for', () => {
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts/cycle/run.js')], { encoding: 'utf8' })
  assert.equal(res.status, 2)
  assert.equal(res.stdout, '')
  assert.match(res.stderr, /not started under the cycle lock/)
})
