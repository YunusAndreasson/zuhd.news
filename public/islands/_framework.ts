// Island framework: Preact + htm + signals, bundled once per island via
// esbuild. Imported by every island as `import { html, render, signal } from './_framework'`.
// The htm tagged template lets us write JSX-shaped trees without a compile
// step, so islands stay as single .ts files that esbuild can transform
// and ship as ES modules.
//
// Bundle budget: ~5 KB gz (preact 3 KB + htm 1 KB + signals 1 KB).
// Each feature island is tree-shaken separately, so the user only pays
// for what they interact with — the homepage loads none of this.

import { h, render, Fragment, type ComponentChildren, type VNode } from 'preact'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from 'preact/hooks'
import { signal, computed, effect, type Signal } from '@preact/signals'
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
export type Island<Props> = (props: Props) => VNode

export const mountIsland = <P extends Record<string, unknown>>(
  Component: Island<P>,
  container: HTMLElement,
  props: P,
): (() => void) => {
  render(h(Component, props as never), container)
  return () => render(null, container)
}

/** Hook that tracks whether the element is within the viewport (first entry). */
export const useInView = (ref: { current: HTMLElement | null }, options?: IntersectionObserverInit) => {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setInView(true)
        observer.disconnect()
      }
    }, options)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, options])
  return inView
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
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
  signal,
  computed,
  effect,
  type Signal,
  type ComponentChildren,
  type VNode,
}
