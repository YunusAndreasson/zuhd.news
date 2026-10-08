// Run: node --test scripts/lib/stage.test.js
//
// Every case runs a stage the way the cycle does, as a script of its own: what
// `runStage` promises is about a process (its streams, its status, the line it
// leaves), and a main guard that is wrong is a stage that silently does
// nothing and exits 0.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runStage } from './stage.js'

const STAGE_LIB = new URL('./stage.js', import.meta.url).href

/**
 * Write `body` as a stage script and run it. `main` is the name the script
 * gives its function; the last line is the one every stage ends with.
 */
function runAsStage(body, { results = true, via = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'zuhd-stage-'))
  try {
    const script = join(dir, 'a-stage.mjs')
    writeFileSync(script, `import { runStage } from '${STAGE_LIB}'\n${body}\nawait runStage(import.meta, 'a-stage', main)\n`)
    const resultPath = join(dir, 'results.jsonl')
    const env = { ...process.env }
    delete env.ZUHD_STAGE_RESULT
    if (results) env.ZUHD_STAGE_RESULT = resultPath
    let entry = script
    if (via) {
      entry = join(dir, 'importer.mjs')
      writeFileSync(entry, via.replace('STAGE', script))
    }
    const res = spawnSync(process.execPath, [entry], { encoding: 'utf-8', env })
    const lines = existsSync(resultPath) ? readFileSync(resultPath, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
    return { status: res.status, stdout: res.stdout, stderr: res.stderr, lines }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a stage leaves one line saying how it went, and prints only what it printed', () => {
  const r = runAsStage(`async function main() { console.log('13 multi + 47 niche'); return { counts: { kept: 60, stale: 4 } } }`)
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '13 multi + 47 niche\n', 'a stdout that is somebody\'s input gains nothing')
  assert.equal(r.stderr, '')
  assert.equal(r.lines.length, 1)
  const [line] = r.lines
  assert.equal(line.stage, 'a-stage')
  assert.equal(line.status, 'ok')
  assert.deepEqual(line.counts, { kept: 60, stale: 4 })
  assert.ok(Number.isFinite(Date.parse(line.at)))
  assert.equal(typeof line.seconds, 'number')
})

test('run by hand, with nowhere to report, it behaves as it always did', () => {
  const r = runAsStage(`function main() { console.log('ok') }`, { results: false })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, 'ok\n')
  assert.deepEqual(r.lines, [])
})

test('a stage that did nothing says why, and that is not a failure', () => {
  const r = runAsStage(`function main() { return { skipped: 'no FIRMS_MAP_KEY' } }`)
  assert.equal(r.status, 0)
  assert.equal(r.lines[0].status, 'skipped')
  assert.equal(r.lines[0].skipped, 'no FIRMS_MAP_KEY')
})

test('a throw is reported and still ends the process the way node ends it', () => {
  const r = runAsStage(`function main() { throw new Error('selection is not JSON') }`)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /Error: selection is not JSON/, 'node prints the error itself, as before')
  assert.equal(r.lines.length, 1)
  assert.equal(r.lines[0].status, 'failed')
  assert.equal(r.lines[0].error, 'selection is not JSON')
})

test('an exit from inside the stage is reported from its status', () => {
  const quiet = runAsStage(`function main() { console.log('nothing to do'); process.exit(0) }`)
  assert.equal(quiet.status, 0)
  assert.equal(quiet.lines.length, 1)
  assert.equal(quiet.lines[0].status, 'ok')

  const failed = runAsStage(`function main() { process.exit(3) }`)
  assert.equal(failed.status, 3)
  assert.equal(failed.lines[0].status, 'failed')
  assert.equal(failed.lines[0].error, 'exit 3')
})

test('imported, a stage does not run', () => {
  const r = runAsStage(`export function main() { console.log('ran'); return {} }`, {
    via: `const stage = await import('STAGE')\nconsole.log(typeof stage.main)\n`,
  })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, 'function\n', 'the importer can reach main, and main did not run by itself')
  assert.deepEqual(r.lines, [])
})

test('called from a module that is not the script, it returns without running', async () => {
  let ran = false
  await runStage({ filename: '/somewhere/else/a-stage.js' }, 'a-stage', () => {
    ran = true
  })
  await runStage({}, 'a-stage', () => {
    ran = true
  })
  assert.equal(ran, false)
})
