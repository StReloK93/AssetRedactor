import { hexToRgb, rgbToCss } from '../core/color'
import { ANCHOR_Y, SPRITE_H, SPRITE_W } from '../core/format'
import type { SpriteTask } from '../core/spriteWorker'
import { TowerProject, towerFileName } from './model'
import { project, renderTower, type RenderOptions } from './render'
import type { PictureKind, RenderPool } from './renderPool'
import { buildScene } from './scene'

/** Which tower a sprite is, and where on it the crown is (the game launches projectiles from about there) */
export interface TowerMeta {
  id: string
  /** The crown's centre in sprite pixels */
  crown: { x: number; y: number }
  /** The game's "muzzleOffsetY" that puts the projectile on the crown (game pixels, at one tile = 128 px) */
  muzzleOffsetY: number
}

/**
 * The game launches a projectile at the tower's cell centre minus 1.35 tile heights (Generator: CombatEngine).
 * The sprite is drawn at half size (256 px to a 128 px tile), hung from its anchor.
 */
const GAME_SCALE = 0.5
const DEFAULT_MUZZLE_Y = SPRITE_H * ANCHOR_Y - (64 * 1.35) / GAME_SCALE

/** The tower set's sprites; with a pool, every picture is drawn on all cores */
export function towerTasks(set: TowerProject, pool?: RenderPool): SpriteTask<TowerMeta>[] {
  const shared = { brickSize: set.brickSize, outline: set.outline, shadow: set.shadow }
  return set.towers.map(def => {
    const { id: _id, name: _name, ...look } = def
    const key = JSON.stringify({ look, shared })
    const scene = buildScene(def)
    const crown = project(scene.light.x, scene.light.y, scene.light.z)
    const draw = (kind: PictureKind) => async () => {
      const scale = kind === 'hd' ? 2 : 1
      const options: RenderOptions = { seed: def.seed, weathering: def.weathering, glow: def.glow, ...shared, quality: kind === 'draft' ? 'draft' : 'final', scale }
      const pixels = pool ? await pool.render(key, kind, def, scene, options) : renderTower(scene, options)
      const canvas = new OffscreenCanvas(SPRITE_W * scale, SPRITE_H * scale)
      const ctx = canvas.getContext('2d')!
      ctx.putImageData(new ImageData(pixels, SPRITE_W * scale, SPRITE_H * scale), 0, 0)
      ctx.scale(scale, scale)
      if (def.glow > 0) drawHalo(ctx, def.colors.glow, def.glow, crown, scene.light.radius * scene.crownScale)
      return canvas
    }
    return {
      name: towerFileName(def.name),
      key,
      meta: { id: def.id, crown, muzzleOffsetY: Math.round((crown.y - DEFAULT_MUZZLE_Y) * GAME_SCALE) },
      build: draw('final'),
      draft: draw('draft'),
      // Twice as sharp, for the preview only (the export stays 256 x 512)
      hd: draw('hd'),
    }
  })
}

/** A soft glow behind the crown (drawn behind the tower, so it never blurs the tower itself) */
function drawHalo(ctx: OffscreenCanvasRenderingContext2D, color: string, strength: number, at: { x: number; y: number }, size: number): void {
  const glow = hexToRgb(color)
  const radius = 18 + size * 60
  ctx.save()
  ctx.globalCompositeOperation = 'destination-over'
  const halo = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius)
  halo.addColorStop(0, rgbToCss(glow, 0.5 * strength))
  halo.addColorStop(0.35, rgbToCss(glow, 0.16 * strength))
  halo.addColorStop(1, rgbToCss(glow, 0))
  ctx.fillStyle = halo
  ctx.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2)
  ctx.restore()
}
