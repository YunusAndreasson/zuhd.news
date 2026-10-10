// Run: node --test scripts/lib/concurrency.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSettled, runWithConcurrency } from './concurrency.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('results come back in the order of the items, whatever order they finished in', async () => {
  // The first item is the slowest, as a cyclone's three requests are beside an
  // earthquake's one. Its result still comes first.
  const finished = []
  const { values, errors, failed, firstError } = await runSettled([30, 1, 15, 5], 4, async (ms, index) => {
    await sleep(ms)
    finished.push(index)
    return `item ${index}`
  })
  assert.deepEqual(finished, [1, 3, 2, 0], 'they did finish out of order')
  assert.deepEqual(values, ['item 0', 'item 1', 'item 2', 'item 3'])
  assert.deepEqual(errors, [undefined, undefined, undefined, undefined])
  assert.equal(failed, 0)
  assert.equal(firstError, null)
})

test('a failure costs its own item, is counted, and the first is the first by position', async () => {
  const { values, errors, failed, firstError } = await runSettled(['a', 'b', 'c', 'd'], 2, async (item) => {
    // `d` fails before `b` does by the clock; `b` is still the first failure.
    if (item === 'b') {
      await sleep(20)
      throw new Error('HTTP 503')
    }
    if (item === 'd') throw new Error('timed out')
    return item.toUpperCase()
  })
  assert.deepEqual(values, ['A', undefined, 'C', undefined])
  assert.equal(failed, 2)
  assert.equal(firstError, 'HTTP 503')
  assert.deepEqual(errors.map((err) => (err instanceof Error ? err.message : err)), [undefined, 'HTTP 503', undefined, 'timed out'])
})

test('every item failing is a count, not a throw', async () => {
  const out = await runSettled([1, 2, 3], 2, () => {
    throw new Error('upstream said: Invalid MAP_KEY.')
  })
  assert.equal(out.failed, 3)
  assert.equal(out.firstError, 'upstream said: Invalid MAP_KEY.')
  assert.deepEqual(await runSettled([], 4, () => assert.fail('nothing to run')), { values: [], errors: [], failed: 0, firstError: null })
})

test('no more than the limit run at once', async () => {
  let running = 0
  let most = 0
  const worker = async () => {
    most = Math.max(most, ++running)
    await sleep(5)
    running--
  }
  await runSettled(Array.from({ length: 12 }), 3, worker)
  assert.equal(most, 3)
  most = 0
  await runWithConcurrency(Array.from({ length: 12 }), 4, worker)
  assert.equal(most, 4)
})
