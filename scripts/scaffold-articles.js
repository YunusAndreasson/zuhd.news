#!/usr/bin/env node
// Post-writer: fills missing frontmatter fields from the selection JSON.
// Concepts, eventCoverage, and empty sources are copied mechanically —
// no reason to spend LLM tokens on data the pipeline already has.
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const SELECTION_PATH = '/tmp/zuhd-selection.json'
const NEW_ARTICLES_PATH = '/tmp/zuhd-new-articles.txt'

if (!existsSync(SELECTION_PATH) || !existsSync(NEW_ARTICLES_PATH)) {
  console.log('Scaffold: no selection or article list — skipping')
  process.exit(0)
}

const selection = JSON.parse(readFileSync(SELECTION_PATH, 'utf-8'))
const files = readFileSync(NEW_ARTICLES_PATH, 'utf-8').trim().split('\n').filter(Boolean)

const selectionBySlug = new Map()
for (const story of selection) {
  if (story.suggestedSlug) selectionBySlug.set(story.suggestedSlug, story)
}

let filled = 0

for (const f of files) {
  const full = resolve(f)
  if (!existsSync(full)) continue
  const raw = readFileSync(full, 'utf-8')

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fmMatch) continue

  let yaml = fmMatch[1]
  const body = fmMatch[2]
  const slug = full.replace(/.*\//, '').replace(/\.md$/, '')
  const story = selectionBySlug.get(slug)
  if (!story) continue

  let changed = false

  // Fill missing or empty concepts
  const hasConcepts = yaml.match(/^concepts:\s*\n\s+- /m)
  if (story.concepts?.length > 0 && !hasConcepts) {
    yaml = yaml.replace(/^concepts:.*$/m, '').trimEnd()
    yaml += '\nconcepts:\n' + story.concepts.slice(0, 5).map(c => `  - "${c}"`).join('\n')
    changed = true
  }

  // Fill missing eventCoverage
  if (story.eventCoverage && !yaml.includes('eventCoverage:')) {
    yaml = yaml.trimEnd() + `\neventCoverage: ${story.eventCoverage}`
    changed = true
  }

  // Fill missing sentimentDivergence
  if (story.sentimentDivergence != null && !yaml.includes('sentimentDivergence:')) {
    yaml = yaml.trimEnd() + `\nsentimentDivergence: ${story.sentimentDivergence}`
    changed = true
  }

  // Add sentiment scores to source entries from selection data
  if (story.sources?.some(s => s.sentiment != null)) {
    for (const selSrc of story.sources) {
      if (selSrc.sentiment == null) continue
      // Find matching source in YAML by name and add sentiment if missing
      const namePattern = `name: "${selSrc.name}"`
      const nameIdx = yaml.indexOf(namePattern)
      if (nameIdx === -1) continue
      // Check if sentiment already exists for this source
      const nextSourceIdx = yaml.indexOf('  - name:', nameIdx + 1)
      const block = nextSourceIdx === -1 ? yaml.slice(nameIdx) : yaml.slice(nameIdx, nextSourceIdx)
      if (block.includes('sentiment:')) continue
      // Find the last property of this source entry and add sentiment after it
      const countryLine = block.match(/\n\s+country:.*/)
      const urlLine = block.match(/\n\s+url:.*/)
      const insertAfter = countryLine ? countryLine[0] : (urlLine ? urlLine[0] : null)
      if (insertAfter) {
        const insertIdx = yaml.indexOf(insertAfter, nameIdx) + insertAfter.length
        yaml = yaml.slice(0, insertIdx) + `\n    sentiment: ${selSrc.sentiment.toFixed(2)}` + yaml.slice(insertIdx)
        changed = true
      }
    }
  }

  // Fill empty sources array from selection
  if (yaml.includes('sources: []') && story.sources?.length > 0) {
    const sourcesYaml = 'sources:\n' + story.sources.map(s => {
      let entry = `  - name: "${s.name}"\n    url: "${s.url}"`
      if (s.country) entry += `\n    country: "${s.country}"`
      return entry
    }).join('\n')
    yaml = yaml.replace(/^sources:\s*\[\]/m, sourcesYaml)
    changed = true
  }

  if (changed) {
    writeFileSync(full, `---\n${yaml}\n---\n${body}`)
    filled++
  }
}

console.log(`Scaffold: filled missing fields in ${filled}/${files.length} articles`)
