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
 * The stories the briefing's topic line was written from until it had the
 * script to read, and still is when there is none: the ledger's rows that are
 * live (importance of 6 or more, or an arc that is breaking or developing),
 * the first five by importance.
 *
 * Not the briefing's top stories, which is what the line is for. A story
 * enters the ledger at importance 6 and loses one for each cycle that does not
 * cover it; nothing raises it (`lib/ledger.js`). So the five are the first
 * five picks of whichever cycle ran last, the 05:00 one, in the order the
 * selector listed them. Over 2026-10-05 to 10-09 the briefing's lead story
 * was missing from the push that announced it on two days of five, and three
 * of the fifteen topics pushed were in no briefing at all.
 *
 * @param {{ stories?: import('./schema.js').LedgerStory[] }} ledger
 */
export const briefingTop = (ledger) =>
  (ledger.stories || [])
    .filter((s) => s.importance >= 6 || s.arc === 'breaking' || s.arc === 'developing')
    .sort((a, b) => (b.importance || 0) - (a.importance || 0))
    .slice(0, 5)
    .map((s) => ({ label: s.label, category: s.category, arc: s.arc }))

const PAUSE = /<(?:short|long) pause>/g
/** The category a section's spoken heading names: "In politics.", "On the economy.", "In technology." */
const HEADINGS = /** @type {[RegExp, string][]} */ ([[/politic/i, 'politics'], [/econom/i, 'economy'], [/scien/i, 'science'], [/tech/i, 'tech']])

/**
 * A story's opening sentence: what happened. The script writes an ellipsis
 * for a breath ("are still in captivity... nearly six months after"), so a
 * sentence ends at a stop that a capital follows, and not within its first
 * forty characters, where "In St. Petersburg" would end it.
 *
 * @param {string} story
 */
function openingSentence(story) {
  const text = story.replace(PAUSE, ' ').replace(/\s+/g, ' ').trim()
  for (const stop of text.matchAll(/[.!?]["”’']?(?=\s+["“‘']?[A-Z])/g)) {
    const end = stop.index + stop[0].length
    if (end >= 40) return text.slice(0, end)
  }
  return text
}

/**
 * The stories the briefing's topic line is written from, out of the script
 * that was read aloud: the lead, then the first story of each section. Five
 * at most, and the same three keys the ledger's rows had, because
 * `briefing-push-prompt.md` is handed this as it stands.
 *
 * `label` is the story's opening sentence. `category` is the section it is
 * in, and `lead` for the one before any section. `arc` is `breaking`
 * throughout: it is what every row from the ledger said, a story of the last
 * day being a new one there.
 *
 * @param {string[]} sections the script's sections, as `parseBriefingScript` splits them
 * @returns {{ label: string, category: string, arc: string }[]}
 */
export function briefingTopFromScript(sections) {
  /** @type {{ label: string, category: string, arc: string }[]} */
  const top = []
  /** @param {string} text the stories of a section, a long pause between them */
  const firstStory = (text) => text.split(/<long pause>/).map((s) => s.trim()).find((s) => s && !/^(this is your\b.*\bbriefing|that['’]?s your briefing)/i.test(s))
  sections.forEach((section, i) => {
    let category = 'lead'
    let stories = section
    if (i > 0) {
      // The heading is what stands before the short pause; a section whose
      // heading has none is recognised by its first words.
      const at = section.indexOf('<short pause>')
      const heading = at >= 0 && at <= 40 ? section.slice(0, at) : (section.match(/^\s*(?:In|On)\b[^.\n]{0,30}\./)?.[0] ?? '')
      category = HEADINGS.find(([named]) => named.test(heading))?.[1] ?? 'news'
      stories = section.slice(at >= 0 && at <= 40 ? at + '<short pause>'.length : heading.length)
    }
    const story = firstStory(stories)
    if (story) top.push({ label: openingSentence(story), category, arc: 'breaking' })
  })
  return top.slice(0, 5)
}
