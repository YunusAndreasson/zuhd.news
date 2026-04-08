export function searchArticles(articles, query, limit = 10) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []

  const scored = articles.map(article => {
    let score = 0
    const title = (article.title || '').toLowerCase()
    const location = (article.location || '').toLowerCase()
    const concepts = (article.concepts || []).map(c =>
      (typeof c === 'string' ? c : c.label || '').toLowerCase()
    )
    const sentences = (article.sentences || []).join(' ').toLowerCase()
    const threadLabel = (article.threadLabel || '').toLowerCase()

    for (const term of terms) {
      if (title.includes(term)) score += 3
      if (threadLabel.includes(term)) score += 2
      for (const c of concepts) {
        if (c.includes(term)) score += 2
      }
      if (location.includes(term)) score += 1.5
      if (sentences.includes(term)) score += 1
    }

    return { article, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.article)
}
