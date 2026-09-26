// The audio briefing's script: what Claude writes, how it is split for
// synthesis, and how the audio is checked against it.
//
// The script is plain spoken text — Gemini TTS reads its input verbatim — with
// three kinds of markup: a line of `---` between sections (a music transition
// plays there), and the two pause tags Gemini documents, `<short pause>` and
// `<long pause>`. Chirp 3 HD remains the fallback voice, so `scriptToSsml`
// turns the same text into the SSML it needs.

const PAUSE_TAG = /<(short|long) pause>/g

/**
 * Split Claude's output into synthesis sections.
 *
 * Tolerates a fenced reply and an old-style SSML reply (the prompt used to ask
 * for SSML, and a model occasionally answers last month's question): tags are
 * reduced to text and pauses, and `<p>` blocks become sections.
 * @param {string} raw
 * @returns {{ script: string, sections: string[] }}
 */
export function parseBriefingScript(raw) {
  let text = String(raw)
    .replace(/^\s*```[a-z]*\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim()
  if (/<speak[\s>]/.test(text)) {
    text = text
      .replace(/<sub\s+alias="([^"]*)"[^>]*>[^<]*<\/sub>/g, '$1')
      .replace(/<break\s+time="(\d+)(ms|s)"\s*\/>/g, (_, n, unit) =>
        (unit === 's' ? Number(n) * 1000 : Number(n)) >= 600 ? ' <long pause> ' : ' <short pause> ')
      .replace(/<p>/g, '\n---\n')
      .replace(/<(?!(?:short|long) pause>)[^>]+>/g, ' ')
  }
  const sections = text
    .split(/^\s*-{3,}\s*$/m)
    .map((s) => s.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim())
    // A section that is only pause tags has nothing to say.
    .filter((s) => s.replace(PAUSE_TAG, '').trim().length > 0)
  return { script: sections.join('\n---\n'), sections }
}

/** The words a section should be heard to say, for the coverage check. */
export function spokenWords(text) {
  return String(text)
    .replace(PAUSE_TAG, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Share of the script's words that a transcript of the audio contains.
 *
 * A bag-of-words test, not an alignment: it exists to catch the failure
 * Gemini 3.8 Flash-Lite showed on 2026-09-26 — the whole lead story skipped,
 * 119 of 303 words spoken, no error. A faithful read measures ~0.94 (the
 * misses are numbers a transcriber writes as digits); that skip measured 0.39.
 * @param {string} script
 * @param {string} transcript
 */
export function coverage(script, transcript) {
  const want = spokenWords(script)
  if (want.length === 0) return 1
  const heard = new Set(spokenWords(transcript))
  return want.filter((w) => heard.has(w)).length / want.length
}

const escXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The same section as SSML for Chirp 3 HD, in pieces under its 5,000-byte
 * request limit, split at sentence ends.
 * @param {string} section
 * @param {number} [maxBytes]
 * @returns {string[]}
 */
export function scriptToSsml(section, maxBytes = 4800) {
  const body = section
    .split(/(<(?:short|long) pause>)/)
    .map((part) => part === '<short pause>' ? '<break time="400ms"/>'
      : part === '<long pause>' ? '<break time="700ms"/>'
        : escXml(part))
    .join('')
    .replace(/\s*\n\s*/g, ' ')
  const pieces = []
  let current = ''
  for (const sentence of body.split(/(?<=[.!?…])\s+/)) {
    const next = current ? `${current} ${sentence}` : sentence
    if (current && Buffer.byteLength(`<speak>${next}</speak>`, 'utf-8') > maxBytes) {
      pieces.push(`<speak>${current}</speak>`)
      current = sentence
    } else {
      current = next
    }
  }
  if (current) pieces.push(`<speak>${current}</speak>`)
  return pieces
}
