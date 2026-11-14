import type { CrownId, Level, TowerShape } from './model'
import { Light, Mat, Part, column } from './parts'
import { clamp, extrude, length2, noise3, rotX, sdBox, sdCapsule, sdEllipsoid, sdShape2, sdSphere, sdTaper, sdTorus } from './sdf'

/** The crowns: the thing on top that shoots. Each adds its parts and returns its light (centre and reach). */

export interface CrownPlace {
  /** Where the crown stands */
  base: number
  /** Its size */
  c: number
  level: Level
  shape: TowerShape
}
type Crown = (parts: Part[], at: CrownPlace) => Light

/** A vertical spike from z0 to z1 at (cx, cy), leaning outwards by `lean` per unit of height */
function spike(cx: number, cy: number, z0: number, z1: number, r: number, lean: number, m: Mat): Part {
  const len = Math.hypot(cx, cy) || 1
  const ux = cx / len
  const uy = cy / len
  const reach = r + (z1 - z0) * Math.abs(lean)
  return {
    b: column(reach + 0.01, z0, z1, cx + ux * (z1 - z0) * lean * 0.5, cy + uy * (z1 - z0) * lean * 0.5),
    d: (x, y, z) => {
      const k = (z - z0) * lean
      return sdTaper('round', x - cx - ux * k, y - cy - uy * k, z, z0, z1, r, 0.002) * 0.85
    },
    m,
  }
}

/** A crystal: a six-sided prism with pointed ends, half-height h, radius r, tips tl long */
export function crystal(x: number, y: number, z: number, r: number, h: number, tl: number): number {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  const q = Math.max(ax * 0.866 + ay * 0.5, ay)
  const k = tl / r
  return Math.max(q - r, (q * k + Math.abs(z) - h) / Math.sqrt(1 + k * k))
}

/** A round metal disc to stand on */
const disc = (r: number, z0: number, z1: number, shape: TowerShape = 'round'): Part => ({
  b: column(r, z0, z1, 0, 0, shape),
  d: (x, y, z) => extrude(sdShape2(shape, x, y, r), z, z0, z1),
  m: Mat.Trim,
})

export const CROWNS: Record<CrownId, Crown> = {
  brazier(parts, { base, c }) {
    const z1 = base + 0.04 * c
    const z2 = z1 + 0.085 * c
    parts.push({ b: column(0.05 * c, base, z1), d: (x, y, z) => sdTaper('round', x, y, z, base, z1, 0.05 * c, 0.035 * c), m: Mat.Trim })
    // A bowl: a widening cup with its inside cut out
    parts.push({
      b: column(0.13 * c, z1, z2),
      d: (x, y, z) => Math.max(sdTaper('round', x, y, z, z1, z2, 0.06 * c, 0.13 * c), -sdTaper('round', x, y, z, z1 + 0.018 * c, z2 + 0.05, 0.045 * c, 0.135 * c)),
      m: Mat.Trim,
    })
    // The flame: a few tall blobs, their surfaces rippled
    const fz = z2 + 0.03 * c
    const flames: [number, number, number, number, number][] = [
      [0, 0, fz + 0.05 * c, 0.08 * c, 0.17 * c],
      [0.05 * c, -0.035 * c, fz + 0.02 * c, 0.045 * c, 0.11 * c],
      [-0.045 * c, 0.04 * c, fz + 0.025 * c, 0.045 * c, 0.12 * c],
    ]
    parts.push({
      b: column(0.14 * c, z2 - 0.04 * c, fz + 0.26 * c),
      d: (x, y, z) => {
        let d = Infinity
        for (const [cx, cy, cz, r, h] of flames) {
          // Thinner towards the top
          const narrow = 1 - clamp((z - cz) / h, 0, 1) * 0.85
          d = Math.min(d, sdEllipsoid(x - cx, y - cy, z - cz, r * narrow, r * narrow, h))
        }
        return (d + (noise3(x * 34, y * 34, z * 18, 5) - 0.5) * 0.035 * c) * 0.6
      },
      m: Mat.Glow,
    })
    return { x: 0, y: 0, z: fz + 0.05 * c, radius: 0.42 * c }
  },

  crystal(parts, { base, c }) {
    const z1 = base + 0.03 * c
    parts.push(disc(0.11 * c, base, z1, 'octagon'))
    const main = { z: z1 + 0.14 * c, r: 0.045 * c, h: 0.17 * c, tl: 0.07 * c }
    parts.push({ b: column(main.r * 1.2, z1 - 0.04, main.z + main.h), d: (x, y, z) => crystal(x, y, z - main.z, main.r, main.h, main.tl), m: Mat.Ice })
    // Smaller crystals leaning out to the sides
    for (const [oy, tilt] of [[0.055, 0.5], [-0.055, -0.5]]) {
      const cz = z1 + 0.07 * c
      const cy = oy * c
      parts.push({
        b: column(0.11 * c, z1 - 0.04, cz + 0.11 * c, 0, cy),
        d: (x, y, z) => {
          const [ry, rz] = rotX(y - cy, z - cz, tilt)
          return crystal(x, ry, rz, 0.03 * c, 0.1 * c, 0.045 * c)
        },
        m: Mat.Ice,
      })
    }
    const cz = z1 + 0.05 * c
    const cx = 0.05 * c
    parts.push({
      b: column(0.09 * c, z1 - 0.04, cz + 0.09 * c, cx, 0),
      d: (x, y, z) => {
        const [rx, rz] = rotX(x - cx, z - cz, -0.45)
        return crystal(y, rx, rz, 0.026 * c, 0.08 * c, 0.04 * c)
      },
      m: Mat.Ice,
    })
    return { x: 0, y: 0, z: main.z, radius: 0.36 * c }
  },

  gem(parts, { base, c }) {
    // A cut gem held in four claws on a little stand
    parts.push(disc(0.08 * c, base, base + 0.03 * c))
    const gz = base + 0.15 * c
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2
      parts.push(spike(Math.cos(a) * 0.055 * c, Math.sin(a) * 0.055 * c, base + 0.02 * c, gz + 0.02 * c, 0.014 * c, 0.25, Mat.Trim))
    }
    const r = 0.075 * c
    const h = 0.12 * c
    parts.push({
      b: column(r * 1.2, gz - h, gz + h),
      d: (x, y, z) => {
        // Turned a little, so a facet edge faces the viewer
        const u = x * 0.94 - y * 0.34
        const v = x * 0.34 + y * 0.94
        return crystal(u, v, z - gz, r, h, h * 0.75)
      },
      m: Mat.Gem,
    })
    return { x: 0, y: 0, z: gz, radius: 0.36 * c }
  },

  cauldron(parts, { base, c }) {
    const cz = base + 0.1 * c
    const top = cz + 0.06 * c
    const R = 0.12 * c
    // A round pot cut open at the top
    parts.push({
      b: column(R + 0.02 * c, base, top + 0.02 * c),
      d: (x, y, z) => {
        const pot = Math.max(Math.max(sdSphere(x, y, z - cz, R), z - top), -sdSphere(x, y, z - cz, R - 0.014 * c))
        const lip = sdTorus(x, y, z - top, Math.sqrt(R * R - 0.06 * 0.06 * c * c), 0.013 * c)
        return Math.min(pot, lip)
      },
      m: Mat.Trim,
    })
    // The brew and its bubbles
    const level = top - 0.02 * c
    const bubbles: [number, number, number, number][] = [
      [0.02, -0.03, 0.025, 0.026],
      [-0.04, 0.01, 0.015, 0.02],
      [0.0, 0.05, 0.05, 0.016],
      [0.03, 0.02, 0.1, 0.012],
    ]
    parts.push({
      b: column(R, level - 0.03 * c, top + 0.13 * c),
      d: (x, y, z) => {
        const ripple = (noise3(x * 50, y * 50, 3, 9) - 0.5) * 0.008 * c
        let d = extrude(length2(x, y) - (R - 0.012 * c), z, level - 0.03 * c, level + ripple)
        for (const [bx, by, bz, br] of bubbles) d = Math.min(d, sdSphere(x - bx * c, y - by * c, z - level - bz * c, br * c))
        return d
      },
      m: Mat.Glow,
    })
    return { x: 0, y: 0, z: level + 0.02 * c, radius: 0.36 * c }
  },

  eye(parts, { base, c }) {
    const z1 = base + 0.03 * c
    parts.push(disc(0.12 * c, base, z1))
    // Claws round the eye
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2
      parts.push(spike(Math.cos(a) * 0.09 * c, Math.sin(a) * 0.09 * c, z1 - 0.01, z1 + 0.24 * c, 0.026 * c, 0.28, Mat.Trim))
    }
    const oz = z1 + 0.11 * c
    parts.push({ b: column(0.09 * c, oz - 0.09 * c, oz + 0.09 * c), d: (x, y, z) => sdSphere(x, y, z - oz, 0.085 * c), m: Mat.Eye })
    return { x: 0, y: 0, z: oz, radius: 0.34 * c }
  },

  coil(parts, { base, c }) {
    const z1 = base + 0.27 * c
    parts.push({ b: column(0.04 * c, base, z1), d: (x, y, z) => sdTaper('round', x, y, z, base, z1, 0.03 * c, 0.017 * c), m: Mat.Trim })
    for (const [h, R] of [[0.07, 0.078], [0.13, 0.063], [0.19, 0.048]]) {
      const rz = base + h * c
      parts.push({ b: column((R + 0.016) * c, rz - 0.016 * c, rz + 0.016 * c), d: (x, y, z) => sdTorus(x, y, z - rz, R * c, 0.014 * c), m: Mat.Trim })
    }
    const oz = z1 + 0.035 * c
    parts.push({ b: column(0.055 * c, oz - 0.055 * c, oz + 0.055 * c), d: (x, y, z) => sdSphere(x, y, z - oz, 0.05 * c), m: Mat.Glow })
    return { x: 0, y: 0, z: oz, radius: 0.38 * c }
  },

  orb(parts, { base, c }) {
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3 + Math.PI / 4
      parts.push(spike(Math.cos(a) * 0.07 * c, Math.sin(a) * 0.07 * c, base - 0.01, base + 0.14 * c, 0.024 * c, 0.3, Mat.Trim))
    }
    const oz = base + 0.21 * c
    parts.push({ b: column(0.09 * c, oz - 0.09 * c, oz + 0.09 * c), d: (x, y, z) => sdSphere(x, y, z - oz, 0.085 * c), m: Mat.Dark })
    // A tilted ring of light round the orb
    parts.push({
      b: column(0.16 * c, oz - 0.1 * c, oz + 0.1 * c),
      d: (x, y, z) => {
        const u = (x + y) * Math.SQRT1_2
        const v = (y - x) * Math.SQRT1_2
        const [rv, rz] = rotX(v, z - oz, 0.45)
        return sdTorus(u, rv, rz, 0.145 * c, 0.009 * c)
      },
      m: Mat.Glow,
    })
    return { x: 0, y: 0, z: oz, radius: 0.36 * c }
  },

  cannon(parts, { base, c }) {
    // A turntable, two wooden cheeks and an iron barrel aimed down to the viewer's left
    parts.push(disc(0.1 * c, base, base + 0.025 * c))
    const pivot = base + 0.075 * c
    for (const side of [-1, 1]) {
      const cx = side * 0.042 * c
      parts.push({ b: column(0.06 * c, base, pivot + 0.03 * c, cx, 0), d: (x, y, z) => sdBox(x - cx, y + 0.005 * c, z - (base + 0.05 * c), 0.011 * c, 0.05 * c, 0.035 * c), m: Mat.Wood })
    }
    const len = 0.21 * c
    const dir = [0, 0.94, 0.34]
    const ax = 0
    const ay = -0.07 * c
    const az = pivot
    const bx = ax + dir[0] * len
    const by = ay + dir[1] * len
    const bz = az + dir[2] * len
    parts.push({
      b: [-0.06 * c, ay - 0.05 * c, base, 0.06 * c, by + 0.05 * c, bz + 0.05 * c],
      d: (x, y, z) => {
        // Thicker at the breech, a ring at the mouth, hollow inside
        const t = clamp(((y - ay) * dir[1] + (z - az) * dir[2]) / len, 0, 1)
        const barrel = sdCapsule(x, y, z, ax, ay, az, bx, by, bz, (0.04 - 0.01 * t) * c)
        const mouth = sdTorus(x, (y - by) * dir[2] - (z - bz) * dir[1], (y - by) * dir[1] + (z - bz) * dir[2], 0.03 * c, 0.009 * c)
        const bore = sdCapsule(x, y, z, bx - dir[0] * 0.05 * c, by - dir[1] * 0.05 * c, bz - dir[2] * 0.05 * c, bx + dir[0] * 0.05 * c, by + dir[1] * 0.05 * c, bz + dir[2] * 0.05 * c, 0.019 * c)
        return Math.max(Math.min(barrel, mouth), -bore)
      },
      m: Mat.Trim,
    })
    return { x: bx, y: by, z: bz, radius: 0.18 * c }
  },

  finial(parts, { base, c }) {
    // A gold spike with a glowing knob: for the point of a roof or dome
    const top = base + 0.07 * c
    parts.push({ b: column(0.02 * c, base - 0.03, top), d: (x, y, z) => sdTaper('round', x, y, z, base - 0.03, top, 0.012 * c, 0.006 * c), m: Mat.Trim })
    const oz = top + 0.03 * c
    parts.push({ b: column(0.035 * c, oz - 0.035 * c, oz + 0.035 * c), d: (x, y, z) => sdSphere(x, y, z - oz, 0.03 * c), m: Mat.Glow })
    return { x: 0, y: 0, z: oz, radius: 0.22 * c }
  },
}
