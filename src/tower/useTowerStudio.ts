import { computed, reactive, ref, watch } from 'vue'
import { useSpriteSet } from '../core/useSpriteSet'
import {
  CLANS,
  Clan,
  OTHER_CLAN,
  PALETTES,
  TOWERS_PER_CLAN,
  TowerDef,
  TowerProject,
  cleanName,
  clanOfName,
  clanStarters,
  defaultProject,
  newId,
  newTower,
  towerFileName,
} from './model'
import type { TowerMeta } from './tasks'

/** v4: towers sit in clans */
const STORAGE_KEY = 'isoforge.tower.v4'
/** The set before clans: still read once, so nothing made there is lost */
const OLD_STORAGE_KEY = 'isoforge.tower.v3'
const OPEN_KEY = 'isoforge.tower.openClans'

/** Forms that are no longer made (the carved figures) */
const RETIRED_FORMS = ['knight', 'golem', 'mage']
const STARTERS = new Map(CLANS.flatMap(clanStarters).map(t => [t.name, t]))

/**
 * A saved tower over today's defaults (a setting added later keeps its default). A tower saved as a figure comes
 * back as the starting tower of its name, or as a plain tower in its own colours.
 */
function revive(t: Partial<TowerDef> & { name: string }): TowerDef {
  const base = newTower({ name: t.name, level: t.level })
  const tower: TowerDef = { ...base, ...t, clan: t.clan ?? clanOfName(t.name), extras: { ...base.extras, ...t.extras }, colors: { ...base.colors, ...t.colors } }
  if (!RETIRED_FORMS.includes(tower.form as string)) return tower
  const starter = STARTERS.get(tower.name)
  return starter ? { ...structuredClone(starter), id: tower.id, clan: tower.clan } : { ...tower, form: 'keep' }
}

function read(key: string): Partial<TowerProject> | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<TowerProject> | null
  } catch {
    return null
  }
}

function load(): TowerProject {
  const defaults = defaultProject()
  const saved = read(STORAGE_KEY)
  if (saved?.towers) return { ...defaults, ...saved, shadow: saved.shadow ?? true, towers: saved.towers.map(revive) }
  // A set from before clans: its towers go into the clans their names start with, and every clan is filled up to
  // six with its starting towers (none of the made ones is replaced)
  const old = read(OLD_STORAGE_KEY)
  if (!old?.towers) return defaults
  const towers = old.towers.map(revive)
  const names = new Set(towers.map(t => t.name))
  for (const clan of CLANS) {
    let have = towers.filter(t => t.clan === clan.id).length
    for (const starter of clanStarters(clan)) {
      if (have >= TOWERS_PER_CLAN) break
      if (names.has(starter.name)) continue
      towers.push(starter)
      names.add(starter.name)
      have++
    }
  }
  // Each clan's towers together, in the clans' order
  const order = (t: TowerDef) => {
    const i = CLANS.findIndex(c => c.id === t.clan)
    return i < 0 ? CLANS.length : i
  }
  towers.sort((a, b) => order(a) - order(b))
  return { ...defaults, ...old, shadow: old.shadow ?? true, towers }
}

/** The tower studio: the clans and their towers, the one being edited, the sprites (built in a worker) and the export. */
export function useTowerStudio() {
  const project = reactive(load())
  const selectedId = ref(project.towers[0]?.id ?? '')
  const selected = computed<TowerDef | undefined>(() => project.towers.find(t => t.id === selectedId.value))

  const worker = new Worker(new URL('./towerWorker.ts', import.meta.url), { type: 'module' })
  const { sprites, building, pending, exportState, exportToGame, refocus } = useSpriteSet<TowerProject, TowerMeta>(
    worker,
    project,
    STORAGE_KEY,
    () => (selected.value ? towerFileName(selected.value.name) : undefined),
  )
  const spriteOf = (id: string) => sprites.value.find(s => s.meta.id === id)
  // Picking another tower: the worker makes its sharper preview
  watch(selectedId, () => refocus())

  /** The folders: every clan, and "other" only while something is in it */
  const clans = computed(() => {
    const groups = CLANS.map(clan => ({ clan, towers: project.towers.filter(t => t.clan === clan.id) }))
    const other = project.towers.filter(t => !CLANS.some(c => c.id === t.clan))
    return other.length ? [...groups, { clan: OTHER_CLAN, towers: other }] : groups
  })
  const clanOf = (id: string): Clan => CLANS.find(c => c.id === id) ?? OTHER_CLAN

  /** Open folders (remembered); the selected tower's folder always opens */
  const open = ref<string[]>(readOpen())
  function readOpen(): string[] {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null')
      return Array.isArray(saved) ? saved : CLANS.map(c => c.id)
    } catch {
      return CLANS.map(c => c.id)
    }
  }
  watch(open, value => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(value))
    } catch {
      // Not remembered in a private window
    }
  }, { deep: true })
  function toggleClan(id: string): void {
    open.value = open.value.includes(id) ? open.value.filter(c => c !== id) : [...open.value, id]
  }
  watch(() => selected.value?.clan, clan => {
    if (clan && !open.value.includes(clan)) open.value = [...open.value, clan]
  }, { immediate: true })

  /** A name not used by another tower */
  function freeName(wanted: string, except?: string): string {
    const base = cleanName(wanted)
    const taken = new Set(project.towers.filter(t => t.id !== except).map(t => t.name))
    if (!taken.has(base)) return base
    let i = 2
    while (taken.has(`${base}_${i}`)) i++
    return `${base}_${i}`
  }
  /** The next free <clan>_<n> */
  function nextClanName(clan: string, except?: string): string {
    const taken = new Set(project.towers.filter(t => t.id !== except).map(t => t.name))
    let i = 1
    while (taken.has(`${clan}_${i}`)) i++
    return `${clan}_${i}`
  }

  function rename(id: string, name: string): void {
    const tower = project.towers.find(t => t.id === id)
    if (tower) tower.name = freeName(name, id)
  }

  /** A new tower at the end of a clan, in the clan's colours */
  function add(clanId: string): void {
    const clan = clanOf(clanId)
    const colors = structuredClone(PALETTES.find(p => p.id === clan.palette)!.colors)
    const tower = newTower({ name: nextClanName(clan.id), clan: clan.id, colors })
    const last = project.towers.map(t => t.clan).lastIndexOf(clan.id)
    project.towers.splice(last < 0 ? project.towers.length : last + 1, 0, tower)
    selectedId.value = tower.id
  }

  function duplicate(): void {
    const source = selected.value
    if (!source) return
    const copy: TowerDef = { ...structuredClone(source), id: newId(), name: CLANS.some(c => c.id === source.clan) ? nextClanName(source.clan) : freeName(source.name) }
    project.towers.splice(project.towers.indexOf(source) + 1, 0, copy)
    selectedId.value = copy.id
  }

  function remove(): void {
    const index = project.towers.findIndex(t => t.id === selectedId.value)
    if (index < 0 || project.towers.length <= 1) return
    project.towers.splice(index, 1)
    selectedId.value = project.towers[Math.min(index, project.towers.length - 1)].id
  }

  /** Moves a tower into another clan: to the end of it, renamed after it if its name followed the old clan */
  function moveToClan(id: string, clanId: string): void {
    const tower = project.towers.find(t => t.id === id)
    if (!tower || tower.clan === clanId) return
    const followedOld = tower.name === tower.clan || tower.name.startsWith(`${tower.clan}_`)
    project.towers.splice(project.towers.indexOf(tower), 1)
    tower.clan = clanId
    if (followedOld && CLANS.some(c => c.id === clanId)) tower.name = nextClanName(clanId, tower.id)
    const last = project.towers.map(t => t.clan).lastIndexOf(clanId)
    project.towers.splice(last < 0 ? project.towers.length : last + 1, 0, tower)
  }

  /** Back to the starting set: the whole project, or one clan's six */
  function reset(): void {
    Object.assign(project, defaultProject())
    selectedId.value = project.towers[0].id
  }
  function resetClan(clanId: string): void {
    const starters = clanStarters(clanOf(clanId))
    const at = project.towers.findIndex(t => t.clan === clanId)
    const kept = project.towers.filter(t => t.clan !== clanId)
    kept.splice(at < 0 ? kept.length : at, 0, ...starters)
    project.towers.splice(0, project.towers.length, ...kept)
    if (starters[0]) selectedId.value = starters[0].id
  }

  return {
    project,
    clans,
    open,
    toggleClan,
    selected,
    selectedId,
    sprites,
    spriteOf,
    building,
    pending,
    exportState,
    exportToGame,
    rename,
    add,
    duplicate,
    remove,
    moveToClan,
    reset,
    resetClan,
  }
}
