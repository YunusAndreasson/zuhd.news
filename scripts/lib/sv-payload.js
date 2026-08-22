// The Swedish payload: what a translation has to satisfy, and what the feed
// item looks like once it does.
//
// Split out from `translate-swedish.js` because these are the parts worth
// testing and none of them touch the model, the filesystem or the clock. The
// stage script owns the IO; this file owns the rules.
//
// The rules exist because the Swedish text is rendered on islam.se by a client
// script that does no parsing and no repair. Anything malformed that reaches
// the payload is malformed on the page, so it is cheaper to drop an article
// here than to defend against it there.

import { createHash } from 'node:crypto'
import { regionFromCoords } from './regions.js'

/** Inline country markup: `[Label](country:XX)`. ~52% of articles carry it. */
const COUNTRY_LINK = /\[([^\]]*)\]\(country:([A-Za-z]{2})\)/g

/** Feed window. The UI shows 24h; the extra day is what keeps a link shared
 *  yesterday evening still resolvable this morning instead of 404-ing into a
 *  fallback. */
export const SV_WINDOW_MS = 48 * 60 * 60 * 1000

/** zuhd's four categories, in Swedish. Values are the API's, not display
 *  strings — islam.se capitalises them for its own surface. */
export const KATEGORI = {
  politics: 'politik',
  economy: 'ekonomi',
  science: 'vetenskap',
  tech: 'teknik',
}

/** The `country:XX` codes in a string, in order, upper-cased.
 *  Order matters: a translation that keeps the right codes but attaches them to
 *  the wrong labels has silently relabelled a country. */
export const countryTargets = (text) =>
  [...String(text).matchAll(COUNTRY_LINK)].map((m) => m[2].toUpperCase())

/** What forces a re-translation: the English the reader would see change.
 *  Hashing title+body means a re-run costs nothing and a corrected article is
 *  picked up on the next cycle without a flag. */
export const articleFingerprint = (title, body) =>
  createHash('sha1').update(`${title}\n\n${body}`).digest('hex').slice(0, 16)

/**
 * Does this translation survive contact with the renderer?
 *
 * Returns `null` when it does, and a short reason when it does not. A reason
 * rather than a boolean because the stage logs it per slug — a run that drops
 * six articles with no reason is a run nobody can act on.
 *
 * @param {{ blocks: string[] }} en
 * @param {{ titel?: unknown, plats?: unknown, stycken?: unknown }} sv
 */
export function translationFault(en, sv) {
  const str = (v) => typeof v === 'string' && v.trim().length > 0

  if (!sv || typeof sv !== 'object') return 'no object'
  if (!str(sv.titel)) return 'missing titel'
  if (!str(sv.plats)) return 'missing plats'
  if (!Array.isArray(sv.stycken)) return 'stycken not an array'

  // 1. Block count is preserved exactly. Merging two paragraphs is the most
  //    common way a translation comes back subtly wrong, and it is invisible
  //    downstream — the article just reads as though a beat is missing.
  if (sv.stycken.length !== en.blocks.length) {
    return `block count ${sv.stycken.length} != ${en.blocks.length}`
  }
  if (!sv.stycken.every(str)) return 'empty block'

  // 2. The dateline. islam.se strips it by exact-matching `plats` against the
  //    head of block 1, exactly as zuhd's own readers strip the English one.
  if (!sv.stycken[0].startsWith(`${sv.plats} — `)) {
    return `block 1 does not open with "${sv.plats} — "`
  }

  // 3. Country markup survives, labels translated, targets untouched. Compared
  //    as an ordered list: same codes in the same places, or the labels have
  //    been shuffled onto the wrong countries.
  const enCodes = countryTargets(en.blocks.join('\n\n'))
  const svCodes = countryTargets(sv.stycken.join('\n\n'))
  if (enCodes.join(',') !== svCodes.join(',')) {
    return `country markup ${svCodes.join(',') || '(none)'} != ${enCodes.join(',') || '(none)'}`
  }

  return null
}

/**
 * One item of `/api/sv/feed.json`.
 *
 * Swedish keys throughout, because the only consumer is a Swedish site and a
 * payload that mixes `title` with `stycken` invites exactly the mistake of
 * rendering the English one. The English `location` is deliberately *not*
 * carried: `plats` is the display string and `lat`/`lng` are what the map
 * needs, so there is nothing for an English city name to do here.
 *
 * @param {{ slug: string, meta: Record<string, any>, sources: any[], addedAt: number }} article
 * @param {{ titel: string, plats: string, stycken: string[] }} sv
 * @param {string} kartaUrl  from `shareUrl` in shared/share.ts — spelled once, there
 */
export function svFeedItem(article, sv, kartaUrl) {
  const { slug, meta, sources, addedAt } = article
  const lander = [
    ...new Set(
      (sources || [])
        .map((s) => (typeof s?.country === 'string' ? s.country.toUpperCase() : null))
        .filter(Boolean),
    ),
  ]
  const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null)
  const lat = num(meta.lat)
  const lng = num(meta.lng)

  return {
    slug,
    titel: sv.titel,
    plats: sv.plats,
    stycken: sv.stycken,
    kategori: KATEGORI[meta.category] || null,
    datum: meta.date || null,
    addedAt,
    kalla: sources?.[0]?.name || null,
    kallaUrl: sources?.[0]?.url || null,
    lander,
    // Coarse continent bucket, from the one bbox ladder in lib/regions.js.
    // A neutral fact, not a score: islam.se ranks its own front page from
    // this and `lander`, and that editorial judgement belongs on islam.se.
    region: regionFromCoords(lat, lng),
    lat,
    lng,
    kartaUrl,
  }
}

/** When the thing happened, not when we published it — the frontmatter date,
 *  falling back to the file mtime. The same rule the map's timeline uses. */
export const eventTime = (meta, addedAt) => {
  const parsed = meta?.date ? Date.parse(meta.date) : Number.NaN
  return Number.isNaN(parsed) ? addedAt : parsed
}
