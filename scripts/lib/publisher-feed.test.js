import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { splitBlocks } from './blocks.js'
import { pathOf } from './datasets.js'
import { parseFrontmatter, replaceFrontmatterKey } from './frontmatter.js'
import { writeJson } from './json-file.js'
import { stampReview } from './starter-topics.js'
import * as publisher from './publisher-feed.js'

const slug = '2026-11-22-karachi-gold-bar-shortage-investors-price-fall'
const cleared = readFileSync(join(pathOf('articles'), `${slug}.md`), 'utf8')
const edition = '2026-11-23'
const generated = `${edition}T12:00:00Z`
const files = ['feed.json', 'feed-lite.json']

test('both endpoints use the parsed build revision even if an editor replaces the source during publication', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'publisher-revision-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, `${slug}.md`)
  const paths = { api: dir, signalPath: join(dir, 'signals.json'), preferencePath: join(dir, 'previous.json') }
  const audio = { available: true, date: edition, generated, duration: 587 }
  const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'))
  async function build(raw, next, stamp = generated, briefing = audio) {
    writeFileSync(path, raw)
    const revisions = await publisher.captureFeedRevisions(new Map(), async () => {
      const { meta, body } = parseFrontmatter(readFileSync(path, 'utf8'))
      const row = { slug, title: meta.title, date: meta.date, sentences: splitBlocks(body), addedAt: Date.parse(stamp) }
      for (const file of files) {
        writeJson(join(dir, file), {
          generated: stamp, categories: { economy: [row] }, briefing,
          ...(file === 'feed.json' && { contexts: { keep: true } }),
        })
      }
      writeFileSync(path, next)
    })
    publisher.publishFeedMetadata({ ...paths, revisions })
    const [full, lite] = files.map(read)
    assert.deepEqual(full.categories, lite.categories)
    assert.deepEqual(full.widgetCandidate, lite.widgetCandidate)
    assert.deepEqual(full.contexts, { keep: true })
    assert.equal(lite.contexts, undefined)
    return lite
  }
  const rejected = cleared.replace('Karachi —', 'Karachi — Trump spoke. ')
  const stale = await build(rejected, cleared)
  assert.equal(stale.categories.economy[0].starterEligible, false)
  assert.equal(stale.categories.economy[0].starterEvidence, undefined)
  assert.equal(stale.widgetCandidate.audio.durationSeconds, 587)
  const approved = await build(cleared, rejected)
  assert.equal(approved.categories.economy[0].starterEligible, true)
  assert.equal(approved.categories.economy[0].starterEvidence, 'measurement')
  const legacy = await build('---\ntitle: Legacy\ncategory: economy\n---\nLegacy text.', cleared, '2026-11-24T00:00:00Z', null)
  assert.equal(legacy.categories.economy[0].starterEligible, undefined)
  assert.equal(legacy.widgetCandidate, undefined)
})

test('indistinguishable rendered revisions cannot borrow each other’s approval', async () => {
  const revisions = await publisher.captureFeedRevisions(new Map(), async () => {
    parseFrontmatter(cleared)
    parseFrontmatter(cleared.replace(/angle: /, 'angle: Trump said '))
  })
  const { meta, body } = parseFrontmatter(cleared)
  assert.equal(revisions.get('economy', { title: meta.title, date: meta.date, sentences: splitBlocks(body) }).starterEligible, false)
})


test('both endpoints prefer an approved opener’s subject exchange and reject duplicate fixture slugs', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'widget-opener-exchange-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const subject = 'mkt:tadawul'
  let raw = replaceFrontmatterKey(cleared, 'subjects', [`subjects: ["${subject}"]`])
  raw = replaceFrontmatterKey(raw, 'entities', [`entities: [{mention: TASI, indicatorId: "${subject}"}]`])
  const article = parseFrontmatter(raw)
  const review = stampReview(article, article.meta.starterReview)
  raw = replaceFrontmatterKey(raw, 'starterReview', [`starterReview: ${JSON.stringify(review)}`])
  const revisions = await publisher.captureFeedRevisions(new Map(), async () => { parseFrontmatter(raw) })
  const row = { slug, title: article.meta.title, date: article.meta.date, sentences: splitBlocks(article.body), addedAt: Date.parse(generated) }
  const signalPath = join(dir, 'signals.json')
  const series = { dates: [edition], values: [9937.26] }
  const saudi = { id: subject, title: 'TASI', country: 'SA', exchange: 'Saudi Exchange', asOf: edition, series }
  const indian = { ...saudi, id: 'mkt:bse', title: 'SENSEX', country: 'IN', exchange: 'Bombay Stock Exchange' }
  writeJson(signalPath, { events: { [indian.id]: { signal: indian }, [subject]: { signal: saudi } } })
  for (const file of files) writeJson(join(dir, file), { generated, categories: { economy: [row] } })
  for (const duplicate of [false, true]) {
    publisher.publishFeedMetadata({ api: dir, revisions, signalPath, preferencePath: null, duplicateSlugs: new Set(duplicate ? [slug] : []) })
    for (const file of files) {
      const result = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      assert.equal(result.categories.economy[0].starterEligible, !duplicate)
      assert.equal(result.widgetCandidate.close.id, duplicate ? indian.id : subject)
    }
  }
})

test('an unavailable starter decision cannot interrupt SSG parsing or lend an approval', async () => {
  const first = replaceFrontmatterKey(cleared, 'chart', ['chart: paxg'])
  const article = parseFrontmatter(first)
  const review = stampReview(article, { ...article.meta.starterReview, subjectChart: 'paxg' })
  const chart = replaceFrontmatterKey(first, 'starterReview', [`starterReview: ${JSON.stringify(review)}`])
  const catalogue = new Map()
  catalogue.get = () => { throw new Error('injected catalogue lookup failure') }
  const revisions = await publisher.captureFeedRevisions(() => catalogue, async () => {
    parseFrontmatter(chart)
    parseFrontmatter(cleared.replace('Karachi Gold Bars Run Short', 'Another report'))
  })
  const row = { title: article.meta.title, date: article.meta.date, sentences: splitBlocks(article.body) }
  assert.equal(revisions.get('economy', row).starterEligible, false)
})

test('a row projection failure leaves the other reports in both feeds', t => {
  const dir = mkdtempSync(join(tmpdir(), 'publisher-row-error-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const rows = [{ slug: 'first', starterEligible: true }, { slug: 'second' }]
  for (const file of files) writeJson(join(dir, file), { generated, categories: { economy: rows } })
  const revisions = { get(category, row) {
    if (row.slug === 'first') throw new Error('injected lookup failure')
    return { starterEligible: true, starterEvidence: 'measurement' }
  }, exchange() { return null } }
  publisher.publishFeedMetadata({ api: dir, signalPath: join(dir, 'signals'), preferencePath: null, revisions })
  for (const file of files) {
    const { categories } = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    assert.deepEqual(categories.economy.map(row => [row.slug, row.starterEligible]), [['first', false], ['second', true]])
  }
})
