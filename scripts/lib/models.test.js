// Run: node --test scripts/lib/models.test.js
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { HAIKU, MODEL_USES, OPUS, SONNET, modelFor } from './models.js'
import { ROOT } from './paths.js'

test('a model is pinned by its full id, never by an alias', () => {
  for (const id of [OPUS, SONNET, HAIKU]) assert.match(id, /^claude-(opus|sonnet|haiku)-\d+(-\d+)?$/)
})

// Which family a use gets is the decision; the version is the three constants.
test('each use has the family it was given', () => {
  const none = {}
  const family = Object.fromEntries(MODEL_USES.map((use) => [use, modelFor(use, none)]))
  assert.deepEqual(family, {
    selector: OPUS,
    session: SONNET,
    tuner: OPUS,
    socialPick: SONNET,
    briefing: OPUS,
    dispatch: OPUS,
    events: OPUS,
    gdacs: OPUS,
    swedish: SONNET,
    polymarketTitles: SONNET,
    eduContext: SONNET,
    offline: OPUS,
    haiku: HAIKU,
  })
})

test('a use is overridden by its own variable, and an empty one is not an override', () => {
  assert.equal(modelFor('selector', { ZUHD_SELECTOR_MODEL: 'x' }), 'x')
  assert.equal(modelFor('selector', { ZUHD_MODEL: 'x' }), OPUS, 'the writer\'s model is not the selector\'s')
  assert.equal(modelFor('session', { ZUHD_MODEL: 'x' }), 'x')
  assert.equal(modelFor('briefing', { ZUHD_BRIEFING_MODEL: 'x' }), 'x')
  assert.equal(modelFor('dispatch', { ZUHD_DISPATCH_MODEL: 'x' }), 'x')
  assert.equal(modelFor('events', { ZUHD_EVENTS_MODEL: 'x' }), 'x')
  assert.equal(modelFor('swedish', { ZUHD_SV_MODEL: 'x' }), 'x')
  assert.equal(modelFor('polymarketTitles', { PM_TITLE_MODEL: 'x' }), 'x')
  assert.equal(modelFor('session', { ZUHD_MODEL: '' }), SONNET)
  for (const use of /** @type {const} */ (['tuner', 'gdacs', 'eduContext', 'offline', 'haiku'])) {
    assert.equal(modelFor(use, { ZUHD_MODEL: 'x', ZUHD_SELECTOR_MODEL: 'y' }), modelFor(use, {}), `${use} takes no override`)
  }
})

test('the social pick follows its own variable, then the cycle\'s model', () => {
  assert.equal(modelFor('socialPick', { ZUHD_SOCIAL_PICK_MODEL: 'a', ZUHD_MODEL: 'b' }), 'a')
  assert.equal(modelFor('socialPick', { ZUHD_MODEL: 'b' }), 'b')
  assert.equal(modelFor('socialPick', {}), SONNET)
})

// The ids used to be spelled in sixteen files. Comment lines do not count.
test('no script spells a model id of its own', () => {
  const walk = (/** @type {string} */ dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]))
  // Not callers: this file's subject, tests and what tests record, and the
  // shell script, which cannot import and is held to the constants below.
  const exempt = /\.test\.js$|lib\/models\.js$|lib\/fixtures\/|lib\/cycle-scenarios\.js$|run-cycle\.legacy\.sh$/
  const code = (/** @type {string} */ file) => readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|#)/.test(l)).join('\n')
  const spelling = walk(join(ROOT, 'scripts'))
    .filter((f) => /\.(js|mjs|sh)$/.test(f) && !exempt.test(f))
    .filter((f) => /claude-(opus|sonnet|haiku)-\d/.test(code(f)))
    .map((f) => relative(ROOT, f))
  assert.deepEqual(spelling, [], `asks for a model by id instead of by use:\n  ${spelling.join('\n  ')}`)
})

// Bash cannot import a constant. For as long as the shell script the runner
// replaced is kept, its three ids are these.
const LEGACY = join(ROOT, 'scripts', 'run-cycle.legacy.sh')
test('the legacy script names the same three models', { skip: !existsSync(LEGACY) && 'the legacy script is gone' }, () => {
  const script = readFileSync(LEGACY, 'utf8')
  assert.ok(script.includes(`CLAUDE_MODEL="\${ZUHD_MODEL:-${SONNET}}"`), 'the writer and editor default')
  assert.ok(script.includes(`CLAUDE_SELECTOR_MODEL="\${ZUHD_SELECTOR_MODEL:-${OPUS}}"`), 'the selector default')
  assert.ok(script.includes(`--effort medium --model ${OPUS} --allowedTools $TOOLS_TUNE`), 'the tuner')
  const ids = new Set(script.match(/claude-(opus|sonnet|haiku)-[\d-]*\d/g))
  assert.deepEqual([...ids].sort(), [OPUS, SONNET].sort())
})
