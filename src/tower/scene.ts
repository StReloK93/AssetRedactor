import { Rgb, hexToRgb } from '../core/color'
import { seededRandom } from '../core/noise'
import { CROWNS, crystal } from './crowns'
import type { CrownId, Level, Masonry, TowerDef, TowerShape, TowerTop } from './model'
import { Light, Mat, Part, Wall, column } from './parts'
import { aroundShape, extrude, length2, noise3, rotX, sdBox, sdCapsule, sdEllipsoid, sdShape2, sdSphere, sdTaper, sdTorus, shapeRadius, shapeReach, shapeSides, smoothMin } from './sdf'

/**
 * A tower as a list of parts (see parts.ts), put together from its definition: a plinth, the body (one piece,
 * two tiers, a slender spire, a floating top or a ring of pillars), its top (battlements, a floor, a dome, an
 * onion dome, an open cupola or a roof), the crown and its decorations.
 */

export interface Scene {
  parts: Part[]
  bounds: [number, number, number, number, number, number]
  /** The crown's glow: it lights the stone around it, and the projectile leaves from here */
  light: Light
  /** The crown's size (its own details scale with it) */
  crownScale: number
  crown: CrownId
  /** 0..1: how strongly runes, cracks and the circle glow */
  magic: number
  runes: boolean
  cracks: boolean
  /** What the walls are made of */
  masonry: Masonry
  /** Ivy on the walls */
  vines: boolean
  /** Radius of the circle of runes on the ground round the tower (none if off) */
  circle: number | null
  colors: { stoneDark: Rgb; stoneLight: Rgb; trim: Rgb; accent: Rgb; glow: Rgb }
}

/** The body's height per level (times the height setting) */
const SHAFT_HEIGHT: Record<Level, number> = { 1: 0.42, 2: 0.6, 3: 0.78 }
const CROWN_SCALE: Record<Level, number> = { 1: 0.85, 2: 1, 3: 1.2 }

/** Biggest radius of a shape that still fits within `reach` of the centre along x and y */
const fit = (shape: TowerShape, r: number, reach: number) => Math.min(r, reach / shapeReach(shape))

export function buildScene(def: TowerDef): Scene {
  const { level, form, extras, taper } = def
  const A = def.shape
  const B = def.upperShape
  const magic = def.magic
  const parts: Part[] = []
  const random = seededRandom(def.seed * 7919 + level * 17)
  const W = 0.19 * def.width
  const H = SHAFT_HEIGHT[level] * def.height
  const c = CROWN_SCALE[level]

  /** An upright tapering prism with bricks laid round it */
  const wall = (w: Wall, m: Mat = Mat.Stone) => {
    parts.push({
      b: column(Math.max(w.r0, w.r1), w.z0, w.z1, w.cx, w.cy, w.shape),
      d: (x, y, z) => sdTaper(w.shape, x - w.cx, y - w.cy, z, w.z0, w.z1, w.r0, w.r1),
      m,
      w,
    })
  }
  const slab = (shape: TowerShape, r: number, z0: number, z1: number, m: Mat = Mat.Stone, cx = 0, cy = 0) =>
    wall({ shape, cx, cy, z0, z1, r0: r, r1: r }, m)
  /** Windows a little above the middle of a wall from z0, h high */
  const windows = (z0: number, h: number): [number, number] | undefined => (extras.windows ? [z0 + h * 0.56, z0 + h * 0.56 + 0.09] : undefined)
  /** A band of runes low on a wall starting at z0 */
  const runes = (z0: number): [number, number] | undefined => (extras.runes ? [z0 + 0.035, z0 + 0.095] : undefined)

  // Plinth: one step, two on the large level; a shrine stands on a wide one
  const plinthR = W * (form === 'shrine' ? 1.75 : 1.42)
  const plinthH = 0.07
  let p: number
  let plinthOuter: number
  let plinthTop: number
  if (level === 3) {
    const r1 = fit(A, plinthR * 1.14, 0.44)
    slab(A, r1, 0, 0.05, Mat.Plinth)
    plinthTop = fit(A, plinthR, 0.4)
    slab(A, plinthTop, 0.05, 0.05 + plinthH - 0.01, Mat.Plinth)
    p = 0.05 + plinthH - 0.01
    plinthOuter = r1 * shapeReach(A)
  } else {
    plinthTop = fit(A, plinthR, 0.42)
    slab(A, plinthTop, 0, plinthH, Mat.Plinth)
    p = plinthH
    plinthOuter = plinthTop * shapeReach(A)
  }

  /** Four buttresses round a wall of shape `shape` and radius r, from z0 to z1 */
  const buttresses = (shape: TowerShape, r: number, z0: number, z1: number) => {
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2
      const reach = shapeRadius(shape, a, r) * (shape === 'square' ? 0.98 : 0.92)
      wall({ shape: 'square', cx: Math.cos(a) * reach, cy: Math.sin(a) * reach, z0, z1, r0: 0.055, r1: 0.03 })
    }
  }

  // The body, by form. `top` is what the top goes on; `ringsOn` the wall rings of light circle.
  let top: { shape: TowerShape; r: number; z: number } | null = null
  let crownAt: { base: number; rim: number; shape: TowerShape; scale: number } | null = null
  let ringsOn: { z0: number; z1: number; r0: number; r1: number; shape: TowerShape } | null = null
  switch (form) {

    case 'keep': {
      const r1 = W * (1 - taper)
      wall({ shape: A, cx: 0, cy: 0, z0: p - 0.01, z1: p + H, r0: W, r1, windows: windows(p, H), runes: runes(p) })
      if (level >= 2) {
        const zb = p + H * 0.42
        slab(A, W + (r1 - W) * 0.42 + 0.014, zb, zb + 0.024, level === 3 ? Mat.Trim : Mat.Stone)
      }
      if (extras.buttresses) buttresses(A, W, p - 0.01, p + H * 0.5)
      top = { shape: A, r: r1, z: p + H }
      ringsOn = { z0: p, z1: p + H, r0: W, r1, shape: A }
      break
    }

    case 'tiered': {
      // A wide lower tier, a ledge, then a narrower upper tier of the other shape
      const h1 = H * 0.46
      const a1 = W * 0.96
      wall({ shape: A, cx: 0, cy: 0, z0: p - 0.01, z1: p + h1, r0: W, r1: a1, runes: runes(p) })
      const ledge = p + h1
      slab(A, a1 + 0.024, ledge, ledge + 0.03, level === 3 ? Mat.Trim : Mat.Stone)
      const u0 = W * (B === 'diamond' ? 0.62 : 0.72)
      const u1 = u0 * (1 - taper)
      const z2 = ledge + 0.03
      const h2 = H * 0.62
      wall({ shape: B, cx: 0, cy: 0, z0: z2 - 0.005, z1: z2 + h2, r0: u0, r1: u1, windows: windows(z2, h2) })
      // Little round turrets with pointed roofs on the ledge's corners
      if (level >= 2) {
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + (A === 'square' ? Math.PI / 4 : 0)
          const reach = shapeRadius(A, a, a1) * 0.9
          const cx = Math.cos(a) * reach
          const cy = Math.sin(a) * reach
          const t1 = z2 + 0.06 + (level === 3 ? 0.03 : 0)
          wall({ shape: 'round', cx, cy, z0: ledge, z1: t1, r0: 0.034, r1: 0.034 })
          wall({ shape: 'round', cx, cy, z0: t1, z1: t1 + 0.075, r0: 0.046, r1: 0.003 }, Mat.Roof)
        }
      }
      if (extras.buttresses) buttresses(A, W, p - 0.01, p + h1 * 0.85)
      top = { shape: B, r: u1, z: z2 + h2 }
      ringsOn = { z0: z2, z1: z2 + h2, r0: u0, r1: u1, shape: B }
      break
    }

    case 'spire': {
      // Tall and slender, narrowing more than the others
      const s0 = W * 0.84
      const s1 = s0 * Math.max(0.55, 1 - taper - 0.16)
      const hs = H * 1.28
      wall({ shape: A, cx: 0, cy: 0, z0: p - 0.01, z1: p + hs, r0: s0, r1: s1, windows: windows(p, hs), runes: runes(p) })
      if (level >= 2) slab(A, s0 + (s1 - s0) * 0.3 + 0.014, p + hs * 0.3, p + hs * 0.3 + 0.022, Mat.Trim)
      if (extras.buttresses) buttresses(A, s0, p - 0.01, p + hs * 0.35)
      top = { shape: B, r: s1, z: p + hs }
      ringsOn = { z0: p, z1: p + hs, r0: s0, r1: s1, shape: A }
      break
    }

    case 'floating': {
      // A stump on the ground; the upper tower hangs over it on a rock, held up by a beam of light
      const hStump = H * 0.28
      const f0 = W * 0.95
      const stumpTop = p + hStump
      wall({ shape: A, cx: 0, cy: 0, z0: p - 0.01, z1: stumpTop, r0: W, r1: f0, runes: runes(p) })
      const gap = 0.07 + 0.025 * level
      const rockTip = stumpTop + gap
      const u0 = W * (B === 'diamond' ? 0.72 : 0.88)
      const rockTop = rockTip + 0.14
      parts.push({
        b: column(u0 * 1.15, rockTip - 0.03, rockTop + 0.02, 0, 0, B),
        d: (x, y, z) => (sdTaper(B, x, y, z, rockTip, rockTop, 0.012, u0 * 1.04) + (noise3(x * 26, y * 26, z * 26, def.seed) - 0.5) * 0.03) * 0.7,
        m: Mat.Rock,
      })
      const h2 = H * 0.56
      const u1 = u0 * (1 - taper)
      wall({ shape: B, cx: 0, cy: 0, z0: rockTop - 0.005, z1: rockTop + h2, r0: u0, r1: u1, windows: windows(rockTop, h2) })
      // The beam, and a ring of light where it leaves the stump
      parts.push({ b: column(0.03, stumpTop - 0.01, rockTip + 0.06), d: (x, y, z) => extrude(length2(x, y) - 0.014, z, stumpTop - 0.01, rockTip + 0.06), m: Mat.Glow })
      parts.push({ b: column(f0 * 0.7, stumpTop - 0.02, stumpTop + 0.02), d: (x, y, z) => sdTorus(x, y, z - stumpTop, f0 * 0.55, 0.006), m: Mat.Glow })
      top = { shape: B, r: u1, z: rockTop + h2 }
      ringsOn = { z0: rockTop, z1: rockTop + h2, r0: u0, r1: u1, shape: B }
      break
    }

    case 'shrine': {
      // A slender pedestal inside a ring of pillars; the crown floats just over the ring they carry
      const zl = p + H * 0.72
      wall({ shape: A, cx: 0, cy: 0, z0: p - 0.01, z1: zl, r0: W * 0.5, r1: W * 0.36, runes: runes(p) })
      const R = W * 1.18
      const count = level === 3 ? 6 : 4
      const turn = count === 4 ? 0 : Math.PI / 6
      for (let i = 0; i < count; i++) {
        const a = turn + (i * 2 * Math.PI) / count
        const reach = shapeRadius(A, a, R)
        const cx = Math.cos(a) * reach
        const cy = Math.sin(a) * reach
        slab(B, 0.05, p - 0.01, p + 0.03, Mat.Plinth, cx, cy)
        wall({ shape: B, cx, cy, z0: p + 0.03, z1: zl - 0.03, r0: 0.034, r1: 0.029 }, Mat.Plinth)
        slab(B, 0.048, zl - 0.03, zl, Mat.Plinth, cx, cy)
      }
      const outer = R + 0.045
      // Battlements or a floor: open, the crown floating over the ring; any other top is built on the ring, closed
      const open = def.top === 'battlements' || def.top === 'floor'
      parts.push({
        b: column(outer, zl, zl + 0.045, 0, 0, A),
        d: open
          ? (x, y, z) => Math.max(extrude(sdShape2(A, x, y, outer), z, zl, zl + 0.045), -sdShape2(A, x, y, outer - 0.09))
          : (x, y, z) => extrude(sdShape2(A, x, y, outer), z, zl, zl + 0.045),
        m: Mat.Stone,
        w: { shape: A, cx: 0, cy: 0, z0: zl, z1: zl + 0.045, r0: outer, r1: outer },
      })
      ringsOn = { z0: p, z1: zl, r0: W * 0.5, r1: W * 0.36, shape: A }
      if (!open) {
        top = { shape: A, r: outer * 0.8, z: zl + 0.045 }
        break
      }
      // A beam of light between the pedestal and the floating crown
      const base = zl + 0.07
      parts.push({ b: column(0.02, zl - 0.01, base + 0.01), d: (x, y, z) => extrude(length2(x, y) - 0.01, z, zl - 0.01, base + 0.01), m: Mat.Glow })
      crownAt = { base, rim: outer, shape: A, scale: 1 }
      break
    }
  }

  if (top) crownAt = finishTop(parts, def.top, top.shape, top.r, top.z, level, extras.flags, random)
  const place = crownAt!
  const scale = c * place.scale
  const light = CROWNS[def.crown](parts, { base: place.base, c: scale, level, shape: place.shape })

  // Glowing bands hugging the body
  if (extras.rings && ringsOn) {
    const { z0, z1, r0, r1, shape } = ringsOn
    const bands = level === 1 ? 1 : 2
    for (let k = 0; k < bands; k++) {
      const bz = z0 + (z1 - z0) * (0.3 + k * 0.38)
      const r = r0 + (r1 - r0) * ((bz - z0) / (z1 - z0)) + 0.006
      parts.push({
        b: column(r + 0.01, bz - 0.012, bz + 0.012, 0, 0, shape),
        d: (x, y, z) => extrude(sdShape2(shape, x, y, r), z, bz - 0.008, bz + 0.008),
        m: Mat.Glow,
      })
    }
  }

  /** The body's radius at height z (on the wall the rings go round) */
  const bodyAt = (z: number) => {
    const { z0, z1, r0, r1 } = ringsOn!
    return r0 + (r1 - r0) * Math.min(1, Math.max(0, (z - z0) / (z1 - z0)))
  }

  // A gallery round the body just under the windows: a corbel, a plank floor and an iron railing
  if (extras.balcony && ringsOn && form !== 'shrine') {
    const { z0, z1, shape } = ringsOn
    const zb = z0 + (z1 - z0) * 0.47
    const r = bodyAt(zb)
    const rOut = r + 0.042
    const floorTop = zb + 0.014
    parts.push({
      b: column(rOut, zb - 0.036, zb, 0, 0, shape),
      d: (x, y, z) => sdTaper(shape, x, y, z, zb - 0.035, zb, bodyAt(zb - 0.035), rOut * 0.97),
      m: Mat.Stone,
      w: { shape, cx: 0, cy: 0, z0: zb - 0.035, z1: zb, r0: bodyAt(zb - 0.035), r1: rOut * 0.97 },
    })
    parts.push({
      b: column(rOut, zb - 0.001, floorTop, 0, 0, shape),
      d: (x, y, z) => extrude(sdShape2(shape, x, y, rOut), z, zb - 0.001, floorTop),
      m: Mat.Wood,
      w: { shape, cx: 0, cy: 0, z0: zb, z1: floorTop, r0: rOut, r1: rOut },
    })
    const railR = rOut - 0.004
    const railTop = floorTop + 0.034
    const sides = shapeSides(shape)
    const period = 0.024
    parts.push({
      b: column(rOut, floorTop - 0.002, railTop, 0, 0, shape),
      d: (x, y, z) => {
        const outer = sdShape2(shape, x, y, railR)
        const shell = Math.max(extrude(outer, z, floorTop - 0.002, railTop), -(outer + 0.005))
        // Balusters between a bottom rail and a top rail
        const s = sides === 0 ? Math.atan2(y, x) * railR : aroundShape(shape, x, y, railR).s
        const m = s - period * (Math.floor(s / period) + 0.5)
        const gap = Math.max(0.0032 - Math.abs(m), floorTop + 0.006 - z, z - (railTop - 0.007))
        return Math.max(shell, -gap)
      },
      m: Mat.Trim,
    })
  }

  // Long banners on the two walls facing the viewer, each with a glowing rune, hung from an iron rod
  if (extras.banners && ringsOn && form !== 'shrine') {
    const { z0, z1, shape } = ringsOn
    const h = z1 - z0
    const top = z0 + h * 0.9
    const bottom = top - Math.max(0.1, h * 0.46)
    const rFlat = bodyAt(bottom)
    // Where the front walls face: [direction of the wall, offset along it]
    const spots: [number, number][] =
      shape === 'square' || shape === 'octagon' ? [[0, 0], [Math.PI / 2, 0]]
        : shape === 'diamond' ? [[Math.PI / 4, -0.48 * rFlat], [Math.PI / 4, 0.48 * rFlat]]
          : shape === 'hexagon' ? [[-Math.PI / 12, 0], [(7 * Math.PI) / 12, 0]]
            : [[Math.PI / 4 - 0.62, 0], [Math.PI / 4 + 0.62, 0]]
    const halfWidth = Math.min(0.032, rFlat * 0.36)
    spots.forEach(([a, off], k) => {
      const nx = Math.cos(a)
      const ny = Math.sin(a)
      // Out from the wall where it is widest (at the banner's foot), clear of a round wall's curve
      const d = rFlat + 0.005 + (shape === 'round' ? (halfWidth * halfWidth) / (2 * rFlat) : 0)
      const cxp = nx * d - ny * off
      const cyp = ny * d + nx * off
      const reach = halfWidth + 0.02
      parts.push({
        b: [cxp - reach, cyp - reach, bottom - 0.01, cxp + reach, cyp + reach, top + 0.01],
        d: (x, y, z) => {
          const n = x * nx + y * ny - d
          const t = -x * ny + y * nx - off
          // A swallowtail cut into its foot, and a gentle sway
          const sway = Math.sin(t * 90 + k) * 0.0012
          const box = sdBox(n - sway, t, z - (top + bottom) / 2, 0.0022, halfWidth, (top - bottom) / 2)
          return Math.max(box, bottom + 0.032 * (1 - Math.abs(t) / halfWidth) - z) * 0.8
        },
        m: Mat.Cloth,
        cloth: { nx, ny, d, off, halfWidth, top, bottom, id: def.seed * 3 + k },
      })
      // The rod it hangs from, reaching back into the wall
      const ax = nx * (d + 0.003) - ny * (off - halfWidth - 0.008)
      const ay = ny * (d + 0.003) + nx * (off - halfWidth - 0.008)
      const bx = nx * (d + 0.003) - ny * (off + halfWidth + 0.008)
      const by = ny * (d + 0.003) + nx * (off + halfWidth + 0.008)
      parts.push({
        b: [Math.min(ax, bx) - 0.01, Math.min(ay, by) - 0.01, top - 0.01, Math.max(ax, bx) + 0.01, Math.max(ay, by) + 0.01, top + 0.015],
        d: (x, y, z) => sdCapsule(x, y, z, ax, ay, top + 0.004, bx, by, top + 0.004, 0.0042),
        m: Mat.Trim,
      })
    })
  }

  // Iron spikes round the plinth's edge, pointing out and up
  if (extras.spikes) {
    const count = level === 1 ? 6 : level === 2 ? 8 : 10
    const len = 0.095 * c
    for (let i = 0; i < count; i++) {
      const a = Math.PI / 4 + Math.PI / count + (i * 2 * Math.PI) / count
      const R = shapeRadius(A, a, plinthTop) * 0.93
      const px = Math.cos(a) * R
      const py = Math.sin(a) * R
      const ux = Math.cos(a)
      const uy = Math.sin(a)
      const lean = 0.38
      parts.push({
        b: column(len + 0.02, p - 0.02, p + len + 0.01, px, py),
        d: (x, y, z) => {
          const out = (x - px) * ux + (y - py) * uy
          const across = -(x - px) * uy + (y - py) * ux
          const [ro, rz] = rotX(out, z - p + 0.008, lean)
          return sdTaper('round', across, ro, rz, 0, len, 0.02, 0.002) * 0.7
        },
        m: Mat.Trim,
      })
    }
  }

  // Crystals growing out of the plinth's top, leaning outwards (two in front, one behind)
  if (extras.shards) {
    const angles = level === 1 ? [0, Math.PI / 2] : [0, Math.PI / 2, (5 * Math.PI) / 4]
    for (const a of angles) {
      const R = shapeRadius(A, a, plinthTop) * 0.82
      const cx = Math.cos(a) * R
      const cy = Math.sin(a) * R
      const ux = Math.cos(a)
      const uy = Math.sin(a)
      for (let i = 0; i < 3; i++) {
        const h = (0.035 + random() * 0.025) * c
        const r = (0.011 + random() * 0.006) * c
        const side = (i - 1) * 0.022
        const px = cx - uy * side
        const py = cy + ux * side
        const lean = 0.25 + random() * 0.35
        parts.push({
          b: column(h * 1.3 + 0.01, p - 0.01, p + h * 2.2, px, py),
          d: (x, y, z) => {
            // Lean away from the tower: tilt about the axis across the outward direction
            const out = (x - px) * ux + (y - py) * uy
            const across = -(x - px) * uy + (y - py) * ux
            const [ro, rz] = rotX(out, z - p - h * 0.9, -lean)
            return crystal(across, ro, rz, r, h, h * 0.55)
          },
          m: Mat.Shard,
        })
      }
    }
  }

  const bounds: Scene['bounds'] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (const part of parts) {
    for (let i = 0; i < 3; i++) bounds[i] = Math.min(bounds[i], part.b[i] - 0.01)
    for (let i = 3; i < 6; i++) bounds[i] = Math.max(bounds[i], part.b[i] + 0.01)
  }

  const colors = def.colors
  return {
    parts,
    bounds,
    light,
    crownScale: scale,
    crown: def.crown,
    magic,
    runes: extras.runes,
    cracks: extras.cracks,
    masonry: def.masonry ?? 'bricks',
    vines: !!extras.vines,
    circle: extras.circle ? Math.min(0.47, plinthOuter + 0.09) : null,
    colors: {
      stoneDark: hexToRgb(colors.stone[0]),
      stoneLight: hexToRgb(colors.stone[1]),
      trim: hexToRgb(colors.trim),
      accent: hexToRgb(colors.accent),
      glow: hexToRgb(colors.glow),
    },
  }
}

/**
 * The top of a body of shape `shape` and radius r1 ending at zt. Returns where the crown goes: on the floor or
 * battlements, under a cupola's dome, on the point of a dome, onion or roof (smaller there).
 */
function finishTop(parts: Part[], top: TowerTop, shape: TowerShape, r1: number, zt: number, level: Level, flags: boolean, random: () => number) {
  const wallOf = (s: TowerShape, r0: number, rr1: number, z0: number, z1: number): Wall => ({ shape: s, cx: 0, cy: 0, z0, z1, r0, r1: rr1 })
  const slab = (s: TowerShape, r: number, z0: number, z1: number, m: Mat) =>
    parts.push({ b: column(r, z0, z1, 0, 0, s), d: (x, y, z) => extrude(sdShape2(s, x, y, r), z, z0, z1), m, w: wallOf(s, r, r, z0, z1) })
  /** A corbel widening the body out to `rim`, and a floor on it; returns the floor's top */
  const corbel = (rim: number) => {
    const zc = zt + 0.06
    parts.push({ b: column(rim, zt - 0.005, zc, 0, 0, shape), d: (x, y, z) => sdTaper(shape, x, y, z, zt - 0.005, zc, r1, rim * 0.98), m: Mat.Stone, w: wallOf(shape, r1, rim * 0.98, zt - 0.005, zc) })
    slab(shape, rim, zc, zc + 0.03, Mat.Stone)
    return zc + 0.03
  }
  /** A hemispherical dome of radius R on z0 (tiles of the accent colour), with a gold rim */
  const dome = (R: number, z0: number, squash: number) => {
    parts.push({
      b: column(R, z0 - 0.01, z0 + R * squash),
      d: (x, y, z) => Math.max(sdEllipsoid(x, y, z - z0, R, R, R * squash), z0 - z),
      m: Mat.Roof,
      w: wallOf('round', R, R * 0.2, z0, z0 + R * squash),
    })
    parts.push({ b: column(R + 0.012, z0 - 0.012, z0 + 0.012), d: (x, y, z) => sdTorus(x, y, z - z0, R, 0.009), m: Mat.Trim })
    return z0 + R * squash
  }
  /** Flags on poles at the left and right corners, waving */
  const addFlags = (rim: number, z0: number) => {
    for (const a of [(3 * Math.PI) / 4, -Math.PI / 4]) {
      const reach = shapeRadius(shape, a, rim) * 0.85
      const cx = Math.cos(a) * reach
      const cy = Math.sin(a) * reach
      const z1 = z0 + 0.2
      parts.push({ b: column(0.01, z0 - 0.01, z1 + 0.01, cx, cy), d: (x, y, z) => extrude(length2(x - cx, y - cy) - 0.0055, z, z0 - 0.01, z1), m: Mat.Trim })
      // The cloth hangs off the pole towards the screen's right, rippling
      const fz = z1 - 0.035
      const phase = random() * 6
      parts.push({
        b: [cx - 0.01, cy - 0.11, fz - 0.05, cx + 0.11, cy + 0.01, fz + 0.04],
        d: (x, y, z) => {
          const along = ((x - cx) - (y - cy)) * Math.SQRT1_2
          const across = ((x - cx) + (y - cy)) * Math.SQRT1_2 - Math.sin(along * 40 + phase) * 0.006 * Math.min(1, along * 12)
          return sdBox(along - 0.05, across, z - fz, 0.05, 0.003, 0.028) * 0.8
        },
        m: Mat.Roof,
      })
    }
  }

  switch (top) {
    case 'floor': {
      const rim = r1 * 1.25
      slab(shape, rim, zt, zt + 0.035, Mat.Wood)
      if (flags) addFlags(rim, zt + 0.035)
      return { base: zt + 0.035, rim, shape, scale: 1 }
    }
    case 'dome': {
      // A drum with a gold band, a dome on it, the crown on its point
      const rim = r1 * 1.25
      const zf = corbel(rim)
      const R = rim * 0.86
      const drumTop = zf + 0.05
      parts.push({ b: column(R, zf, drumTop), d: (x, y, z) => extrude(length2(x, y) - R * 0.98, z, zf, drumTop), m: Mat.Stone, w: wallOf('round', R * 0.98, R * 0.98, zf, drumTop) })
      const apex = dome(R, drumTop, 0.92)
      return { base: apex - 0.01, rim: R, shape: 'round' as TowerShape, scale: 0.6 }
    }
    case 'glass': {
      // A shining glass dome on metal ribs; the crown glows inside it
      const rim = Math.max(r1 * 1.45, 0.13)
      const zf = corbel(rim)
      const R = rim * 0.95
      const squash = 1.3
      parts.push({ b: column(R + 0.015, zf - 0.015, zf + 0.015), d: (x, y, z) => sdTorus(x, y, z - zf, R, 0.012), m: Mat.Trim })
      parts.push({
        b: column(R, zf, zf + R * squash),
        d: (x, y, z) => Math.max(sdEllipsoid(x, y, z - zf, R, R, R * squash), zf - z),
        m: Mat.Glass,
      })
      // Ribs along the dome, from the rim to the top
      const ribs = 8
      parts.push({
        b: column(R + 0.01, zf, zf + R * squash + 0.01),
        d: (x, y, z) => {
          const shell = Math.abs(sdEllipsoid(x, y, z - zf, R, R, R * squash)) - 0.004
          const a = Math.atan2(y, x)
          const sector = (2 * Math.PI) / ribs
          const across = Math.abs(a - sector * Math.round(a / sector)) * length2(x, y) - 0.004
          return Math.max(shell, across, zf - z)
        },
        m: Mat.Trim,
      })
      const apex = zf + R * squash
      parts.push({ b: column(0.03, apex - 0.02, apex + 0.05), d: (x, y, z) => Math.min(extrude(length2(x, y) - 0.012, z, apex - 0.02, apex + 0.012), sdSphere(x, y, z - apex - 0.03, 0.017)), m: Mat.Trim })
      return { base: zf, rim: R, shape: 'round' as TowerShape, scale: Math.min(0.75, (R * squash * 0.8) / 0.3) }
    }
    case 'onion': {
      // An onion dome: a swelling bulb drawn up into a point
      const rim = r1 * 1.25
      const zf = corbel(rim)
      const a = rim * 0.82
      const neck = zf + 0.03
      parts.push({ b: column(a * 0.75, zf, neck), d: (x, y, z) => extrude(length2(x, y) - a * 0.72, z, zf, neck), m: Mat.Trim })
      const bulbZ = neck + a * 0.72
      const tipTop = neck + a * 2.7
      parts.push({
        b: column(a + 0.01, neck - 0.02, tipTop),
        d: (x, y, z) => {
          const bulb = sdEllipsoid(x, y, z - bulbZ, a, a, a * 0.85)
          const tip = sdTaper('round', x, y, z, bulbZ + a * 0.5, tipTop, a * 0.32, 0.003)
          return smoothMin(bulb, tip, a * 0.45) * 0.9
        },
        m: Mat.Roof,
        w: wallOf('round', a, a * 0.1, neck, tipTop),
      })
      return { base: tipTop - 0.012, rim: a, shape: 'round' as TowerShape, scale: 0.55 }
    }
    case 'cupola': {
      // An open pavilion: slim columns round the crown carrying a dome
      const rim = r1 * 1.3
      const zf = corbel(rim)
      const R = rim * 0.92
      const hc = 0.2 + (level - 1) * 0.02
      const count = 6
      for (let i = 0; i < count; i++) {
        const a = Math.PI / 12 + (i * 2 * Math.PI) / count
        const cx = Math.cos(a) * R * 0.84
        const cy = Math.sin(a) * R * 0.84
        parts.push({ b: column(0.016, zf, zf + hc, cx, cy), d: (x, y, z) => extrude(length2(x - cx, y - cy) - 0.013, z, zf, zf + hc), m: Mat.Trim })
      }
      parts.push({ b: column(R, zf + hc, zf + hc + 0.025), d: (x, y, z) => extrude(length2(x, y) - R, z, zf + hc, zf + hc + 0.025), m: Mat.Stone, w: wallOf('round', R, R, zf + hc, zf + hc + 0.025) })
      const apex = dome(R * 0.96, zf + hc + 0.025, 0.75)
      // A small glowing knob on the dome's point
      parts.push({ b: column(0.02, apex - 0.01, apex + 0.04), d: (x, y, z) => sdSphere(x, y, z - apex - 0.015, 0.016), m: Mat.Glow })
      return { base: zf, rim: R, shape: 'round' as TowerShape, scale: 0.62 }
    }
    case 'roof': {
      // A pointed roof following the body's shape, overhanging its edge
      const rim = r1 * 1.25
      const zf = corbel(rim)
      const r0 = rim * 1.12
      const apex = zf + rim * 1.9
      parts.push({ b: column(r0, zf, apex, 0, 0, shape), d: (x, y, z) => sdTaper(shape, x, y, z, zf, apex, r0, 0.004), m: Mat.Roof, w: wallOf(shape, r0, 0.004, zf, apex) })
      return { base: apex - 0.012, rim: r0 * 0.4, shape, scale: 0.6 }
    }
    case 'turrets': {
      // Battlements with a round turret and its pointed roof standing out of each corner
      const rim = r1 * 1.32
      const zf = corbel(rim)
      const zh = zf + 0.075
      parts.push({ b: column(rim, zf - 0.005, zh, 0, 0, shape), d: battlements(shape, rim, zf - 0.005, zh, level), m: Mat.Stone, w: wallOf(shape, rim, rim, zf, zh) })
      const tr = 0.034 + 0.006 * level
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + (shape === 'diamond' ? 0 : Math.PI / 4)
        const reach = shapeRadius(shape, a, rim) * 0.97
        const cx = Math.cos(a) * reach
        const cy = Math.sin(a) * reach
        const z0 = zf - 0.09
        const z1 = zh + 0.035
        parts.push({ b: column(tr, z0, z1, cx, cy), d: (x, y, z) => sdTaper('round', x - cx, y - cy, z, z0, z1, tr * 0.85, tr), m: Mat.Stone, w: { shape: 'round', cx, cy, z0, z1, r0: tr * 0.85, r1: tr } })
        // A little corbel under it, and its roof
        parts.push({ b: column(tr, z0 - 0.04, z0 + 0.002, cx, cy), d: (x, y, z) => sdTaper('round', x - cx, y - cy, z, z0 - 0.04, z0 + 0.001, 0.004, tr * 0.85), m: Mat.Stone, w: { shape: 'round', cx, cy, z0: z0 - 0.04, z1: z0, r0: 0.004, r1: tr * 0.85 } })
        parts.push({ b: column(tr * 1.3, z1, z1 + tr * 2.6, cx, cy), d: (x, y, z) => sdTaper('round', x - cx, y - cy, z, z1, z1 + tr * 2.6, tr * 1.28, 0.002), m: Mat.Roof, w: { shape: 'round', cx, cy, z0: z1, z1: z1 + tr * 2.6, r0: tr * 1.28, r1: 0.002 } })
      }
      if (flags) addFlags(rim * 0.8, zh - 0.02)
      return { base: zf, rim, shape, scale: 1 }
    }
    case 'pagoda': {
      // Stacked roofs with upturned eaves, each smaller, a short wall between them; the crown on the last one
      const rim = r1 * 1.15
      let z = corbel(rim)
      let r = rim * 1.3
      const tiers = level === 1 ? 2 : 3
      for (let k = 0; k < tiers; k++) {
        const z0 = z
        const h = 0.05 + 0.01 * (tiers - k)
        const top = r * 0.42
        const lift = 0.034 + 0.006 * level
        const eave = r
        parts.push({
          b: column(eave, z0 - 0.01, z0 + h + lift, 0, 0, shape),
          d: (x, y, zz) => {
            // How far out a point is, 0 at the axis, 1 on the eave
            const out = Math.max(0, (sdShape2(shape, x, y, 1) + 1) / eave)
            const up = lift * Math.max(0, Math.min(1, (out - 0.6) / 0.4)) ** 2
            return sdTaper(shape, x, y, zz - up, z0, z0 + h, eave, top) * 0.7
          },
          m: Mat.Roof,
          w: wallOf(shape, eave, top, z0, z0 + h),
        })
        z = z0 + h
        if (k < tiers - 1) {
          const wr = top * 1.05
          slab(shape, wr, z - 0.005, z + 0.05, Mat.Stone)
          z += 0.05
          r *= 0.72
        }
      }
      // A cap and a gold ring under the crown
      slab(shape, r * 0.45, z - 0.004, z + 0.012, Mat.Trim)
      return { base: z + 0.012, rim: r * 0.45, shape, scale: 0.75 }
    }
    case 'thorns': {
      // A floor ringed by big rough horns of rock curving up and out: a wild, cruel top
      const rim = r1 * 1.3
      const zf = corbel(rim)
      slab(shape, rim, zf, zf + 0.02, Mat.Stone)
      const count = level === 1 ? 5 : level === 2 ? 6 : 8
      for (let i = 0; i < count; i++) {
        const a = (i * 2 * Math.PI) / count + 0.3
        const reach = shapeRadius(shape, a, rim) * 0.86
        const cx = Math.cos(a) * reach
        const cy = Math.sin(a) * reach
        const ux = Math.cos(a)
        const uy = Math.sin(a)
        const len = (0.13 + random() * 0.06) * (0.85 + level * 0.1)
        const lean = 0.25 + random() * 0.25
        const z0 = zf + 0.01
        parts.push({
          b: column(0.03 + len * 0.6, z0 - 0.02, z0 + len, cx + ux * len * 0.3, cy + uy * len * 0.3),
          d: (x, y, z) => {
            // Leaning further out the higher it goes (a curve), rough
            const t = Math.max(0, z - z0)
            const bend = lean * t + 1.4 * t * t
            const out = (x - cx) * ux + (y - cy) * uy - bend
            const across = -(x - cx) * uy + (y - cy) * ux
            const rough = (noise3(x * 40, y * 40, z * 40, 17 + i) - 0.5) * 0.008
            return (sdTaper('round', across, out, z, z0, z0 + len, 0.026, 0.002) + rough) * 0.55
          },
          m: Mat.Rock,
        })
      }
      return { base: zf + 0.02, rim, shape, scale: 1 }
    }
    case 'stepped': {
      // A stepped pyramid: each step narrower, a gold band on the last, the crown on its flat top
      const rim = r1 * 1.3
      let z = corbel(rim)
      let r = rim
      const steps = level + 1
      for (let k = 0; k < steps; k++) {
        r *= k === 0 ? 0.9 : 0.74
        const h = 0.046
        slab(shape, r, z - 0.003, z + h, Mat.Stone)
        z += h
      }
      slab(shape, r * 0.82, z - 0.003, z + 0.016, Mat.Trim)
      z += 0.016
      return { base: z, rim: r * 0.82, shape, scale: 0.9 }
    }
    case 'halo': {
      // A floor, and a ring of stone floating round the crown, a few loose stones and glowing bands holding it up
      const rim = r1 * 1.25
      const zf = corbel(rim)
      slab(shape, rim, zf, zf + 0.025, Mat.Stone)
      const base = zf + 0.025
      const R = rim * 0.95
      const za = base + 0.1
      const zb = za + 0.042
      parts.push({
        b: column(R, za, zb, 0, 0, shape),
        d: (x, y, z) => Math.max(extrude(sdShape2(shape, x, y, R), z, za, zb), -sdShape2(shape, x, y, R - 0.045)),
        m: Mat.Plinth,
        w: wallOf(shape, R, R, za, zb),
      })
      parts.push({ b: column(R + 0.01, zb - 0.01, zb + 0.01, 0, 0, shape), d: (x, y, z) => extrude(Math.abs(sdShape2(shape, x, y, R - 0.0225)) - 0.005, z, zb - 0.001, zb + 0.004), m: Mat.Glow })
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 4 + ((i - 1) * 2 * Math.PI) / 3
        const sr = R * 0.92
        const cx = Math.cos(a) * sr
        const cy = Math.sin(a) * sr
        const cz = base + 0.05 + random() * 0.025
        const s = 0.028 + random() * 0.012
        parts.push({ b: column(s * 1.4, cz - s * 1.4, cz + s * 1.4, cx, cy), d: (x, y, z) => (sdSphere(x - cx, y - cy, (z - cz) * 1.3, s) + (noise3(x * 60, y * 60, z * 60, 23 + i) - 0.5) * 0.01) * 0.7, m: Mat.Rock })
      }
      return { base, rim: R, shape, scale: 1 }
    }
    default: {
      const rim = r1 * 1.32
      const zf = corbel(rim)
      const zh = zf + 0.075
      parts.push({ b: column(rim, zf - 0.005, zh, 0, 0, shape), d: battlements(shape, rim, zf - 0.005, zh, level), m: Mat.Stone, w: wallOf(shape, rim, rim, zf, zh) })
      if (flags) addFlags(rim, zh - 0.02)
      return { base: zf, rim, shape, scale: 1 }
    }
  }
}

/** A parapet wall round the edge with gaps cut in its top half (merlons on the corners of a polygon) */
function battlements(shape: TowerShape, R: number, z0: number, z1: number, level: Level) {
  const thickness = 0.034
  const zCut = z0 + (z1 - z0) * 0.48
  const sides = shapeSides(shape)
  let period: number
  let offset: number
  if (sides === 0) {
    period = (2 * Math.PI * R) / Math.max(8, Math.round((2 * Math.PI * R) / 0.075))
    offset = 0
  } else {
    // Along each side, from corner to corner
    const half = shape === 'square' || shape === 'diamond' ? R : R * Math.tan(Math.PI / sides)
    period = (2 * half) / (sides === 4 ? (level === 3 ? 3 : 2) : sides === 6 ? 2 : 1)
    offset = half
  }
  const gap = Math.min(period * 0.24, 0.03)
  return (x: number, y: number, z: number) => {
    const outer = sdShape2(shape, x, y, R)
    const wall = Math.max(extrude(outer, z, z0, z1), -(outer + thickness))
    const s = sides === 0 ? Math.atan2(y, x) * R : aroundShape(shape, x, y, R).s + offset
    const m = s - period * (Math.floor(s / period) + 0.5)
    const notch = Math.max(Math.abs(m) - gap, zCut - z)
    return Math.max(wall, -notch)
  }
}
