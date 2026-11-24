import { readFileSync, readdirSync, statSync, utimesSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathOf } from './datasets.js'
import { readJson, writeText } from './json-file.js'
import { parseFrontmatter, setStarterField, withdrawStarter } from './frontmatter.js'
import { classifyRevision } from './starter-eligibility.js'
import { stampReview } from './starter-topics.js'
import { latestTrendsPath } from './trends-snapshot.js'

export function starterCatalogue() {
  try {
    return readCatalogue()
  } catch (error) {
    console.warn(`Starter catalogue unavailable:`, error instanceof Error ? error.message : error)
    return null
  }
}

function readCatalogue() {
  const trends = latestTrendsPath()
  const rows = (trends && readJson(trends)?.indicators) || []
  const catalogue = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (typeof row?.id === 'string') catalogue.set(row.id, row)
  }
  for (const event of Object.values(readJson(pathOf('marketSignalState'))?.events ?? {})) {
    const signal = event?.signal
    if (typeof signal?.id === 'string' && signal.id.startsWith('mkt:') && signal.series) {
      catalogue.set(signal.id, { ...signal.series, asOf: signal.asOf, unit: 'index points' })
    }
  }
  return catalogue
}

// Archived articles can use the same revision-bound response as the live desk.
// Only a certified positive adds review metadata to a historical content file.
function importArchiveReview(raw, article, supplied, catalogue) {
  const review = stampReview(article, supplied)
  if (!review || review.revision !== supplied?.revision) return null
  const withReview = JSON.stringify(article.meta.starterReview) === JSON.stringify(review) ? raw :
    setStarterField(raw, 'starterReview', review)
  const classified = classifyRevision(withReview, catalogue, { ...article, meta: { ...article.meta, starterReview: review } }, true)
  return parseFrontmatter(classified).meta.starterEligible === true ? classified : setStarterField(classified, 'starterReview')
}

// A file may have been withdrawn since the directory listing. Other I/O errors
// need the operator's attention and must not be reported as a changed revision.
function readSource(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return null
  }
}

/**
 * Explicit maintenance rechecks persisted reviews against current classification tables.
 * Preserve mtime: an approval or withdrawal is not a new publication.
 */
export function rebuildStarters(dir, catalogue, { since = null, through = null, publications = new Map(),
  all = false, reviews = {} } = {}) {
  const result = []
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.md')) continue
    const slug = basename(name, '.md')
    const added = publications.get(slug)
    if (since && added && (added < since || added >= through)) continue
    const file = join(dir, name)
    const skipped = { file: name, changed: false, skipped: 'revision changed' }
    const raw = readSource(file)
    if (raw === null) {
      result.push(skipped)
      continue
    }
    let article, published
    try {
      article = parseFrontmatter(raw)
      if (!all && !since && !Object.hasOwn(article.meta, 'starterEligible') && !Object.hasOwn(article.meta, 'starterReview')) continue
      published = added ?? Date.parse(article.meta.date)
    } catch (error) {
      result.push({ ...skipped, skipped: error instanceof Error ? error.message : 'unreadable article metadata' })
      continue
    }
    if (since && !(published >= since && published < through)) continue
    let classified
    let eligible = false
    try {
      if (!catalogue) throw new Error('starter catalogue unavailable')
      classified = Object.hasOwn(reviews, name) ? importArchiveReview(raw, article, reviews[name], catalogue) :
        classifyRevision(raw, catalogue, article, since !== null || all)
      if (classified === null) {
        result.push({ ...skipped, skipped: 'malformed review or stale revision' })
        continue
      }
      eligible = parseFrontmatter(classified).meta.starterEligible === true
    } catch (error) {
      classified = withdrawStarter(raw, name, error)
    }
    const changed = classified !== raw
    // Under the cycle lock in a disposable checkout, confirm that the review
    // still describes the source, even when the existing flag needs no edit.
    const times = statSync(file, { throwIfNoEntry: false })
    if (!times || readSource(file) !== raw) {
      result.push(skipped)
      continue
    }
    if (changed) {
      writeText(file, classified)
      utimesSync(file, times.atimeMs / 1000, times.mtimeMs / 1000)
    }
    result.push({ file: name, published, eligible, changed })
  }
  return result
}
