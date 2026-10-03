// The entity stage's company scan: the prompt Haiku is given and what is kept
// of its answer. `extract-entities.js` makes the call; these two halves are
// here so the answer's shape is tested without one (`stock-mentions.test.js`).
//
// The scan answers two questions about each company an article names. Which
// share it is — so the mention can open a chart — and, since 2026-10-03,
// whether the article is *about* it. The second is what `/api/companies.json`
// lists under a company's chart: a ticker alone is a mention, and a forum that
// Microsoft attended is not Microsoft's news (`lib/companies.js`). Telling the
// two apart is reading, which is the model's work and was already being paid
// for: one more field on a call that reads every new article anyway.

/**
 * @typedef {{ mention: string, ticker: string, name: string, subject: boolean }} StockMention
 */

/**
 * @param {{ slug: string, title?: string, body: string }[]} articles
 * @returns {string}
 */
export function stockMentionsPrompt(articles) {
  const blocks = articles
    .map(
      (a) =>
        `---
slug: ${a.slug}
title: ${a.title || ''}
body:
"""
${a.body.slice(0, 1500).replace(/"""/g, "'''")}
"""`,
    )
    .join('\n')

  return `You extract publicly-traded company mentions from news articles so we can attach a live stock chart to each mention. For EACH article below, list only companies that:
  - Are mentioned substantively in the body (not just in a source byline or a one-word drive-by)
  - Are publicly traded with a known stable ticker
  - You can confidently resolve to a Yahoo Finance symbol

For each company, give:
  - mention: the exact string used in the body (preserve case, e.g. "Meta", "Nvidia", "TSMC")
  - ticker: Yahoo Finance symbol ("META", "NVDA", "TSM" for TSMC's ADR or "2330.TW" for Taiwan listing; use the main ADR when one exists). SpaceX is listed now: "SPCX".
  - name: human-readable company name ("Meta Platforms", "Nvidia", "Taiwan Semiconductor")
  - subject: true when the article is ABOUT this company — it is the one acting or acted upon, or the news is its business, products, shares, staff or legal trouble. false when it is named as context: a customer, supplier, rival, comparison, example, attendee or the platform something happened on. Most articles have one subject company or none; a deal, lawsuit or dispute between two companies has two.

Skip (do NOT list):
  - Private firms: OpenAI, Anthropic, Stripe, Boeing Defence, Aramco-the-government-entity (Saudi Aramco Public IS listed as 2222.SR — include only if named as the listed entity)
  - Ambiguous-ticker mentions: if you're not confident which ticker is right, omit
  - Countries, governments, people, agencies, indices (we cover those elsewhere)
  - Generic mentions ("a tech company", "big tech", "hyperscalers" without naming specific firms)

Return ONLY a JSON object keyed by slug, mapping to an array of company objects. Articles with no qualifying companies get an empty array.

Example output:
{
  "2026-04-18-meta-8000-layoffs-ai-capex-gpu-reallocation-zuckerberg": [
    {"mention": "Meta", "ticker": "META", "name": "Meta Platforms", "subject": true},
    {"mention": "Nvidia", "ticker": "NVDA", "name": "Nvidia", "subject": false}
  ],
  "2026-04-18-some-pure-mechanism-science-article": []
}

Articles:
${blocks}

Return ONLY the JSON object. No commentary, no markdown fences.`
}

/**
 * What is kept of the model's answer: per slug, the companies whose three
 * strings are present and whose ticker looks like one. `subject` is true only
 * for a literal `true` — an absent flag, a string or a guess at another type
 * is a mention, because a wrong "about" puts the wrong story under a chart and
 * a wrong "mention" only leaves one out.
 *
 * Every slug the model answered for is in the map, with an empty list where
 * it found no company: "read, and nothing there" is a different answer from
 * "never read", and the caller records it.
 *
 * @param {unknown} obj  the parsed JSON object
 * @returns {Map<string, StockMention[]>}
 */
export function parseStockMentions(obj) {
  /** @type {Map<string, StockMention[]>} */
  const out = new Map()
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out
  for (const [slug, value] of Object.entries(obj)) {
    const list = Array.isArray(value) ? value : []
    out.set(
      slug,
      list
        .filter(
          (c) =>
            c &&
            typeof c.mention === 'string' &&
            typeof c.ticker === 'string' &&
            /^[A-Z0-9.-]{1,15}$/i.test(c.ticker) &&
            typeof c.name === 'string',
        )
        .map((c) => ({
          mention: c.mention,
          ticker: c.ticker,
          name: c.name,
          subject: c.subject === true,
        })),
    )
  }
  return out
}

/**
 * The frontmatter block recording which instruments an article is about, as
 * the model judged it: `subjects:` with one indicator id a line, or
 * `subjects: []` for an article that was read and is about none.
 *
 * Its own key, not a field on `entities[]`: that array is published to the
 * app and the map, and a key added to its items would ride out with them.
 *
 * @param {string[]} ids  indicator ids, e.g. `stocks:NVDA`
 * @returns {string[]} lines, the first being `subjects: …`
 */
export function subjectsBlock(ids) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return ['subjects: []']
  return ['subjects:', ...unique.map((id) => `  - "${id.replace(/"/g, '\\"')}"`)]
}
