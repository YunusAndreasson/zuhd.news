// The app line, and the fact that it stops.
//
// The whole justification for putting an install prompt on a reading surface
// is that it is bounded — it waits until the site has been used, it appears a
// handful of times, and it goes away for good the moment the reader either
// takes it or has clearly declined it. An unbounded version of the same line is
// just an ad in the middle of a story, and the difference between the two is
// three counters that nothing else checks.
//
// Bounds are also the sort of thing that breaks silently. A prompt that fires
// on the first open, or on every card forever, looks exactly like a working one
// to whoever changed it — the failure is only visible to a reader four cards
// in, which is nobody during development.
//
// `_app-prompt.ts` is DOM-and-localStorage only, so it is bundled and driven
// against jsdom the way `_map/sheet.ts` is.

import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = new URL('../..', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'zuhd-app-prompt-'))
const bundlePath = join(dir, 'app-prompt.mjs')

await build({
  entryPoints: [join(ROOT, 'public/islands/_app-prompt.ts')],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
  alias: { '@shared': join(ROOT, 'shared') },
})
process.on('exit', () => rmSync(dir, { recursive: true, force: true }))

/** A fresh document and a fresh, empty localStorage for each case. */
async function freshModule({ storage = 'working' } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://zuhd.news/',
  })
  if (storage === 'broken') {
    // Safari private mode and a blocked-cookies profile both throw here rather
    // than returning null. The prompt must degrade to silence, not to an
    // exception thrown in the middle of rendering a story card.
    Object.defineProperty(dom.window, 'localStorage', {
      configurable: true,
      get() {
        throw new dom.window.DOMException('denied', 'SecurityError')
      },
    })
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.localStorage = storage === 'broken' ? undefined : dom.window.localStorage
  if (storage === 'broken') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new dom.window.DOMException('denied', 'SecurityError')
      },
    })
  }
  // Cache-bust so each case gets module state as clean as its storage.
  return import(`${bundlePath}?case=${Math.random().toString(36).slice(2)}`)
}

test('the app line says nothing until the site has actually been used', async () => {
  const { appPrompt } = await freshModule()
  for (let i = 1; i < 4; i++) {
    assert.equal(appPrompt(), null, `prompted on open ${i}, before the site had been read`)
  }
  const first = appPrompt()
  assert.ok(first, 'never prompted, even after four opens')
  assert.match(first.textContent, /notification/i, 'the line does not say what the app gives you')
})

test('the app line stops asking', async () => {
  const { appPrompt } = await freshModule()
  let shown = 0
  // Well past any reasonable session. If this loop keeps producing a node, the
  // line is chrome rather than a suggestion.
  for (let i = 0; i < 60; i++) if (appPrompt()) shown++
  assert.ok(shown > 0, 'the line never appeared at all')
  assert.ok(shown <= 3, `the line appeared ${shown} times; the ceiling is 3`)
  assert.equal(appPrompt(), null, 'the line came back after it was done')
})

test('following the line answers it, and it never asks again', async () => {
  const { appPrompt } = await freshModule()
  let node = null
  for (let i = 0; i < 10 && !node; i++) node = appPrompt()
  assert.ok(node, 'the line never appeared')

  const link = node.querySelector('a')
  assert.ok(link, 'the line offers no way to act on it')
  assert.match(link.href, /apps\.apple\.com|play\.google\.com/, 'the link does not go to a store')
  link.dispatchEvent(new window.Event('click'))

  for (let i = 0; i < 10; i++) {
    assert.equal(appPrompt(), null, 'asked again after the reader had already followed it')
  }
})

test('a reader whose storage is blocked is never prompted, and never crashes', async () => {
  const { appPrompt, countOpen } = await freshModule({ storage: 'broken' })
  // Without storage there is no way to know whether this is the first open or
  // the fortieth, and guessing wrong means prompting a first-time visitor.
  for (let i = 0; i < 20; i++) {
    assert.doesNotThrow(() => countOpen())
    assert.equal(appPrompt(), null)
  }
})
