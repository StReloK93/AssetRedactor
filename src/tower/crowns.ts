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

  armillary(parts, { base, c }) {
    // Three metal rings turned every way round a glowing core, on a slim stand
    parts.push(disc(0.07 * c, base, base + 0.025 * c))
    const oz = base + 0.17 * c
    parts.push({ b: column(0.02 * c, base, oz - 0.06 * c), d: (x, y, z) => sdTaper('round', x, y, z, base, oz - 0.06 * c, 0.016 * c, 0.008 * c), m: Mat.Trim })
    parts.push({ b: column(0.05 * c, oz - 0.05 * c, oz + 0.05 * c), d: (x, y, z) => sdSphere(x, y, z - oz, 0.042 * c), m: Mat.Glow })
    const rings: [number, number, number][] = [[0.12, Math.PI / 4, 1.2], [0.104, -Math.PI / 4, 0.75], [0.088, 0, 0.25]]
    for (const [R, phi, tilt] of rings) {
      const cp = Math.cos(phi)
      const sp = Math.sin(phi)
      parts.push({
        b: column((R + 0.012) * c, oz - (R + 0.012) * c, oz + (R + 0.012) * c),
        d: (x, y, z) => {
          const u = x * cp + y * sp
          const v = -x * sp + y * cp
          const [rv, rz] = rotX(v, z - oz, tilt)
          return sdTorus(u, rv, rz, R * c, 0.0075 * c)
        },
        m: Mat.Trim,
      })
    }
    return { x: 0, y: 0, z: oz, radius: 0.36 * c }
  },

  bell(parts, { base, c }) {
    // A bronze bell in a wooden frame, its clapper glowing
    const top = base + 0.27 * c
    for (const side of [-1, 1]) {
      const cx = side * 0.095 * c
      parts.push({ b: column(0.02 * c, base, top, cx, 0), d: (x, y, z) => sdBox(x - cx, y, z - (base + top) / 2, 0.013 * c, 0.013 * c, (top - base) / 2), m: Mat.Wood })
    }
    parts.push({ b: [-0.13 * c, -0.02 * c, top - 0.02 * c, 0.13 * c, 0.02 * c, top + 0.03 * c], d: (x, y, z) => sdBox(x, y, z - top - 0.005 * c, 0.125 * c, 0.016 * c, 0.016 * c), m: Mat.Wood })
    const bTop = top - 0.03 * c
    const bBot = bTop - 0.14 * c
    parts.push({
      b: column(0.09 * c, bBot - 0.01 * c, bTop + 0.03 * c),
      d: (x, y, z) => {
        const body = sdTaper('round', x, y, z, bBot, bTop, 0.072 * c, 0.036 * c)
        const crown = sdSphere(x, y, z - bTop, 0.037 * c)
        const lip = sdTorus(x, y, z - bBot - 0.006 * c, 0.07 * c, 0.009 * c)
        const hollow = sdTaper('round', x, y, z, bBot - 0.02, bTop - 0.03 * c, 0.062 * c, 0.022 * c)
        return Math.max(Math.min(body, crown, lip), -hollow)
      },
      m: Mat.Trim,
    })
    const cz = bBot - 0.004 * c
    parts.push({ b: column(0.03 * c, cz - 0.03 * c, cz + 0.03 * c), d: (x, y, z) => sdSphere(x, y, z - cz, 0.024 * c), m: Mat.Glow })
    return { x: 0, y: 0, z: bBot + 0.05 * c, radius: 0.36 * c }
  },

  mortar(parts, { base, c: size }) {
    const c = size * 1.15
    // A squat iron mortar tipped towards the viewer, glowing shot inside its mouth
    parts.push(disc(0.105 * c, base, base + 0.025 * c, 'octagon'))
    const pz = base + 0.07 * c
    const tilt = 0.4
    const L = 0.12 * c
    /** Along the barrel: (across, out, up) from the breech */
    const local = (x: number, y: number, z: number) => {
      const u = (x + y) * Math.SQRT1_2
      const w = (x - y) * Math.SQRT1_2
      const [ru, rz] = rotX(u, z - pz, tilt)
      return [w, ru, rz] as const
    }
    parts.push({
      b: column(0.12 * c, base, pz + 0.16 * c),
      d: (x, y, z) => {
        const [w, ru, rz] = local(x, y, z)
        const barrel = sdTaper('round', w, ru, rz, 0, L, 0.062 * c, 0.07 * c)
        const breech = sdSphere(w, ru, rz, 0.07 * c)
        const mouth = sdTorus(w, ru, rz - L, 0.068 * c, 0.012 * c)
        const bore = extrude(length2(w, ru) - 0.046 * c, rz, 0.03 * c, L + 0.05 * c)
        return Math.max(Math.min(barrel, breech, mouth), -bore) * 0.9
      },
      m: Mat.Trim,
    })
    parts.push({
      b: column(0.06 * c, pz, pz + 0.14 * c),
      d: (x, y, z) => {
        const [w, ru, rz] = local(x, y, z)
        return sdSphere(w, ru, rz - L + 0.035 * c, 0.04 * c)
      },
      m: Mat.Glow,
    })
    // Where its mouth is, in the world
    const mu = Math.sin(tilt) * L
    const mz = pz + Math.cos(tilt) * L
    return { x: mu * Math.SQRT1_2, y: mu * Math.SQRT1_2, z: mz, radius: 0.3 * c }
  },

  ballista(parts, { base, c: size }) {
    const c = size * 1.35
    // A big crossbow on a post: a wooden stock, bent arms, a string and a bolt with a glowing head
    parts.push(disc(0.09 * c, base, base + 0.025 * c))
    const pz = base + 0.09 * c
    parts.push({ b: column(0.03 * c, base, pz), d: (x, y, z) => sdBox(x, y, z - (base + pz) / 2, 0.018 * c, 0.018 * c, (pz - base) / 2), m: Mat.Wood })
    parts.push({ b: [-0.03 * c, -0.11 * c, pz - 0.03 * c, 0.03 * c, 0.14 * c, pz + 0.03 * c], d: (x, y, z) => sdBox(x, y - 0.015 * c, z - pz, 0.017 * c, 0.105 * c, 0.013 * c), m: Mat.Wood })
    const fy = 0.1 * c
    const tips: [number, number, number][] = []
    for (const side of [-1, 1]) {
      const tx = side * 0.13 * c
      const ty = fy - 0.055 * c
      const tz = pz + 0.012 * c
      tips.push([tx, ty, tz])
      parts.push({
        b: [Math.min(0, tx) - 0.02 * c, ty - 0.02 * c, pz - 0.02 * c, Math.max(0, tx) + 0.02 * c, fy + 0.02 * c, pz + 0.04 * c],
        d: (x, y, z) => Math.min(
          sdCapsule(x, y, z, 0, fy, pz + 0.008 * c, side * 0.075 * c, fy - 0.012 * c, pz + 0.012 * c, 0.012 * c),
          sdCapsule(x, y, z, side * 0.075 * c, fy - 0.012 * c, pz + 0.012 * c, tx, ty, tz, 0.009 * c),
        ),
        m: Mat.Trim,
      })
    }
    const ny = -0.05 * c
    const sz = pz + 0.016 * c
    parts.push({
      b: [-0.15 * c, ny - 0.01 * c, pz - 0.01 * c, 0.15 * c, fy, pz + 0.03 * c],
      d: (x, y, z) => Math.min(...tips.map(([tx, ty, tz]) => sdCapsule(x, y, z, tx, ty, tz, 0, ny, sz, 0.0028 * c))),
      m: Mat.Trim,
    })
    const by = 0.15 * c
    parts.push({ b: [-0.02 * c, ny - 0.01 * c, sz - 0.02 * c, 0.02 * c, by, sz + 0.02 * c], d: (x, y, z) => sdCapsule(x, y, z, 0, ny, sz + 0.004 * c, 0, by - 0.02 * c, sz + 0.004 * c, 0.006 * c), m: Mat.Wood })
    const hy = by + 0.005 * c
    parts.push({ b: [-0.02 * c, hy - 0.04 * c, sz - 0.02 * c, 0.02 * c, hy + 0.04 * c, sz + 0.025 * c], d: (x, y, z) => sdEllipsoid(x, y - hy, z - sz - 0.004 * c, 0.014 * c, 0.03 * c, 0.014 * c), m: Mat.Glow })
    return { x: 0, y: hy, z: sz, radius: 0.24 * c }
  },

  lotus(parts, { base, c }) {
    // Crystal petals opening round a glowing heart: an outer ring leaning out, an inner one standing up
    parts.push(disc(0.08 * c, base, base + 0.02 * c))
    const pz = base + 0.035 * c
    const rings: [number, number, number, number, number][] = [
      // count, distance out, lean, length, turn
      [7, 0.06, 0.95, 0.095, 0],
      [5, 0.03, 0.4, 0.085, 0.4],
    ]
    for (const [count, dist, lean, len, turn] of rings) {
      for (let i = 0; i < count; i++) {
        const a = turn + (i * 2 * Math.PI) / count
        const ux = Math.cos(a)
        const uy = Math.sin(a)
        const cx = ux * dist * c
        const cy = uy * dist * c
        parts.push({
          b: column((len + 0.03) * c, pz - 0.03 * c, pz + (len + 0.03) * c, cx, cy),
          d: (x, y, z) => {
            const out = (x - cx) * ux + (y - cy) * uy
            const across = -(x - cx) * uy + (y - cy) * ux
            const [ro, rz] = rotX(out, z - pz, lean)
            // A pointed, cupped petal
            const cup = ro + across * across * 6 / c
            return sdEllipsoid(across, cup, rz - len * 0.5 * c, 0.036 * c * (1 - 0.6 * Math.max(0, rz / (len * c))), 0.01 * c, len * 0.55 * c) * 0.7
          },
          m: Mat.Gem,
        })
      }
    }
    const hz = pz + 0.06 * c
    parts.push({ b: column(0.04 * c, hz - 0.04 * c, hz + 0.04 * c), d: (x, y, z) => sdSphere(x, y, z - hz, 0.032 * c), m: Mat.Glow })
    return { x: 0, y: 0, z: hz, radius: 0.36 * c }
  },

  tiara(parts, { base, c }) {
    // A king's crown: a gold band with points, pearls of light on them, a gem floating inside
    const z0 = base + 0.005 * c
    const z1 = z0 + 0.05 * c
    const R = 0.09 * c
    parts.push({
      b: column(R + 0.01 * c, z0, z1),
      d: (x, y, z) => Math.max(extrude(length2(x, y) - R, z, z0, z1), -(length2(x, y) - R + 0.01 * c)),
      m: Mat.Trim,
    })
    parts.push({ b: column(R + 0.02 * c, z0 - 0.01 * c, z0 + 0.012 * c), d: (x, y, z) => sdTorus(x, y, z - z0 - 0.004 * c, R, 0.009 * c), m: Mat.Trim })
    const points = 8
    for (let i = 0; i < points; i++) {
      const a = (i * 2 * Math.PI) / points + Math.PI / 8
      const px = Math.cos(a) * R * 0.95
      const py = Math.sin(a) * R * 0.95
      const h = (i % 2 ? 0.05 : 0.075) * c
      parts.push(spike(px, py, z1 - 0.005 * c, z1 + h, 0.02 * c, 0.15, Mat.Trim))
      const tz = z1 + h + 0.008 * c
      const tx = px * (1 + 0.15 * h / R)
      const ty = py * (1 + 0.15 * h / R)
      parts.push({ b: column(0.015 * c, tz - 0.015 * c, tz + 0.015 * c, tx, ty), d: (x, y, z) => sdSphere(x - tx, y - ty, z - tz, 0.011 * c), m: Mat.Glow })
    }
    const gz = z1 + 0.055 * c
    parts.push({ b: column(0.06 * c, gz - 0.08 * c, gz + 0.08 * c), d: (x, y, z) => crystal(x * 0.94 - y * 0.34, x * 0.34 + y * 0.94, z - gz, 0.045 * c, 0.07 * c, 0.045 * c), m: Mat.Gem })
    return { x: 0, y: 0, z: gz, radius: 0.36 * c }
  },

  horns(parts, { base, c }) {
    // Two great horns curling up from a skull-like boss, a dark fire burning between them
    parts.push(disc(0.09 * c, base, base + 0.025 * c, 'hexagon'))
    const bz = base + 0.06 * c
    parts.push({ b: column(0.07 * c, base, bz + 0.05 * c), d: (x, y, z) => sdEllipsoid(x, y, z - bz, 0.065 * c, 0.065 * c, 0.045 * c), m: Mat.Rock })
    for (const side of [-1, 1]) {
      // Along a curve going out to the side, up, then curling back in at the tip
      const pts: [number, number, number, number][] = []
      const n = 7
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const out = (0.05 + 0.1 * Math.sin(t * Math.PI * 0.8)) * c
        const up = (0.02 + 0.2 * t) * c
        const r = (0.03 * (1 - t) + 0.003) * c
        const ux = (side * out) * Math.SQRT1_2
        pts.push([ux, -ux, bz + up, r])
      }
      parts.push({
        b: [Math.min(...pts.map(p => p[0])) - 0.04 * c, Math.min(...pts.map(p => p[1])) - 0.04 * c, bz - 0.02 * c, Math.max(...pts.map(p => p[0])) + 0.04 * c, Math.max(...pts.map(p => p[1])) + 0.04 * c, bz + 0.25 * c],
        d: (x, y, z) => {
          let d = Infinity
          for (let k = 0; k < n; k++) {
            const [ax, ay, az, ar] = pts[k]
            const [bx, by, bz2, br] = pts[k + 1]
            d = Math.min(d, sdCapsule(x, y, z, ax, ay, az, bx, by, bz2, (ar + br) / 2))
          }
          // Ridges round the horn
          return d + Math.sin(z * 260 / c) * 0.0015 * c
        },
        m: Mat.Trim,
      })
    }
    const fz = bz + 0.11 * c
    parts.push({
      b: column(0.06 * c, bz, fz + 0.1 * c),
      d: (x, y, z) => {
        const narrow = 1 - Math.max(0, Math.min(1, (z - fz) / (0.1 * c))) * 0.8
        return (sdEllipsoid(x, y, z - fz, 0.042 * c * narrow, 0.042 * c * narrow, 0.09 * c) + (noise3(x * 40, y * 40, z * 20, 3) - 0.5) * 0.02 * c) * 0.6
      },
      m: Mat.Dark,
    })
    return { x: 0, y: 0, z: fz, radius: 0.34 * c }
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
