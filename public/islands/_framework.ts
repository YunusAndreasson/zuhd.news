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
