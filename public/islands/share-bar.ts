// The article page's share row, upgraded in place.
//
// The page ships the row already rendered: a label and three real `<a href>`s
// built from `shareLinks()` in `build.js`. That version is the one a crawler
// reads, the one a reader with JavaScript off gets, and the one that survives
// this bundle failing to load — the same bargain the footer's document links
// and the rail's story rows already make.
//
// All this island does is take the row somewhere the server could not: on a
// phone, `navigator.share` opens the operating system's own sheet, which
// reaches the messaging app the reader actually uses instead of the three we
// guessed. It also adds "copy link", which needs a clipboard API to exist.
//
// It is auto-mounted, not click-mounted, because there is no affordance to
// click — the row is already there, and the upgrade has to happen before the
// reader reaches for it.

import { appBar, appPrompt, pickStore } from './_app-prompt'
import { renderShare } from './_share'
import { SITE_URL } from '@shared/share'

interface Props {
  /** Canonical URL of the page being shared. */
  url?: string
  title?: string
}

export function mount(node: HTMLElement, props: Props = {}): void {
  const url = props.url || location.href.split('#')[0]
  const title = props.title || document.title

  renderShare(node, { url: new URL(url, SITE_URL).href, title })

  // Reading a whole article counts as an open, exactly as opening a story card
  // on the map does — a reader who arrived here from a shared link and stayed
  // is the same reader either way. The prompt lands after the row rather than
  // inside it: sharing and installing are two different offers and should not
  // read as one list.
  //
  // On a phone the article already ends in the app block (`.article-app`,
  // shown to a coarse pointer only), so the line would say it twice: there the
  // block keeps the reader's store and Android's bar is the bounded offer.
  const handoff = document.querySelector<HTMLElement>('.article-app')
  if (handoff) pickStore(handoff)
  if (handoff && getComputedStyle(handoff).display !== 'none') {
    appBar()
    return
  }
  const prompt = appPrompt()
  if (prompt) node.after(prompt)
}
