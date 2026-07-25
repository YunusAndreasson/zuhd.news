// The app line, and what it is allowed to say.
//
// ── Why notifications ──────────────────────────────────────────────────────
//
// The obvious way to make a news site sticky is to ask for the browser's
// notification permission. This site will not: a web push subscription is a
// per-device endpoint held on our server, which is precisely the kind of record
// the privacy claim on /privacy says we do not keep — the app-open beacon was
// removed for the same reason. So the honest version of "get told when
// something breaks" is the app, which already has push (`functions/api/push.js`
// sends it, and Expo holds the token, not us).
//
// That turns a nag into an answer. The line does not say "download our app",
// which is a request; it says what the reader gets, which is a reason. And it
// serves the download goal better than a generic banner, because it names the
// one thing the web page genuinely cannot do.
//
// ── Why it is bounded ──────────────────────────────────────────────────────
//
// A prompt that appears on every card is chrome, not a suggestion. This one
// waits until the reader has opened enough of the map to have found it useful,
// then appears at most a handful of times, then stops for good — and stops
// immediately if they follow it. All three counters are in localStorage, which
// means they are the reader's own and we never see them.

import { APP_ANDROID, APP_IOS } from '@shared/share'

/** Opens across the whole site — cards, sheets, articles. Pre-existing key. */
const OPEN_KEY = 'zuhd-map-opens'
/** How many times the line has actually been rendered. */
const SHOWN_KEY = 'zuhd-app-shown'
/** Set when the reader follows the line, or has seen it enough times. */
const DONE_KEY = 'zuhd-app-done'

/** Only mention the app once the site has clearly been found useful. */
const PROMPT_AFTER = 4
/** Asked and not taken this many times is an answer. */
const PROMPT_LIMIT = 3

const read = (key: string): number => {
  try {
    return Number(localStorage.getItem(key) || '0') || 0
  } catch {
    return 0
  }
}

const write = (key: string, value: number): void => {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* private mode, storage disabled — the prompt simply never fires */
  }
}

/**
 * Record that the reader opened something worth reading, and report the running
 * total. Called once per story card, overlay sheet or article page.
 */
export function countOpen(): number {
  const next = read(OPEN_KEY) + 1
  write(OPEN_KEY, next)
  return next
}

/**
 * The app line, or `null` — which is the answer most of the time.
 *
 * @param counted pass `false` when the caller has already called `countOpen()`
 *   for this open, so one card cannot count as two.
 */
export function appPrompt(counted = true): HTMLElement | null {
  if (read(DONE_KEY)) return null
  const opens = counted ? countOpen() : read(OPEN_KEY)
  if (opens < PROMPT_AFTER) return null

  const shown = read(SHOWN_KEY) + 1
  write(SHOWN_KEY, shown)
  if (shown > PROMPT_LIMIT) {
    write(DONE_KEY, 1)
    return null
  }

  const p = document.createElement('p')
  p.className = 'app-prompt'

  const text = document.createElement('span')
  text.className = 'app-prompt-text'
  // Present tense, and a fact about the app rather than an instruction to the
  // reader. "Get the app" is a demand; this is the reason someone would.
  text.textContent = 'Breaking stories reach the app as a notification.'
  p.append(text, ' ')

  const store = (href: string, label: string) => {
    const a = document.createElement('a')
    a.className = 'app-prompt-link'
    a.href = href
    a.rel = 'noopener'
    a.target = '_blank'
    a.textContent = label
    // Following the line answers it. Asking again after that is not a
    // suggestion, it is a reminder that we were not listening.
    a.addEventListener('click', () => write(DONE_KEY, 1))
    return a
  }

  const sep = document.createElement('span')
  sep.className = 'app-prompt-sep'
  sep.setAttribute('aria-hidden', 'true')
  sep.textContent = '·'

  p.append(store(APP_IOS, 'iPhone'), sep, store(APP_ANDROID, 'Android'))
  return p
}
