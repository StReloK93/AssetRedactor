/**
 * The game's sprite format (Generator: scripts/buildAtlases.js, MapRenderer): every library sprite is a
 * 256 x 512 picture, drawn one tile wide (128 px) with its anchor at 0.5 / 0.88 on the cell centre.
 */
export const SPRITE_W = 256
export const SPRITE_H = 512
export const ANCHOR_Y = 0.88

/** The top face of a ground tile: a 2:1 diamond as wide as the sprite. Its centre sits a little above the anchor,
 * as on the game's own tiles, so new and old ground meet at the same height. */
export const FACE_HALF_W = SPRITE_W / 2
export const FACE_HALF_H = SPRITE_W / 4
export const FACE_CENTER_Y = 437
/** The slab under the face (seen only on the map's outer edge) */
export const SLAB_DEPTH = 10

/** Edge of the square a surface is worked out on (cell space: x along the column axis, y along the row axis) */
export const SURFACE_SIZE = 192

/** Cell space (u, v in 0..1 over one cell) to sprite pixels. */
export function cellToSprite(u: number, v: number): { x: number; y: number } {
  return {
    x: FACE_HALF_W + (u - v) * FACE_HALF_W,
    y: FACE_CENTER_Y - FACE_HALF_H + (u + v) * FACE_HALF_H,
  }
}
