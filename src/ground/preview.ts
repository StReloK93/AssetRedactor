import { ANCHOR_Y, SPRITE_H, SPRITE_W } from '../core/format'
import { seededRandom } from '../core/noise'
import type { GroundPictures } from './useGroundStudio'
import type { MaterialId } from './materials'

/** Preview scale: the game draws a sprite one tile (128 px) wide */
const TILE_W = 128
const TILE_H = 64
const SCALE = TILE_W / SPRITE_W

/**
 * A small map laid out the way the game lays it out (same size, anchor and back-to-front order): patches of the
 * `over` ground on the `under` ground, their borders made of the transition set, so seams show if there are any.
 */
export function drawPreview(target: HTMLCanvasElement, set: GroundPictures, over: MaterialId, under: MaterialId, size: number, seed: number): void {
  const random = seededRandom(seed)
  // Which corners are `over`: a few round patches
  const blobs = Array.from({ length: Math.max(2, Math.round(size / 3)) }, () => ({
    x: random() * size,
    y: random() * size,
    r: 1.5 + random() * size * 0.22,
  }))
  const cornerOver = (x: number, y: number) => blobs.some(b => Math.hypot(x - b.x, y - b.y) < b.r)

  const width = size * TILE_W
  const height = size * TILE_H + SPRITE_H * SCALE
  target.width = width
  target.height = height
  const ctx = target.getContext('2d')!
  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'

  const originX = width / 2
  const originY = SPRITE_H * SCALE * ANCHOR_Y - TILE_H
  for (let depth = 0; depth <= (size - 1) * 2; depth++) {
    for (let col = 0; col < size; col++) {
      const row = depth - col
      if (row < 0 || row >= size) continue
      const mask = (cornerOver(col, row) ? 1 : 0) | (cornerOver(col + 1, row) ? 2 : 0) | (cornerOver(col, row + 1) ? 4 : 0) | (cornerOver(col + 1, row + 1) ? 8 : 0)
      const variants = mask === 0 || mask === 15 ? set.bases[mask === 15 ? over : under] : set.transitions[mask]
      const sprite = variants[Math.floor(random() * variants.length)]
      if (!sprite) continue
      // The cell's centre, then the sprite hung from its anchor
      const cx = originX + (col - row) * (TILE_W / 2)
      const cy = originY + (col + row) * (TILE_H / 2) + TILE_H / 2
      ctx.drawImage(sprite, cx - (SPRITE_W * SCALE) / 2, cy - SPRITE_H * SCALE * ANCHOR_Y, SPRITE_W * SCALE, SPRITE_H * SCALE)
    }
  }
}
