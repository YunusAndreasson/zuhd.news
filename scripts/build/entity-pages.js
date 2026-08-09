// Entity page builder: emits /e/{id}.html for every indicator in
// content/trends/<today>.json. Each page shows the current value, the series
// as a chart, the indicator description, and every article that mentions the
// entity via its frontmatter `entities[]` array. No chart library on the
// critical path — the geometry comes from `@shared/chart/series`, which emits
// SVG nodes as data, and this walks them into a string.
//
// The chart is complete before any script runs: the line, the rule, the axis,
// the extremes and every observation in a `<details>` table. `series-chart`
// then replaces it with the interactive one.
//
// Also emits a sibling /api/entity/{id}.json blob used by the
// entity-sheet island: identical numbers, lighter transport, consumed
// when a reader opens an entity sheet (from an article's entity strip
// or a future globe affordance) without leaving the page they're on.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { escHtml } from '../lib/html.js'
import { footerStatusLine } from '../lib/site-chrome.js'
import { listRow } from '../lib/list-row.js'
import { canonicalIndicatorId } from '../lib/entity-registry.js'
import { loadShared } from './shared-ts.js'

const ROOT = new URL('../..', import.meta.url).pathname

/**
 * Newest daily trends snapshot on disk, or null.
 *
 * Exported because build.js needs the same answer for `/api/trends.json`. It
 * used to look up `content/trends/${today}.json` directly, which is only
 * present after that day's fetch stage has run — so on any build that happened
 * before the fetch, or on a day the fetch failed, the endpoint silently did
 * not exist. Entity pages never had that problem because they came through
 * here; now neither does the API.
 */
export const latestTrendsPath = () => {
  const dir = join(ROOT, 'content', 'trends')
  if (!existsSync(dir)) return null
  const names = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
  const latest = names[names.length - 1]
  return latest ? join(dir, latest) : null
}

const formatValue = (v, unit) => {
  if (v == null || !Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2).replace(/\.?0+$/, '')}B${unit ? ` ${unit}` : ''}`
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2).replace(/\.?0+$/, '')}M${unit ? ` ${unit}` : ''}`
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(2).replace(/\.?0+$/, '')}K${unit ? ` ${unit}` : ''}`
  if (Number.isInteger(v) || Math.abs(v) >= 100) return `${v.toFixed(0)}${unit ? ` ${unit}` : ''}`
  return `${v.toFixed(2)}${unit ? ` ${unit}` : ''}`
}

/**
 * The chart, from the same geometry the map sheet and the entity sheet draw.
 *
 * This used to be its own thirty lines — a line, two dots, two labels, and
 * `preserveAspectRatio="none"`. That last one is the mistake that was found and
 * removed twice elsewhere in the repo and never here: a 720×160 box stretched
 * into a full-width frame is a non-uniform scale, so the axis labels came out
 * wide for their height and the end dots were ellipses. On the one page whose
 * entire subject is a chart.
 *
 * What lands here now is the complete no-JS chart: the line, the area, the
 * window's opening rule, the y-axis, the extremes marked where they fell, the
 * latest value named in words, and every observation in a `<details>` table.
 * The `series-chart` island then replaces it with the interactive one — a
 * cursor, a range control and a copy button, none of which mean anything
 * without a script, which is exactly why none of them are in the static markup.
 */
const chartHtml = (chart, record) => {
  const { seriesModel, staticFigure, renderMarkup } = chart
  const values = record.values ?? []
  const model = seriesModel({
    values,
    periods: record.periods ?? [],
    reference: 'open',
    referenceLabel: 'the window’s open',
    direction: 'window',
    palette: 'signed',
    unit: record.unit || '',
    step: record.kind === 'MONTHLY' ? 'months' : 'days',
    label: record.label,
  })
  if (!model.ok) return ''
  return renderMarkup(staticFigure(model, { caption: record.caption }))
}

/** Shape consumed by both the static page and the entity-sheet island.
 *  All numbers are precomputed here so the island stays tiny.
 *
 *  `dispatch` is this indicator's entry from `content/.indicator-dispatch.json`
 *  — `{ standing, recent, citations }` — or null. It rides the record rather
 *  than being fetched separately because every surface that wants the prose
 *  already fetches this blob. */
const buildEntityRecord = (ind, mentions, dispatch, bySlug) => {
  const values = ind.values
  const periods = Array.isArray(ind.periods) ? ind.periods : []
  const last = values[values.length - 1]
  const prev = values[values.length - 2]
  const dayChange = last != null && prev != null ? ((last - prev) / prev) * 100 : null
  const deltaTone = dayChange == null ? '' : dayChange > 0 ? 'pos' : dayChange < 0 ? 'neg' : ''
  /**
   * The day's move, and only the day's.
   *
   * This used to read "+2.33% day · −23.6% window" as one span tinted by the
   * *day* — so on Brent, a green line of type containing a large red number,
   * directly above a chart drawn red for the window. Two horizons sharing one
   * colour is the same mistake the market card was fixed for, one surface over.
   *
   * The window's change is not lost: the chart's readout states it against the
   * rule it draws, and it is the only place that can still be right once the
   * range control has narrowed what "the window" means.
   */
  const deltaLabel =
    dayChange == null ? '—' : `${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)}% day`
  // No date range: the chart's x-axis prints its own start and end, and unlike
  // this string it reprints them when the reader changes the range.
  const caption = [ind.sourceLabel || ind.source, ind.cadence].filter(Boolean).join(' · ')

  return {
    id: ind.id,
    label: ind.label,
    kind: (ind.cadence || 'indicator').toUpperCase(),
    sourceLabel: ind.sourceLabel || ind.source || '',
    unit: ind.unit || '',
    currentFormatted: formatValue(last, ind.unit),
    current: last ?? null,
    deltaLabel,
    deltaTone,
    values,
    periods,
    caption,
    asOf: ind.asOf || '',
    // Spread-conditionally, the way `corrections` is added to the article
    // payloads: absent on any indicator the dispatch stage has not reached, so
    // the published shape is unchanged and every existing consumer keeps
    // parsing. See `.claude/rules/pipeline/articles.md`.
    ...(dispatch?.standing ? { standing: dispatch.standing } : {}),
    ...(dispatch?.recent ? { recent: dispatch.recent } : {}),
    /**
     * The cited stories, **resolved here rather than as bare slugs**.
     *
     * They were shipped as slugs first, on the assumption that a consumer could
     * look each one up in `mentions` — which is true for `brent`, where the
     * entity registry puts the id in article frontmatter, and false for every
     * `wiki-*` and `poly-*` id, where nothing does. Those have no mentions at
     * all, so the join found nothing and the list silently did not render on
     * exactly the block this change exists for. The dispatch draws citations
     * from a wider pool than `entities[]` ever populates, so the pool it drew
     * from is what has to travel.
     */
    ...(() => {
      const cited = (dispatch?.citations || [])
        .map((slug) => bySlug?.get(slug))
        .filter(Boolean)
        .map((a) => ({
          slug: a.slug,
          title: a.title,
          date: a.meta.date,
          dateFormatted: a.dateFormatted,
          source: a.sources?.[0]?.name || '',
        }))
      return cited.length ? { cited } : {}
    })(),
    mentions: mentions.map((a) => ({
      slug: a.slug,
      title: a.title,
      date: a.meta.date,
      dateFormatted: a.dateFormatted,
      source: a.sources?.[0]?.name || '',
    })),
  }
}

/**
 * @param {{ sorted: any[], distDir: string, template: string,
 *           shareRowHtml?: (target: string, title: string) => string,
 *           dispatch?: Record<string, {standing?: string, recent?: string, citations?: string[]}>,
 *           extraIndicators?: any[] }} opts
 *        `template` arrives already resolved — see the note on the same
 *        parameter in `country-pages.js`; this module used to carry its own
 *        copy of the document shell as a JS template literal, with its own
 *        `${ARCHETYPE_HEADER}` interpolation alongside every other template's
 *        `{{token}}` substitution.
 *        `shareRowHtml` is passed in rather than imported because build.js
 *        owns it; the default is a no-op for callers that do not want a
 *        share row.
 *        Its signature has to be declared here — a default of `() => ''` infers
 *        a zero-argument function, which makes the two real call sites read as
 *        passing two arguments too many.
 */
export const buildEntityPages = async ({
  sorted,
  distDir,
  template,
  shareRowHtml = () => '',
  dispatch = {},
  extraIndicators = [],
}) => {
  const today = new Date().toISOString().slice(0, 10)
  const trendsPath = latestTrendsPath()
  if (!trendsPath) return { count: 0, ids: [] }
  const trends = JSON.parse(readFileSync(trendsPath, 'utf8'))
  const indicators = [
    ...(Array.isArray(trends.indicators) ? trends.indicators : []),
    // Chokepoints and exchanges, shaped as indicators by the caller. They are
    // series with a label, a unit and a date axis like any other, and the only
    // reason they never had a page is that they arrive in their own payloads —
    // which is also why 305 articles carried a chokepoint entity id that
    // resolved to nothing and rendered no chip at all.
    ...extraIndicators,
  ]
  const chart = await loadShared('chart/series.ts')

  const bySlug = new Map(sorted.map((a) => [a.slug, a]))

  // Index articles by entity.indicatorId so each entity page can surface
  // its mentions. Use sorted (newest → oldest) to preserve the reading
  // order readers expect.
  const mentionsByEntity = {}
  for (const a of sorted) {
    const entities = Array.isArray(a.meta.entities) ? a.meta.entities : []
    for (const e of entities) {
      if (!e?.indicatorId) continue
      // Through the alias table, so an article published against a renamed id
      // still counts as a mention of the thing it was always about.
      const id = canonicalIndicatorId(e.indicatorId)
      // biome-ignore lint/suspicious/noAssignInExpressions: the (x ??= []) group-by idiom, in statement position. The rule is here for `if (a = b)`.
      ;(mentionsByEntity[id] ??= []).push(a)
    }
  }

  mkdirSync(join(distDir, 'e'), { recursive: true })
  mkdirSync(join(distDir, 'api', 'entity'), { recursive: true })
  const ids = []
  for (const ind of indicators) {
    if (!ind?.id || !Array.isArray(ind.values) || ind.values.length < 2) continue

    const mentions = mentionsByEntity[ind.id] || []
    const record = buildEntityRecord(ind, mentions.slice(0, 30), dispatch[ind.id], bySlug)

    /**
     * The two pieces of prose, in the two places their jobs put them.
     *
     * `standing` sits above the chart because a reader who cannot name the
     * instrument cannot read the line either — the same ordering `_map/sheet.ts`
     * already argues for. `recent` sits below it, because it is a claim *about*
     * the shape the reader has just looked at and reads as a caption to it
     * rather than as an introduction.
     */
    const standingSection = record.standing
      ? `<p class="entity-standing">${escHtml(record.standing)}</p>`
      : ''

    /**
     * `recent`, and under it the stories it was actually built from.
     *
     * This list is not "articles mentioning this indicator" — that is
     * `Mentioned in` below, and it is a tag match. These are the slugs the
     * dispatch stage returned as the sources of the sentence above them, which
     * is why the heading is a claim about the prose and not about the
     * instrument. Filtered against the corpus so a slug that has since been
     * renamed or dropped cannot render a dead link.
     */
    const cited = record.cited || []
    const recentSection = record.recent
      ? `<section class="entity-recent">
          <h2 class="label section-title">Lately</h2>
          <p class="entity-recent-body">${escHtml(record.recent)}</p>
          ${
            cited.length
              ? `<ol class="archive-article-list entity-recent-sources">
            ${cited.map((a) => `<li>${listRow({
              title: a.title,
              url: `/a/${a.slug}`,
              date: a.date,
              dateFormatted: a.dateFormatted,
              variant: 'date-title',
            })}</li>`).join('')}
          </ol>`
              : ''
          }
        </section>`
      : ''

    const mentionedSection = mentions.length
      ? `<section class="entity-mentioned">
          <h2 class="label section-title">Mentioned in · ${mentions.length}</h2>
          <ol class="archive-article-list">
            ${mentions.map((a) => `<li>${listRow({
              title: a.title,
              url: `/a/${a.slug}`,
              date: a.meta.date,
              dateFormatted: a.dateFormatted,
              source: a.sources[0]?.name || '',
              variant: 'date-title-source',
            })}</li>`).join('')}
          </ol>
        </section>`
      : ''

    const html = template
      .replaceAll('{{shareRow}}', shareRowHtml(`/e/${ind.id}`, `${ind.label} — zuhd.news`))
      .replaceAll('{{id}}', escHtml(ind.id))
      .replaceAll('{{label}}', escHtml(ind.label))
      // The standing sentence where there is one. The fallback it replaces —
      // "<label> — <source>. N related articles on zuhd.news." — described the
      // page rather than the subject, so every search result and every share
      // card for 57 instruments said the same thing with a different number in
      // it. Trimmed to a length a description meta tag is actually shown at.
      .replaceAll(
        '{{description}}',
        escHtml(
          record.standing ||
            `${ind.label} — ${ind.sourceLabel || ind.source}. ${mentions.length} related articles on zuhd.news.`,
        ).slice(0, 300),
      )
      .replaceAll('{{kind}}', escHtml(record.kind))
      .replaceAll('{{source}}', escHtml(record.sourceLabel))
      .replaceAll('{{current}}', escHtml(record.currentFormatted))
      .replaceAll('{{delta}}', escHtml(record.deltaLabel))
      .replaceAll('{{deltaTone}}', record.deltaTone)
      .replaceAll('{{spark}}', chartHtml(chart, record))
      // `</` is the only sequence that can end a script element early, and
      // escaping it is what keeps a label like "S&P 500 </script>" from being
      // a way to write markup into this page. JSON keeps `<` as a `<` on
      // parse, so the payload is unchanged.
      .replaceAll(
        '{{series}}',
        JSON.stringify({
          values: record.values,
          periods: record.periods,
          unit: record.unit || '',
          kind: record.kind,
          label: record.label,
          caption: record.caption,
        }).replace(/</g, '\\u003c'),
      )
      .replaceAll('{{standing}}', standingSection)
      .replaceAll('{{recent}}', recentSection)
      .replaceAll('{{mentioned}}', mentionedSection)
      .replaceAll(
        '{{footerStatus}}',
        footerStatusLine({
          sources: record.sourceLabel,
          dateHtml: escHtml(record.asOf || trends.asOf || today),
        }),
      )

    writeFileSync(join(distDir, 'e', `${ind.id}.html`), html)

    // Sheet JSON: same numbers, lighter transport. Consumed by the
    // entity-sheet island (opened from article entity strips).
    writeFileSync(join(distDir, 'api', 'entity', `${ind.id}.json`), JSON.stringify(record))

    ids.push(ind.id)
  }

  return { count: ids.length, ids }
}
