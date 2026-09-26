import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { htmlForReadability } from './fetch-source-text.js'

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
