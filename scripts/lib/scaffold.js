// What the selection already knows about an article, written into the
// frontmatter the writer left: concepts, event coverage, sentiment, images, an
// empty source list. This was the body of `scripts/scaffold-articles.js`.
// Copied mechanically, because there is no reason to spend a model's tokens on
// data the pipeline already holds.

// Frontmatter is assembled as text, not serialised, so every interpolated value
// has to be escaped here or it terminates its own scalar. A Wikidata concept
// label carrying literal quotes (`Ecologist Party "The Greens"`) produced YAML
// that js-yaml rejected, and because parseFrontmatter is deliberately loud the
// whole build died — three cycles in a row published nothing off one label.
const yamlStr = (/** @type {unknown} */ v) =>
  `"${String(v)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`

/**
 * Fill what is missing from one article's frontmatter out of its selection
 * entry. Returns the new file text, or null when there was nothing to add or
 * the file has no frontmatter. What the writer wrote is never replaced.
 *
 * @param {string} raw the article file as it stands
 * @param {Record<string, any>} story the selection entry of the same slug
 * @returns {string | null}
 */
export function scaffoldArticle(raw, story) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fmMatch) return null

  let yaml = fmMatch[1]
  const body = fmMatch[2]

  let changed = false

  // Fill missing or empty concepts
  const hasConcepts = yaml.match(/^concepts:\s*\n\s+- /m)
  if (story.concepts?.length > 0 && !hasConcepts) {
    yaml = yaml.replace(/^concepts:.*$/m, '').trimEnd()
    yaml += `\nconcepts:\n${story.concepts.slice(0, 5).map(c => `  - ${yamlStr(typeof c === 'object' ? c.label : c)}`).join('\n')}`
    changed = true
  }

  // Fill missing eventCoverage
  if (story.eventCoverage && !yaml.includes('eventCoverage:')) {
    yaml = `${yaml.trimEnd()}\neventCoverage: ${story.eventCoverage}`
    changed = true
  }

  // Fill missing sentimentDivergence
  if (story.sentimentDivergence != null && !yaml.includes('sentimentDivergence:')) {
    yaml = `${yaml.trimEnd()}\nsentimentDivergence: ${story.sentimentDivergence}`
    changed = true
  }

  // Add sentiment scores to source entries from selection data
  if (story.sources?.some(s => s.sentiment != null)) {
    for (const selSrc of story.sources) {
      if (selSrc.sentiment == null) continue
      // Find matching source in YAML by name and add sentiment if missing
      const namePattern = `name: ${yamlStr(selSrc.name)}`
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
        yaml = `${yaml.slice(0, insertIdx)}\n    sentiment: ${selSrc.sentiment.toFixed(2)}${yaml.slice(insertIdx)}`
        changed = true
      }
    }
  }

  // Add image URLs to source entries from selection data (NewsAPI publisher images).
  // Captured for evaluation; not yet rendered in the article surface.
  if (story.sources?.some(s => s.image)) {
    for (const selSrc of story.sources) {
      if (!selSrc.image) continue
      const namePattern = `name: ${yamlStr(selSrc.name)}`
      const nameIdx = yaml.indexOf(namePattern)
      if (nameIdx === -1) continue
      const nextSourceIdx = yaml.indexOf('  - name:', nameIdx + 1)
      const block = nextSourceIdx === -1 ? yaml.slice(nameIdx) : yaml.slice(nameIdx, nextSourceIdx)
      if (block.includes('image:')) continue
      // Insert after country/url, like sentiment
      const sentimentLine = block.match(/\n\s+sentiment:.*/)
      const countryLine = block.match(/\n\s+country:.*/)
      const urlLine = block.match(/\n\s+url:.*/)
      const insertAfter = sentimentLine ? sentimentLine[0] : (countryLine ? countryLine[0] : (urlLine ? urlLine[0] : null))
      if (insertAfter) {
        const insertIdx = yaml.indexOf(insertAfter, nameIdx) + insertAfter.length
        yaml = `${yaml.slice(0, insertIdx)}\n    image: ${yamlStr(selSrc.image)}${yaml.slice(insertIdx)}`
        changed = true
      }
    }
  }

  // Fill empty sources array from selection
  if (yaml.includes('sources: []') && story.sources?.length > 0) {
    const sourcesYaml = `sources:\n${story.sources.map(s => {
      let entry = `  - name: ${yamlStr(s.name)}\n    url: ${yamlStr(s.url)}`
      if (s.country) entry += `\n    country: ${yamlStr(s.country)}`
      return entry
    }).join('\n')}`
    yaml = yaml.replace(/^sources:\s*\[\]/m, sourcesYaml)
    changed = true
  }

  return changed ? `---\n${yaml}\n---\n${body}` : null
}
