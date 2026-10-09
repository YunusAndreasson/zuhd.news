/**
 * Does a story's hook only say its title again?
 *
 * The title says what happened in three to five words; the hook is the one
 * sentence the reader sees under it before deciding to open the story — on
 * the app's resting card, and as the dek of the X and Instagram cards. A hook
 * that repeats the title spends that sentence on nothing: "Settlers Attack
 * Olive Pickers" over "Israeli settlers attacked Palestinian olive pickers
 * Monday during a closure."
 *
 * Both prompts already forbid it (`write-prompt.md` `<revision>`,
 * `check-prompt.md`'s title-echo test), and it doubled anyway: hooks repeating
 * two thirds of their title's words with no figure of their own were 9.8% of
 * 357 articles from 2026-09-20 to 09-25 and 17.1% of 409 from 09-26 to 10-03.
 * The editor rewrites an echo when it notices one, and the logs show it
 * noticing a few a day. This measures every article, so the editor is told
 * which ones to look at.
 *
 * **A flag, never a verdict.** Of 30 flagged hooks read by hand (2026-10-03),
 * 20 were echoes and 2 borderline; 8 carried a stake in words, not digits —
 * "Russia threatens nuclear response if NATO isolates Kaliningrad". So the
 * editor applies its own test to each, and nothing is quarantined on this.
 */

import { stripDateline } from './article.js'

/** Words that say nothing about which story this is. */
const STOP = new Set(
  `a an the and or but of to in on at for from by with as is are was were be been being
  has have had it its this that these those over after before into than then their his her
  they them he she we you i not no new says say said will would could may might can amid
  about up down out per via while`.split(/\s+/),
)

/** Crude on purpose: "attacked" and "Attack", "Pickers" and "pickers" are one word. */
function stem(w) {
  for (const suf of ['ing', 'ers', 'er', 'es', 'ed', 's']) {
    if (w.length > 4 && w.endsWith(suf)) return w.slice(0, -suf.length)
  }
  return w
}

/** The words a sentence is about: link markup dropped, possessives cut. */
export function contentWords(s) {
  const plain = String(s || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/’/g, "'")
  const out = []
  for (const tok of plain.match(/[\p{L}\p{N}$%][\p{L}\p{N}$%.'-]*/gu) || []) {
    const w = tok
      .replace(/^[.'-]+|[.'-]+$/g, '')
      .toLowerCase()
      .replace(/'s$/, '')
    if (w && !STOP.has(w)) out.push(stem(w))
  }
  return out
}

/** The figures in a sentence, as written: `4.5`, `39bn`, `2,000`. */
function figures(s) {
  return (String(s || '').match(/\d[\d,.]*/g) || []).map((f) => f.replace(/[.,]$/, ''))
}

/**
 * The hook as the reader sees it: the body's first block without its
 * dateline (`Kano — `), which every surface strips. By the location, as the
 * app strips it, and without one by the pattern the validator reads a
 * dateline with (`stripDateline`, `lib/article.js`).
 *
 * @param {string} body
 * @param {string} [location]
 */
export function hookOf(body, location) {
  const first = String(body || '').trim().split(/\n\s*\n/)[0] || ''
  return stripDateline(first, location)
}

/**
 * How much of the title the hook repeats, and whether it brings a figure the
 * title does not carry. An echo repeats at least two thirds of the title's
 * words and brings no figure of its own — the threshold the 2026-10-03
 * measurement above used.
 *
 * @param {string} title
 * @param {string} hook
 * @returns {{ covered: number, figure: boolean, echo: boolean }}
 */
export function titleEcho(title, hook) {
  const titleWords = contentWords(title)
  if (titleWords.length === 0) return { covered: 0, figure: false, echo: false }
  const hookWords = new Set(contentWords(hook))
  const covered = titleWords.filter((w) => hookWords.has(w)).length / titleWords.length
  const titleFigures = new Set(figures(title))
  const figure = figures(hook).some((f) => !titleFigures.has(f))
  return { covered, figure, echo: covered >= 2 / 3 && !figure }
}
