import { computed, reactive } from 'vue'
import { loadSettings, useSpriteSet } from '../core/useSpriteSet'
import { DEFAULT_SETTINGS, GroundSettings, MATERIAL_IDS, MaterialId } from './materials'
import type { GroundTileMeta } from './tiles'

const STORAGE_KEY = 'isoforge.ground.v1'

/** The saved settings over the defaults (a setting added later keeps its default) */
function load(): GroundSettings {
  return loadSettings<GroundSettings>(STORAGE_KEY, DEFAULT_SETTINGS, (defaults, saved) => ({
    ...defaults,
    ...saved,
    materials: Object.fromEntries(MATERIAL_IDS.map(id => [id, { ...defaults.materials[id], ...saved.materials?.[id] }])) as GroundSettings['materials'],
    transition: { ...defaults.transition, ...saved.transition },
  }))
}

/** The pictures as the preview uses them: per material its variants, per corner mask the transition variants */
export interface GroundPictures {
  bases: Record<MaterialId, ImageBitmap[]>
  transitions: ImageBitmap[][]
}

/** The ground studio: its settings, the tiles they give (built in a worker) and the export. */
export function useGroundStudio() {
  const settings = reactive(load())
  const worker = new Worker(new URL('./groundWorker.ts', import.meta.url), { type: 'module' })
  const { sprites: tiles, building, exportState, exportToGame } = useSpriteSet<GroundSettings, GroundTileMeta>(worker, settings, STORAGE_KEY)

  const pictures = computed<GroundPictures | null>(() => {
    if (!tiles.value.length) return null
    const bases = Object.fromEntries(MATERIAL_IDS.map(id => [id, [] as ImageBitmap[]])) as Record<MaterialId, ImageBitmap[]>
    const transitions: ImageBitmap[][] = Array.from({ length: 16 }, () => [])
    for (const { meta, bitmap } of tiles.value) {
      if (meta.kind === 'base') bases[meta.material][meta.variant] = bitmap
      else transitions[meta.mask][meta.variant] = bitmap
    }
    return { bases, transitions }
  })

  function reset(): void {
    Object.assign(settings, structuredClone(DEFAULT_SETTINGS))
  }

  return { settings, tiles, pictures, building, exportState, reset, exportToGame }
}
