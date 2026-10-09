// What is posted to the push endpoint, and the small steps that shape it.
//
// The endpoint (`functions/api/push.js`) takes `{ articles: [{ slug, title,
// body, … }] }` and that shape is fixed: the app in both stores reads it.
// The shell script that ran the cycle put the payloads together in four
// programs carried inline;
// these are those, moved as they stood.

/**
 * The slug of the story a breaking payload carries, or '' when its first
 * article has none. A payload with no `articles` is an error, as it was.
 *
 * @param {{ articles: { slug?: string }[] }} payload
 */
export const pushSlug = (payload) => payload.articles[0]?.slug || ''

/**
 * The first line of the model's answer that says anything, trimmed. The
 * model is asked for one line and sometimes gives a blank one first.
 *
 * @param {string | undefined} text
 * @returns {string | undefined}
 */
export const firstLine = (text) => (text || '').trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0]

/**
 * The breaking payload as it is sent: titled `Breaking News`, with the
 * model's line as its body in place of the article's lead.
 *
 * @template {{ articles: { title?: string, body?: string }[] }} T
 * @param {T} payload
 * @param {string} body
 * @returns {T}
 */
export function withPushBody(payload, body) {
  payload.articles[0].title = 'Breaking News'
  payload.articles[0].body = body
  return payload
}

/**
 * The daily briefing's push. Its slug is synthetic, `briefing-<date>`, which
 * is what the endpoint's seven-day dedup keys on, so a rerun does not push
 * twice.
 *
 * @param {string} body the topic line
 * @param {string | undefined} date `YYYY-MM-DD`
 */
export const briefingPayload = (body, date) => ({
  articles: [
    {
      slug: `briefing-${date}`,
      title: "Today's Briefing",
      body,
      channelId: 'briefing',
      priority: 'normal',
      data: { kind: 'briefing', date },
    },
  ],
})

/**
 * The stories the briefing's topic line is written from: straight from the
 * ledger, so no second model pass is needed to rank. The same filter the
 * briefing generator uses (importance of 6 or more, or an arc that is
 * breaking or developing), the five most important.
 *
 * @param {{ stories?: import('./schema.js').LedgerStory[] }} ledger
 */
export const briefingTop = (ledger) =>
  (ledger.stories || [])
    .filter((s) => s.importance >= 6 || s.arc === 'breaking' || s.arc === 'developing')
    .sort((a, b) => (b.importance || 0) - (a.importance || 0))
    .slice(0, 5)
    .map((s) => ({ label: s.label, category: s.category, arc: s.arc }))
