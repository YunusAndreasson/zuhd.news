// Globals the performance instruments inject into the page under test.
//
// scripts/perf/*.mjs straddle two runtimes: the file runs in Node, but the
// bodies passed to Playwright's `evaluate` and `addInitScript` run in the
// browser. tsconfig.node.json type-checks the whole file as Node with the DOM
// lib, so a counter the harness installs on `window` is, to the compiler, a
// property that does not exist. Declaring them here keeps those scripts inside
// the typecheck gate instead of excluded from it.

interface Window {
  /** probe.mjs — paint, layout-shift and long-task records. */
  __probe?: {
    longTasks: { start: number; dur: number }[]
    shifts: { start: number; value: number }[]
    lcp: number
    cls: number
  }
  /** idle-renders.mjs — frames counted by a wrapped requestAnimationFrame. */
  __frames?: number
}
