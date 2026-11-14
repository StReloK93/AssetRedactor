import { Rgb, mix, shade } from '../core/color'
import { FACE_CENTER_Y, SPRITE_H, SPRITE_W } from '../core/format'
import { smoothstep } from '../core/noise'
import { Mat, Wall } from './parts'
import type { Scene } from './scene'
import { aroundShape, clamp, hash3, noise3 } from './sdf'

/**
 * Draws a tower scene into the game's sprite format by ray marching: every pixel sends a ray along the camera's
 * view and steps forward by the scene's distance until it meets a surface, which is then coloured by its
 * material and lit (sun from the left, sky, ambient occlusion, soft shadows and the crown's own light).
 * The camera is the game's: a 2:1 isometric view looking down 30 degrees, one tile 256 px wide.
 */

/** Pixels per world unit along the screen axes */
const S = 128 * Math.SQRT2
const SIN = 0.5
const COS = Math.sqrt(3) / 2
/** Screen right, screen down and the view direction, in world space */
const RX = Math.SQRT1_2
const RY = -Math.SQRT1_2
const DNX = SIN * Math.SQRT1_2
const DNY = SIN * Math.SQRT1_2
const DNZ = -COS
const DX = -COS * Math.SQRT1_2
const DY = -COS * Math.SQRT1_2
const DZ = -SIN
/** Where the world's origin (the cell centre on the ground) lands in the sprite */
const CX = SPRITE_W / 2
const CY = FACE_CENTER_Y

/** Towards the sun: from the screen's left and above, so the left face is lit and the right one in shade */
const LIGHT = normalize(-0.55, 0.45, 0.78)
const SUN: Rgb = [1.08, 1.02, 0.92]
const SKY: Rgb = [0.78, 0.84, 0.98]

function normalize(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}

/** A wall's radius at height z */
const radiusAt = (w: Wall, z: number) => w.r0 + (w.r1 - w.r0) * clamp((z - w.z0) / (w.z1 - w.z0), 0, 1)

/** The strokes runes are made of, between points of a 3 x 3 grid (u, v from 0 to 1); the first, the stem, is always drawn */
const GLYPH_STROKES: [number, number, number, number][] = [
  [0.5, 0, 0.5, 1],
  [0, 1, 0.5, 0.5],
  [1, 1, 0.5, 0.5],
  [0, 0, 0.5, 0.5],
  [1, 0, 0.5, 0.5],
  [0, 1, 1, 1],
  [0, 0, 1, 0],
  [0.5, 1, 1, 0.5],
  [0.5, 1, 0, 0.5],
  [0.5, 0, 1, 0.5],
  [0, 0.5, 1, 0.5],
  [0.5, 0.5, 1, 0],
]

/** World point to sprite pixel */
export function project(x: number, y: number, z: number): { x: number; y: number } {
  return { x: CX + (x - y) * 128, y: CY + (x + y) * 64 - z * S * COS }
}

export interface RenderOptions {
  seed: number
  brickSize: number
  weathering: number
  glow: number
  outline: number
  /** draft: one ray per 2 x 2 pixels, quick; final: a ray per pixel and more along edges */
  quality: 'draft' | 'final'
  /** Put the tower's shadow on its tile into the sprite */
  shadow: boolean
  /** Pixels per sprite pixel: 2 draws a sharper, double-size picture (for the preview) */
  scale?: number
}

/** A rendered sprite: straight (not premultiplied) RGBA pixels, 256 x 512 times the scale */
export function renderTower(scene: Scene, options: RenderOptions): Uint8ClampedArray {
  const { parts, bounds } = scene
  const n = parts.length
  let hitPart = -1
  /** Glass is skipped while looking through it, and by shadows */
  let skipGlass = false

  /** The scene's distance at a point; `hitPart` is left on the nearest part */
  function map(x: number, y: number, z: number): number {
    let best = Infinity
    hitPart = -1
    for (let i = 0; i < n; i++) {
      const b = parts[i].b
      const ox = Math.max(b[0] - x, 0, x - b[3])
      const oy = Math.max(b[1] - y, 0, y - b[4])
      const oz = Math.max(b[2] - z, 0, z - b[5])
      if (ox * ox + oy * oy + oz * oz >= best * best) continue
      if (skipGlass && parts[i].m === Mat.Glass) continue
      const d = parts[i].d(x, y, z)
      if (d < best) {
        best = d
        hitPart = i
      }
    }
    return best
  }

  const boundsDist = (x: number, y: number, z: number) =>
    Math.hypot(Math.max(bounds[0] - x, 0, x - bounds[3]), Math.max(bounds[1] - y, 0, y - bounds[4]), Math.max(bounds[2] - z, 0, z - bounds[5]))

  /** How much sunlight reaches a point, 0..1, soft at the edges of a shadow */
  function softShadow(x: number, y: number, z: number): number {
    const before = skipGlass
    skipGlass = true
    const res = shadowRay(x, y, z)
    skipGlass = before
    return res
  }
  function shadowRay(x: number, y: number, z: number): number {
    let res = 1
    let t = 0.012
    for (let i = 0; i < 32; i++) {
      const px = x + LIGHT[0] * t
      const py = y + LIGHT[1] * t
      const pz = z + LIGHT[2] * t
      if (boundsDist(px, py, pz) > 0.02) break
      const h = map(px, py, pz)
      res = Math.min(res, (12 * h) / t)
      if (res < 0.01) return 0
      t += clamp(h, 0.006, 0.08)
    }
    return clamp(res, 0, 1)
  }

  /** How open a point is to the sky (corners and the foot of the walls get darker); the ground counts */
  function occlusion(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    let occ = 0
    let weight = 1
    for (let i = 1; i <= 4; i++) {
      const h = 0.012 * i
      const px = x + nx * h
      const py = y + ny * h
      const pz = z + nz * h
      const d = Math.min(map(px, py, pz), pz)
      occ += (h - d) * weight
      weight *= 0.65
    }
    return clamp(1 - occ * 9, 0.25, 1)
  }

  const colors = scene.colors
  const mortar = shade(colors.stoneDark, 0.55)
  const glowHot = mix(colors.glow, [255, 250, 235], 0.5)
  const glowDeep = shade(colors.glow, 0.5)
  const moss: Rgb = [84, 112, 50]
  const seed = options.seed
  const light = scene.light
  const lightRadius = light.radius

  /** A brick pattern on (s, t): which brick, and how far from its mortar */
  function bricks(s: number, t: number, bw: number, bh: number) {
    const row = Math.floor(t / bh)
    const shifted = s / bw + (row & 1 ? 0.5 : 0)
    const col = Math.floor(shifted)
    const fs = shifted - col
    const ft = t / bh - row
    const edge = Math.min(fs * bw, (1 - fs) * bw, ft * bh, (1 - ft) * bh)
    return { row, col, ft, edge }
  }

  /** Stone: bricks on the walls, flagstones on top, moss and grime low down */
  function stoneColor(x: number, y: number, z: number, nz: number, big: boolean, wall: Wall): Rgb {
    const size = options.brickSize * (big ? 1.5 : 1)
    const bw = 0.075 * size
    const bh = 0.036 * size
    let b
    let side = 0
    if (nz > 0.7) b = bricks(x + y * 0.31, y, bw * 0.9, bw * 0.7)
    else {
      const around = aroundShape(wall.shape, x - wall.cx, y - wall.cy, radiusAt(wall, z))
      side = around.side
      b = bricks(around.s, z, bw, bh)
    }
    const m = 0.0045
    if (b.edge < m) return shade(mortar, 0.9 + noise3(x * 90, y * 90, z * 90, seed) * 0.2)
    const tone = hash3(b.col, b.row, side, seed + (big ? 7 : 0))
    const grain = noise3(x * 70, y * 70, z * 70, seed + 3) - 0.5
    let c = mix(colors.stoneDark, colors.stoneLight, clamp(0.22 + tone * 0.62 + grain * 0.25 - (big ? 0.12 : 0), 0, 1))
    // Rounded brick edges: darker at the mortar, the top edge catching the light
    c = shade(c, (0.78 + 0.22 * smoothstep(m, m + 0.007, b.edge)) * (nz <= 0.7 && b.ft > 0.82 ? 1.07 : 1))
    return weather(c, x, y, z, nz, tone)
  }

  /** Moss in patches and grime near the ground */
  function weather(c: Rgb, x: number, y: number, z: number, nz: number, tone: number): Rgb {
    const w = options.weathering
    if (w <= 0) return c
    const patch = noise3(x * 13, y * 13, z * 13, seed + 11) * 0.7 + noise3(x * 40, y * 40, z * 40, seed + 12) * 0.3
    const amount = clamp((patch - 0.62 + w * 0.5 - z * 1.3 + Math.max(nz, 0) * 0.25) * 5, 0, 1) * Math.min(1, w * 1.6)
    c = mix(c, shade(moss, 0.8 + tone * 0.4), amount * 0.85)
    return shade(c, 1 - 0.3 * w * smoothstep(0.14, 0, z))
  }

  /** Rough rock: layered noise, no bricks */
  function rockColor(x: number, y: number, z: number, nz: number): Rgb {
    const n = noise3(x * 22, y * 22, z * 22, seed + 31) * 0.6 + noise3(x * 70, y * 70, z * 70, seed + 32) * 0.4
    const c = mix(shade(colors.stoneDark, 0.8), colors.stoneLight, clamp(n * 1.1 - 0.1 + Math.max(nz, 0) * 0.15, 0, 1))
    return weather(c, x, y, z, nz, n)
  }

  /** Where round a wall a point is, from the middle of its side (a round wall: from the nearest quarter turn, one facing the viewer) */
  function wallAround(wall: Wall, x: number, y: number, z: number): number {
    const r = radiusAt(wall, z)
    if (wall.shape !== 'round') return aroundShape(wall.shape, x - wall.cx, y - wall.cy, r).s
    const a = Math.atan2(y - wall.cy, x - wall.cx) - Math.PI / 4
    return (a - (Math.PI / 2) * Math.round(a / (Math.PI / 2))) * r
  }

  /** An arrow slit on a wall that the crown's light shines out of: 2 inside it, 1 on its frame */
  function windowAt(wall: Wall, x: number, y: number, z: number): number {
    const win = wall.windows
    if (!win || z < win[0] || z > win[1] + 0.006) return 0
    const s = wallAround(wall, x, y, z)
    const half = 0.014
    const top = win[1] - half
    // A rounded top on the slit
    const inside = z > top ? Math.hypot(s, z - top) < half : Math.abs(s) < half
    if (inside) return 2
    return Math.abs(s) < half + 0.006 ? 1 : 0
  }

  /** How brightly the runes carved in a wall's band glow at a point, 0..1 */
  function runeAt(wall: Wall, x: number, y: number, z: number): number {
    const band = wall.runes
    if (!band || z < band[0] || z > band[1]) return 0
    const r = radiusAt(wall, z)
    const s = wall.shape === 'round' ? Math.atan2(y - wall.cy, x - wall.cx) * r : aroundShape(wall.shape, x - wall.cx, y - wall.cy, r).s
    const cell = 0.052
    const k = Math.floor(s / cell)
    const h = band[1] - band[0] - 0.016
    return glyph((s / cell - k - 0.2) / 0.6, (z - band[0] - 0.008) / h, k, cell * 0.6, h)
  }

  /**
   * A rune: a few strokes between the points of a 3 x 3 grid, picked by `id`, always with its stem. u, v run 0..1
   * over the rune (w, h its size in world units); returns how much of a stroke covers the point.
   */
  function glyph(u: number, v: number, id: number, w: number, h: number): number {
    if (u < -0.15 || u > 1.15 || v < -0.15 || v > 1.15) return 0
    const bits = Math.floor(hash3(id, 7, 3, seed) * 4096)
    let best = Infinity
    for (let i = 0; i < GLYPH_STROKES.length; i++) {
      if (i > 0 && !((bits >> i) & 1)) continue
      const [x1, y1, x2, y2] = GLYPH_STROKES[i]
      const dx = (x2 - x1) * w
      const dy = (y2 - y1) * h
      const px = (u - x1) * w
      const py = (v - y1) * h
      const t = clamp((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1)
      best = Math.min(best, Math.hypot(px - dx * t, py - dy * t))
    }
    return smoothstep(0.0055, 0.0025, best)
  }

  /** Thin glowing cracks running through old stone, mostly low down, 0..1 */
  function crackAt(x: number, y: number, z: number): number {
    if (!scene.cracks || scene.magic <= 0) return 0
    const n = Math.abs(noise3(x * 16, y * 16, z * 16, seed + 41) - 0.5) + Math.abs(noise3(x * 33, y * 33, z * 33, seed + 42) - 0.5) * 0.5
    return smoothstep(0.035, 0.012, n) * smoothstep(0.32, 0.05, z) * scene.magic
  }

  /** The colour of the surface at a point, lit */
  function shadeAt(px: number, py: number, pz: number, part: number): Rgb {
    // Normal from four samples round the point
    const e = 0.0008
    const k1 = map(px + e, py - e, pz - e)
    const k2 = map(px - e, py - e, pz + e)
    const k3 = map(px - e, py + e, pz - e)
    const k4 = map(px + e, py + e, pz + e)
    const [nx, ny, nz] = normalize(k1 - k2 - k3 + k4, -k1 - k2 + k3 + k4, -k1 + k2 - k3 + k4)
    const mat = parts[part].m
    const towardsViewer = clamp(-(nx * DX + ny * DY + nz * DZ), 0, 1)

    // Glowing materials are not lit, they light
    if (mat === Mat.Glow) {
      if (scene.crown === 'brazier' && pz > light.z - 0.12) {
        // Flame: a yellow core, its own colour at the edges, deeper towards the tips
        const core = Math.pow(towardsViewer, 1.3) * (1 - smoothstep(light.z - 0.02, light.z + 0.2 * scene.crownScale, pz) * 0.8)
        return mix(mix(shade(colors.glow, 0.8), [255, 70, 20], 0.25), mix(colors.glow, [255, 236, 140], 0.85), core)
      }
      return mix(glowDeep, glowHot, Math.pow(towardsViewer, 1.6))
    }
    if (mat === Mat.Eye) {
      const qx = px - light.x
      const qy = py - light.y
      const qz = pz - light.z
      const across = qx * RX + qy * RY
      const r = 0.085 * scene.crownScale
      const iris = 1 - clamp(Math.hypot(across, qx * DNX + qy * DNY + qz * DNZ) / r, 0, 1)
      let c = mix(glowDeep, mix(colors.glow, [255, 200, 140], 0.55), Math.pow(towardsViewer, 2))
      c = mix(c, [255, 230, 170], smoothstep(0.35, 0.9, iris) * 0.35)
      // A slit pupil, upright, on the side facing the viewer
      if (Math.abs(across) < r * (0.1 + 0.12 * iris) && towardsViewer > 0.55) c = [26, 2, 6]
      return c
    }
    if (mat === Mat.Dark) {
      const swirl = noise3(px * 30, py * 30, pz * 30, seed + 21)
      const rim = Math.pow(1 - towardsViewer, 2.2)
      return mix(mix([14, 9, 22], shade(colors.glow, 0.25), swirl * 0.5), mix(colors.glow, [255, 255, 255], 0.2), rim)
    }

    const sunDot = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
    if (mat === Mat.Shard) {
      // A glowing crystal: lit facets over its own light, bright edges
      const facet = clamp(0.4 + 0.6 * Math.max(sunDot, 0), 0, 1)
      return mix(mix(shade(colors.glow, 0.7), glowHot, facet), [255, 255, 255], Math.pow(1 - towardsViewer, 3) * 0.6)
    }
    const lit = sunDot > 0 ? sunDot * softShadow(px + nx * 0.003, py + ny * 0.003, pz + nz * 0.003) : 0
    const ao = occlusion(px, py, pz, nx, ny, nz)

    if (mat === Mat.Gem) {
      // Deep inside, bright where a facet catches the sun or turns away from the viewer
      const facet = Math.max(sunDot, 0)
      let c = mix(shade(colors.glow, 0.45), colors.glow, 0.35 + 0.65 * towardsViewer)
      c = mix(c, glowHot, Math.pow(facet, 3) * 0.8)
      c = mix(c, [255, 255, 255], Math.pow(1 - towardsViewer, 4) * 0.35)
      return specular(c, nx, ny, nz, lit, 80, 0.9)
    }
    if (mat === Mat.Ice) {
      const facet = clamp(0.35 + 0.65 * Math.max(sunDot, 0), 0, 1)
      let c = mix(shade(colors.glow, 0.45), mix(colors.glow, [255, 255, 255], 0.45), facet)
      c = mix(c, [255, 255, 255], Math.pow(1 - towardsViewer, 3) * 0.5)
      return specular(c, nx, ny, nz, lit, 60, 0.7)
    }

    // Parts without a wall of their own get bricks laid round the tower's axis
    const wall: Wall = parts[part].w ?? { shape: 'round', cx: 0, cy: 0, z0: 0, z1: 1, r0: Math.hypot(px, py), r1: Math.hypot(px, py) }
    let base: Rgb
    let shine = 0
    /** Light of its own on top of the lit colour: runes, cracks */
    let emit = 0
    switch (mat) {
      case Mat.Stone: {
        const win = nz < 0.5 ? windowAt(wall, px, py, pz) : 0
        if (win === 2) return mix(colors.glow, glowHot, 0.3)
        base = win === 1 ? shade(mortar, 0.6) : stoneColor(px, py, pz, nz, false, wall)
        if (nz < 0.5) emit = Math.max(runeAt(wall, px, py, pz) * Math.min(1, scene.magic * 1.5), crackAt(px, py, pz))
        break
      }
      case Mat.Plinth:
        base = stoneColor(px, py, pz, nz, true, wall)
        emit = crackAt(px, py, pz)
        break
      case Mat.Rock:
        base = rockColor(px, py, pz, nz)
        emit = scene.cracks ? smoothstep(0.012, 0.004, Math.abs(noise3(px * 14, py * 14, pz * 14, seed + 43) - 0.5)) * smoothstep(0.45, 0.6, noise3(px * 5, py * 5, pz * 5, seed + 44)) * scene.magic : 0
        break
      case Mat.Trim:
        base = shade(colors.trim, 0.92 + noise3(px * 60, py * 60, pz * 60, seed + 5) * 0.16)
        shine = 0.55
        break
      case Mat.Wood: {
        // Planks: running along x on the floor, upright on the edges
        const along = nz > 0.7 ? px + py * 0.02 : aroundShape(wall.shape, px - wall.cx, py - wall.cy, radiusAt(wall, pz)).s
        const plank = Math.floor(along / 0.03)
        const f = along / 0.03 - plank
        const tone = hash3(plank, 3, 1, seed)
        const grain = noise3(along * 20, (nz > 0.7 ? py : pz) * 150, plank, seed + 9)
        // Wood brown, tinted by the accent colour
        base = shade(mix(colors.accent, [118, 80, 48], 0.6), (0.75 + tone * 0.35 + (grain - 0.5) * 0.18) * (f < 0.08 || f > 0.92 ? 0.6 : 1))
        break
      }
      default: {
        // Roof shingles: rows of rounded tiles, each overlapping the one below
        const around = aroundShape(wall.shape, px - wall.cx, py - wall.cy, 0.1)
        const rowH = 0.026
        const row = Math.floor(pz / rowH)
        const ft = pz / rowH - row
        const w = 0.034
        const shifted = around.s / w + (row & 1 ? 0.5 : 0)
        const col = Math.floor(shifted)
        const fs = shifted - col - 0.5
        const scallop = ft - (1 - 4 * fs * fs) * 0.35
        const tone = hash3(col, row, around.side, seed + 13)
        base = shade(colors.accent, (0.72 + tone * 0.22) * (scallop < 0.05 ? 0.62 : 0.82 + ft * 0.25))
        break
      }
    }

    // Sun, sky and the crown's light
    const sky = (0.46 + 0.26 * Math.max(nz, 0)) * ao
    const sun = lit * 0.92
    let c: Rgb = [base[0] * (SUN[0] * sun + SKY[0] * sky), base[1] * (SUN[1] * sun + SKY[1] * sky), base[2] * (SUN[2] * sun + SKY[2] * sky)]
    const lx = light.x - px
    const ly = light.y - py
    const lz = light.z - pz
    const ld = Math.hypot(lx, ly, lz)
    if (ld < lightRadius && options.glow > 0) {
      const facing = clamp((nx * lx + ny * ly + nz * lz) / ld, 0, 1)
      const fall = Math.pow(1 - ld / lightRadius, 2) * facing * options.glow * 1.6
      c = [c[0] + base[0] * (colors.glow[0] / 255) * fall, c[1] + base[1] * (colors.glow[1] / 255) * fall, c[2] + base[2] * (colors.glow[2] / 255) * fall]
    }
    if (shine) c = specular(c, nx, ny, nz, lit, 24, shine)
    return emit > 0 ? mix(c, glowHot, clamp(emit, 0, 1)) : c
  }

  /** A highlight where the sun reflects towards the viewer */
  function specular(c: Rgb, nx: number, ny: number, nz: number, lit: number, power: number, strength: number): Rgb {
    const [hx, hy, hz] = normalize(LIGHT[0] - DX, LIGHT[1] - DY, LIGHT[2] - DZ)
    const s = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), power) * strength * lit * 255
    return [c[0] + s, c[1] + s, c[2] + s]
  }

  /** A circle of runes on the ground: two rings with runes between them, 0..1 */
  function circleAt(x: number, y: number, R: number): number {
    const rho = Math.hypot(x, y)
    const inner = R - 0.05
    if (rho > R + 0.01 || rho < inner - 0.01) return 0
    const rings = Math.max(smoothstep(0.006, 0.003, Math.abs(rho - R)), smoothstep(0.004, 0.002, Math.abs(rho - inner)) * 0.8)
    const count = Math.round((2 * Math.PI * (R - 0.025)) / 0.045)
    const at = ((Math.atan2(y, x) / (2 * Math.PI)) + 1) * count
    const k = Math.floor(at)
    const rune = glyph((at - k - 0.22) / 0.56, (rho - inner - 0.01) / 0.03, k + 1000, ((2 * Math.PI * (R - 0.025)) / count) * 0.56, 0.03)
    return Math.max(rings, rune * 0.9)
  }

  /** Glass at a point: its colour and how much it hides what is behind it */
  let glassAlpha = 0
  const glassTint = mix(colors.glow, [255, 255, 255], 0.35)
  const ENV = normalize(-0.6, 0.35, 0.72)
  function glassAt(px: number, py: number, pz: number): Rgb {
    const e = 0.0008
    const k1 = map(px + e, py - e, pz - e)
    const k2 = map(px - e, py - e, pz + e)
    const k3 = map(px - e, py + e, pz - e)
    const k4 = map(px + e, py + e, pz + e)
    const [nx, ny, nz] = normalize(k1 - k2 - k3 + k4, -k1 - k2 + k3 + k4, -k1 + k2 - k3 + k4)
    const towardsViewer = clamp(-(nx * DX + ny * DY + nz * DZ), 0, 1)
    const fresnel = Math.pow(1 - towardsViewer, 2.4)
    // The sky reflected as a soft bright window, the sun as a sharp spark
    const env = smoothstep(0.55, 0.95, nx * ENV[0] + ny * ENV[1] + nz * ENV[2])
    const [hx, hy, hz] = normalize(LIGHT[0] - DX, LIGHT[1] - DY, LIGHT[2] - DZ)
    const spark = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), 140) * 1.6
    glassAlpha = clamp(0.28 + fresnel * 0.6 + env * 0.45 + spark, 0, 0.97)
    const c = mix(glassTint, [255, 255, 255], clamp(fresnel * 0.5 + env * 0.8 + spark, 0, 1))
    return c
  }

  // ---- Casting rays ----

  const hitEps = 0.0006
  let marchT = 0
  let marchPart = -1
  let marchAlpha = 0
  /** Steps along a ray from t0 to t1; leaves where it hit (or came closest) and how much of a pixel it covers */
  function march(ox: number, oy: number, oz: number, t0: number, t1: number, pixel: number): void {
    let t = t0
    let minD = Infinity
    let minT = t0
    let minPart = -1
    for (let step = 0; step < 160 && t < t1; step++) {
      const dist = map(ox + DX * t, oy + DY * t, oz + DZ * t)
      if (dist < minD) {
        minD = dist
        minT = t
        minPart = hitPart
      }
      if (dist < hitEps) break
      t += Math.max(dist * 0.8, hitEps * 0.5)
    }
    marchT = minT
    marchPart = minPart
    // A miss that came within a pixel still covers part of it (smooth silhouettes)
    marchAlpha = minPart < 0 ? 0 : minD < hitEps ? 1 : clamp(1 - minD / pixel, 0, 1)
  }

  // One ray's result
  let rayR = 0
  let rayG = 0
  let rayB = 0
  let rayA = 0
  let rayShadow = 0
  let rayCircle = 0
  let rayPart = -1
  const withShadow = options.shadow
  /** Casts the ray through sprite point (sx, sy); `pixel` is the size of what it stands for, in world units */
  function cast(sx: number, sy: number, pixel: number): void {
    const fx = (sx - CX) / S
    const fy = (sy - CY) / S
    // The ray starts in front of everything and runs along the view
    const ox = RX * fx + DNX * fy - DX * 3
    const oy = RY * fx + DNY * fy - DY * 3
    const oz = DNZ * fy - DZ * 3
    rayR = rayG = rayB = rayA = rayShadow = rayCircle = 0
    rayPart = -1
    // Where it crosses the scene's box
    let tIn = 0
    let tOut = Infinity
    const o = [ox, oy, oz]
    const d = [DX, DY, DZ]
    for (let a = 0; a < 3; a++) {
      const t1 = (bounds[a] - o[a]) / d[a]
      const t2 = (bounds[a + 3] - o[a]) / d[a]
      tIn = Math.max(tIn, Math.min(t1, t2))
      tOut = Math.min(tOut, Math.max(t1, t2))
    }
    if (tIn < tOut) {
      skipGlass = false
      march(ox, oy, oz, tIn, tOut, pixel)
      if (marchAlpha > 0) {
        const t = marchT
        const part = marchPart
        const alpha = marchAlpha
        rayPart = part
        if (parts[part].m === Mat.Glass) {
          // Glass: its own colour over whatever is behind it
          const glass = glassAt(ox + DX * t, oy + DY * t, oz + DZ * t)
          const ga = glassAlpha
          skipGlass = true
          march(ox, oy, oz, t + 0.004, tOut, pixel)
          let br = 0
          let bg = 0
          let bb = 0
          let ba = 0
          if (marchAlpha > 0) {
            const c = shadeAt(ox + DX * marchT, oy + DY * marchT, oz + DZ * marchT, marchPart)
            br = c[0]
            bg = c[1]
            bb = c[2]
            ba = marchAlpha
          }
          skipGlass = false
          const a = ga + ba * (1 - ga)
          rayR = (glass[0] * ga + br * ba * (1 - ga)) / a
          rayG = (glass[1] * ga + bg * ba * (1 - ga)) / a
          rayB = (glass[2] * ga + bb * ba * (1 - ga)) / a
          rayA = a * alpha
        } else {
          const c = shadeAt(ox + DX * t, oy + DY * t, oz + DZ * t, part)
          rayR = c[0]
          rayG = c[1]
          rayB = c[2]
          rayA = alpha
        }
      }
    }
    // The tower's shadow and the circle of runes on its own tile, where the ray reaches the ground
    if (rayA < 1 && (withShadow || scene.circle)) {
      const tg = oz / -DZ
      const gx = ox + DX * tg
      const gy = oy + DY * tg
      const reach = Math.max(Math.abs(gx), Math.abs(gy))
      if (reach < 0.5) {
        if (withShadow) {
          const fade = smoothstep(0.5, 0.3, reach)
          const sun = 1 - softShadow(gx, gy, 0.001)
          const contact = 1 - clamp(map(gx, gy, 0.01) / 0.09, 0, 1)
          rayShadow = Math.max(sun * 0.4, contact * 0.4) * fade * (1 - rayA)
        }
        if (scene.circle) rayCircle = circleAt(gx, gy, scene.circle) * (1 - rayA) * Math.min(1, scene.magic * 1.4)
      }
    }
  }

  // The part of the sprite worth casting rays for: the scene's box on screen, and the tile under it (for the shadow)
  let minX = SPRITE_W
  let maxX = 0
  let minY = SPRITE_H
  let maxY = 0
  for (let i = 0; i < 8; i++) {
    const p = project(bounds[i & 1 ? 3 : 0], bounds[i & 2 ? 4 : 1], bounds[i & 4 ? 5 : 2])
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  if (scene.circle) {
    // The circle on the ground reaches past the tower
    minX = Math.min(minX, CX - scene.circle * S - 2)
    maxX = Math.max(maxX, CX + scene.circle * S + 2)
    maxY = Math.max(maxY, CY + scene.circle * S * SIN + 2)
  }
  const x0 = Math.max(0, Math.floor(minX) - 2)
  const x1 = Math.min(SPRITE_W, Math.ceil(maxX) + 2)
  const y0 = Math.max(0, Math.floor(minY) - 2)
  const y1 = Math.min(SPRITE_H, Math.ceil(Math.max(maxY, withShadow ? CY + 64 : maxY)) + 2)

  // From here on in output pixels: the sprite's pixels times the scale
  const R = options.scale ?? 1
  const W = SPRITE_W * R
  const H = SPRITE_H * R
  const X0 = x0 * R
  const X1 = x1 * R
  const Y0 = y0 * R
  const Y1 = y1 * R
  const tower = new Float32Array(W * H * 4) // r, g, b, coverage
  const ground = new Float32Array(W * H) // shadow strength
  const circle = new Float32Array(W * H) // the circle of runes' light
  const partAt = new Int16Array(W * H).fill(-1)
  const store = (i: number) => {
    tower[i * 4] = rayR
    tower[i * 4 + 1] = rayG
    tower[i * 4 + 2] = rayB
    tower[i * 4 + 3] = rayA
    ground[i] = rayShadow
    circle[i] = rayCircle
    partAt[i] = rayPart
  }

  if (options.quality === 'draft') {
    // One ray for every 2 x 2 pixels: a quarter of the work, a little soft
    for (let py = Y0; py < Y1; py += 2) {
      for (let px = X0; px < X1; px += 2) {
        cast((px + 1) / R, (py + 1) / R, 2 / (S * R))
        for (let dy = 0; dy < 2 && py + dy < Y1; dy++) for (let dx = 0; dx < 2 && px + dx < X1; dx++) store((py + dy) * W + px + dx)
      }
    }
  } else {
    // One ray through every pixel's centre...
    for (let py = Y0; py < Y1; py++) for (let px = X0; px < X1; px++) {
      cast((px + 0.5) / R, (py + 0.5) / R, 1 / (S * R))
      store(py * W + px)
    }
    // ...then four more only where an edge runs through the pixel: a silhouette, or one part meeting another
    const refine = new Uint8Array(W * H)
    for (let py = Y0 + 1; py < Y1 - 1; py++) {
      for (let px = X0 + 1; px < X1 - 1; px++) {
        const i = py * W + px
        const a = tower[i * 4 + 3]
        const part = partAt[i]
        if ((a > 0 && a < 1) || part !== partAt[i - 1] || part !== partAt[i + 1] || part !== partAt[i - W] || part !== partAt[i + W]) refine[i] = 1
      }
    }
    for (let py = Y0 + 1; py < Y1 - 1; py++) {
      for (let px = X0 + 1; px < X1 - 1; px++) {
        const i = py * W + px
        if (!refine[i]) continue
        const a0 = tower[i * 4 + 3]
        let r = tower[i * 4] * a0
        let g = tower[i * 4 + 1] * a0
        let b = tower[i * 4 + 2] * a0
        let cover = a0
        let shadow = ground[i]
        let glow = circle[i]
        for (const [ox, oy] of SUBPIXELS) {
          cast((px + 0.5 + ox) / R, (py + 0.5 + oy) / R, 0.5 / (S * R))
          r += rayR * rayA
          g += rayG * rayA
          b += rayB * rayA
          cover += rayA
          shadow += rayShadow
          glow += rayCircle
        }
        if (cover > 0) {
          tower[i * 4] = r / cover
          tower[i * 4 + 1] = g / cover
          tower[i * 4 + 2] = b / cover
        }
        tower[i * 4 + 3] = cover / 5
        ground[i] = shadow / 5
        circle[i] = glow / 5
      }
    }
  }

  return compose(tower, ground, circle, glowHot, W, H, X0, X1, Y0, Y1, options.outline * R, shade(colors.stoneDark, 0.28))
}

/** Where the extra rays go inside an edge pixel */
const SUBPIXELS: [number, number][] = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]

/**
 * Tower over its outline over the circle of runes over its shadow, into 8-bit RGBA. The tower's colours get a
 * little more contrast and colour, and a light sharpening, so it reads crisp at the game's small size.
 */
function compose(tower: Float32Array, ground: Float32Array, circle: Float32Array, circleColor: Rgb, W: number, H: number, x0: number, x1: number, y0: number, y1: number, outline: number, line: Rgb): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4)
  const reach = Math.ceil(outline)
  const SHARPEN = 0.45
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x
      const a = tower[i * 4 + 3]
      // The outline: how much tower is within `outline` px
      let o = 0
      if (outline > 0 && a < 1) {
        for (let dy = -reach; dy <= reach; dy++) {
          for (let dx = -reach; dx <= reach; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const dist = Math.hypot(dx, dy)
            if (dist > outline + 0.5) continue
            o = Math.max(o, tower[(ny * W + nx) * 4 + 3] * clamp(outline + 0.5 - dist, 0, 1))
          }
        }
      }
      // The tower's colour: sharpened against its solid neighbours, then a touch more contrast and colour
      let tr = tower[i * 4]
      let tg = tower[i * 4 + 1]
      let tb = tower[i * 4 + 2]
      if (a >= 1 && x > 0 && y > 0 && x < W - 1 && y < H - 1) {
        const n = [i - 1, i + 1, i - W, i + W]
        if (n.every(j => tower[j * 4 + 3] >= 1)) {
          let ar = 0
          let ag = 0
          let ab = 0
          for (const j of n) {
            ar += tower[j * 4]
            ag += tower[j * 4 + 1]
            ab += tower[j * 4 + 2]
          }
          tr += (tr - ar / 4) * SHARPEN
          tg += (tg - ag / 4) * SHARPEN
          tb += (tb - ab / 4) * SHARPEN
        }
      }
      const lum = tr * 0.3 + tg * 0.59 + tb * 0.11
      tr = (lum + (tr - lum) * 1.12 - 128) * 1.07 + 128
      tg = (lum + (tg - lum) * 1.12 - 128) * 1.07 + 128
      tb = (lum + (tb - lum) * 1.12 - 128) * 1.07 + 128

      // Back to front: shadow (black), the circle's light, outline, tower
      let r = 0
      let g = 0
      let b = 0
      let alpha = ground[i]
      const over = (cr: number, cg: number, cb: number, ca: number) => {
        const na = ca + alpha * (1 - ca)
        if (na <= 0) return
        r = (cr * ca + r * alpha * (1 - ca)) / na
        g = (cg * ca + g * alpha * (1 - ca)) / na
        b = (cb * ca + b * alpha * (1 - ca)) / na
        alpha = na
      }
      if (circle[i] > 0) over(circleColor[0], circleColor[1], circleColor[2], circle[i] * 0.9)
      if (o > 0) over(line[0], line[1], line[2], o * 0.9)
      if (a > 0) over(tr, tg, tb, a)
      out[i * 4] = r
      out[i * 4 + 1] = g
      out[i * 4 + 2] = b
      out[i * 4 + 3] = alpha * 255
    }
  }
  return out
}
