// The publisher's lead-image URL for a story, wherever the feed or page offers one.
//
// NewsAPI items carry `image`; RSS items carried nothing, so ~half the feed —
// every niche outlet — reached the article with no image URL at all. These read
// what the fetch already has in hand: the RSS item's own media fields, and the
// `og:image` of a page the HN path downloads anyway. No request is added.
//
// A URL only — nothing on the site renders it yet. Kept so the choice to use
// images later is not a choice to re-fetch every source.

/** @param {unknown} v */
const attr = (v, name) => {
  if (!v) return null
  const first = Array.isArray(v) ? v[0] : v
  if (typeof first === 'string') return name === '@_url' ? null : first
  return typeof first === 'object' && first ? first[name] || null : null
}

/** @param {unknown} url */
const httpUrl = (url) => {
  if (typeof url !== 'string') return null
  const u = url.trim().replace(/&amp;/g, '&')
  return /^https?:\/\/\S+$/i.test(u) ? u : null
}

const isImageType = (t) => typeof t !== 'string' || t === '' || t.startsWith('image/')

/**
 * From a parsed RSS/Atom item (fast-xml-parser, `@_` attribute prefix):
 * `media:content`, `media:thumbnail`, an image `enclosure`, `media:group`, or
 * the first `<img src>` inside the item's HTML content.
 * @param {Record<string, any>} raw
 * @returns {string | null}
 */
export function rssItemImage(raw) {
  if (!raw || typeof raw !== 'object') return null
  const contents = [].concat(raw['media:content'] || [], raw['media:group']?.['media:content'] || [])
  for (const c of contents) {
    if (c && typeof c === 'object' && (c['@_medium'] === 'image' || isImageType(c['@_type']))) {
      const u = httpUrl(c['@_url'])
      if (u) return u
    }
  }
  const thumb = httpUrl(attr(raw['media:thumbnail'], '@_url'))
  if (thumb) return thumb
  for (const e of [].concat(raw.enclosure || [])) {
    if (e && typeof e === 'object' && isImageType(e['@_type']) && e['@_type']) {
      const u = httpUrl(e['@_url'])
      if (u) return u
    }
  }
  for (const field of ['content:encoded', 'content', 'description', 'summary']) {
    const v = raw[field]
    const html = typeof v === 'string' ? v : typeof v === 'object' && v ? v['#text'] : null
    if (typeof html !== 'string') continue
    const m = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)
    const u = m && httpUrl(m[1])
    if (u) return u
  }
  return null
}

/**
 * `og:image` / `twitter:image` from a page's HTML, attribute order either way.
 * @param {string} html
 * @returns {string | null}
 */
export function htmlLeadImage(html) {
  if (typeof html !== 'string') return null
  const head = html.slice(0, 200_000)
  for (const key of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    const k = key.replace(/:/g, '\\:')
    const a = head.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']+)["']`, 'i'))
    const b = head.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${k}["']`, 'i'))
    const u = httpUrl((a || b)?.[1])
    if (u) return u
  }
  return null
}
