// One row in a dated article list: date · title (· source) (· category).
//
// This was four independent copies — the category page, the country page's
// coverage section, and the entity page's "Lately"/"Mentioned in" sections —
// each with its own class prefix and its own choice of which fields to show.
// None of them had drifted on what a row *is*; they disagreed on markup and,
// as a side effect, on the title's font-size (three of the four sat inside
// `.article-page-main`'s prose clamp with nothing to bring it back down,
// which the category page's row alone corrected).

import { escHtml } from './html.js'

/**
 * @param {{ title: string, url: string, date?: string, dateFormatted?: string,
 *           source?: string, category?: string,
 *           variant: 'date-title-source'|'date-title-category'|'title-source'|'date-title' }} row
 */
export const listRow = ({ title, url, date, dateFormatted, source, category, variant }) => {
  const parts = []
  if (dateFormatted) {
    parts.push(
      `<time datetime="${escHtml(date)}" class="list-row-date t-tabular">${escHtml(dateFormatted)}</time>`,
    )
  }
  parts.push(`<span class="list-row-title">${escHtml(title)}</span>`)
  if (category) parts.push(`<span class="category list-row-category">${escHtml(category)}</span>`)
  if (source) parts.push(`<span class="t-source-host list-row-source">${escHtml(source)}</span>`)
  return `<a class="list-row list-row--${variant}" href="${escHtml(url)}">${parts.join('\n  ')}</a>`
}
