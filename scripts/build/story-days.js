// The same UTC day heads the category, country and indicator story lists.
// The loader can relabel a dated heading Today or Yesterday after midnight.
import { listRow } from '../lib/list-row.js'

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
})

export const storyDays = (articles, { heading = 'h2', showCategory = false } = {}) => {
  const groups = new Map()
  for (const article of articles) {
    const date = Date.parse(article.meta?.date ?? article.date)
    const day = Number.isFinite(date) ? new Date(date).toISOString().slice(0, 10) : ''
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day).push(article)
  }
  return [...groups.keys()].sort().reverse().map(day => {
    const when = day ? `<time datetime="${day}" data-day>${dayFormat.format(new Date(day))}</time>` : 'Undated'
    const rows = groups.get(day).map(article => `<li>${listRow({
      title: article.title,
      url: `/a/${article.slug}`,
      category: showCategory ? article.meta?.category : '',
      source: article.sources?.[0]?.name ?? article.source ?? '',
      variant: 'title-source',
    })}</li>`)
    return `<li class="category-day-group"><${heading} class="category-day-heading">${when}</${heading}>
      <ol class="category-day-list">${rows.join('')}</ol></li>`
  }).join('\n')
}
