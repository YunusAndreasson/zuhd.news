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

const bigrams = (words) => words.slice(1).map((w, i) => `${words[i]} ${w}`)

/**
 * The sentences of `script` that a transcript of its audio does not contain.
 *
 * Checked per sentence, on word pairs, because the failure is a skipped
 * story: on 2026-09-26 Gemini 3.8 Flash dropped a whole three-sentence
 * story from a 587-word request and returned success. A bag-of-words score
 * for the request still read 91%; the skipped sentences' word pairs scored
 * 0.00, 0.08 and 0.12 against the audio, while every sentence it did say
 * scored 0.85 or more (median 1.00). Sentences under five word pairs are
 * too short to judge.
 * @param {string} script
 * @param {string} transcript
 * @param {number} [min]
 * @returns {string[]}
 */
export function unheardSentences(script, transcript, min = 0.5) {
  const heard = new Set(bigrams(spokenWords(transcript)))
  return String(script)
    .replace(PAUSE_TAG, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((sentence) => {
      const pairs = bigrams(spokenWords(sentence))
      return pairs.length >= 5 && pairs.filter((b) => heard.has(b)).length / pairs.length < min
    })
}

/**
 * A section in synthesis-sized pieces: split at `<long pause>` (the story
 * boundaries) and regrouped up to `maxChars`, so a request carries one or
 * two stories. The skip above happened in the longest request of the run;
 * a short request is also a cheap retry. The caller puts a pause-length
 * silence between the pieces.
 * @param {string} section
 * @param {number} [maxChars]
 * @returns {string[]}
 */
export function splitForSynthesis(section, maxChars = 1200) {
  const pieces = []
  let current = ''
  for (const story of section.split(/\s*<long pause>\s*/).map((s) => s.trim()).filter(Boolean)) {
    const next = current ? `${current}\n<long pause>\n${story}` : story
    if (current && next.length > maxChars) {
      pieces.push(current)
      current = story
    } else {
      current = next
    }
  }
  if (current) pieces.push(current)
  return pieces
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
