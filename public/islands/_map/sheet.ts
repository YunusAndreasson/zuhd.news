// The detail sheet.
//
// Reuses the site's existing native-<dialog> pattern (`.island-sheet` in
// style.css) rather than introducing a second modal system. Built imperatively
// with textContent throughout — this island stays off the Preact runtime the
// other islands use, and never interpolates content into innerHTML.

import type { Chokepoint, ConflictEvent, GdacsAlert } from './types'

const APP_IOS = 'https://apps.apple.com/us/app/zuhd-news/id6760964753'
const APP_ANDROID = 'https://play.google.com/store/apps/details?id=news.zuhd.app'
const OPEN_COUNT_KEY = 'zuhd-map-opens'
/** Only mention the app once the map has clearly been found useful. */
const APP_PROMPT_AFTER = 4

export interface Sheet {
  element: HTMLDialogElement
  showGdacs(alert: GdacsAlert, pinned: boolean): void
  showChokepoint(cp: Chokepoint, pinned: boolean): void
  showConflict(event: ConflictEvent, window: string | null, pinned: boolean): void
  close(): void
  isOpen(): boolean
  isPinned(): boolean
  pin(): void
  destroy(): void
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

export function relativeTime(ts: number, now = Date.now()) {
  const mins = Math.round((now - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function bumpOpenCount(): number {
  try {
    const next = Number(localStorage.getItem(OPEN_COUNT_KEY) || '0') + 1
    localStorage.setItem(OPEN_COUNT_KEY, String(next))
    return next
  } catch {
    return 0
  }
}

function appLine(): HTMLElement | null {
  if (bumpOpenCount() < APP_PROMPT_AFTER) return null
  const p = el('p', 'map-sheet-app')
  p.append('Carry the map with you — ')
  const ios = el('a', undefined, 'iPhone') as HTMLAnchorElement
  ios.href = APP_IOS
  ios.rel = 'noopener'
  const android = el('a', undefined, 'Android') as HTMLAnchorElement
  android.href = APP_ANDROID
  android.rel = 'noopener'
  p.append(ios, ' · ', android)
  return p
}

export function createSheet(): Sheet {
  const dialog = document.createElement('dialog')
  dialog.className = 'island-sheet map-sheet'

  const closeForm = el('form', 'island-sheet-close-form') as HTMLFormElement
  closeForm.method = 'dialog'
  const closeBtn = el('button', 'island-sheet-close', '×') as HTMLButtonElement
  closeBtn.type = 'submit'
  closeBtn.setAttribute('aria-label', 'Close')
  closeForm.append(closeBtn)

  const inner = el('div', 'island-sheet-inner')
  dialog.append(closeForm, inner)
  document.body.append(dialog)

  let pinned = false
  dialog.addEventListener('close', () => {
    pinned = false
  })

  // Hover opens the sheet non-modally, so the map underneath stays live and
  // the pointer can move straight to the next beacon. Clicking promotes the
  // same sheet to a real modal — committed reading, backdrop and all. A
  // pinned sheet ignores hover entirely, so it never vanishes mid-read.
  const open = (pin: boolean): boolean => {
    if (pinned && !pin) return false
    if (pin) {
      if (dialog.open && !pinned) dialog.close()
      pinned = true
      dialog.classList.remove('is-peek')
      if (!dialog.open) dialog.showModal()
    } else {
      dialog.classList.add('is-peek')
      if (!dialog.open) dialog.show()
    }
    return true
  }

  const render = (nodes: Node[], pin: boolean) => {
    if (pinned && !pin) return
    // The app line used to hang off the story sheet, which the map no longer
    // opens — stories now read in a popup anchored to their own coordinate. It
    // belongs on whichever sheet the reader has actually committed to, and only
    // once they have opened enough of them to have found the map useful.
    if (pin) {
      const app = appLine()
      if (app) nodes = [...nodes, app]
    }
    inner.replaceChildren(...nodes)
    open(pin)
  }

  const kicker = (parts: Array<string | null | undefined>) =>
    el('p', 'map-sheet-kicker', parts.filter(Boolean).join(' · '))

  const readMore = (href: string, label: string) => {
    const a = el('a', 'map-sheet-link', label) as HTMLAnchorElement
    a.href = href
    return a
  }

  return {
    element: dialog,

    showGdacs(alert, pin) {
      const nodes: Node[] = []
      nodes.push(kicker(['disaster', alert.alertlevel?.toLowerCase(), alert.country || null]))
      nodes.push(el('h2', 'island-sheet-title', alert.name || 'Disaster alert'))
      if (alert.severityText) nodes.push(el('p', 'map-sheet-lead', alert.severityText))
      if (alert.narrative) nodes.push(el('p', 'map-sheet-lead', alert.narrative))
      nodes.push(el('p', 'map-sheet-meta', `GDACS · ${new Date(alert.fromDate).toISOString().slice(0, 10)}`))
      if (alert.reportUrl) {
        const a = readMore(alert.reportUrl, 'GDACS report')
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        nodes.push(a)
      }
      render(nodes, pin)
    },

    showChokepoint(cp, pin) {
      const nodes: Node[] = []
      const delta = cp.delta7vs90?.[cp.primaryField]
      const deltaLabel =
        typeof delta === 'number'
          ? `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}% vs 90-day baseline`
          : null
      nodes.push(kicker(['chokepoint', deltaLabel]))
      nodes.push(el('h2', 'island-sheet-title', cp.name))
      if (cp.blurb) nodes.push(el('p', 'map-sheet-lead', cp.blurb))
      nodes.push(el('p', 'map-sheet-meta', 'IMF PortWatch · 7-day vessel traffic'))
      if (cp.relatedArticles?.length) {
        nodes.push(el('p', 'map-sheet-more-label', 'Related coverage'))
        const list = el('ul', 'map-sheet-more')
        for (const a of cp.relatedArticles.slice(0, 5)) {
          const li = el('li')
          const link = el('a', undefined, a.title) as HTMLAnchorElement
          link.href = `/a/${a.slug}`
          li.append(link)
          list.append(li)
        }
        nodes.push(list)
      }
      render(nodes, pin)
    },

    showConflict(event, windowLabel, pin) {
      const nodes: Node[] = []
      nodes.push(kicker(['conflict', event.country || null, event.location || null]))
      const title =
        event.fatalities > 0
          ? `${event.fatalities} killed · ${event.actor1}`
          : event.subEvent.replace(/_/g, ' ')
      nodes.push(el('h2', 'island-sheet-title', title))
      if (event.notes) nodes.push(el('p', 'map-sheet-lead', event.notes))
      const meta = [`UCDP · ${event.eventDate}`]
      if (windowLabel) meta.push(windowLabel)
      nodes.push(el('p', 'map-sheet-meta', meta.join(' · ')))
      // The conflict feed trails real time by months. Saying so in the sheet is
      // the difference between a dated record and a false "now".
      nodes.push(el('p', 'map-sheet-note', 'Conflict records publish on a lag and are not live.'))
      render(nodes, pin)
    },

    close() {
      pinned = false
      if (dialog.open) dialog.close()
    },
    isOpen: () => dialog.open,
    isPinned: () => pinned,
    pin() {
      pinned = true
    },
    destroy() {
      dialog.remove()
    },
  }
}
