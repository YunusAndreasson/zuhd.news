// Mirrors public/style.css's `--text` / `--text-secondary` / `--rule` /
// `--bg-soft` / `--bg` light and dark values, for the share-card renderers
// (og-image.js, ig-image.js).
//
// Node has no DOM and no browser, so these scripts cannot read a CSS custom
// property at build time — this is a maintained copy, not a live reference.
// It drifted once already: og-image.js's `rule` was `#e2e2e2`/`#2a2a2a`
// against style.css's `#e8e8e8`/`#181818`, and ig-image.js separately
// hardcoded a third dark "ocean" for the same globe role in two different
// card layouts (see `IG_DARK_OCEAN` there). Keep this in sync by hand
// whenever public/style.css's `:root` block changes — nothing enforces it
// automatically, since `colour-system.test.js` only reads style.css and
// `_map/style.ts`.
export const SHARE_PALETTE = {
  light: { text: '#1a1a1a', textSecondary: '#555', rule: '#e8e8e8', bgSoft: '#fafafa', bg: '#fff' },
  dark: { text: '#d4d4d4', textSecondary: '#a3a3a3', rule: '#181818', bgSoft: '#1a1a1a', bg: '#080808' },
}
