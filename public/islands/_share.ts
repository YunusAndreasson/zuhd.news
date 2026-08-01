// Sharing.
//
// The site had no way to pass a story on. Every reading surface — the map's
// story card, the standalone article page — ended at the sources line, so a
// reader who wanted to send something to someone had to select the address bar
// and hope the URL was the one they thought it was. On the map it never is:
// the URL stays `/` no matter which story is open, by design, so the address
// bar is actively the wrong thing to copy.
//
// ── One control, two shapes ────────────────────────────────────────────────
//
// `navigator.share` opens the operating system's own sheet, which is the right
// answer wherever it exists: it reaches the apps the reader actually uses and
// costs one word of chrome. It does not exist on desktop Firefox, or on Chrome
// under Linux, so the fallback is a row of plain links — the same targets the
// OS sheet would have offered, named rather than pictured, in the footnote
// register `.footer-social` already uses.
//
// Both shapes share their targets, and both share `https://zuhd.news/a/{slug}`
// — the canonical page, which carries the generated OG card. Nothing appends a
// campaign parameter. The site's claim is that it does not track anyone, and a
// share URL that quietly says where it came from is exactly the sort of thing
// that claim has to keep covering.

import { shareLinks, type ShareTarget } from '@shared/share'
import { el } from './_dom'

export type { ShareTarget }


const canNativeShare = (t: ShareTarget): boolean => {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  // `canShare` is the only way to ask before opening a sheet that might reject
  // the payload; where it is absent, `share` itself is the check.
  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare({ title: t.title, url: t.url })
    } catch {
      return false
    }
  }
  return true
}

const copy = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Render the control into `root`, replacing whatever was there.
 *
 * Takes a root rather than returning one so the caller owns the placement
 * classes: the map card wants it inside the card's own bottom rule, the
 * article page wants it in the footnote row, and both are the same control.
 */
export function renderShare(root: HTMLElement, target: ShareTarget): void {
  root.classList.add('share')

  // One live region for both branches. A label that changes inside a button is
  // not reliably announced; this is.
  const status = el('span', 'sr-only')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  if (canNativeShare(target)) {
    const btn = el('button', 'share-trigger', 'Share')
    btn.type = 'button'
    btn.addEventListener('click', async () => {
      try {
        await navigator.share({ title: target.title, url: target.url })
      } catch (err) {
        // The reader dismissing the OS sheet is the common case and is not a
        // failure. Anything else means the sheet is not usable on this device
        // after all, so fall back to the row rather than leaving a dead button.
        if ((err as DOMException)?.name === 'AbortError') return
        renderFallback(root, target, status)
      }
    })
    // No `.share-label` here — the button already says the word, and the row's
    // label exists only because a bare "x · whatsapp · email" does not say what
    // it is for.
    root.replaceChildren(btn, status)
    return
  }

  renderFallback(root, target, status)
}

function renderFallback(root: HTMLElement, target: ShareTarget, status: HTMLElement): void {
  const nodes: Node[] = [el('span', 'share-label', 'Share')]

  // Copy first: it is the only target that covers the app we did not think of,
  // and on the map it is the only way to get at a URL the address bar is
  // deliberately not showing.
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    const btn = el('button', 'share-choice', 'copy link')
    btn.type = 'button'
    let revert: ReturnType<typeof setTimeout> | undefined
    btn.addEventListener('click', async () => {
      const ok = await copy(target.url)
      btn.textContent = ok ? 'copied' : 'copy failed'
      status.textContent = ok ? 'Link copied to clipboard' : 'Could not copy the link'
      clearTimeout(revert)
      revert = setTimeout(() => {
        btn.textContent = 'copy link'
        status.textContent = ''
      }, 2400)
    })
    nodes.push(btn)
  }

  for (const { label, href, aria } of shareLinks(target)) {
    const a = el('a', 'share-choice', label)
    a.href = href
    a.setAttribute('aria-label', aria)
    // mailto: must open in place; a target of _blank leaves an empty tab behind.
    if (!href.startsWith('mailto:')) {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    }
    nodes.push(a)
  }

  nodes.push(status)
  root.replaceChildren(...nodes)
}
