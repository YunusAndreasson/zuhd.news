// The document sheet and the browser's history.
//
// The sheet pushes the page's URL, and it lives as long as that entry is
// current. Closing it with a `replaceState` left a second copy of the previous
// URL, so Back did nothing once; Forward after a close showed `/about` in the
// address bar over the map, with no sheet.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { bundleIsland, scratchDir } from './island-bundle.js'

const dir = scratchDir('doc-sheet')
const bundlePath = await bundleIsland(dir, 'public/islands/doc-sheet.ts', 'doc-sheet.mjs')

/**
 * History traversal is queued, in jsdom as in a browser, and `close` queues the
 * traversal in turn. Several short waits, each timed after the last, because one
 * timer set before those are queued can come due with them on a loaded box.
 */
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 5))
}

const setup = async (url = 'https://zuhd.news/') => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url })
  const { window } = dom
  window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  window.HTMLDialogElement.prototype.close = function () {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    queueMicrotask(() => this.dispatchEvent(new window.Event('close')))
  }
  Object.defineProperty(window.HTMLDialogElement.prototype, 'open', {
    configurable: true,
    get() {
      return this.hasAttribute('open')
    },
  })
  for (const k of ['window', 'document', 'history', 'location']) {
    Object.defineProperty(globalThis, k, {
      configurable: true,
      writable: true,
      value: k === 'window' ? window : window[k],
    })
  }
  globalThis.fetch = /** @type {typeof fetch} */ (
    /** @type {unknown} */ (async () => ({ ok: true, json: async () => ({ page: 'about', title: 'About', html: '<p>Prose.</p>' }) }))
  )
  const { mount } = await import(`${bundlePath}?${Math.random()}`)
  const sheet = () => window.document.querySelector('dialog.doc-sheet')
  return { window, mount, sheet, open: () => mount(window.document.createElement('div'), { doc: 'about' }) }
}

test('closing the sheet steps back off its entry and leaves no copy of the map behind', async () => {
  const { window, sheet, open } = await setup()
  const before = window.history.length
  open()
  assert.equal(window.location.pathname, '/about')
  assert.equal(window.history.length, before + 1)

  sheet().close()
  await settle()
  assert.equal(sheet(), null)
  assert.equal(window.location.pathname, '/')
  assert.equal(window.history.state, null, 'on the entry the reader came from, not a rewrite of ours')
  assert.equal(window.history.length, before + 1, 'nothing further was pushed')
})

test('Forward onto a closed sheet’s entry opens it again, and it closes the same way', async () => {
  const { window, sheet, open } = await setup()
  open()
  sheet().close()
  await settle()

  window.history.forward()
  await settle()
  assert.equal(window.location.pathname, '/about')
  assert.ok(sheet()?.open, 'the address bar and the page agree')

  sheet().close()
  await settle()
  assert.equal(window.location.pathname, '/')
  assert.equal(sheet(), null)
})

test('Back closes the sheet without moving history twice, and Forward reopens it', async () => {
  const { window, sheet, open } = await setup('https://zuhd.news/a/story')
  window.history.pushState({}, '', '/')
  open()

  window.history.back()
  await settle()
  assert.equal(sheet(), null)
  assert.equal(window.location.pathname, '/', 'one step, not two')

  window.history.forward()
  await settle()
  assert.ok(sheet()?.open)
  assert.equal(window.location.pathname, '/about')
})

test('an entry a reload left behind is the standalone page, with no sheet to open', async () => {
  // `history.state` outlives a reload, which makes the URL the real page.
  const { window, sheet, open } = await setup('https://zuhd.news/contact')
  window.history.replaceState({ doc: 'contact', by: 1 }, '')
  open()
  assert.equal(window.location.pathname, '/about')
  sheet().close()
  await settle()
  assert.equal(window.location.pathname, '/contact')
  assert.equal(sheet(), null, 'the page behind is already this document')
})
