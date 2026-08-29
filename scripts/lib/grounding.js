// Grounding validators for model-written prose.
//
// Two stages now ask a model for a sentence about data we already hold, and
// both have the same failure mode: the prose is fluent, the shape is valid, and
// one number in it was never in the input. `narrate-gdacs.js` carried this
// check inline; `narrate-indicators.js` needed the same one, and a second copy
// of a validator is a validator that can quietly stop agreeing with itself
// about what counts as grounded.
//
// The split is deliberate and is the thing to understand before editing:
//
//   `validateNumbers` is for prose about **what happened** — every figure has
//   to be traceable to the bundle, because a fabricated number reads exactly
//   like a real one and the reader has no way to check it.
//
//   `validateProperNouns` is the same argument for names, and it is stricter
//   than it looks safe to be, which is why it is opt-in per call site rather
//   than folded into the first. A model asked why an indicator moved will reach
//   for the actor it remembers rather than the one in the bundle, and "Saudi
//   Arabia cut output" is not checkable by a numeric scan.
//
// Neither catches a fabricated *qualitative* claim ("because traders feared a
// blockade"). Nothing here can; the mitigation is prompt-side discipline and
// the fact that both callers log the rejected text.

/**
 * Words that may be capitalised in ordinary prose without naming anything, so a
 * proper-noun scan must not demand them of the input.
 *
 * Sentence-initial capitalisation is the bulk of it and cannot be distinguished
 * from a real name by case alone, so the scan skips the first token of every
 * sentence instead of trying to enumerate openers. What is left here is the
 * words that appear capitalised *mid*-sentence: months, weekdays, and the
 * handful of demonyms and institutions that are genuinely generic connective
 * tissue in this register.
 */
const GENERIC_CAPITALS = new Set([
  // Dates are not actors.
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
  'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
  // Function words that open a sentence. Without these the scan rejects every
  // well-formed sentence, since the opener is capitalised whatever it is.
  'The', 'A', 'An', 'This', 'That', 'These', 'Those', 'It', 'Its', 'They',
  'Their', 'There', 'And', 'But', 'Or', 'So', 'Then', 'Now', 'Both', 'Each',
  'After', 'Before', 'When', 'While', 'Since', 'Until', 'Because', 'If',
  'In', 'On', 'At', 'By', 'For', 'From', 'With', 'Within', 'Over', 'Under',
  'Most', 'More', 'Much', 'Less', 'Fewer', 'No', 'Not', 'Nothing', 'None',
  'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Half', 'Nearly', 'Almost', 'About', 'Roughly', 'Every', 'All', 'Any',
  'What', 'Which', 'Who', 'How', 'Where', 'Why',
  // The structural words of country and institution names. None of them is the
  // identifying part of anything: "United States", "United Kingdom", "United
  // Arab Emirates", "European Union", "Islamic Republic" and "South Africa" all
  // carry their claim in the *other* token. Leaving them in meant a bundle that
  // spelled the country `US` rejected a sentence for writing "United States" —
  // which is the same country, written out.
  'United', 'States', 'Kingdom', 'Republic', 'Emirates', 'Union', 'Federal',
  'North', 'South', 'East', 'West', 'Central', 'New', 'Great', 'Saint',
])

/** Normalise a bundle to one lowercased haystack. Objects are stringified
 *  whole — key names become searchable too, which is harmless: a model is not
 *  going to fabricate a number that happens to be a JSON key. */
const haystack = (bundle) =>
  (typeof bundle === 'string' ? bundle : JSON.stringify(bundle)).toLowerCase()

/**
 * Every number-like token in `text` must appear in `bundle`.
 *
 * Returns a reason string when rejected, `null` when grounded — the shape both
 * callers branch on.
 *
 * Two tolerances, each of which exists because rejecting on it produced a false
 * negative in practice:
 *
 *  - **Comma grouping**: `3,319,522` in the prose against `3319522` in a JSON
 *    number field is the same figure written two ways.
 *  - **Rounding, proportionally, at every scale.** A model given `183 mm` writes
 *    `180 mm`; given a series change of `4.65%` it writes `4.7%`. Both are
 *    correct prose. The tolerance was originally gated to figures of 100 and
 *    above on the reasoning that below that the rounding step is the size of the
 *    fact — but that reasoning confused an *absolute* step with a proportional
 *    one. At 5% relative, `4.7` still matches `4.65` and `12%` still fails
 *    against an input of `8%`, which is the case the gate was protecting.
 *
 * **The rounding tolerance compares against the numbers actually in the
 * bundle**, which is the correction this extraction carried. The inline version
 * rounded the *output* number and then looked for that rounded form as a
 * substring of the input — so `180` written from an input of `183` produced
 * `Math.round(180/10)*10 = 180`, searched the blob for "180", and rejected the
 * exact case the comment said it existed to allow. Rounding one side of a
 * comparison and string-matching the other is not a tolerance.
 */
export function validateNumbers(text, bundle) {
  const blob = haystack(bundle)
  const inputNumbers = (blob.match(/\d[\d,]*(?:\.\d+)?/g) || [])
    .map((s) => Number(s.replace(/,/g, '')))
    .filter(Number.isFinite)
  const numbers = String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []
  for (const raw of numbers) {
    const norm = raw.replace(/,/g, '')
    if (blob.includes(norm) || blob.includes(raw)) continue
    const n = Number(norm)
    // Within 5% of some figure the bundle actually carries. Proportional rather
    // than a fixed step so it means the same thing at 4.65 and at 3,319,522.
    if (Number.isFinite(n) && inputNumbers.some((v) => Math.abs(v - n) <= Math.abs(n) * 0.05)) {
      continue
    }
    return `number "${raw}" not in input`
  }
  return null
}

/**
 * Every mid-sentence capitalised token in `text` must appear in `bundle`.
 *
 * For prose that claims *why* something moved. A numeric scan passes
 * "Saudi Arabia cut output after the OPEC meeting" with no numbers in it at
 * all, and both of those names are checkable against a bundle that carries our
 * own headlines and the feed window.
 *
 * **Only runs of two or more consecutive capitals are checked**, and that
 * calibration came from measurement rather than from taste.
 *
 * The first version checked every capitalised token. Run against twelve real
 * indicators it produced **two rejections, both false positives, and caught
 * nothing** — it threw away a good sentence for writing *"America's"* when the
 * bundle said `US`, and rejected a definitional one for containing the `500` in
 * *"S&P 500"*. A validator with a 17% false-positive rate and no true positives
 * is not protecting the reader; it is deleting the feature.
 *
 * The reason it fails on single tokens is that English capitalises the opener of
 * every sentence and every demonym, so *"Prices rose."*, *"Traders sold."* and
 * *"America's supply"* are indistinguishable from a country name without a
 * dictionary this repo does not have. Enumerating them means an ever-growing
 * list of content words, and `cycle.md` is explicit that these lists are
 * editorial judgements "not heuristics to be widened when something is missed".
 *
 * A *run* — `Aban Tether`, `Nova Scotia`, `Damietta LNG`, `Saudi Arabia` — is a
 * different thing. Consecutive capitalisation is a strong proper-noun signal, it
 * is where fabricated organisations and places actually appear, and an
 * adjective almost never forms one. What escapes is a fabricated single-word
 * actor. The prompt's iron rule is the primary defence there, the numeric check
 * still covers every figure and date, and the caller logs rejected text so the
 * gap stays visible.
 *
 * Also skipped:
 *
 *  - **`GENERIC_CAPITALS`** — months, weekdays, and the function words above.
 *  - **All-caps tokens of 2–5 letters** — `OPEC`, `VIX`, `US`, `LNG`. These are
 *    the register's ordinary vocabulary and a bundle that spells `sourceLabel`
 *    as `FRED · EIA` already carries most of them; the ones it does not are
 *    unit and index names, not claims about the world.
 *  - **Tokens under three characters**, which are initials and roman numerals.
 *
 * Matching is substring against the lowercased bundle rather than word-boundary
 * on purpose: `Saudi` has to be satisfied by `Saudi Arabia` in a headline, and
 * a possessive `Iran's` by `Iran`.
 */
export function validateProperNouns(text, bundle) {
  const blob = haystack(bundle)
  for (const run of String(text).match(/\b[A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*)+/g) || []) {
    // A run counts as a proper noun only once its generic members are removed.
    // "The Fed" and "In August" are an article or preposition followed by one
    // word, which is the single-token case wearing a run's shape — and treating
    // them as runs put the whole "The Fed held rates" sentence at risk over a
    // three-letter abbreviation. What survives this filter is `Aban Tether`.
    const tokens = run.split(/\s+/).filter((t) => !GENERIC_CAPITALS.has(t))
    if (tokens.length < 2) continue

    /**
     * **Any token, not every token** — the quantifier was the bug.
     *
     * What this guards against is an *invented* actor: a person, company or
     * place the desk never mentioned. A run that shares a token with the input
     * is not an invention, it is an elaboration of something the input already
     * established. Requiring every token instead deleted good paragraphs for
     * being *more* specific than their source. Measured on one production run:
     * the corpus wrote "Warsh", the sentence wrote "Kevin Warsh", and both FOMC
     * meetings lost their entire explanation over the first name — the two most
     * important events on the calendar, silently blank.
     *
     * `Aban Tether`, the case this check exists for, is still caught: neither
     * token appears anywhere in the bundle.
     */
    let grounded = false
    let firstMissing = null
    for (const token of tokens) {
      if (/^[A-Z]{2,5}$/.test(token)) continue
      // Strip a possessive so `Iran’s` is satisfied by `Iran`, and a hyphenated
      // suffix so `Milan-listed` is satisfied by `Milan` — the place is the
      // claim and `-listed` is the adjective it was turned into. That one cost
      // a good sentence in the first full run over 98 instruments.
      const bare = token
        .replace(/[’']s$/, '')
        .replace(/-.*$/, '')
        .toLowerCase()
      if (bare.length < 3) continue
      if (blob.includes(bare) || demonymOf(bare, blob)) {
        grounded = true
        break
      }
      if (!firstMissing) firstMissing = token
    }
    if (!grounded && firstMissing) return `name "${firstMissing}" not in input`
  }
  return null
}

/**
 * Is this token an adjectival form of a place the bundle does name?
 *
 * `Chinese` from `China`, `African` from `South Africa`, `Israeli` from
 * `Israel`. A demonym is the country as an adjective — the same claim in a
 * different part of speech — and rejecting one is rejecting a sentence for its
 * grammar. Two exchange cards and a chokepoint lost their explanations to
 * exactly this in a single run.
 *
 * Two conditions, and both are needed. The token has to *look* adjectival, and
 * its stem has to be in the bundle. A prefix test alone had to be five
 * characters to avoid matching noise, and five characters misses `China` by
 * one letter — `chine` is not in `china` — which is the single most common
 * demonym in this corpus. A suffix test alone would accept `Aban` for ending
 * in `-an`. Together they are narrow: `Chinese` is adjectival *and* `chin` is
 * in the bundle, while `Aban` is adjectival and `aban` is nowhere.
 *
 * A suffix list rather than a country table because the country table is the
 * thing that is always missing the next entry; these six suffixes cover the
 * English forms, and an irregular one (`Dutch`, `Danish`) simply falls through
 * to the ordinary token check rather than breaking anything.
 */
const DEMONYM_SUFFIX = /(?:ese|ish|ian|an|i|ic)$/
const DEMONYM_STEM = 4
function demonymOf(bare, blob) {
  if (bare.length <= DEMONYM_STEM || !DEMONYM_SUFFIX.test(bare)) return false
  return blob.includes(bare.slice(0, DEMONYM_STEM))
}

/**
 * Both checks, numbers first.
 *
 * `properNouns` is opt-in because the two call sites want different strictness:
 * a definitional sentence about what Brent crude *is* draws on general
 * knowledge by design and would fail a name scan on "North Sea", while a
 * sentence about what happened last week must not.
 */
export function validateGrounding(text, bundle, { properNouns = false } = {}) {
  return validateNumbers(text, bundle) ?? (properNouns ? validateProperNouns(text, bundle) : null)
}
