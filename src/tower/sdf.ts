import type { TowerShape } from './model'

/**
 * Signed distance functions: how far a point is from a shape's surface (negative inside). The tower is a union
 * of these, and the renderer finds its surface by stepping along each pixel's ray by that distance.
 * World space: x along the game's column axis, y along the row axis, z up; one tile is 1 x 1, centred on 0, 0.
 */

export const length2 = (x: number, y: number) => Math.sqrt(x * x + y * y)
export const length3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z)
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)

export function sdBox(x: number, y: number, z: number, hx: number, hy: number, hz: number): number {
  const qx = Math.abs(x) - hx
  const qy = Math.abs(y) - hy
  const qz = Math.abs(z) - hz
  return length3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0)
}

export const sdSphere = (x: number, y: number, z: number, r: number) => length3(x, y, z) - r

/** A ring lying flat (in the x-y plane): radius R, thickness r */
export const sdTorus = (x: number, y: number, z: number, R: number, r: number) => length2(length2(x, y) - R, z) - r

/** An ellipsoid with radii rx, ry, rz (a close bound, not exact) */
export function sdEllipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number): number {
  const k0 = length3(x / rx, y / ry, z / rz)
  const k1 = length3(x / (rx * rx), y / (ry * ry), z / (rz * rz))
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1
}

/**
 * A 2D shape of "radius" r (half the width across the flats). Square has a corner facing the viewer; diamond is a
 * square turned so a flat faces the viewer; hexagon and octagon also show the viewer a flat.
 */
export function sdShape2(shape: TowerShape, x: number, y: number, r: number): number {
  if (shape === 'round') return length2(x, y) - r
  if (shape === 'square') {
    const qx = Math.abs(x) - r
    const qy = Math.abs(y) - r
    return length2(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
  }
  const { sides, turn } = POLYGONS[shape]
  // The flat nearest the point's direction: exact inside and along the flats, a little short past the corners
  const sector = (2 * Math.PI) / sides
  const a = Math.atan2(y, x) - turn
  const local = a - sector * Math.round(a / sector)
  return Math.cos(local) * length2(x, y) - r
}

/** Polygons by their number of sides and the direction of one flat (the viewer looks along x = y) */
const POLYGONS: Record<'diamond' | 'hexagon' | 'octagon', { sides: number; turn: number }> = {
  diamond: { sides: 4, turn: Math.PI / 4 },
  hexagon: { sides: 6, turn: Math.PI / 4 },
  octagon: { sides: 8, turn: 0 },
}

/** How far a shape of radius 1 reaches along x or y (its corners), for bounding boxes */
export function shapeReach(shape: TowerShape): number {
  return shape === 'diamond' ? Math.SQRT2 : shape === 'hexagon' ? 1.16 : shape === 'octagon' ? 1.09 : 1
}

/** A 2D distance pulled up between z0 and z1 */
export function extrude(d2: number, z: number, z0: number, z1: number): number {
  const half = (z1 - z0) / 2
  const wy = Math.abs(z - (z0 + z1) / 2) - half
  return Math.min(Math.max(d2, wy), 0) + length2(Math.max(d2, 0), Math.max(wy, 0))
}

/**
 * A prism of the given shape from z0 to z1 whose radius goes from r0 to r1 (a tapering wall, a pyramid roof
 * when r1 is 0). The slope shortens the true distance, which the last factor makes up for.
 */
export function sdTaper(shape: TowerShape, x: number, y: number, z: number, z0: number, z1: number, r0: number, r1: number): number {
  const t = clamp((z - z0) / (z1 - z0), 0, 1)
  const d = extrude(sdShape2(shape, x, y, r0 + (r1 - r0) * t), z, z0, z1)
  const slope = (r1 - r0) / (z1 - z0)
  return d / Math.sqrt(1 + slope * slope)
}

/** How far around the shape's outline a point is (for bricks and planks) and which side it is on */
export function aroundShape(shape: TowerShape, x: number, y: number, r: number): { s: number; side: number } {
  if (shape === 'square') {
    if (Math.abs(x) > Math.abs(y)) return { s: x > 0 ? -y : y, side: x > 0 ? 0 : 2 }
    return { s: y > 0 ? x : -x, side: y > 0 ? 1 : 3 }
  }
  const a = Math.atan2(y, x)
  if (shape === 'round') return { s: a * r, side: 0 }
  // A polygon: one side per sector, measured from that side's middle
  const { sides, turn } = POLYGONS[shape]
  const sector = (2 * Math.PI) / sides
  const k = Math.round((a - turn) / sector)
  return { s: Math.tan(a - turn - k * sector) * r, side: ((k % sides) + sides) % sides }
}

/** Turn a point about the x axis (a tilt towards the viewer's right) */
export function rotX(y: number, z: number, angle: number): [number, number] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [c * y - s * z, s * y + c * z]
}

/** 3D value noise, 0..1 */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const fx = x - xi
  const fy = y - yi
  const fz = z - zi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const sz = fz * fz * (3 - 2 * fz)
  const h = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k, seed)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  return lerp(
    lerp(lerp(h(0, 0, 0), h(1, 0, 0), sx), lerp(h(0, 1, 0), h(1, 1, 0), sx), sy),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), sx), lerp(h(0, 1, 1), h(1, 1, 1), sx), sy),
    sz,
  )
}

export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

/** How many flat sides a shape has (0 for round) */
export function shapeSides(shape: TowerShape): number {
  return shape === 'round' ? 0 : shape === 'square' || shape === 'diamond' ? 4 : shape === 'hexagon' ? 6 : 8
}

/** How far from the centre a shape of radius r reaches in the direction `angle` (to place things on its outline) */
export function shapeRadius(shape: TowerShape, angle: number, r: number): number {
  if (shape === 'round') return r
  if (shape === 'square') return r / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)))
  const { sides, turn } = POLYGONS[shape]
  const sector = (2 * Math.PI) / sides
  const a = angle - turn
  return r / Math.cos(a - sector * Math.round(a / sector))
}

/** A rod with rounded ends from a to b, radius r */
export function sdCapsule(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): number {
  const px = x - ax
  const py = y - ay
  const pz = z - az
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const h = clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz), 0, 1)
  return length3(px - dx * h, py - dy * h, pz - dz * h) - r
}

/** A union of two shapes with a smooth seam k wide */
export function smoothMin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1)
  return b + (a - b) * h - k * h * (1 - h)
}
