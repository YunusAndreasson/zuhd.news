// The seams between the map and its two rails: drag to resize, press to fold.
//
// ── Why a map gets resizable panes at all ──────────────────────────────────
//
// Because on this layout the trade is real and it is not the one a reader
// expects. The globe is `min(canvasW, canvasH)` and the canvas is as tall as
// the window, so **widening or narrowing a rail cannot change the size of the
// Earth** — not by a pixel, until the canvas is narrower than it is tall. What
// the reader is actually adjusting is the split between the two columns of
// *type*: a wider story rail is longer headlines, a wider instrument rail is
// more room for the money rows, and the planet is a constant through both.
//
// That is exactly the case where a control beats a decision. A layout choice
// nobody can get wrong is a layout choice worth handing over, and the stylesheet
// keeps the bounds so no drag can produce a broken frame.
//
// ── What folding means, and what it does not ──────────────────────────────
//
// It does **not** mean "see more map", and the code must not imply that it
// does. Folding a rail on a height-bound globe reclaims no globe; what it
// reclaims is attention. So the fold is offered as what it is — a way to look
// at the planet and nothing else — and both toggles stay on screen while their
// pane is shut, because a control that hides the only route back to itself is
// not a disclosure, it is a trapdoor.
//
// ── And the two panes fold differently ────────────────────────────────────
//
// The story rail goes to zero: it is content, and a reader who folds it has
// said they are done reading for now. The instrument rail narrows to a spine
// instead, because what it holds is not all of one kind — controls, which the
// fold is *about*, and readings, which it was silently taking with them. A
// folded aside used to be a 15px triangle stating nothing: not which layers
// were on, not what was shading the land, not what the world was doing. It is
// a column of sparklines now.
//
// This module does not know any of that — the width and the contents are the
// stylesheet's, keyed on `body.map-aside-off`. What it has to get right is the
// *word*, which is why `verbs` exists: a button offering to "show the
// instruments" while four of them are on screen is describing a layout that no
// longer exists.

import { el } from '../_dom'

/** One key for both panes; two would be two chances to write half a layout. */
const STORE_KEY = 'zuhd:map-panes'

interface PaneState {
  /**
   * The reader's width in px.
   *
   * Explicitly `| undefined` rather than merely optional, because
   * `exactOptionalPropertyTypes` is on and a double-click has to be able to
   * *clear* this back to the layout's own arithmetic — which is an assignment
   * of `undefined`, not a missing key.
   */
  w?: number | undefined
  /** Folded. */
  off?: boolean
}

type Stored = Record<string, PaneState>

/**
 * Read the stored layout, and never let a bad one take the map down.
 *
 * `localStorage` throws on access in a partitioned or storage-blocked context,
 * not merely on write — and this runs during `mount`, so an exception here is a
 * map that does not draw. The same reasoning as `_map/read-state.ts`: the
 * preference is a nicety and the map is not.
 */
const readStore = (): Stored => {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Stored) : {}
  } catch {
    return {}
  }
}

const writeStore = (next: Stored) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
  } catch {
    /* Private mode, or a full quota. The layout is still correct for this
       visit; only its memory is lost. */
  }
}

export interface PaneSeamOptions {
  /** Which edge of the canvas this seam sits on. */
  side: 'left' | 'right'
  /**
   * The custom property the reader's width is written to, on `document.body`.
   *
   * Deliberately *not* the property the layout reads. `--map-rail-w` and
   * `--map-aside-w` are both computed — one steps by viewport width, the other
   * is the surplus left over once the globe has been squared — and an inline
   * override of either would replace that arithmetic outright, so a width
   * dragged on a 2560 monitor would arrive whole on a 1280 laptop and on a
   * phone. Writing to a `-user` property that the stylesheet feeds *into* its
   * own `clamp()` keeps every bound the layout depends on and still lets the
   * reader move the number.
   */
  prop: string
  /** Which pane this is, for the stored state and the class that folds it. */
  id: 'rail' | 'aside'
  /** Named in the toggle's label: "Hide the {name}". */
  name: string
  /**
   * What folding this pane actually does to it, in the two words the button
   * says.
   *
   * The two panes no longer fold the same way and the label must not claim they
   * do. The story rail goes to zero and takes the wordmark and the document
   * links with it — that is *hidden*. The instrument rail narrows to a spine of
   * sparklines and keeps showing them — that is *collapsed*, and a button
   * promising to "show the instruments" while four of them are on screen is a
   * button describing a different layout.
   *
   * Defaulted rather than required, because hide/show is what a fold meant
   * before this and is still the right answer for any pane that genuinely
   * disappears.
   */
  verbs?: { off: string; on: string }
  /** Where the drag is measured from — the seam's own live position. */
  edge: () => number
  /** Relayout: whatever has to be re-measured once a width has moved. */
  onChange: () => void
}

export interface PaneSeam {
  element: HTMLElement
  /** Fold or unfold, from a key as well as from the button. */
  toggle(): void
  destroy(): void
}

export function createPaneSeam(opts: PaneSeamOptions): PaneSeam {
  const { side, prop, id, name, verbs = { off: 'Show', on: 'Hide' } } = opts
  const root = el('div', 'map-seam')
  root.dataset.side = side

  const toggle = el('button', 'map-seam-toggle')
  toggle.type = 'button'
  // Two triangles, one of which is `display: none` per state — the same trick
  // `.map-more`'s two labels use, so the button announces one name and the
  // hidden glyph leaves the accessibility tree with the pixels.
  toggle.innerHTML =
    '<svg viewBox="0 0 8 12" aria-hidden="true" focusable="false" fill="currentColor">' +
    '<path d="M6.2 1 1.4 6l4.8 5V1Z"/></svg>'
  root.append(toggle)

  const store = readStore()
  const state: PaneState = store[id] ?? {}

  const setFolded = (off: boolean) => {
    state.off = off
    document.body.classList.toggle(`map-${id}-off`, off)
    toggle.setAttribute('aria-expanded', String(!off))
    const words = `${off ? verbs.off : verbs.on} the ${name}`
    toggle.setAttribute('aria-label', words)
    toggle.title = words
  }

  const setWidth = (px: number | undefined) => {
    state.w = px
    if (px === undefined) document.body.style.removeProperty(prop)
    else document.body.style.setProperty(prop, `${Math.round(px)}px`)
  }

  const persist = () => {
    const next = readStore()
    next[id] = state
    writeStore(next)
  }

  setFolded(state.off === true)
  if (typeof state.w === 'number' && Number.isFinite(state.w)) setWidth(state.w)

  // --- Drag ---------------------------------------------------------------
  /**
   * One write per frame, and the write is the *last* position rather than the
   * first.
   *
   * A pointermove can fire several times between frames, and each write here
   * ends in a grid reflow plus `map.resize()` — which reallocates MapLibre's
   * drawing buffer. Coalescing onto a rAF is the same discipline the story
   * refresh already follows; taking the newest sample rather than the one that
   * scheduled the frame is what keeps the seam under the pointer instead of
   * trailing it by however many events arrived meanwhile.
   */
  let frame = 0
  let pending = 0
  let dragging = false

  const flush = () => {
    frame = 0
    setWidth(pending)
    opts.onChange()
  }

  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    // The rail grows away from its own edge of the screen, so the left seam
    // reads the pointer's x directly and the right one reads its distance from
    // the far edge. Getting this backwards is a pane that shrinks when dragged
    // outward, which is the one behaviour a drag handle cannot have.
    pending = side === 'left' ? e.clientX : window.innerWidth - e.clientX
    if (!frame) frame = requestAnimationFrame(flush)
  }

  /**
   * `setPointerCapture` throws on a pointer id the browser no longer considers
   * active, which is not a hypothetical: a pointer released outside the window,
   * or a synthetic event from a test harness, both produce one. An exception
   * out of a `pointerdown` handler would leave `dragging` true with no way to
   * clear it — the seam would follow the pointer with no button held.
   */
  const capture = (e: PointerEvent, on: boolean) => {
    try {
      if (on) root.setPointerCapture(e.pointerId)
      else if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId)
    } catch {
      /* Capture is an optimisation here: the listeners are on the seam and the
         drag overlay keeps the pointer inside it either way. */
    }
  }

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    root.classList.remove('is-dragging')
    document.body.classList.remove('is-pane-dragging')
    capture(e, false)
    if (frame) {
      cancelAnimationFrame(frame)
      flush()
    }
    persist()
  }

  const onDown = (e: PointerEvent) => {
    // Primary button only, and never from the toggle sitting on top of it — a
    // press that both folds the pane and starts sizing it would fold it to
    // wherever the pointer drifted on the way to letting go.
    if (e.button !== 0 || toggle.contains(e.target as Node)) return
    // A folded pane has no width to drag; the press is asking for it back.
    if (state.off) {
      setFolded(false)
      opts.onChange()
      persist()
      return
    }
    dragging = true
    pending = opts.edge()
    capture(e, true)
    root.classList.add('is-dragging')
    // On `body`, because the pointer leaves the seam within the first few
    // pixels of any real drag: without this the cursor reverts to whatever it
    // is over and the map shows its `grab` hand while a resize is in progress.
    // It also carries `user-select: none`, which is what stops a drag across the
    // story list from selecting every headline it passes.
    //
    // **No `preventDefault()` here**, and that is not an omission. Calling it on
    // `pointerdown` suppresses the compatibility mouse events the browser
    // synthesises from it — which includes `click`, and therefore `dblclick`,
    // and therefore the reset gesture below. It was there to stop the text
    // selection that the class above already prevents, so it was buying nothing
    // and silently costing the only way back to the layout's own width.
    document.body.classList.add('is-pane-dragging')
  }

  root.addEventListener('pointerdown', onDown)
  // Move and release are on the *document*, not the seam. Pointer capture would
  // normally route them back here on its own, and where it holds this changes
  // nothing — but capture is exactly the thing that fails at the edges: a
  // pointer id the browser has retired, a release outside the window, a
  // synthetic event. Listening where the events actually go makes the drag
  // independent of whether the capture was granted.
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', endDrag)
  document.addEventListener('pointercancel', endDrag)

  /**
   * Double-click resets to the layout's own arithmetic.
   *
   * The one gesture that undoes a drag without asking the reader to find the
   * original number by hand — which they cannot, because the original number is
   * a `clamp()` over the viewport and was never a number they saw.
   */
  root.addEventListener('dblclick', () => {
    setWidth(undefined)
    opts.onChange()
    persist()
  })

  const fold = () => {
    setFolded(!state.off)
    opts.onChange()
    persist()
  }

  toggle.addEventListener('click', fold)

  return {
    element: root,
    toggle: fold,
    destroy() {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', endDrag)
      document.removeEventListener('pointercancel', endDrag)
      root.remove()
      document.body.classList.remove(`map-${id}-off`, 'is-pane-dragging')
      document.body.style.removeProperty(prop)
    },
  }
}
