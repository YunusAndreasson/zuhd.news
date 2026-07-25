// Island framework: Preact + htm + signals, bundled once per island via
// esbuild. Imported by every island as `import { html, render, signal } from './_framework'`.
// The htm tagged template lets us write JSX-shaped trees without a compile
// step, so islands stay as single .ts files that esbuild can transform
// and ship as ES modules.
//
// Bundle budget: ~5 KB gz (preact 3 KB + htm 1 KB + signals 1 KB).
// Each feature island is tree-shaken separately, so the user only pays
// for what they interact with — the homepage loads none of this.

import { h, render, type VNode } from 'preact'
import {
  useEffect,
  useRef,
  useState,
} from 'preact/hooks'
import htm from 'htm'

/** htm tagged-template bound to preact.h — tree-builds without a compiler. */
export const html = htm.bind(h)

/**
 * Mount an island into its container and return a teardown fn.
 *
 * Call pattern from a lazy loader:
 *   import { mount } from '/islands/entity-sheet.js'
 *   const dispose = mount(container, { id })
 */
/**
 * An island's root component.
 *
 * Returns `VNode | VNode[]` rather than `VNode` because that is what `html`
 * actually produces: htm returns an array whenever a template has more than one
 * root node, which several islands do. Declaring the narrower type made every
 * such island fail to satisfy `Island<Props>` while working perfectly at
 * runtime — the type was describing a restriction the framework does not have.
 */
export type Island<Props> = (props: Props) => VNode | VNode[]

/**
 * `P extends object`, not `P extends Record<string, unknown>`.
 *
 * Every island declares its props as an `interface`, and an interface has no
 * implicit index signature, so it never satisfies `Record<string, unknown>` no
 * matter how plain its fields are. The constraint was rejecting exactly the
 * shapes it was meant to accept; `object` asks for the only thing this function
 * actually needs.
 */
export const mountIsland = <P extends object>(
  Component: Island<P>,
  container: HTMLElement,
  props: P,
): (() => void) => {
  render(h(Component, props as never), container)
  return () => render(null, container)
}

/**
 * Mount a dialog island and clean it up when the reader closes it.
 *
 * The island loader appends a fresh `.island-container` to `<body>` on every
 * activation and discards the teardown `mount` returns, so an island that does
 * nothing about it leaves its container and a shut `<dialog>` in the document
 * for the life of the page — one more per click, for ever.
 *
 * Two things are handled here so no island has to invent them again:
 *
 * - **Teardown on close.** `<dialog>` fires a native `close` event. The first
 *   version of this watched for the `open` attribute disappearing with a
 *   `MutationObserver` attached inside a `setTimeout(…, 0)`, which is both
 *   heavier than the event and racy: a dialog dismissed inside that tick was
 *   never cleaned up at all. Preact's initial `render` is synchronous, so the
 *   dialog is in the container by the time this returns and the listener can
 *   be attached directly.
 * - **One at a time.** A second trigger replaces the first rather than
 *   stacking a second modal on top of it.
 */
let activeSheet: { container: HTMLElement; unmount: () => void } | null = null

export const mountSheetIsland = <P extends object>(
  Component: Island<P>,
  container: HTMLElement,
  props: P,
): (() => void) => {
  if (activeSheet && activeSheet.container !== container) {
    activeSheet.unmount()
    activeSheet.container.remove()
  }

  const unmount = mountIsland(Component, container, props)
  const dispose = () => {
    if (activeSheet?.container === container) activeSheet = null
    unmount()
    container.remove()
  }
  activeSheet = { container, unmount }

  const dialog = container.querySelector('dialog')
  dialog?.addEventListener('close', dispose, { once: true })
  return dispose
}

/** Close a <dialog popover> when the user taps outside the dialog body. */
export const useDialogOutsideClose = (dialogRef: { current: HTMLDialogElement | null }) => {
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) dialog.close()
    }
    dialog.addEventListener('click', onClick)
    return () => dialog.removeEventListener('click', onClick)
  }, [dialogRef])
}

export {
  h,
  render,
  useEffect,
  useRef,
  useState,
  type VNode,
}
