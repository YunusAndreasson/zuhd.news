// Run: node --test scripts/lib/stage-budget.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STAGES } from '../cycle/stages.js'
import { STAGE_TIMEOUT_SECONDS, stageBudget } from './stage-budget.js'

// A fetcher's budget is cut from its stage's deadline, and the deadline is the
// stage list's to set. If a stage is re-timed there and not here, the fetcher
// either gives up with time in hand or is killed with a budget unspent, and
// neither says so.
test("each budget is its stage's own deadline, as the stage list has it", () => {
  for (const [id, seconds] of Object.entries(STAGE_TIMEOUT_SECONDS)) {
    const stage = STAGES.find((s) => s.id === id)
    assert.ok(stage, `${id} is not a stage`)
    assert.deepEqual(stage.command, ['node', `scripts/${id}.js`])
    assert.equal(stage.timeout, seconds, `${id} runs under timeout ${stage.timeout}`)
  }
})

test('the signal fires before the deadline, by what is kept back', async () => {
  const total = STAGE_TIMEOUT_SECONDS['fetch-analytics'] * 1000
  const signal = stageBudget('fetch-analytics', { keptBack: total - 30 })
  assert.equal(signal.aborted, false)
  await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
  assert.equal(signal.aborted, true)
  // What a request cut by it says, which is what a fetcher's log will carry.
  assert.equal(signal.reason.name, 'TimeoutError')

  assert.equal(stageBudget('fetch-ipc').aborted, false)
  assert.throws(() => stageBudget(/** @type {any} */ ('fetch-nothing')), /no stage named/)
})
