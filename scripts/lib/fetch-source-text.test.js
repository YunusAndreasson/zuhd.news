import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { fetchSourcePage, fetchSourceText, htmlForReadability, pageText, stripTags } from './fetch-source-text.js'

test('styles and scripts are dropped, the prose survives', () => {
  const prose = 'The ministry said 40 people were displaced by the flooding overnight. '.repeat(8)
  const html = `<html><head><style>${'.a{color:red}'.repeat(50_000)}</style>
    <link rel="stylesheet" href="/x.css"><script>var x = "${'y'.repeat(1000)}"</script></head>
    <body><article><h1>Floods</h1><p style="color:blue">${prose}</p></article></body></html>`
  const cleaned = htmlForReadability(html)
  assert.ok(!/<style|<script|stylesheet|style="/i.test(cleaned))
  const t0 = Date.now()
  const article = new Readability(new JSDOM(cleaned, { url: 'https://example.org/a' }).window.document).parse()
  assert.ok(Date.now() - t0 < 2000)
  assert.match(article?.textContent ?? '', /40 people were displaced/)
})

// --- stripTags: an RSS item's description and content:encoded ---------------
// Shapes from the 10:00 feed of 2026-10-09, which reached the writer as
// "…he finished.Another citizen…" and "…Iran war's costThe Con…".
test('a tag that ends a block leaves a space, so two paragraphs are not one word', () => {
  assert.equal(
    stripTags('<p>“It is done. Hail Satan,” he finished.</p><p>Another citizen, a pastor named Rick, spoke next.</p>'),
    '“It is done. Hail Satan,” he finished. Another citizen, a pastor named Rick, spoke next.',
  )
  assert.equal(stripTags('<h2>Pentagon mum on Iran war’s cost</h2><p>The Congressional Budget Office said so.</p>'), 'Pentagon mum on Iran war’s cost The Congressional Budget Office said so.')
  assert.equal(stripTags('<ul><li>one</li><li>two</li></ul>three<br>four<br />five'), 'one two three four five')
})

test('a tag inside a sentence leaves nothing, so no space stands before a comma', () => {
  assert.equal(
    stripTags('<p>The toll rose to 35, <a href="https://example.org/a">according to Reuters</a>, which <em>first</em> reported it<sup>1</sup>.</p>'),
    'The toll rose to 35, according to Reuters, which first reported it1.',
  )
  // `<pre>` is a block and `<picture>` is not; `<link>` is not `<li>`.
  assert.equal(stripTags('a<pre>b</pre>c<picture>d</picture>e<link rel="x">f'), 'a b cdef')
})

test('the line breaks a feed wrote are kept, and the spaces around them are not', () => {
  assert.equal(stripTags('<p>One.</p>\n<p>Two.</p>\n\n<p>Three.</p>'), 'One.\nTwo.\n\nThree.')
  assert.equal(stripTags('  plain   text\twith  runs  '), 'plain text with runs')
  assert.equal(stripTags(''), '')
})

// --- pageText: one extractor for enrich, the source angles and Hacker News --
const page = (body) => `<html><head><title>t</title><meta property="og:image" content="https://example.org/lead.jpg"></head><body>${body}</body></html>`

test('a page gives its prose, capped', () => {
  const sentence = 'The ministry said 40 people were displaced by the flooding overnight. '
  const text = pageText(page(`<article><h1>Floods</h1>${`<p>${sentence.repeat(6)}</p>`.repeat(12)}</article>`), 'https://example.org/a')
  assert.match(text, /40 people were displaced/)
  assert.equal(text.length, 3500)
})

test('a page that is all teaser stays short, which is what the bar is for', () => {
  const text = pageText(page('<main><p>Subscribe to read the rest of this story.</p></main>'), 'https://example.org/b')
  assert.match(text, /Subscribe to read/)
  assert.ok(text.length < 500)
})

test('no address, no request', async () => {
  assert.equal(await fetchSourcePage(''), null)
  assert.equal(await fetchSourcePage(undefined), null)
  assert.equal(await fetchSourceText(null), null)
})
