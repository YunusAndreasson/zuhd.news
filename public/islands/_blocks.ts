// Shared block renderers — web equivalents of mobile's
// `components/blocks/*.tsx` components, keeping the same block-type
// vocabulary (prose/trend/compare/quote/locations/actors/quiz) so the
// same JSON payloads render visually consistent across web and mobile.
//
// These are written fresh in Preact/htm rather than ported 1:1 via
// preact/compat because the mobile components carry platform-specific
// concerns (Reanimated, Skia, gesture-handler, react-native primitives)
// that don't translate cleanly. The shape contracts come from
// `@shared/types`; mobile and web are independent renderers against
// the same data.

import { html, Fragment, type VNode } from './_framework'

interface CompareRow {
  label: string
  value: string
  tone?: 'favorable' | 'unfavorable' | 'neutral'
  cc?: string
  weight?: number
}

interface Actor {
  name: string
  role: string
  years?: string
  cc?: string
}

interface TrendAnnotation {
  atIndex: number
  label: string
}

export type ArticleBlock =
  | ({ type: 'prose'; text: string } & { source?: number })
  | ({ type: 'compare'; rows: CompareRow[]; label?: string } & { source?: number })
  | ({
      type: 'trend'
      values: number[]
      label: string
      unit?: string
      periods?: string[]
      highlight?: 'last' | 'first' | 'max' | 'min'
      annotations?: TrendAnnotation[]
      link?: string
    } & { source?: number })
  | ({ type: 'locations'; codes: string[]; label?: string; caption?: string } & { source?: number })
  | ({ type: 'quote'; text: string; speaker?: string; year?: string } & { source?: number })
  | ({ type: 'actors'; people: Actor[]; label?: string } & { source?: number })
  | ({
      type: 'quiz'
      question: string
      options: string[]
      correct: number
      explanation?: string
    } & { source?: number })

/** Convert ISO-2 code to a flag emoji using regional indicator symbols. */
export const ccToFlag = (cc: string): string => {
  if (!cc || cc.length !== 2) return ''
  const A = 0x41
  const base = 0x1f1e6
  const c1 = cc.toUpperCase().charCodeAt(0) - A
  const c2 = cc.toUpperCase().charCodeAt(1) - A
  if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return ''
  return String.fromCodePoint(base + c1, base + c2)
}

const SourceCaption = ({ label }: { label?: string | null }) =>
  label ? html`<p class="block-source">${label}</p>` : null

// ── ProseBlock ────────────────────────────────────────────────────────────
const ProseBlock = ({ text, sourceLabel }: { text: string; sourceLabel?: string | null }) => html`
  <div class="block block-prose">
    <p>${text}</p>
    <${SourceCaption} label=${sourceLabel} />
  </div>
`

// ── QuoteBlock ────────────────────────────────────────────────────────────
const QuoteBlock = ({
  text,
  speaker,
  year,
}: {
  text: string
  speaker?: string
  year?: string
}) => {
  const parts: string[] = []
  if (speaker) parts.push(speaker)
  if (year) parts.push(year)
  const attribution = parts.join(' · ')
  return html`
    <blockquote class="block block-quote">
      <p class="block-quote-text">“${text}”</p>
      ${attribution ? html`<cite class="block-quote-attr">${attribution}</cite>` : null}
    </blockquote>
  `
}

// ── CompareBlock ──────────────────────────────────────────────────────────
const CompareBlock = ({
  rows,
  label,
  sourceLabel,
}: {
  rows: CompareRow[]
  label?: string
  sourceLabel?: string | null
}) => {
  const maxWeight = rows.reduce((m, r) => Math.max(m, r.weight ?? 0), 0)
  const showBars = maxWeight > 0
  return html`
    <div class="block block-compare">
      ${label ? html`<span class="block-label">${label}</span>` : null}
      <ol class="compare-rows">
        ${rows.map((row, i) => {
          const flag = row.cc ? ccToFlag(row.cc) : ''
          const tone = row.tone ?? 'default'
          const fill = showBars && row.weight != null ? (row.weight / maxWeight) * 100 : 0
          return html`
            <li class="compare-row" data-tone=${tone} key=${i}>
              ${showBars
                ? html`<span class="compare-bar" style=${`--fill:${fill.toFixed(1)}%`}></span>`
                : null}
              <span class="compare-label">
                ${flag ? html`<span class="compare-flag" aria-hidden="true">${flag} </span>` : null}
                ${row.label}
              </span>
              <span class="compare-value t-tabular">${row.value}</span>
            </li>
          `
        })}
      </ol>
      <${SourceCaption} label=${sourceLabel} />
    </div>
  `
}

// ── LocationsBlock ────────────────────────────────────────────────────────
const LocationsBlock = ({
  codes,
  label,
  caption,
  sourceLabel,
}: {
  codes: string[]
  label?: string
  caption?: string
  sourceLabel?: string | null
}) => html`
  <div class="block block-locations">
    ${label ? html`<span class="block-label">${label}</span>` : null}
    <div class="locations-row">
      ${codes.map(
        (cc, i) => html`
          <a class="location-chip" href=${`/country/${cc.toUpperCase()}`} key=${i}>
            <span class="location-flag" aria-hidden="true">${ccToFlag(cc)}</span>
            <span class="location-code t-tabular">${cc.toUpperCase()}</span>
          </a>
        `,
      )}
    </div>
    ${caption ? html`<p class="t-caption">${caption}</p>` : null}
    <${SourceCaption} label=${sourceLabel} />
  </div>
`

// ── ActorsBlock ───────────────────────────────────────────────────────────
const ActorsBlock = ({
  people,
  label,
  sourceLabel,
}: {
  people: Actor[]
  label?: string
  sourceLabel?: string | null
}) => html`
  <div class="block block-actors">
    ${label ? html`<span class="block-label">${label}</span>` : null}
    <ol class="actors-rows">
      ${people.map(
        (p, i) => html`
          <li class="actor-row" key=${i}>
            <span class="actor-name">${p.name}</span>
            <span class="actor-role">${p.role}</span>
            ${p.years
              ? html`<span class="actor-years t-tabular">${p.years}</span>`
              : null}
            ${p.cc
              ? html`<a class="actor-cc" href=${`/country/${p.cc.toUpperCase()}`}>
                  ${ccToFlag(p.cc)} ${p.cc.toUpperCase()}
                </a>`
              : null}
          </li>
        `,
      )}
    </ol>
    <${SourceCaption} label=${sourceLabel} />
  </div>
`

// ── TrendBlock ────────────────────────────────────────────────────────────
const TrendBlock = ({
  values,
  label,
  unit,
  periods,
  highlight,
  annotations,
  link,
  sourceLabel,
}: {
  values: number[]
  label: string
  unit?: string
  periods?: string[]
  highlight?: 'last' | 'first' | 'max' | 'min'
  annotations?: TrendAnnotation[]
  link?: string
  sourceLabel?: string | null
}) => {
  if (!values?.length) return null
  const w = 680
  const h = 140
  const pad = { l: 8, r: 8, t: 24, b: 22 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const sx = (i: number) => pad.l + (i / Math.max(1, values.length - 1)) * innerW
  const sy = (v: number) => pad.t + innerH - ((v - min) / range) * innerH
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`)
    .join('')
  const lastIndex = values.length - 1
  const lastVal = values[lastIndex]
  const prevVal = values[Math.max(0, lastIndex - 1)]
  const delta =
    lastVal != null && prevVal != null && prevVal !== 0 ? ((lastVal - prevVal) / prevVal) * 100 : null

  const highlightIdx =
    highlight === 'first' ? 0
    : highlight === 'max' ? values.indexOf(max)
    : highlight === 'min' ? values.indexOf(min)
    : lastIndex

  const chartSvg = html`
    <svg class="trend-chart" viewBox=${`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label=${label}>
      <path d=${d} fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx=${sx(0)} cy=${sy(values[0])} r="2.5" fill="currentColor" opacity="0.5"/>
      <circle cx=${sx(highlightIdx)} cy=${sy(values[highlightIdx])} r="3.5" fill="currentColor"/>
      ${annotations?.map(
        (a) => html`
          <line
            x1=${sx(a.atIndex)}
            x2=${sx(a.atIndex)}
            y1=${pad.t}
            y2=${pad.t + innerH}
            stroke="currentColor"
            stroke-width="0.5"
            stroke-dasharray="2 3"
            opacity="0.4"
            key=${a.atIndex}
          />
        `,
      )}
      ${periods?.[0]
        ? html`<text x=${sx(0)} y=${h - 6} class="trend-axis-label" text-anchor="start">${periods[0]}</text>`
        : null}
      ${periods?.[lastIndex]
        ? html`<text x=${sx(lastIndex)} y=${h - 6} class="trend-axis-label" text-anchor="end">${periods[lastIndex]}</text>`
        : null}
    </svg>
  `
  const valueStr = `${lastVal?.toFixed(lastVal >= 100 ? 0 : 2)}${unit ? ` ${unit}` : ''}`
  const tone = delta == null ? '' : delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''
  const wrap = (inner: VNode) =>
    link
      ? html`<a class="block-trend-link" href=${link} target="_blank" rel="noopener">${inner}</a>`
      : inner

  return html`
    <div class="block block-trend">
      ${wrap(html`
        <${Fragment}>
          <div class="trend-header">
            <span class="block-label">${label}</span>
            <span class="trend-value t-tabular">${valueStr}</span>
            ${delta != null
              ? html`<span class=${`trend-delta t-tabular ${tone}`}>
                  ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%
                </span>`
              : null}
          </div>
          ${chartSvg}
        <//>
      `)}
      <${SourceCaption} label=${sourceLabel} />
    </div>
  `
}

// ── QuizBlock (disclosure-only, no state) ─────────────────────────────────
const QuizBlock = ({
  question,
  options,
  correct,
  explanation,
}: {
  question: string
  options: string[]
  correct: number
  explanation?: string
}) => html`
  <details class="block block-quiz">
    <summary class="quiz-question">${question}</summary>
    <ol class="quiz-options">
      ${options.map(
        (opt, i) => html`
          <li class=${`quiz-option${i === correct ? ' is-correct' : ''}`} key=${i}>
            <span class="quiz-marker t-tabular">${String.fromCharCode(65 + i)}</span>
            <span>${opt}</span>
          </li>
        `,
      )}
    </ol>
    ${explanation ? html`<p class="quiz-explanation">${explanation}</p>` : null}
  </details>
`

export const Block = ({
  block,
  sources,
}: {
  block: ArticleBlock
  sources?: string[]
}) => {
  const sourceLabel =
    block.source != null && sources && block.source >= 0 && block.source < sources.length
      ? sources[block.source] || null
      : null

  switch (block.type) {
    case 'prose':
      return html`<${ProseBlock} text=${block.text} sourceLabel=${sourceLabel} />`
    case 'quote':
      return html`<${QuoteBlock} text=${block.text} speaker=${block.speaker} year=${block.year} />`
    case 'compare':
      return html`<${CompareBlock} rows=${block.rows} label=${block.label} sourceLabel=${sourceLabel} />`
    case 'locations':
      return html`<${LocationsBlock} codes=${block.codes} label=${block.label} caption=${block.caption} sourceLabel=${sourceLabel} />`
    case 'actors':
      return html`<${ActorsBlock} people=${block.people} label=${block.label} sourceLabel=${sourceLabel} />`
    case 'trend':
      return html`<${TrendBlock}
        values=${block.values}
        label=${block.label}
        unit=${block.unit}
        periods=${block.periods}
        highlight=${block.highlight}
        annotations=${block.annotations}
        link=${block.link}
        sourceLabel=${sourceLabel}
      />`
    case 'quiz':
      return html`<${QuizBlock}
        question=${block.question}
        options=${block.options}
        correct=${block.correct}
        explanation=${block.explanation}
      />`
    default:
      return null
  }
}
