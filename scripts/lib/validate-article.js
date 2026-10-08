// The gate between the editor and the build: what may ship, what is repaired
// on the way, and what is moved aside.
//
// This was the body of `scripts/validate-articles.js`, where every rule ran in
// the file's top-level loop and none had a test. The rules are moved as they
// stood, order included: an article that fails a late gate has still been
// counted by the early ones, and that is kept.
//
// A verdict of `bad` costs the reader the story, so each gate is deliberately
// more forgiving than the writer's contract, and the comment on each says how
// far. The contract itself is `articleProblems` (`lib/article.js`), which is
// run beside the gates and decides nothing.

import { basename } from 'node:path'
import { articleProblems } from './article.js'
import { splitBlocks } from './blocks.js'
import { normalizeUrl } from './dedup.js'
import { canonicalIndicatorId } from './entity-registry.js'
import { parseFrontmatter } from './frontmatter.js'
import { chartProblem, citesFigure } from './indicator-offer.js'
import { bodyNamesOutlet, soleClassifiedSource } from './outlet-class.js'

const WINDOW_MS = 72 * 3600 * 1000
const DATELINE = /^([^\n—]{2,60}?) — /

/** A title as the duplicate gate compares it: lower case, letters, digits and single spaces. */
export const normTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

/**
 * What the duplicate gate keeps of an article: when it is dated, its title and
 * its first source's URL, each in the form two copies of one story share.
 *
 * @typedef {{ slug: string, t: number, title: string, url: string }} DuplicateKey
 * @param {string} name the filename
 * @param {Record<string, any>} meta
 * @returns {DuplicateKey}
 */
export const duplicateKey = (name, meta) => ({
  slug: name,
  t: Date.parse(meta.date),
  title: normTitle(meta.title),
  url: normalizeUrl(meta.sources?.[0]?.url || ''),
})

/**
 * @typedef {object} Verdict
 * @property {string | null} bad why the article may not ship, or null
 * @property {string | null} text the file as it is now to be written, or null
 *   to leave it alone. A repair is kept on an article a later gate finds bad.
 * @property {string[]} events what was done to it, in order, as the stage prints them
 * @property {string[]} problems where it departs from the article contract.
 *   Reported, never acted on; empty for an article stopped before it parsed.
 */

/**
 * A validator for one batch. It carries what the gates remember from one
 * article to the next: what is already published, each article accepted so
 * far, every block seen, and the counts.
 *
 * @param {object} known
 * @param {DuplicateKey[]} known.published recent articles outside the batch
 * @param {Map<string, any[]>} known.offeredBySlug the indicator rows each story
 *   was offered, by the slug its article is saved under; empty when there is
 *   no selection (a rerun)
 * @param {Set<string>} known.knownIds every series id the build can resolve:
 *   the fallback for a rerun
 */
export function createValidator({ published, offeredBySlug, knownIds }) {
  const seen = [...published]
  const counts = { removed: 0, repaired: 0, chartsSet: 0, chartsDropped: 0, chartsCited: 0 }
  /** Block text → the batch files that carry it. @type {Map<string, { file: string, text: string }[]>} */
  const sentenceSeen = new Map()

  /**
   * Judge one article.
   *
   * @param {string} raw the file as the editor left it
   * @param {string} name its filename, `2026-10-08-x.md`
   * @returns {Verdict}
   */
  function check(raw, name) {
    /** @type {string[]} */
    const events = []
    /** @type {string[]} */
    let problems = []
    /** @type {string | null} */
    let text = null
    /** @param {string | null} bad */
    const verdict = (bad) => {
      if (bad) counts.removed++
      return { bad, text, events, problems }
    }

    const fm = raw.match(/^---\n([\s\S]*?)\n---/)
    if (!fm) return verdict('no frontmatter')

    // Parse with the same function build.js uses, not just string-match it.
    // The string checks below pass on frontmatter that js-yaml rejects, so an
    // unparseable article reached Stage 3b and took the whole build down with
    // it — a no-publish cascade off one file. Quarantining it here is what the
    // .bad mechanism is for: 12 good articles ship, the broken one does not.
    try {
      parseFrontmatter(raw)
    } catch (err) {
      return verdict(`unparseable frontmatter: ${err.reason || err.message}`)
    }

    const yaml = fm[1]
    const has = (k) => yaml.includes(`${k}:`)
    const hasSources = yaml.includes('sources:') && yaml.includes('  - name:')
    if (!has('title') || !has('date') || !has('category') || !has('location') || !hasSources) {
      return verdict('missing fields')
    }

    // The writer's contract is four blocks, or five when the optional
    // counterpoint-or-quote block was earned (`scripts/write-prompt.md` §rhythm).
    // This range is deliberately wider than the contract in BOTH directions,
    // because the penalty here is not a warning — it is the article not
    // publishing at all. A three-block draft that lost a paragraph break is still
    // readable news; quarantining it costs the reader the story to enforce a rule
    // the editor stage is better placed to fix. The ceiling is the real guard: a
    // body that split into six or more blocks is a malformed file, not a long
    // article.
    const body = raw.replace(/^---[\s\S]*?---\s*/, '').trim()
    const blocks = splitBlocks(body).filter((s) => s.length > 5)
    if (blocks.length < 2 || blocks.length > 5) return verdict(`${blocks.length} blocks`)

    const { meta, body: prose } = parseFrontmatter(raw)
    problems = articleProblems(meta, prose)
    const location = String(meta.location || '').trim()

    // Dateline. Nine bodies shipped without one on 2026-09-22 22:00 — the editor
    // rewrote their hooks and dropped it. `location` is the dateline city by
    // invariant, so a missing one is repaired rather than costing the story.
    const dl = body.match(DATELINE)
    if (!dl) {
      if (!location) return verdict('no dateline and no location')
      text = raw.replace(body, () => `${location} — ${body}`)
      counts.repaired++
      events.push(`REPAIRED (dateline "${location} — " restored)`)
    } else if (dl[1].trim() !== location) {
      return verdict(`location "${location}" is not the dateline city "${dl[1].trim()}"`)
    }

    // Same primary source URL, or the same title, as an article published in the
    // last 72 hours — or as an earlier file in this batch.
    //
    // No duplicate check ran after the writer. On 2026-09-07 the editor spotted a
    // same-URL double publish and had no way to stop it, and in the fortnight to
    // 09-25 two identical titles shipped within a day ("India Ends Free UPI",
    // "Trump Presses Kyiv On Refineries"). Both gates are exact-match on
    // purpose: measured over 837 articles they fire only on real duplicates.
    const me = duplicateKey(name, meta)
    const dup = seen.find((p) => Math.abs(p.t - me.t) <= WINDOW_MS && ((me.url && p.url === me.url) || (me.title && p.title === me.title)))
    if (dup) return verdict(`duplicate of ${dup.slug} (${dup.url === me.url ? 'same source URL' : 'same title'})`)
    seen.push(me)

    // `chart:` names the one series drawn under the story, and the writer may
    // only name one it was offered as chartable for that story — the offer is on
    // the selection (`attach-indicators.js`), keyed by the slug the writer saves
    // under. A chart that fails is dropped from the file and the article ships
    // without it: a missing chart costs one figure, a quarantine costs the story.
    // With no selection on disk (a rerun) the fallback is any id the build can
    // resolve.
    if (meta.chart != null) {
      counts.chartsSet++
      const id = canonicalIndicatorId(String(meta.chart).trim())
      const offered = offeredBySlug.size ? (offeredBySlug.get(basename(name, '.md')) ?? []) : null
      const problem = chartProblem(id, { offered, known: knownIds })
      if (problem) {
        // The file is written back whether or not the pattern found the line.
        text = (text ?? raw).replace(/^(---\n[\s\S]*?)^chart:.*\n([\s\S]*?\n---)/m, '$1$2')
        counts.chartsDropped++
        events.push(`CHART DROPPED (${problem})`)
      } else {
        const row = offered?.find((r) => r.id === id)
        if (row && citesFigure(body, row)) counts.chartsCited++
      }
    }

    for (const b of blocks.slice(1)) {
      const block = b.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
      // The same injected level is reworded, never repeated verbatim ("Brent crude
      // stood at…" / "Brent crude was…"), so the key is the run of figures when a
      // block carries three or more, and the text otherwise.
      const figures = block.match(/\d[\d,.]*/g) || []
      const key = figures.length >= 3 ? `#${figures.join('|')}` : block
      if (key.length >= 12) sentenceSeen.set(key, [...(sentenceSeen.get(key) || []), { file: name, text: block }])
    }

    // State-media or advocacy as the only sourcing: allowed, but the body must
    // say whose claim it is (lib/outlet-class.js has the why).
    const cls = soleClassifiedSource(meta.sources)
    if (cls && !bodyNamesOutlet(body, cls)) return verdict(`only source is ${cls.label}, and the body does not name it`)
    return verdict(null)
  }

  /**
   * Every block more than one article of the batch carries, in the order first
   * seen. A warning, not a gate: two articles in one cycle sharing a whole
   * block is the "numeric tic" — on 2026-09-25 two stories carried the
   * identical Brent sentence as their why-it-matters. The editor is the one
   * to fix it.
   *
   * @returns {{ files: string[], text: string }[]} `text` is the block as the first article has it
   */
  const repeats = () =>
    [...sentenceSeen.values()].filter((where) => where.length > 1).map((where) => ({ files: where.map((w) => w.file), text: where[0].text }))

  return { check, repeats, counts }
}
