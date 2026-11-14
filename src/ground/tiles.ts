import { Rgb, hexToRgb, mix, ramp, rgbToCss, shade } from '../core/color'
import { FACE_CENTER_Y, FACE_HALF_H, FACE_HALF_W, SLAB_DEPTH, SPRITE_H, SPRITE_W, SURFACE_SIZE, cellToSprite } from '../core/format'
import { cellFbm, cellPoint, hash2, interiorWeight, smoothstep } from '../core/noise'
import type { SpriteTask } from '../core/spriteWorker'
import { GroundSettings, MATERIAL_IDS, MaterialId, prepare, surfaceColor } from './materials'

/**
 * Ground sprites, worked out off the main thread (groundWorker): plain OffscreenCanvas drawing, no DOM.
 * Each tile is a task with a key made of exactly what it depends on, so a change rebuilds only the tiles it touches.
 */

/** How far past its cell a surface is worked out, so the face can overlap its neighbours by a pixel (no hairline) */
const PAD = 3

type Ctx = OffscreenCanvasRenderingContext2D

/** A surface square in cell space, padded past the cell edge (the colour functions repeat every cell). */
function renderSurface(sample: (u: number, v: number) => Rgb): OffscreenCanvas {
  const size = SURFACE_SIZE + PAD * 2
  const surface = new OffscreenCanvas(size, size)
  const ctx = surface.getContext('2d')!
  const image = ctx.createImageData(size, size)
  for (let py = 0; py < size; py++) {
    const v = (py - PAD + 0.5) / SURFACE_SIZE
    for (let px = 0; px < size; px++) {
      const u = (px - PAD + 0.5) / SURFACE_SIZE
      const [r, g, b] = sample(u, v)
      const i = (py * size + px) << 2
      image.data[i] = r
      image.data[i + 1] = g
      image.data[i + 2] = b
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return surface
}

/** The diamond of the top face, grown by `grow` px all round */
function facePath(ctx: Ctx, grow: number): void {
  ctx.beginPath()
  ctx.moveTo(FACE_HALF_W, FACE_CENTER_Y - FACE_HALF_H - grow)
  ctx.lineTo(SPRITE_W + grow, FACE_CENTER_Y)
  ctx.lineTo(FACE_HALF_W, FACE_CENTER_Y + FACE_HALF_H + grow)
  ctx.lineTo(-grow, FACE_CENTER_Y)
  ctx.closePath()
}

/** The slab's two front sides (only the map's outer edge shows them: inside the map the next tile covers them) */
function drawSides(ctx: Ctx, color: Rgb): void {
  const bottom = FACE_CENTER_Y + FACE_HALF_H
  const side = (x1: number, y1: number, x2: number, y2: number, k: number) => {
    const gradient = ctx.createLinearGradient(0, Math.min(y1, y2), 0, Math.max(y1, y2) + SLAB_DEPTH)
    gradient.addColorStop(0, rgbToCss(shade(color, k)))
    gradient.addColorStop(1, rgbToCss(shade(color, k * 0.6)))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.lineTo(x2, y2 + SLAB_DEPTH)
    ctx.lineTo(x1, y1 + SLAB_DEPTH)
    ctx.closePath()
    ctx.fill()
  }
  side(0, FACE_CENTER_Y, FACE_HALF_W, bottom, 0.8)
  side(FACE_HALF_W, bottom, SPRITE_W, FACE_CENTER_Y, 1.05)
}

/** Grass blades standing on the face: thin tapered strokes, drawn back to front, the tops may rise past the tile */
function drawBlades(ctx: Ctx, settings: GroundSettings, grassAt: (u: number, v: number) => boolean, variant: number): void {
  const grass = settings.materials.grass
  const colors = grass.colors.map(hexToRgb)
  const tip = hexToRgb(grass.accent)
  const grid = Math.round(10 + settings.bladeDensity * 26)
  const seed = settings.seed + 71
  const blades: { x: number; y: number; h: number; lean: number; base: Rgb; top: Rgb; w: number }[] = []
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      // Blades deep inside the cell follow the variant; near the edges every variant has the same ones
      const centre = { u: (i + 0.5) / grid, v: (j + 0.5) / grid }
      const s = interiorWeight(centre.u, centre.v) > 0.5 ? seed + variant * 211 : seed
      const p = cellPoint(i, j, grid, s)
      if (p.u < 0.01 || p.v < 0.01 || p.u > 0.99 || p.v > 0.99 || !grassAt(p.u, p.v)) continue
      const r1 = hash2(i, j, s + 1)
      const r2 = hash2(i, j, s + 2)
      const r3 = hash2(i, j, s + 3)
      const { x, y } = cellToSprite(p.u, p.v)
      const h = (10 + r1 * 16) * (0.35 + settings.bladeHeight * 1.3)
      const shadeT = cellFbm(p.u, p.v, 3, 3, settings.seed) * 0.6 + r2 * 0.4
      const base = ramp(colors, 0.15 + shadeT * 0.6)
      blades.push({ x, y, h, lean: (r3 - 0.5) * h * 0.7, base, top: mix(base, tip, 0.35 + r2 * 0.45), w: 1.6 + r1 * 1.6 })
    }
  }
  blades.sort((a, b) => a.y - b.y)
  for (const blade of blades) {
    const tipX = blade.x + blade.lean
    const tipY = blade.y - blade.h
    const gradient = ctx.createLinearGradient(0, blade.y, 0, tipY)
    gradient.addColorStop(0, rgbToCss(shade(blade.base, 0.8)))
    gradient.addColorStop(1, rgbToCss(blade.top))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(blade.x - blade.w, blade.y)
    ctx.quadraticCurveTo(blade.x + blade.lean * 0.3 - blade.w * 0.3, blade.y - blade.h * 0.55, tipX, tipY)
    ctx.quadraticCurveTo(blade.x + blade.lean * 0.3 + blade.w * 0.3, blade.y - blade.h * 0.5, blade.x + blade.w, blade.y)
    ctx.closePath()
    ctx.fill()
  }
}

/** One ground sprite in the game's format from a surface (and its grass, if any). */
function buildSprite(
  settings: GroundSettings,
  sample: (u: number, v: number) => Rgb,
  grassAt: ((u: number, v: number) => boolean) | null,
  variant: number,
): OffscreenCanvas {
  const sprite = new OffscreenCanvas(SPRITE_W, SPRITE_H)
  const ctx = sprite.getContext('2d')!
  drawSides(ctx, hexToRgb(settings.edgeColor))

  // The face: the surface square turned into the 2:1 diamond, a pixel past its edges
  ctx.save()
  facePath(ctx, 1.5)
  ctx.clip()
  const k = 1 / SURFACE_SIZE
  ctx.setTransform(FACE_HALF_W * k, FACE_HALF_H * k, -FACE_HALF_W * k, FACE_HALF_H * k, FACE_HALF_W, FACE_CENTER_Y - FACE_HALF_H - 2 * PAD * FACE_HALF_H * k)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(renderSurface(sample), 0, 0)
  ctx.restore()

  if (grassAt) drawBlades(ctx, settings, grassAt, variant)
  return sprite
}

/**
 * Corner masks: how much of `over` a transition tile shows at a point (0..1). The border meets its neighbours at
 * the same points on every variant; in between, each variant bends it its own way, so a long straight edge
 * does not repeat the same wave cell after cell.
 */
function transitionAmount(mask: number, u: number, v: number, seed: number, variant: number): number {
  const corner = (bit: number) => (mask >> bit) & 1
  const cu = Math.max(0, Math.min(1, u))
  const cv = Math.max(0, Math.min(1, v))
  const top = corner(0) + (corner(1) - corner(0)) * cu
  const bottom = corner(2) + (corner(3) - corner(2)) * cu
  const level = top + (bottom - top) * cv
  let wobble = (cellFbm(u, v, 3, 3, seed + 500) - 0.5) * 0.62
  if (variant > 0) wobble += (cellFbm(u, v, 2, 3, seed + 500 + variant * 313) - 0.5) * 0.9 * interiorWeight(u, v)
  return smoothstep(0.43, 0.57, level + wobble)
}

const materialSeed = (settings: GroundSettings, id: MaterialId) => settings.seed * 13 + MATERIAL_IDS.indexOf(id) * 1009

/** What a ground tile is (the preview lays the map out by it) */
export interface GroundTileMeta {
  kind: 'base' | 'transition'
  material: MaterialId
  variant: number
  mask: number
}

/** The tiles of the settings: every variant of every material, then every variant of the 14 transition pieces */
export function groundTasks(settings: GroundSettings): SpriteTask<GroundTileMeta>[] {
  const tasks: SpriteTask<GroundTileMeta>[] = []
  const grassLook = { blades: [settings.bladeDensity, settings.bladeHeight], grass: settings.materials.grass }
  const common = { seed: settings.seed, edge: settings.edgeColor }

  for (const id of MATERIAL_IDS) {
    const style = settings.materials[id]
    for (let variant = 0; variant < settings.variants; variant++) {
      tasks.push({
        name: baseFileName(id, variant),
        meta: { kind: 'base', material: id, variant, mask: 15 },
        key: JSON.stringify({ id, variant, style, common, grass: id === 'grass' ? grassLook : null }),
        build: () => {
          const m = prepare(style)
          const seed = materialSeed(settings, id)
          return buildSprite(settings, (u, v) => surfaceColor(id, m, u, v, seed, variant), id === 'grass' ? () => true : null, variant)
        },
      })
    }
  }

  const { over, under } = settings.transition
  const hasGrass = over === 'grass' || under === 'grass'
  const pairKey = { over, under, a: settings.materials[over], b: settings.materials[under], common, grass: hasGrass ? grassLook : null }
  for (let mask = 1; mask < 15; mask++) for (let variant = 0; variant < settings.variants; variant++) {
    tasks.push({
      name: transitionFileName(over, under, mask, variant),
      meta: { kind: 'transition', material: over, variant, mask },
      key: JSON.stringify({ mask, variant, pairKey }),
      build: () => {
        const top = prepare(settings.materials[over])
        const bottom = prepare(settings.materials[under])
        const overSeed = materialSeed(settings, over)
        const underSeed = materialSeed(settings, under)
        const amount = (u: number, v: number) => transitionAmount(mask, u, v, settings.seed, variant)
        const sample = (u: number, v: number): Rgb => {
          const a = amount(u, v)
          const upper = surfaceColor(over, top, u, v, overSeed, 0)
          // The lower ground is a little shaded right along the edge of the one growing over it
          const lower = shade(surfaceColor(under, bottom, u, v, underSeed, 0), 1 - 0.22 * smoothstep(0, 0.5, a) * (1 - a))
          return mix(lower, upper, a)
        }
        const grassAt = over === 'grass' ? (u: number, v: number) => amount(u, v) > 0.6
          : under === 'grass' ? (u: number, v: number) => amount(u, v) < 0.4
            : null
        return buildSprite(settings, sample, grassAt, variant)
      },
    })
  }
  return tasks
}

/** File names in the game's sprite folder (the game finds them as sprite-<name>) */
export function baseFileName(id: MaterialId, variant: number): string {
  return `forge_${id}_${variant + 1}`
}
/** The first variant keeps the plain name (forge_grass_dirt_05), the others get a number (forge_grass_dirt_05_2) */
export function transitionFileName(over: MaterialId, under: MaterialId, mask: number, variant: number): string {
  return `forge_${over}_${under}_${mask.toString().padStart(2, '0')}${variant > 0 ? `_${variant + 1}` : ''}`
}
