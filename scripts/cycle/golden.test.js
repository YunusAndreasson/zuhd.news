// The orchestrator against its record.
//
//   npm run test:cycle                     run every scenario and compare
//   UPDATE_GOLDENS=1 npm run test:cycle    record what the script does now
//
// Not in `npm test`: it runs the real `run-cycle.sh` some thirty times, about
// a minute in all, and needs root and `unshare` to build its sandbox.
// `lib/cycle-harness.test.js` is in `npm test`, and fails when the script has
// changed since these were recorded.
//
// A recording is a claim about behaviour, so read the diff before keeping it:
// a refactor changes none of them, and a deliberate change changes only the
// scenarios it is about.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { runWithConcurrency } from '../lib/concurrency.js'
import { canSandbox, renderCycle, runCycle } from '../lib/cycle-harness.js'
import { FULL, SCENARIOS } from '../lib/cycle-scenarios.js'
import { ROOT } from '../lib/paths.js'

const DIR = join(ROOT, 'scripts', 'lib', 'fixtures', 'cycle')
const SCRIPT = join(ROOT, 'scripts', 'run-cycle.sh')
const update = process.env.UPDATE_GOLDENS === '1'

test('in every scenario the orchestrator does what it is recorded as doing', { skip: !canSandbox() && 'needs root and unshare' }, async (t) => {
  /** @type {Map<string, string>} */
  const did = new Map()
  await runWithConcurrency(Object.keys(SCENARIOS), 4, async (name) => {
    did.set(name, renderCycle(await runCycle(SCENARIOS[name]), { full: FULL.includes(name) }))
  })

  if (update) {
    mkdirSync(DIR, { recursive: true })
    for (const [name, text] of did) writeFileSync(join(DIR, `${name}.txt`), text)
    writeFileSync(join(DIR, 'RECORDED_FROM'), `${createHash('sha1').update(readFileSync(SCRIPT)).digest('hex')}  scripts/run-cycle.sh\n`)
  }

  for (const name of Object.keys(SCENARIOS)) {
    await t.test(name, () => {
      assert.equal(did.get(name), readFileSync(join(DIR, `${name}.txt`), 'utf-8'))
    })
  }
})
