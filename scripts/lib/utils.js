// Shared utilities for the news pipeline

export function slugify(title, date) {
  const d = new Date(date)
  const prefix = Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10)
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '')
  return `${prefix}-${slug}`
}

export function fingerprint(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40)
}

export function zuhdCategory(categories, title = '', description = '') {
  // Accept either API category array or RSS text
  if (Array.isArray(categories)) {
    for (const cat of categories) {
      const uri = (cat.uri || cat.label || '').toLowerCase()
      if (uri.includes('politic') || uri.includes('society') || uri.includes('conflict') || uri.includes('government')) return 'politics'
      if (uri.includes('business') || uri.includes('econom') || uri.includes('financ') || uri.includes('market')) return 'economy'
      if (uri.includes('science') || uri.includes('health') || uri.includes('environment') || uri.includes('medicine')) return 'science'
      if (uri.includes('technolog') || uri.includes('computer') || uri.includes('internet') || uri.includes('software')) return 'tech'
    }
  }

  const text = (`${title} ${description}`).toLowerCase()
  if (/\b(study|research|climate|vaccine|species|quantum|genome|crispr)\b/.test(text)) return 'science'
  if (/\b(ai|startup|software|hack|data breach|algorithm|llm|chatbot)\b/.test(text)) return 'tech'
  if (/\b(gdp|inflation|market|trade|tariff|oil price|currency|imf|crypto|bitcoin|fintech)\b/.test(text)) return 'economy'
  return 'politics'
}
