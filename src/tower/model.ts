/**
 * The tower set: a list of towers, each its own sprite with its own build, top, crown, colours and decorations,
 * so the three levels of one clan need not look alike. Brick size and outline are shared, so the set matches.
 */

export type TowerShape = 'square' | 'diamond' | 'hexagon' | 'octagon' | 'round'
export const SHAPES: TowerShape[] = ['square', 'diamond', 'hexagon', 'octagon', 'round']

/**
 * How a tower is put together:
 * keep - one tapering body; tiered - a lower body with a narrower upper one (of the second shape) on it;
 * spire - tall and slender; floating - a stump on the ground and the upper tower hanging over it on a beam of light;
 * shrine - pillars round a pedestal, the crown floating over them.
 */
export type TowerForm = 'keep' | 'tiered' | 'spire' | 'floating' | 'shrine'
export const FORMS: TowerForm[] = ['keep', 'tiered', 'spire', 'floating', 'shrine']

/** What finishes the body: the crown stands on it, or under it (cupola) */
export type TowerTop = 'battlements' | 'floor' | 'dome' | 'glass' | 'onion' | 'cupola' | 'roof'
export const TOPS: TowerTop[] = ['battlements', 'floor', 'dome', 'glass', 'onion', 'cupola', 'roof']

/** The thing that shoots: what stands on top and glows */
export type CrownId = 'brazier' | 'crystal' | 'cauldron' | 'coil' | 'orb' | 'gem' | 'eye' | 'cannon' | 'finial'
export const CROWN_IDS: CrownId[] = ['brazier', 'crystal', 'gem', 'orb', 'coil', 'cauldron', 'cannon', 'finial', 'eye']

/** Size and detail: small, medium, large */
export type Level = 1 | 2 | 3

export interface TowerColors {
  /** The bricks: dark, light */
  stone: [string, string]
  /** Metal: brazier, rings, claws */
  trim: string
  /** Wood, roofs and domes, flags */
  accent: string
  /** What the crown glows with (also windows, runes) */
  glow: string
}

export interface TowerExtras {
  windows: boolean
  runes: boolean
  cracks: boolean
  circle: boolean
  /** Crystals growing out of the plinth */
  shards: boolean
  /** Glowing bands round the body */
  rings: boolean
  buttresses: boolean
  flags: boolean
}
export const EXTRA_IDS: (keyof TowerExtras)[] = ['windows', 'runes', 'cracks', 'circle', 'shards', 'rings', 'buttresses', 'flags']

export interface TowerDef {
  /** Stable id (the list's key) */
  id: string
  /** File name: forge_tower_<name>.png (lower-case letters, digits, underscores) */
  name: string
  /** The clan (folder) it belongs to: an id from CLANS, or 'other' */
  clan: string
  level: Level
  form: TowerForm
  /** The lower body's shape and the upper one's (upper tier, floating top, shrine pillars) */
  shape: TowerShape
  upperShape: TowerShape
  top: TowerTop
  crown: CrownId
  colors: TowerColors
  extras: TowerExtras
  /** 1 = default */
  width: number
  height: number
  /** How much the body narrows towards the top, 0..0.4 */
  taper: number
  /** Halo and sparks round the crown, 0..1 */
  glow: number
  /** How strongly runes, cracks, the circle and shards glow, 0..1 */
  magic: number
  /** Moss and grime, 0..1 */
  weathering: number
  seed: number
}

export interface TowerProject {
  towers: TowerDef[]
  /** Shared by every tower so the set matches */
  brickSize: number
  outline: number
  /** The tower's shadow on its tile goes into the sprite */
  shadow: boolean
}

/** Ready colour sets */
export const PALETTES: { id: string; name: string; colors: TowerColors }[] = [
  { id: 'fire', name: 'Olov', colors: { stone: ['#7d5c40', '#c49b6a'], trim: '#4b4950', accent: '#7a3b22', glow: '#ff7a1a' } },
  { id: 'frost', name: 'Muz', colors: { stone: ['#5d7896', '#b8cfe4'], trim: '#c9d8e6', accent: '#3d5f86', glow: '#7fd8ff' } },
  { id: 'poison', name: 'Zahar', colors: { stone: ['#56604c', '#8f9878'], trim: '#3a4036', accent: '#4c3a5e', glow: '#8dff4a' } },
  { id: 'ruby', name: 'Yoqut', colors: { stone: ['#5a3a3e', '#a98478'], trim: '#c9a24a', accent: '#7c1626', glow: '#ff2f4e' } },
  { id: 'storm', name: 'Chaqmoq', colors: { stone: ['#545b6a', '#9aa3b4'], trim: '#b8743d', accent: '#2d3a5a', glow: '#9fe8ff' } },
  { id: 'void', name: "Bo'shliq", colors: { stone: ['#3a3348', '#6e6584'], trim: '#2d2738', accent: '#2a1f3d', glow: '#b05cff' } },
  { id: 'gold', name: 'Oltin', colors: { stone: ['#776d62', '#c9bda8'], trim: '#d0a640', accent: '#8f2f2a', glow: '#ffd75a' } },
  { id: 'azure', name: 'Feruza', colors: { stone: ['#8a7a62', '#e0d2b4'], trim: '#c9a24a', accent: '#1f7f93', glow: '#4fe3e0' } },
  { id: 'forest', name: "O'rmon", colors: { stone: ['#5e5a48', '#a39c80'], trim: '#5a4a32', accent: '#2f5e2e', glow: '#b6ff6a' } },
  { id: 'night', name: 'Tun', colors: { stone: ['#2f3442', '#5d6478'], trim: '#8a93a8', accent: '#1b2238', glow: '#6c8cff' } },
]

const NO_EXTRAS: TowerExtras = { windows: false, runes: false, cracks: false, circle: false, shards: false, rings: false, buttresses: false, flags: false }

export const newId = () => Math.random().toString(36).slice(2, 10)

/** A tower with sensible settings for its level */
export function newTower(fields: Partial<TowerDef> & { name: string }): TowerDef {
  const level = fields.level ?? 2
  return {
    id: newId(),
    clan: OTHER_CLAN.id,
    level,
    form: 'keep',
    shape: 'square',
    upperShape: 'square',
    top: level === 1 ? 'floor' : 'battlements',
    crown: 'brazier',
    colors: structuredClone(PALETTES[0].colors),
    extras: { ...NO_EXTRAS, windows: level >= 2, runes: true, circle: level >= 2, shards: level >= 2, cracks: level === 3 },
    width: 1,
    height: 1,
    taper: 0.14,
    glow: 0.4,
    magic: 0.7,
    weathering: 0.3,
    seed: 11,
    ...fields,
  }
}

const palette = (id: string) => structuredClone(PALETTES.find(p => p.id === id)!.colors)

/**
 * The clans: the game's tower traits (Generator: TowerTraitType). Each is a folder of towers in the studio and the
 * start of their file names (forge_tower_fire_1.png): the game reads its sprite folder without sub-folders.
 */
export interface Clan {
  id: string
  name: string
  /** The colours a new tower of the clan starts with */
  palette: string
}
export const CLANS: Clan[] = [
  { id: 'fire', name: 'Olov', palette: 'fire' },
  { id: 'frost', name: 'Muz', palette: 'frost' },
  { id: 'poison', name: 'Zahar', palette: 'poison' },
  { id: 'blood', name: 'Qon', palette: 'ruby' },
  { id: 'electric', name: 'Chaqmoq', palette: 'storm' },
  { id: 'void', name: "Bo'shliq", palette: 'void' },
  { id: 'stacking', name: "To'planuvchi", palette: 'gold' },
]
/** Towers that belong to no clan (made before clans existed, under another name) */
export const OTHER_CLAN: Clan = { id: 'other', name: 'Boshqa', palette: 'night' }
/** Towers in a clan's starting set */
export const TOWERS_PER_CLAN = 6

type Recipe = [Level, TowerForm, TowerShape, TowerShape, TowerTop, CrownId, Partial<TowerExtras>?]

/** Each clan's six starting towers, from a small first one to two large ones: each built its own way */
const RECIPES: Record<string, Recipe[]> = {
  fire: [
    [1, 'keep', 'square', 'square', 'floor', 'brazier'],
    [1, 'keep', 'octagon', 'octagon', 'battlements', 'brazier'],
    [2, 'tiered', 'square', 'octagon', 'battlements', 'brazier', { flags: true }],
    [2, 'spire', 'round', 'round', 'cupola', 'brazier'],
    [3, 'tiered', 'octagon', 'round', 'cupola', 'brazier', { buttresses: true }],
    [3, 'keep', 'octagon', 'octagon', 'dome', 'brazier', { buttresses: true }],
  ],
  frost: [
    [1, 'keep', 'hexagon', 'hexagon', 'floor', 'crystal'],
    [1, 'floating', 'hexagon', 'round', 'floor', 'crystal'],
    [2, 'floating', 'hexagon', 'round', 'battlements', 'crystal'],
    [2, 'spire', 'round', 'round', 'glass', 'crystal', { rings: true }],
    [3, 'spire', 'round', 'round', 'glass', 'crystal', { rings: true }],
    [3, 'tiered', 'hexagon', 'round', 'glass', 'crystal', { buttresses: true, shards: true }],
  ],
  poison: [
    [1, 'keep', 'round', 'round', 'floor', 'cauldron'],
    [1, 'keep', 'round', 'round', 'battlements', 'cauldron'],
    [2, 'keep', 'round', 'round', 'battlements', 'cauldron'],
    [2, 'shrine', 'octagon', 'round', 'battlements', 'cauldron'],
    [3, 'tiered', 'octagon', 'round', 'cupola', 'cauldron', { buttresses: true }],
    [3, 'floating', 'octagon', 'round', 'glass', 'cauldron', { shards: true }],
  ],
  blood: [
    [1, 'keep', 'diamond', 'diamond', 'floor', 'gem'],
    [1, 'keep', 'diamond', 'diamond', 'battlements', 'gem'],
    [2, 'spire', 'octagon', 'octagon', 'onion', 'gem'],
    [2, 'shrine', 'diamond', 'octagon', 'battlements', 'gem'],
    [3, 'tiered', 'square', 'octagon', 'onion', 'gem', { buttresses: true }],
    [3, 'spire', 'diamond', 'octagon', 'glass', 'gem', { rings: true }],
  ],
  electric: [
    [1, 'keep', 'hexagon', 'hexagon', 'floor', 'coil'],
    [1, 'spire', 'hexagon', 'hexagon', 'battlements', 'coil'],
    [2, 'spire', 'hexagon', 'hexagon', 'battlements', 'coil', { rings: true }],
    [2, 'tiered', 'square', 'hexagon', 'cupola', 'coil'],
    [3, 'spire', 'round', 'round', 'cupola', 'coil', { rings: true }],
    [3, 'floating', 'hexagon', 'round', 'cupola', 'coil'],
  ],
  void: [
    [1, 'keep', 'octagon', 'octagon', 'floor', 'orb'],
    [1, 'floating', 'octagon', 'diamond', 'floor', 'orb'],
    [2, 'floating', 'octagon', 'diamond', 'battlements', 'orb'],
    [2, 'shrine', 'hexagon', 'round', 'battlements', 'orb'],
    [3, 'floating', 'round', 'round', 'glass', 'orb'],
    [3, 'shrine', 'octagon', 'round', 'battlements', 'orb', { shards: true }],
  ],
  stacking: [
    [1, 'keep', 'square', 'square', 'battlements', 'cannon'],
    [1, 'keep', 'square', 'square', 'roof', 'finial'],
    [2, 'spire', 'round', 'round', 'roof', 'finial', { rings: true }],
    [2, 'tiered', 'square', 'round', 'onion', 'finial'],
    [3, 'tiered', 'square', 'round', 'glass', 'gem', { buttresses: true }],
    [3, 'tiered', 'square', 'square', 'roof', 'finial', { buttresses: true }],
  ],
}

/** A clan's starting towers, named <clan>_1 .. <clan>_6 */
export function clanStarters(clan: Clan): TowerDef[] {
  return (RECIPES[clan.id] ?? []).map(([level, form, shape, upperShape, top, crown, extras], i) => {
    const name = `${clan.id}_${i + 1}`
    const tower = newTower({ name, clan: clan.id, level, form, shape, upperShape, top, crown, colors: palette(clan.palette), seed: 11 + i * 37 + clan.id.length * 7 })
    Object.assign(tower.extras, extras ?? {})
    return tower
  })
}

/** Which clan a tower named before clans existed belongs to: by the start of its name */
export function clanOfName(name: string): string {
  return CLANS.find(c => name === c.id || name.startsWith(`${c.id}_`))?.id ?? OTHER_CLAN.id
}

/** The starting set: seven clans of six */
export function defaultProject(): TowerProject {
  return { brickSize: 1, outline: 1, shadow: true, towers: CLANS.flatMap(clanStarters) }
}

/** File name in the game's sprite folder (the game finds it as sprite-<name>) */
export function towerFileName(name: string): string {
  return `forge_tower_${name}`
}

/** A name the export accepts: lower-case latin letters, digits and underscores */
export function cleanName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'tower'
}
