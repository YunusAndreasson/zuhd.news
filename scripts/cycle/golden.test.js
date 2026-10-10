// The orchestrator against its record.
//
//   npm run test:cycle                     run every scenario and compare
//   UPDATE_GOLDENS=1 npm run test:cycle    record what the orchestrator does now
//
// Not in `npm test`: it runs a whole cycle for each scenario, on the runner and
// again on the shell script it replaced, about three minutes in all, and needs
// root and `unshare` to build its sandbox. `lib/cycle-harness.test.js` is in
// `npm test`, and fails when the orchestrator has changed since these were
// recorded.
//
// A recording is a claim about behaviour, so read the diff before keeping it:
// a refactor changes none of them, and a deliberate change changes only the
// scenarios it is about.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { runWithConcurrency } from '../lib/concurrency.js'
import { RECORDED, canSandbox, renderCycle, runCycle } from '../lib/cycle-harness.js'
import { FULL, SCENARIOS } from '../lib/cycle-scenarios.js'
import { ROOT } from '../lib/paths.js'

const DIR = join(ROOT, 'scripts', 'lib', 'fixtures', 'cycle')
const update = process.env.UPDATE_GOLDENS === '1'

/**
 * Every scenario, run on one orchestrator.
 *
 * @param {string} [script] the file started as `scripts/run-cycle.sh`; that file itself when absent
 */
async function everyScenario(script) {
  /** @type {Map<string, string>} */
  const did = new Map()
  await runWithConcurrency(Object.keys(SCENARIOS), 4, async (name) => {
    did.set(name, renderCycle(await runCycle(SCENARIOS[name], script ? { script } : {}), { full: FULL.includes(name) }))
  })
  return did
}

test('in every scenario the orchestrator does what it is recorded as doing', { skip: !canSandbox() && 'needs root and unshare' }, async (t) => {
  const did = await everyScenario()

  if (update) {
    mkdirSync(DIR, { recursive: true })
    for (const [name, text] of did) writeFileSync(join(DIR, `${name}.txt`), text)
    writeFileSync(join(DIR, 'RECORDED_FROM'), RECORDED.map((f) => `${createHash('sha1').update(readFileSync(join(ROOT, f))).digest('hex')}  ${f}\n`).join(''))
  }

  for (const name of Object.keys(SCENARIOS)) {
    await t.test(name, () => {
      assert.equal(did.get(name), readFileSync(join(DIR, `${name}.txt`), 'utf-8'))
    })
  }
})

// The shell script the runner replaced, for as long as it is kept: the wrapper
// hands the cycle back to it when a file named `.cycle-legacy` exists. It is
// held to the same recordings, and never recorded from.
const LEGACY = join(ROOT, 'scripts', 'run-cycle.legacy.sh')
test('and the shell script it replaced still does the same', { skip: (!canSandbox() && 'needs root and unshare') || (!existsSync(LEGACY) && 'the legacy script is gone') }, async (t) => {
  const did = await everyScenario(LEGACY)
  for (const name of Object.keys(SCENARIOS)) {
    await t.test(name, () => {
      assert.equal(did.get(name), readFileSync(join(DIR, `${name}.txt`), 'utf-8'))
    })
  }
})
