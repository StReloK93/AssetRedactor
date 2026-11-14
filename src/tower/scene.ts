import { Rgb, hexToRgb } from '../core/color'
import { seededRandom } from '../core/noise'
import { CROWNS, crystal } from './crowns'
import type { CrownId, Level, TowerDef, TowerShape, TowerTop } from './model'
import { Light, Mat, Part, Wall, column } from './parts'
import { aroundShape, extrude, length2, noise3, rotX, sdBox, sdEllipsoid, sdShape2, sdSphere, sdTaper, sdTorus, shapeRadius, shapeReach, shapeSides, smoothMin } from './sdf'

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
      parts.push({
        b: column(outer, zl, zl + 0.045, 0, 0, A),
        d: (x, y, z) => Math.max(extrude(sdShape2(A, x, y, outer), z, zl, zl + 0.045), -sdShape2(A, x, y, outer - 0.09)),
        m: Mat.Stone,
        w: { shape: A, cx: 0, cy: 0, z0: zl, z1: zl + 0.045, r0: outer, r1: outer },
      })
      // A beam of light between the pedestal and the floating crown
      const base = zl + 0.07
      parts.push({ b: column(0.02, zl - 0.01, base + 0.01), d: (x, y, z) => extrude(length2(x, y) - 0.01, z, zl - 0.01, base + 0.01), m: Mat.Glow })
      crownAt = { base, rim: outer, shape: A, scale: 1 }
      ringsOn = { z0: p, z1: zl, r0: W * 0.5, r1: W * 0.36, shape: A }
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
