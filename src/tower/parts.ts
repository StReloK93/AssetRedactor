import type { TowerShape } from './model'
import { shapeReach } from './sdf'

/** The pieces a tower scene is made of. Sizes are in tiles: one cell is 1 x 1, centred on 0, 0, z up. */

export const enum Mat {
  Stone,
  Plinth,
  Trim,
  Wood,
  Roof,
  Glow,
  Ice,
  Dark,
  Eye,
  /** A glowing crystal shard (the floating ones) */
  Shard,
  /** Rough rock without bricks (under a floating tower, loose chunks) */
  Rock,
  /** A cut gem: deep, saturated, bright facets */
  Gem,
  /** Glowing glass: see-through, the crown shows inside it */
  Glass,
}

/**
 * A wall a stone part is laid on: bricks run round its outline, and it may carry windows and a band of runes.
 * (cx, cy) is its centre, r0 and r1 its radius at z0 and z1.
 */
export interface Wall {
  shape: TowerShape
  cx: number
  cy: number
  z0: number
  z1: number
  r0: number
  r1: number
  windows?: [number, number]
  runes?: [number, number]
}

export interface Part {
  /** min x, y, z, max x, y, z */
  b: [number, number, number, number, number, number]
  d: (x: number, y: number, z: number) => number
  m: Mat
  w?: Wall
}

export interface Light {
  x: number
  y: number
  z: number
  radius: number
}

/** A box round an upright shape of radius r from z0 to z1, centred on (cx, cy) */
export function column(r: number, z0: number, z1: number, cx = 0, cy = 0, shape: TowerShape = 'round'): Part['b'] {
  const reach = r * shapeReach(shape)
  return [cx - reach, cy - reach, z0, cx + reach, cy + reach, z1]
}
