// Splits an article body into the visual blocks the reader sees on screen
// (one `<p>` on web, one `<Text>` element on mobile — each separated by a
// vertical gap). Block boundaries are markdown paragraph breaks: a blank
// line between prose runs, which the writer declares explicitly.
export function splitBlocks(text) {
  return text.trim().split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
}
