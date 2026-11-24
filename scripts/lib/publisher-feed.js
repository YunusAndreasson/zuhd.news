import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { splitBlocks } from './blocks.js'
import { parsedArticles } from './frontmatter.js'
import { readJson, writeJson } from './json-file.js'
import { validDay } from './period.js'
import { starterDecision } from './starter-eligibility.js'
import { widgetCandidate } from './widget-candidate.js'

// Both feeds carry these same fields from the SSG's parsed article. If two
// snapshots render identically but their reviews differ, neither can clear it.
const rowKey = (category, row) => JSON.stringify([category, row.title, row.date, row.sentences])
export async function captureFeedRevisions(catalogue, build) {
  const byRow = new Map()
  const exchanges = new Map()
  await parsedArticles.run(article => {
    const { meta, body } = article
    let key
    let fields
    try {
      key = rowKey(meta.category || 'uncategorised', {
        title: meta.title || 'Untitled', date: meta.date, sentences: splitBlocks(body),
      })
      fields = Object.hasOwn(meta, 'starterEligible') || meta.starterReview ? { starterEligible: false } : {}
      if (meta.starterEligible === true) {
        if (typeof catalogue === 'function') catalogue = catalogue()
        if (!catalogue) throw new Error('starter catalogue unavailable')
        const decision = starterDecision(article, catalogue)
        if (decision.eligible) {
          const exchange = [meta.chart, ...(meta.subjects ?? [])].find(id => typeof id === 'string' &&
            id.startsWith('mkt:') && meta.entities.some(entity => entity.indicatorId === id)) ?? null
          exchanges.set(key, exchanges.has(key) && exchanges.get(key) !== exchange ? null : exchange)
          fields = { starterEligible: true, starterEvidence: decision.evidence }
        }
      }
    } catch (error) {
      console.warn(`Starter ineligible during publication:`, error instanceof Error ? error.message : error)
      if (key === undefined) return // An unmatched feed row defaults to ineligible.
      fields = { starterEligible: false }
    }
    const previous = byRow.get(key)
    byRow.set(key, previous && (previous.starterEligible !== fields.starterEligible ||
      previous.starterEvidence !== fields.starterEvidence) ? { starterEligible: false } : fields)
  }, build)
  return {
    get: (category, row) => byRow.get(rowKey(category, row)) ?? { starterEligible: false },
    exchange: (category, row) => exchanges.get(rowKey(category, row)) ?? null,
  }
}

function openingExchange(categories, edition, revisions) {
  const time = row => row.publishedAt ?? row.addedAt
  const day = row => Math.floor(time(row) / 86400000)
  const approved = Object.entries(categories).flatMap(([category, rows]) =>
    rows.map(row => ({ ...row, category }))).filter(row =>
    row.starterEligible === true && Number.isFinite(time(row)) && day(row) <= Date.parse(edition) / 86400000)
  // The app prefers a quantified hook with a subject chart, then the hook,
  // then a chart alone. The approval certifies at least one of the two.
  const tier = row => row.starterEvidence === 'both' ? 0 : row.starterEvidence === 'measurement' ? 1 : 2
  const first = approved.sort((a, b) => day(b) - day(a) || tier(a) - tier(b) || time(b) - time(a) ||
    b.eventAt - a.eventAt || a.slug.localeCompare(b.slug))[0]
  if (!first) return null
  return revisions.exchange(first.category, first)
}

/** Both files have been produced in full by the SSG before this is called. */
export function publishFeedMetadata({ api, revisions, signalPath, preferencePath, duplicateSlugs = new Set() }) {
  const projections = new Map()
  const feeds = ['feed.json', 'feed-lite.json'].map(name => {
    const path = join(api, name)
    const feed = JSON.parse(readFileSync(path, 'utf8'))
    for (const [category, rows] of Object.entries(feed.categories)) {
      for (const row of /** @type {any[]} */ (rows)) {
        delete row.starterEligible
        delete row.starterEvidence
        let key
        try {
          key = JSON.stringify([row.slug, rowKey(category, row)])
          if (!projections.has(key)) {
            projections.set(key, duplicateSlugs.has(row.slug) ? { starterEligible: false } : revisions.get(category, row))
          }
          Object.assign(row, projections.get(key))
        } catch (error) {
          console.warn(`Starter ineligible (${row.slug}):`, error instanceof Error ? error.message : error)
          row.starterEligible = false
          if (key !== undefined) projections.set(key, { starterEligible: false })
        }
      }
    }
    return { path, feed }
  })
  const feed = feeds[0].feed
  if (feeds[1].feed.generated !== feed.generated) throw new Error('Feed editions disagree')
  const edition = feed.generated.slice(0, 10)
  const stored = preferencePath && readJson(preferencePath)
  const previous = validDay(stored?.edition) ? stored : null
  const priorId = previous?.edition <= edition ? previous.id : null
  let candidate
  try {
    candidate = widgetCandidate(edition, readJson(signalPath)?.events, feed.briefing, priorId,
      openingExchange(feed.categories, edition, revisions), Date.parse(feed.generated))
  } catch (error) {
    console.warn(`Widget candidate unavailable:`, error instanceof Error ? error.message : error)
  }
  for (const { path, feed } of feeds) {
    if (candidate) feed.widgetCandidate = candidate
    else delete feed.widgetCandidate
    writeJson(path, feed, { pretty: false })
  }
  if (preferencePath && candidate?.close && (!previous || previous.edition <= edition)) {
    try {
      writeJson(preferencePath, { edition, id: candidate.close.id })
    } catch (error) {
      console.warn(`Widget exchange preference could not be saved:`, error instanceof Error ? error.message : error)
    }
  }
}
