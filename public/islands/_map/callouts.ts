// Callouts: a name that must stand, set clear of its neighbours with a hairline
// back to its mark.
//
// A market's or a strait's name may lose a collision and its mark stays. Two
// may not: a flagged market's (its doubled tick asks a question only the name
// answers) and a disrupted strait's. Where either loses its place beside the
// mark, `callouts` tries eight directions and sets the name where its box
// keeps clearest of every other mark, so it cannot be read as a neighbour's;
// the island draws the line back once MapLibre has placed it.
//
// Screen space in, screen space out: the island projects the marks, runs this
// and unprojects the result, so it needs no camera and tests as arithmetic.

/** How far out a callout's name is set, in CSS pixels from its mark. */
export const CALLOUT_PX = 46
/** The clear space a callout's line leaves round its mark's tick. */
export const CALLOUT_GAP_PX = 9
/** Marks within this distance push a callout away from them. */
export const CALLOUT_REACH_PX = 90

export interface ScreenMark {
  id: string
  x: number
  y: number
}

export type CalloutAnchor =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

/** A mark whose name lost its place, with the size of that name in pixels. */
export interface LostMark extends ScreenMark {
  w: number
  h: number
}

export interface Callout {
  id: string
  /** Where the name's anchor stands, and where the hairline ends. */
  x: number
  y: number
  /** The side of the name that faces its mark. */
  anchor: CalloutAnchor
}

/**
 * The anchor that puts the name on the far side of `[dx, dy]` (screen y grows
 * down): pointing right, the name's left edge faces the mark.
 */
export const anchorFor = (dx: number, dy: number): CalloutAnchor => {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI
  const sector = Math.round(((a + 360) % 360) / 45) % 8
  return (['left', 'top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left'] as const)[
    sector
  ]
}

type Box = [x0: number, y0: number, x1: number, y1: number]

/** The box a name of `w` × `h` covers when its `anchor` side stands at `x, y`. */
const boxAt = (x: number, y: number, anchor: CalloutAnchor, w: number, h: number): Box => {
  const left = anchor.includes('left') ? x : anchor.includes('right') ? x - w : x - w / 2
  const top = anchor.startsWith('top') ? y : anchor.startsWith('bottom') ? y - h : y - h / 2
  return [left, top, left + w, top + h]
}

const distToBox = (x: number, y: number, [x0, y0, x1, y1]: Box) =>
  Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1))

const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

/** Clearance past this is not worth trading the push direction for. */
const CLEAR_PX = 24
/** Nearer than this to another mark, a name reads as that mark's: never set there. */
export const CALLOUT_MIN_CLEAR_PX = 12

/**
 * A callout for each mark in `lost`, clear of every mark in `all` and of the
 * callouts already set.
 *
 * The eight directions are ranked: furthest from the nearest other mark
 * first, up to `CLEAR_PX`; past that, or on a tie, the one most nearly along
 * the push out of the cluster (the sum of unit vectors from each neighbour
 * within `CALLOUT_REACH_PX`, weighted by nearness). A lone mark is pushed up
 * and to the right, the side a label reads from. `rank` picks a lower choice
 * for a mark whose first one MapLibre could not place, because another name
 * had the space. A direction within `CALLOUT_MIN_CLEAR_PX` of another mark is
 * never a choice, so a mark that runs out of them gets no callout: a name
 * left off is a loss, a name beside the wrong mark is a misreading.
 */
export const callouts = (
  lost: LostMark[],
  all: ScreenMark[],
  rank: ReadonlyMap<string, number> = new Map(),
): Callout[] => {
  const taken: Box[] = []
  return lost.flatMap((m) => {
    let px = 0
    let py = 0
    for (const n of all) {
      if (n.id === m.id) continue
      const ex = m.x - n.x
      const ey = m.y - n.y
      const d = Math.hypot(ex, ey)
      if (d === 0 || d > CALLOUT_REACH_PX) continue
      const w = 1 - d / CALLOUT_REACH_PX
      px += (ex / d) * w
      py += (ey / d) * w
    }
    const plen = Math.hypot(px, py)
    const [ux, uy] = plen < 1e-6 ? [Math.SQRT1_2, -Math.SQRT1_2] : [px / plen, py / plen]

    const ranked = Array.from({ length: 8 }, (_, k) => {
      const dx = Math.cos((k * Math.PI) / 4)
      const dy = Math.sin((k * Math.PI) / 4)
      const x = m.x + dx * CALLOUT_PX
      const y = m.y + dy * CALLOUT_PX
      const anchor = anchorFor(dx, dy)
      const box = boxAt(x, y, anchor, m.w, m.h)
      let clear = CLEAR_PX
      for (const n of all) {
        if (n.id === m.id || (n.x === m.x && n.y === m.y)) continue
        clear = Math.min(clear, distToBox(n.x, n.y, box))
      }
      if (taken.some((t) => overlaps(t, box))) clear = -1
      return { c: { id: m.id, x, y, anchor }, box, clear, along: dx * ux + dy * uy }
    })
      .filter((r) => r.clear >= CALLOUT_MIN_CLEAR_PX)
      .sort((a, b) => b.clear - a.clear || b.along - a.along)
    const chosen = ranked[rank.get(m.id) ?? 0]
    if (!chosen) return []
    taken.push(chosen.box)
    return [chosen.c]
  })
}
