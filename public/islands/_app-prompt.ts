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
// sends it, and a reader who turns it on is told on /privacy that the token is stored).
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
//
// ── On a phone, at the end of an article ───────────────────────────────────
//
// A phone reading an article is a reader the app was made for, so the article
// ends with a block naming it (`appHandoffHtml`, `build.js`): one sentence, the
// reader's own store, and no counter, because it is the end of the page and
// not something laid over it. Android has no banner of its own the way Safari
// does (the `apple-itunes-app` meta), so Android also gets a slim bar at the
// foot of the screen, and that bar *is* this line: the same counters, the same
// `PROMPT_AFTER` and `PROMPT_LIMIT`, and a press on its × is an answer
// (`DONE_KEY`), as following it is. It reserves its own height on `body`, so
// it never covers the text. Nothing here asks for a permission.

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
  if (!due(counted)) return null

  const p = document.createElement('p')
  p.className = 'app-prompt'

  const text = document.createElement('span')
  text.className = 'app-prompt-text'
  // Present tense, and a fact about the app rather than an instruction to the
  // reader. "Get the app" is a demand; this is the reason someone would.
  text.textContent = 'Breaking stories reach the app as a notification.'
  p.append(text, ' ')

  const sep = document.createElement('span')
  sep.className = 'app-prompt-sep'
  sep.setAttribute('aria-hidden', 'true')
  sep.textContent = '·'

  p.append(store(APP_IOS, 'iPhone', 'app-prompt-link'), sep, store(APP_ANDROID, 'Android', 'app-prompt-link'))
  return p
}

/**
 * Whether the line may show for this open, and the count of its showing.
 * Every surface that offers the app asks this one question.
 */
const due = (counted: boolean): boolean => {
  if (read(DONE_KEY)) return false
  const opens = counted ? countOpen() : read(OPEN_KEY)
  if (opens < PROMPT_AFTER) return false

  const shown = read(SHOWN_KEY) + 1
  write(SHOWN_KEY, shown)
  if (shown > PROMPT_LIMIT) {
    write(DONE_KEY, 1)
    return false
  }
  return true
}

const store = (href: string, label: string, className: string): HTMLAnchorElement => {
  const a = document.createElement('a')
  a.className = className
  a.href = href
  a.rel = 'noopener'
  a.target = '_blank'
  a.textContent = label
  // Following the line answers it. Asking again after that is not a
  // suggestion, it is a reminder that we were not listening.
  a.addEventListener('click', () => write(DONE_KEY, 1))
  return a
}

/** The reader's phone, from its user agent; `null` is "not a phone we know". */
export const appPlatform = (): 'ios' | 'android' | null => {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  // iPadOS reports a Mac; a touch screen is what tells them apart.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  return null
}

/**
 * The article's app block keeps the store the reader's phone takes. On a
 * platform it cannot name it keeps both, which is what the HTML already says.
 */
export function pickStore(block: HTMLElement): void {
  const platform = appPlatform()
  for (const a of block.querySelectorAll<HTMLAnchorElement>('a[data-platform]')) {
    if (platform && a.dataset.platform !== platform) a.remove()
    else a.addEventListener('click', () => write(DONE_KEY, 1))
  }
}

/**
 * Android's bar at the foot of the screen, shown and placed, or `null`.
 *
 * @param counted as `appPrompt`'s: `false` when the caller has counted this open.
 */
export function appBar(counted = true): HTMLElement | null {
  if (appPlatform() !== 'android') return null
  if (!due(counted)) return null

  const bar = document.createElement('div')
  bar.className = 'app-bar'
  bar.setAttribute('role', 'region')
  bar.setAttribute('aria-label', 'The app')

  const text = document.createElement('span')
  text.className = 'app-bar-text'
  text.textContent = 'Read this on the map in the app'

  const sep = document.createElement('span')
  sep.className = 'app-bar-sep'
  sep.setAttribute('aria-hidden', 'true')
  sep.textContent = '·'

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'app-bar-close'
  close.setAttribute('aria-label', 'Dismiss')
  close.textContent = '×'

  const shut = () => {
    bar.remove()
    document.body.classList.remove('has-app-bar')
  }
  close.addEventListener('click', () => {
    write(DONE_KEY, 1)
    shut()
  })

  const link = store(APP_ANDROID, 'Get it on Google Play', 'app-bar-link')
  link.addEventListener('click', shut)
  bar.append(text, sep, link, close)
  document.body.append(bar)
  document.body.classList.add('has-app-bar')
  return bar
}
