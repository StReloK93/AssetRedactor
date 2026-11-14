/**
 * Noise that repeats exactly every cell. A tile picture is used on every cell of its kind, so whatever crosses its
 * right edge has to come back in on its left: with a lattice that wraps every cell, neighbours always meet.
 */

/** A stable 0..1 value for a lattice point. */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

const wrap = (i: number, n: number) => ((i % n) + n) % n
const smooth = (t: number) => t * t * (3 - 2 * t)

/** Value noise in 0..1 with `freq` lattice points per cell, repeating every cell (u, v in cells). */
export function cellNoise(u: number, v: number, freq: number, seed: number): number {
  const x = u * freq
  const y = v * freq
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const sx = smooth(x - x0)
  const sy = smooth(y - y0)
  const a = hash2(wrap(x0, freq), wrap(y0, freq), seed)
  const b = hash2(wrap(x0 + 1, freq), wrap(y0, freq), seed)
  const c = hash2(wrap(x0, freq), wrap(y0 + 1, freq), seed)
  const d = hash2(wrap(x0 + 1, freq), wrap(y0 + 1, freq), seed)
  const top = a + (b - a) * sx
  const bottom = c + (d - c) * sx
  return top + (bottom - top) * sy
}

/** Layered value noise (each layer twice as fine, half as strong), 0..1, repeating every cell. */
export function cellFbm(u: number, v: number, baseFreq: number, octaves: number, seed: number): number {
  let sum = 0
  let amplitude = 0.5
  let total = 0
  let freq = baseFreq
  for (let i = 0; i < octaves; i++) {
    sum += cellNoise(u, v, freq, seed + i * 101) * amplitude
    total += amplitude
    amplitude *= 0.5
    freq *= 2
  }
  return sum / total
}

/**
 * Jittered points on a `grid` x `grid` lattice per cell (one per lattice square), repeating every cell.
 * Returned for the lattice squares around (u, v) so a caller can search its neighbourhood across the cell edge.
 */
export function cellPoint(ix: number, iy: number, grid: number, seed: number): { u: number; v: number } {
  const wx = wrap(ix, grid)
  const wy = wrap(iy, grid)
  return {
    u: (ix + 0.15 + hash2(wx, wy, seed) * 0.7) / grid,
    v: (iy + 0.15 + hash2(wx, wy, seed + 7) * 0.7) / grid,
  }
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** 0 on the cell's edges, rising to 1 a quarter cell in: what a variant may change without touching the seams. */
export function interiorWeight(u: number, v: number): number {
  return smoothstep(0.04, 0.26, Math.min(u, 1 - u, v, 1 - v))
}

/** A small seeded random generator (for the preview map). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
