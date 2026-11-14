import { Rgb, hexToRgb, mix, ramp, shade } from '../core/color'
import { cellFbm, cellNoise, cellPoint, hash2, interiorWeight, smoothstep } from '../core/noise'

export type MaterialId = 'grass' | 'dirt' | 'stone' | 'sand'
export const MATERIAL_IDS: MaterialId[] = ['grass', 'dirt', 'stone', 'sand']

export interface MaterialStyle {
  /** Dark to light: the surface's colour ramp */
  colors: string[]
  /** Grass blade tips, dirt pebbles, the mortar between stones, sand grains */
  accent: string
  /** Size of the features (1 = default, more = bigger blotches / stones) */
  scale: number
  /** How strongly light and dark patches differ, 0..1 */
  contrast: number
}

export interface GroundSettings {
  seed: number
  /** Pictures per material: the same seams, a different inside, so a field does not visibly repeat */
  variants: number
  /** Grass blades: how many and how tall, 0..1 */
  bladeDensity: number
  bladeHeight: number
  /** The slab's side, seen on the map's outer edge */
  edgeColor: string
  materials: Record<MaterialId, MaterialStyle>
  /** The transition set: `over` grows over `under` */
  transition: { over: MaterialId; under: MaterialId }
}

export const DEFAULT_SETTINGS: GroundSettings = {
  seed: 7,
  variants: 3,
  bladeDensity: 0.55,
  bladeHeight: 0.5,
  edgeColor: '#4a3424',
  materials: {
    grass: { colors: ['#3d6a2a', '#5c8c35', '#86b046'], accent: '#c2d96e', scale: 1, contrast: 0.45 },
    dirt: { colors: ['#6b4a2f', '#8c6844', '#b08b60'], accent: '#cdbb9c', scale: 1, contrast: 0.4 },
    stone: { colors: ['#7a756c', '#9e988c', '#c3bcae'], accent: '#4c4842', scale: 1, contrast: 0.35 },
    sand: { colors: ['#c4a56e', '#d9c08b', '#eddaae'], accent: '#a88a58', scale: 1, contrast: 0.35 },
  },
  transition: { over: 'grass', under: 'dirt' },
}

/** Light comes from the screen's top left: in cell space that is towards smaller u (and a little smaller v) */
const LIGHT = { u: -0.86, v: -0.3, z: 0.42 }

/** An integer lattice frequency (a whole number keeps the noise repeating every cell) */
const freqFor = (base: number, scale: number) => Math.max(1, Math.round(base / Math.max(0.25, scale)))

interface Prepared {
  ramp: Rgb[]
  accent: Rgb
  style: MaterialStyle
}
export function prepare(style: MaterialStyle): Prepared {
  return { ramp: style.colors.map(hexToRgb), accent: hexToRgb(style.accent), style }
}

/** Large soft patches: the same on every variant along the edges, the variant's own inside */
function patches(u: number, v: number, freq: number, seed: number, variant: number): number {
  const base = cellFbm(u, v, freq, 4, seed)
  if (variant === 0) return base
  const own = cellFbm(u, v, freq, 4, seed + variant * 997)
  return base + (own - base) * interiorWeight(u, v)
}

/** Stretch a 0..1 value around its middle by the contrast */
const contrasted = (n: number, contrast: number) => 0.5 + (n - 0.5) * (0.6 + contrast * 2.2)

/** The colour of a material at a point of the cell (u, v in 0..1). */
export function surfaceColor(id: MaterialId, m: Prepared, u: number, v: number, seed: number, variant: number): Rgb {
  const { style } = m
  switch (id) {
    case 'grass': {
      const n = patches(u, v, freqFor(3, style.scale), seed, variant)
      const grain = cellNoise(u, v, 48, seed + 31)
      return shade(ramp(m.ramp, contrasted(n, style.contrast)), 0.94 + grain * 0.12)
    }
    case 'dirt': {
      const n = patches(u, v, freqFor(3, style.scale), seed, variant)
      const grain = cellNoise(u, v, 64, seed + 37)
      const ground = shade(ramp(m.ramp, contrasted(n, style.contrast)), 0.92 + grain * 0.16)
      return pebbles(ground, m, u, v, freqFor(9, style.scale), seed, variant)
    }
    case 'stone':
      return cobbles(m, u, v, freqFor(4, style.scale), seed, variant)
    case 'sand': {
      const n = patches(u, v, freqFor(2, style.scale), seed, variant)
      const k = freqFor(5, style.scale)
      const ripple = Math.sin(2 * Math.PI * (k * u + Math.max(1, Math.round(k / 3)) * v) + n * 5)
      const grain = cellNoise(u, v, 72, seed + 41)
      const tone = shade(ramp(m.ramp, contrasted(n * 0.8 + 0.1 + ripple * 0.06, style.contrast)), 0.95 + grain * 0.1)
      return grain > 0.86 ? mix(tone, m.accent, 0.5) : tone
    }
  }
}

/** Small shaded pebbles scattered over dirt */
function pebbles(ground: Rgb, m: Prepared, u: number, v: number, grid: number, seed: number, variant: number): Rgb {
  const ix = Math.floor(u * grid)
  const iy = Math.floor(v * grid)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const gx = ix + dx
      const gy = iy + dy
      // A lattice square deep inside the cell takes the variant's pebble; near the edges every variant has the same
      const centre = { u: (gx + 0.5) / grid, v: (gy + 0.5) / grid }
      const s = interiorWeight(centre.u, centre.v) > 0.5 ? seed + variant * 577 : seed
      // The lattice wraps every cell: a pebble across the edge is the same pebble as on the far side
      const wx = ((gx % grid) + grid) % grid
      const wy = ((gy % grid) + grid) % grid
      if (hash2(wx, wy, s + 3) > 0.12) continue
      const p = cellPoint(gx, gy, grid, s + 5)
      const r = 0.012 + Math.pow(hash2(wx, wy, s + 9), 2) * 0.04
      const du = (u - p.u) / r
      const dv = (v - p.v) / (r * 0.8)
      const d2 = du * du + dv * dv
      if (d2 > 1.35) continue
      if (d2 > 1) return shade(ground, 0.78) // its shadow on the ground
      const z = Math.sqrt(1 - d2)
      const light = Math.max(0, du * LIGHT.u + dv * LIGHT.v + z * LIGHT.z)
      return shade(mix(m.accent, m.ramp[1], 0.35 + hash2(wx, wy, s + 11) * 0.4), 0.7 + light * 0.5)
    }
  }
  return ground
}

/** Rounded paving stones with mortar between them */
function cobbles(m: Prepared, u: number, v: number, grid: number, seed: number, variant: number): Rgb {
  const ix = Math.floor(u * grid)
  const iy = Math.floor(v * grid)
  let d1 = Infinity
  let d2 = Infinity
  let near = { u: 0, v: 0, gx: 0, gy: 0 }
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const gx = ix + dx
      const gy = iy + dy
      const p = cellPoint(gx, gy, grid, seed + 13)
      const d = Math.hypot(u - p.u, v - p.v)
      if (d < d1) {
        d2 = d1
        d1 = d
        near = { ...p, gx, gy }
      } else if (d < d2) d2 = d
    }
  }
  const edge = (d2 - d1) * grid
  const mortar = 0.07
  if (edge < mortar) return shade(m.accent, 0.9 + cellNoise(u, v, 40, seed + 17) * 0.2)
  // Each stone its own tone (stones inside the cell take the variant's tone)
  const wx = ((near.gx % grid) + grid) % grid
  const wy = ((near.gy % grid) + grid) % grid
  const toneSeed = interiorWeight(near.u, near.v) > 0.5 ? seed + variant * 389 : seed
  const tone = hash2(wx, wy, toneSeed + 19)
  const surface = cellFbm(u, v, 12, 2, seed + 23)
  const base = ramp(m.ramp, contrasted(0.25 + tone * 0.5 + (surface - 0.5) * 0.35, m.style.contrast))
  // Bevelled edges, lit from the top left
  const bevel = smoothstep(mortar, mortar + 0.22, edge)
  const toU = u - near.u
  const toV = v - near.v
  const len = Math.hypot(toU, toV) || 1
  const facing = (toU * LIGHT.u + toV * LIGHT.v) / len
  return shade(base, (0.78 + bevel * 0.22) * (1 + facing * 0.12 * (1 - bevel)))
}
