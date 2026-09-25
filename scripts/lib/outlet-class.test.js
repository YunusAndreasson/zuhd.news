import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bodyNamesOutlet, outletClass, soleClassifiedSource } from './outlet-class.js'

test('classifies by domain, subdomains included', () => {
  assert.equal(outletClass('https://www.rt.com/news/1/')?.kind, 'state')
  assert.equal(outletClass('https://en.mehrnews.com/news/1')?.kind, 'state')
  assert.equal(outletClass('https://responsiblestatecraft.org/x')?.kind, 'advocacy')
  assert.equal(outletClass('https://www.reuters.com/x'), null)
  assert.equal(outletClass('not a url'), null)
})

test('only labelled when no independent source carries the story', () => {
  assert.equal(soleClassifiedSource([{ url: 'https://tass.com/a' }])?.aliases[0], 'TASS')
  assert.equal(soleClassifiedSource([{ url: 'https://tass.com/a' }, { url: 'https://apnews.com/b' }]), null)
  assert.equal(soleClassifiedSource([]), null)
})

test('body must name the outlet, whole word', () => {
  const rt = outletClass('https://www.rt.com/x')
  assert.ok(bodyNamesOutlet('Brussels — Russian state outlet RT reports the US backs X.', rt))
  assert.ok(!bodyNamesOutlet('Brussels — The start of art.', rt))
  const mehr = outletClass('https://en.mehrnews.com/x')
  assert.ok(bodyNamesOutlet('Gaza — Iran’s state-affiliated Mehr news agency put the toll at 73,914.', mehr))
})

test('both prompts name every classified outlet', async () => {
  // The list lives here and, in prose, in write-prompt.md and check-prompt.md.
  // An outlet added here but not there is one the writer is never told to
  // label and the validator then quarantines every time.
  const { readFileSync } = await import('node:fs')
  const { outletNames } = await import('./outlet-class.js')
  for (const file of ['scripts/write-prompt.md', 'scripts/check-prompt.md']) {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
    for (const name of outletNames()) {
      assert.ok(text.includes(name), `${file} does not name ${name}`)
    }
  }
})
