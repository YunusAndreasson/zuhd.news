// Spacefield — ambient starfield with depth layers, probabilistic twinkling,
// and a pre-rendered Mars sprite. Replaces the build-time SVG starfield.
// Renders on a full-screen canvas at z-index -2 via a single rAF loop.
//
// Design constraints:
//   - Must read as atmosphere, never as figure — max star alpha ~0.6
//   - Twinkling is random-chance probabilistic, not rhythmic — only r > 0.8
//   - Mouse parallax is barely perceptible (4px max displacement)
//   - Uses lighter composite: overlapping stars accumulate brightness naturally
//   - Glow sprites pre-rendered once (star glow + Mars) — no per-frame gradients
//   - Pauses rAF on visibilitychange (tab hidden)
//   - Respects prefers-reduced-motion (static stars, no parallax)
//   - Touch devices: no mouse tracking (pointer: coarse)

import { MAP_COLOURS, STAR_TINT } from './_map/style'

const rgbOf = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
]
const STAR_RGB = rgbOf(MAP_COLOURS.star)
const WARM_RGB = rgbOf(MAP_COLOURS.starWarm)
const COOL_RGB = rgbOf(MAP_COLOURS.starCool)

interface Star {
  x: number
  y: number
  r: number
  baseAlpha: number
  alpha: number       // current frame opacity
  z: number           // depth layer 0-1 (0 = far, 1 = near)
  colorStr: string    // pre-computed 'rgb(r,g,b)'
  glint: boolean      // draw 4-point cross?
  glintAngle: number  // rotation of the cross
}

// Park-Miller LCG — deterministic, stable night sky across reloads
const createRng = (seed: number) => {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
}

// Linear interpolation
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// Stars only in the upper portion so they don't compete with content.
// Soft radial mask creates a "dome" feel: bright at upper edges,
// fading toward center and bottom.
const SKY_MAX_Y = 0.55       // stars exist only in top 55% of viewport
const SKY_FADE_START = 0.22  // full opacity above 22%, fades downward

// Twinkling — probabilistic per-frame drift (stars.js-inspired)
const TWINKLE_CHANCE = 0.003  // per-frame probability a star's alpha changes
const TWINKLE_STEP = 0.03     // alpha change per frame
const TWINKLE_RANGE = 0.12    // max deviation from baseAlpha
const TWINKLE_MIN_R = 0.8     // only stars larger than this twinkle

/**
 * One star's alpha, nudged toward or away from its resting value.
 *
 * A single `Math.random()` drives both directions so the two branches cannot
 * both fire in one frame, and each is clamped to `TWINKLE_RANGE` either side of
 * `baseAlpha` — the star wanders about its own brightness rather than drifting
 * off it.
 */
const twinkle = (s: { alpha: number; baseAlpha: number }): void => {
  const roll = Math.random()
  if (roll < TWINKLE_CHANCE && s.alpha > s.baseAlpha - TWINKLE_RANGE) {
    s.alpha = Math.max(s.baseAlpha - TWINKLE_RANGE, s.alpha - TWINKLE_STEP)
  } else if (roll < TWINKLE_CHANCE * 2 && s.alpha < s.baseAlpha + TWINKLE_RANGE) {
    s.alpha = Math.min(s.baseAlpha + TWINKLE_RANGE, s.alpha + TWINKLE_STEP)
  }
}


export const mount = (container: HTMLElement) => {
  const canvas = document.createElement('canvas')
  canvas.className = 'spacefield-canvas'
  container.appendChild(canvas)
  container.classList.add('spacefield-root')

  const ctx = canvas.getContext('2d')!
  let stars: Star[][] = [[], [], []]
  let canvasW = 0             // CSS-pixel dimensions for fade calc
  let canvasH = 0
  // `--bg`'s dark value, read live off `body` rather than duplicated as a
  // literal — this canvas sits directly in front of the site's own
  // background (article/country pages mount on a plain `<body>`, not
  // `body.map-page`), so it must track `--bg` exactly rather than
  // approximate it. `--bg` is `light-dark()`, which only resolves through an
  // applied property (body's own `background: var(--bg)`), not through a raw
  // custom-property read — hence reading `backgroundColor`, not the token.
  // Refreshed on resize rather than every frame; the literal stays only as
  // the fallback for a `getComputedStyle` failure, which is what it already
  // coincidentally equals.
  let bgFill = '#080808'
  let animId = 0
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let pageVisible = true
  let mouseX = 0.5   // normalized 0-1 screen position
  let mouseY = 0.5
  let targetMouseX = 0.5
  let targetMouseY = 0.5

  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const isTouch = matchMedia('(pointer: coarse)').matches

  // Parallax sensitivity — max pixel displacement per depth layer
  const PARALLAX_MAX = prefersReduced ? 0 : 4

  // --- Pre-rendered sprites ---

  let starGlowCanvas: HTMLCanvasElement | null = null
  let marsSprite: HTMLCanvasElement | null = null
  let marsW = 0

  const createStarGlow = () => {
    const c = document.createElement('canvas')
    const size = 40
    c.width = size
    c.height = size
    const gctx = c.getContext('2d')!
    const half = size / 2
    const grad = gctx.createRadialGradient(half, half, 0, half, half, half)
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.55)')
    grad.addColorStop(0.15, 'rgba(255, 255, 255, 0.18)')
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)')
    grad.addColorStop(1, 'transparent')
    gctx.fillStyle = grad
    gctx.fillRect(0, 0, size, size)
    starGlowCanvas = c
  }

  // Mars sprite — pre-rendered glow + core combined
  const MARS_X_FRAC = 0.88
  const MARS_Y_FRAC = 0.11
  const MARS_R = 1.4
  const MARS_GLOW_R = 3.5

  const createMarsSprite = () => {
    marsW = Math.ceil(MARS_GLOW_R * 2 + 2)
    const c = document.createElement('canvas')
    c.width = marsW
    c.height = marsW
    const gctx = c.getContext('2d')!
    const cx = marsW / 2
    const cy = marsW / 2
    const grad = gctx.createRadialGradient(cx, cy, MARS_R * 0.5, cx, cy, MARS_GLOW_R)
    grad.addColorStop(0, 'rgba(230, 140, 90, 0.28)')
    grad.addColorStop(0.3, 'rgba(220, 120, 70, 0.12)')
    grad.addColorStop(1, 'transparent')
    gctx.fillStyle = grad
    gctx.fillRect(0, 0, marsW, marsW)
    gctx.fillStyle = 'rgb(225, 130, 70)'
    gctx.beginPath()
    gctx.arc(cx, cy, MARS_R, 0, Math.PI * 2)
    gctx.fill()
    marsSprite = c
  }

  createStarGlow()
  createMarsSprite()

  // --- Star generation ---

  const layerDefs = [
    { count: 140, rMin: 0.25, rMax: 0.5, alphaMin: 0.03, alphaMax: 0.07, z: 0.0, glint: false },
    { count: 30,  rMin: 0.45, rMax: 1.0, alphaMin: 0.04, alphaMax: 0.08, z: 0.5, glint: false },
    { count: 8,   rMin: 0.9, rMax: 1.8, alphaMin: 0.05, alphaMax: 0.09, z: 1.0, glint: true  },
  ]

  // Color temperature variants — weighted toward cool white.
  //
  // The endpoints are the map's own star anchors (`_map/starfield.ts`'s
  // `STAR_RGB`/`WARM_RGB`/`COOL_RGB`, from `MAP_COLOURS`) rather than a
  // fourth independently-guessed set of literals — these are the same real
  // stars seen from the same near-black sky, so there is no reason for this
  // field to measure its own palette. `STAR_TINT` is the map's own cap on how
  // far a star may travel from its base colour toward either anchor; the
  // four-bucket weighting (blue / warm / bright / neutral) is unchanged, only
  // the RGB values moved onto the shared constants.
  const mixToward = (target: readonly [number, number, number], k: number): string => {
    const c = STAR_RGB.map((v, i) => Math.round(v + (target[i] - v) * k))
    return `rgb(${c[0]},${c[1]},${c[2]})`
  }
  const chooseColor = (rand: () => number, bright: boolean): string => {
    const roll = rand()
    if (roll < 0.05) return mixToward(COOL_RGB, STAR_TINT)        // blue
    if (roll < 0.20) return mixToward(WARM_RGB, STAR_TINT)        // warm
    if (bright) return mixToward(COOL_RGB, STAR_TINT * 0.4)       // dim bright
    return `rgb(${STAR_RGB[0]},${STAR_RGB[1]},${STAR_RGB[2]})`    // cool white / neutral
  }

  const generateStars = (w: number, h: number): Star[][] => {
    const rand = createRng(0xCAFE)
    const layers: Star[][] = [[], [], []]
    for (const layer of layerDefs) {
      const layerIdx = layer.z < 0.3 ? 0 : layer.z < 0.7 ? 1 : 2
      const target = layers[layerIdx]
      for (let i = 0; i < layer.count; i++) {
        const t = rand()
        const r = layer.rMin + t ** 3 * (layer.rMax - layer.rMin)
        const baseAlpha = layer.alphaMin + rand() ** 2 * (layer.alphaMax - layer.alphaMin)
        const isBright = r > 1.5 && layer.glint
        const x = clamp(0.01 + (rand() < 0.5 ? rand() : 1 - rand()) ** 1.6 * 0.49, 0, 1) * w
        const y = rand() * h * SKY_MAX_Y
        target.push({
          x,
          y,
          r,
          baseAlpha,
          alpha: baseAlpha,
          z: layer.z,
          colorStr: chooseColor(rand, isBright),
          glint: isBright,
          glintAngle: rand() * Math.PI,
        })
      }
    }
    return layers
  }

  let marsPos: { cx: number; cy: number } | null = null

  const drawMars = () => {
    if (!marsPos || !marsSprite) return
    const { cx, cy } = marsPos
    const halfW = marsW / 2
    ctx.drawImage(marsSprite, cx - halfW, cy - halfW)
  }

  // --- Frame loop ---

  const TAU = Math.PI * 2

  // Dome fade: stars brighten toward upper edges, dim toward center + bottom.
  // Returns 0–1 multiplier for a star at screen-position (sx, sy).
  const domeFade = (sx: number, sy: number) => {
    const yFrac = sy / canvasH
    // Vertical: full above SKY_FADE_START, linear to 0 at SKY_MAX_Y
    const vFade = yFrac <= SKY_FADE_START ? 1
      : 1 - clamp((yFrac - SKY_FADE_START) / (SKY_MAX_Y - SKY_FADE_START), 0, 1)
    // Horizontal: peak at edges, dip at center — U-shaped with a gentle
    // parabola so the central sky reads as depth, not emptiness
    const xFrac = sx / canvasW
    const distFromEdge = Math.min(xFrac, 1 - xFrac) // 0 at edges, 0.5 at center
    const hFade = 1 - clamp((distFromEdge * 2) ** 1.4 * 0.55, 0, 0.55)
    return vFade * hFade
  }

  const draw = (_t: number) => {
    const w = canvas.width
    const h = canvas.height

    // Solid dark backdrop
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = bgFill
    ctx.fillRect(0, 0, w, h)

    // Smooth mouse follow — slow lerp so stars drift, not snap
    if (!isTouch && !prefersReduced) {
      mouseX = lerp(mouseX, targetMouseX, 0.03)
      mouseY = lerp(mouseY, targetMouseY, 0.03)
    }
    const px = (mouseX - 0.5) * PARALLAX_MAX
    const py = (mouseY - 0.5) * PARALLAX_MAX

    const [far, mid, near] = stars

    // Probabilistic twinkling — only larger stars flicker. Mid-field stars are
    // gated on radius; near-field ones all qualify, which is the only
    // difference between these two passes and used to be two copies of the walk.
    for (const s of mid) if (s.r > TWINKLE_MIN_R) twinkle(s)
    for (const s of near) twinkle(s)

    // Draw far stars — faint dots, no glow
    for (const s of far) {
      const sx = s.x + px * 0.25
      const sy = s.y + py * 0.25
      ctx.globalAlpha = s.baseAlpha * 0.45 * domeFade(sx, sy)
      ctx.fillStyle = s.colorStr
      ctx.beginPath()
      ctx.arc(sx, sy, s.r, 0, TAU)
      ctx.fill()
    }

    // Draw mid stars — glow sprite behind brighter ones
    for (const s of mid) {
      const sx = s.x + px * 0.5
      const sy = s.y + py * 0.5
      const df = domeFade(sx, sy)
      if (s.r > 0.85 && starGlowCanvas) {
        const glowSize = s.r * 4.5
        ctx.globalAlpha = s.alpha * 0.10 * df
        ctx.drawImage(starGlowCanvas, sx - glowSize / 2, sy - glowSize / 2, glowSize, glowSize)
      }
      ctx.globalAlpha = s.alpha * 0.55 * df
      ctx.fillStyle = s.colorStr
      ctx.beginPath()
      ctx.arc(sx, sy, s.r, 0, TAU)
      ctx.fill()
    }

    // Mars — pre-rendered sprite
    drawMars()

    // Draw near stars — glow sprite, core, cross glints
    for (const s of near) {
      const sx = s.x + px
      const sy = s.y + py
      const df = domeFade(sx, sy)
      if (starGlowCanvas) {
        const glowSize = s.r * 4.5
        ctx.globalAlpha = s.alpha * 0.10 * df
        ctx.drawImage(starGlowCanvas, sx - glowSize / 2, sy - glowSize / 2, glowSize, glowSize)
      }
      ctx.globalAlpha = s.alpha * df
      ctx.fillStyle = s.colorStr
      ctx.beginPath()
      ctx.arc(sx, sy, s.r, 0, TAU)
      ctx.fill()

      // 4-point cross glint — faint diffraction spikes
      if (s.glint && s.r > 1.5) {
        ctx.save()
        ctx.globalAlpha = s.alpha * 0.10 * df
        ctx.strokeStyle = s.colorStr
        ctx.lineWidth = 0.35
        ctx.translate(sx, sy)
        ctx.rotate(s.glintAngle)
        const glen = s.r * 2.2
        ctx.beginPath()
        ctx.moveTo(-glen, 0)
        ctx.lineTo(glen, 0)
        ctx.moveTo(0, -glen)
        ctx.lineTo(0, glen)
        ctx.stroke()
        ctx.restore()
      }
    }

  }

  const tick = (now: number) => {
    if (pageVisible) {
      draw(now)
    }
    animId = requestAnimationFrame(tick)
  }

  /**
   * The field only exists in dark mode — `.spacefield-root` is `opacity: 0`
   * otherwise — so in light mode this is a 60fps canvas loop drawing something
   * nobody can see. On a phone that is battery spent on nothing. The listener
   * is what keeps the CSS crossfade honest when the system flips mid-visit.
   */
  const darkQuery = matchMedia('(prefers-color-scheme: dark)')

  const syncScheme = () => {
    const wanted = darkQuery.matches
    if (wanted === (animId !== 0)) return
    if (wanted) {
      animId = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(animId)
      animId = 0
    }
  }

  // --- Sizing ---

  const resize = () => {
    bgFill = getComputedStyle(document.body).backgroundColor || '#080808'
    // Deliberately 1 device pixel per CSS pixel, not devicePixelRatio: this is
    // a backdrop of sub-pixel dots at 0.85 opacity, and paying 4× the fill rate
    // for it on a retina phone buys nothing anyone can see. The stars are
    // capped at 1440 wide and stretched beyond that for the same reason.
    const w = Math.min(window.innerWidth, 1440)
    const h = window.innerHeight
    canvas.width = w
    canvas.height = h
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    canvasW = w
    canvasH = h
    stars = generateStars(w, h)
    marsPos = { cx: w * MARS_X_FRAC, cy: h * MARS_Y_FRAC }
  }

  // --- Event handlers ---

  const onMouseMove = (e: MouseEvent) => {
    targetMouseX = e.clientX / window.innerWidth
    targetMouseY = e.clientY / window.innerHeight
  }

  const onVisibilityChange = () => {
    pageVisible = document.visibilityState === 'visible'
  }

  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(resize, 120)
  }

  resize()
  syncScheme()

  if (!isTouch && !prefersReduced) {
    document.addEventListener('mousemove', onMouseMove, { passive: true })
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('resize', onResize, { passive: true })
  darkQuery.addEventListener('change', syncScheme)

  return () => {
    if (animId) cancelAnimationFrame(animId)
    if (resizeTimer) clearTimeout(resizeTimer)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('resize', onResize)
    darkQuery.removeEventListener('change', syncScheme)
    canvas.remove()
    container.classList.remove('spacefield-root')
  }
}
