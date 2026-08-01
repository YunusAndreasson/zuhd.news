// What an article says about itself after the prose stops: its corrections,
// and its chain of sources.
//
// Both implement a stated principle that the site was not keeping.
// `foundation.md` promises "Corrections issued openly" and nothing in the repo
// could record that an article had ever been wrong. `about.md` promises
// "*isnad* — Every article ends with its chain of sources, named and linked"
// and the article page printed `Sources: A, B, C` as flat text, unlinked, in
// publication order.
//
// Extracted from build.js so both can be tested. Rendering that only runs
// inside a 1,600-line top-level-await script is rendering nobody can assert on,
// and the isnad ordering in particular is a claim strong enough to deserve one.

import { escHtml } from './html.js'

/** `2026-07-26T05:00:00Z` → `26 July 2026`. */
export const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

// --- Corrections -----------------------------------------------------------

/**
 * Corrections, as a record on the article itself.
 *
 * `foundation.md`'s first principle is "Accurate. Verified before published.
 * Sources cited. **Corrections issued openly**." The first three had machinery
 * behind them — the validator, the source chain, the whole check stage — and
 * the fourth had nothing at all. Nothing in the repo could record that an
 * article had been wrong, so in practice a correction meant editing the prose
 * and letting the earlier version disappear, which is the opposite of openly.
 *
 * This is the *tabayyun* principle the about page cites (Qur'an 49:6) applied
 * after publication rather than before it: verify, and when verification
 * arrives late, say so where the claim was made.
 *
 * The record lives in the article's own frontmatter rather than a side file
 * because a correction is part of the article — it should travel with it in
 * git, appear in the same diff as the text it corrects, and be impossible to
 * publish the fix without.
 *
 *     corrections:
 *       - date: "2026-07-26T10:00:00Z"
 *         note: "An earlier version put the toll at 40. The ministry's revised
 *                count is 14."
 *
 * The note states what was wrong and what is right. It does not apologise and
 * it does not explain how the error happened; neither is information the
 * reader came for.
 *
 * A malformed entry is dropped rather than thrown on, because this runs inside
 * a live pipeline and one bad hand-edit should not stop the deploy. That makes
 * the filter silent, which for this feature is its own hazard — so
 * `corpus.test.js` fails the build on any correction that would not survive it.
 */
export const parseCorrections = (meta) => {
  const raw = Array.isArray(meta?.corrections) ? meta.corrections : []
  return raw
    .map((c) => ({ date: String(c?.date || '').trim(), note: String(c?.note || '').trim() }))
    .filter((c) => c.note && Number.isFinite(Date.parse(c.date)))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}

/**
 * The corrections block: dated, in the article, above the source chain.
 *
 * Above rather than below because `about.md` says the article *ends* with its
 * chain of sources, and that ordering is load-bearing — the isnad is the last
 * thing on the page or the sentence is untrue.
 */
export const renderCorrections = (corrections) => {
  if (!corrections.length) return ''
  const items = corrections
    .map(
      (c) =>
        `<li><time datetime="${escHtml(c.date)}">${escHtml(formatDate(c.date))}</time> — ${escHtml(c.note)}</li>`,
    )
    .join('')
  const label = corrections.length === 1 ? 'Correction' : 'Corrections'
  return (
    `<aside class="article-corrections" id="corrections" aria-label="${label}">` +
    `<p class="article-corrections-label">${label}</p>` +
    `<ul class="article-corrections-list">${items}</ul>` +
    `</aside>`
  )
}

// --- The isnad -------------------------------------------------------------

/**
 * State outlets, which proximity does not promote.
 *
 * This exists because ordering by nearness alone gets a specific case exactly
 * backwards. `about.md` sets two rules that meet here: "*isnad* — every article
 * ends with its chain of sources" and "*adalah* — sources are weighed by
 * character, not only by content". Classical isnad criticism holds both at
 * once: a chain is strengthened by connectedness AND by the integrity of each
 * transmitter, and a near but unreliable transmitter does not outrank a distant
 * reliable one.
 *
 * Rank by nearness alone and a state news agency leads every chain about its
 * own state — which is the one situation the source policy names outright:
 * "State media is included to carry a government's position, never as a
 * substitute for independent reporting." Putting TASS at the head of a Russia
 * story makes it exactly that substitute. Measured against this corpus, the
 * rule was promoting TASS to the head of 6 chains, RT 10, and Mehr 3.
 *
 * What this does NOT do: remove, downrank, or mark these outlets. They stay in
 * the chain, named and linked, in the position the pipeline published them in.
 * The only thing withheld is the promotion.
 *
 * This list is an editorial judgement and it is deliberately short — every
 * entry is a state-owned agency functioning as a government organ, which is
 * the narrow case the policy above describes. Anadolu is on it for the same
 * reason TASS is: it is majority state-owned, and leaving it off because Turkey
 * is an ummah state would be the double standard this site avoids everywhere
 * else. Outlets that are merely state-*funded* with editorial independence —
 * the BBC, and by most readings Al Jazeera — are not here and should not be.
 * Grounded in the outlets this corpus actually cites; extend it as it grows.
 */
export const STATE_OUTLETS = new Set(
  [
    'TASS',
    'RT',
    'Sputnik',
    'Xinhua',
    'China Daily',
    'Global Times',
    'CGTN',
    'Mehr News Agency',
    'PressTV',
    'Press TV',
    'IRNA',
    'Fars News Agency',
    'Tasnim News Agency',
    'Anadolu Ajansı',
    'Anadolu Agency',
    'KCNA',
    'SANA',
  ].map((n) => n.toLowerCase()),
)

const isStateOutlet = (name) => STATE_OUTLETS.has(String(name || '').trim().toLowerCase())

/**
 * The chain of sources, ordered by how close each one stood to the event.
 *
 * `about.md` states the principle this implements — *isnad*, every article
 * ending with its chain of sources, named and linked — and until now the page
 * did neither of the last two things. The map's story card had linked them for
 * months; the canonical article page, which is where a shared link lands and
 * what a crawler reads, had not.
 *
 * Ordering is the other half. An isnad is not a bibliography — it is ranked,
 * and what ranks it is proximity to the event: the nearer the transmitter
 * stood, the stronger the report. For a newsroom the workable reading of that
 * is jurisdiction. An outlet reporting from inside the country where the thing
 * happened is closer to it than a wire desk in London, so those come first —
 * unless it is a state organ reporting on its own state, which is where
 * `adalah` overrides nearness. See `STATE_OUTLETS`.
 *
 * What this deliberately does NOT do:
 *
 *  - It does not sort by distance in kilometres. `SOURCE_COORDS` covers 41
 *    outlets and the corpus names several hundred — 32% of source references
 *    resolve — so a distance sort would be arbitrary two thirds of the time
 *    while looking principled. `source.country` is present on 99% of them.
 *  - It does not reorder `sources[]`. `sources[0]` is the published primary
 *    source in `/api/*.json`, in `feed.xml`, and on the generated share card;
 *    reordering the array would silently change all three. This sorts a copy
 *    for display only.
 *  - It does not claim a ranking it cannot establish. Roughly half the corpus
 *    carries no inline country tag, and there the published order stands. The
 *    stable sort is load-bearing for that: ties keep the pipeline's own order
 *    rather than being shuffled by the sort's implementation.
 */
export const renderIsnad = (sources, body) => {
  if (!Array.isArray(sources) || !sources.length) return ''

  // Where the story is, as the article itself declares it — the same
  // `[Name](country:XX)` tags the markets layer joins on.
  const storyCountries = new Set(
    Array.from(String(body || '').matchAll(/\(country:([A-Za-z]{2})\)/g), (m) =>
      m[1].toUpperCase(),
    ),
  )

  const nearness = (s) =>
    storyCountries.size &&
    s.country &&
    storyCountries.has(String(s.country).toUpperCase()) &&
    // Nearness is a claim about access, and `adalah` is the check on it. See
    // STATE_OUTLETS: a state agency's proximity to its own state is the one
    // case where being closest is not evidence of being better placed.
    !isStateOutlet(s.name)
      ? 0
      : 1

  const links = sources
    .map((s, i) => ({ s, i, near: nearness(s) }))
    .sort((a, b) => a.near - b.near || a.i - b.i)
    .map(({ s }) => {
      const name = escHtml(s.name || '')
      if (!name) return ''
      // A source without a URL is still part of the chain and still named. It
      // just cannot be followed, and a dead `<a>` would imply it could.
      if (!s.url) return `<span>${name}</span>`
      return `<a href="${escHtml(s.url)}" rel="noopener nofollow" target="_blank">${name}</a>`
    })
    .filter(Boolean)

  if (!links.length) return ''
  return `<p class="article-sources-flat">Sources: ${links.join(', ')}</p>`
}
