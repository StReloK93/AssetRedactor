<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  BrickWall,
  Castle,
  Check,
  Download,
  FolderInput,
  Shuffle,
  ChevronRight,
  Flag,
  Folder,
  FolderOpen,
  CircleAlert,
  CircleCheck,
  Copy,
  Crosshair,
  Dices,
  Image,
  Landmark,
  LoaderCircle,
  Mountain,
  Palette,
  Plus,
  RotateCcw,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next'
import ChipGroup from './ChipGroup.vue'
import ColorField from './ColorField.vue'
import RangeField from './RangeField.vue'
import TileThumb from './TileThumb.vue'
import TowerPreview from './TowerPreview.vue'
import { useTowerStudio } from '../tower/useTowerStudio'
import {
  CLANS,
  type Clan,
  CROWN_IDS,
  EXTRA_IDS,
  PALETTES,
  SHAPES,
  towerFileName,
  type CrownId,
  type Level,
  type Masonry,
  type TowerExtras,
  type TowerForm,
  type TowerShape,
  type TowerTop,
} from '../tower/model'

const {
  project,
  saveState,
  downloadProject,
  openProject,
  randomize,
  clans,
  open,
  toggleClan,
  selected,
  selectedId,
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
} = useTowerStudio()

/** A clan's colour: the glow of its palette */
const clanColor = (clan: Clan) => PALETTES.find(p => p.id === clan.palette)?.colors.glow ?? '#94a3b8'
const clanOptions = CLANS.map(c => ({ value: c.id, label: c.name }))
/** The clan chips move the selected tower */
const clanModel = computed({
  get: () => selected.value?.clan ?? '',
  set: (id: string) => {
    if (selected.value) moveToClan(selected.value.id, id)
  },
})
function confirmReset(): void {
  if (confirm("Hamma klanlar boshlang'ich holatiga qaytsinmi? O'zgartirilgan minoralar yo'qoladi.")) reset()
}
function confirmResetClan(clan: Clan): void {
  if (confirm(`"${clan.name}" klani boshlang'ich 6 ta minoraga qaytsinmi? Shu klandagi o'zgarishlar yo'qoladi.`)) resetClan(clan.id)
}

const BUILDING_FORMS: { value: TowerForm; label: string; hint: string }[] = [
  { value: 'keep', label: 'Oddiy', hint: 'Bitta torayib boruvchi tana' },
  { value: 'tiered', label: 'Ikki qavat', hint: 'Keng pastki qavat, ustida torroq boshqa shakl' },
  { value: 'spire', label: 'Baland', hint: 'Ingichka baland sehrgar minorasi' },
  { value: 'floating', label: 'Uchar', hint: 'Yuqori qismi nur ustida turadi' },
  { value: 'shrine', label: 'Ustunli', hint: 'Ustunlar halqasi, toj ular ustida' },
]
const SHAPE_LABELS: Record<TowerShape, string> = { square: 'Kvadrat', diamond: 'Romb', hexagon: '6 burchak', octagon: '8 burchak', round: 'Silindr' }
const TOP_OPTIONS: { value: TowerTop; label: string; hint: string }[] = [
  { value: 'battlements', label: "Qal'a tishi", hint: "Tishli devor, otish joyi o'rtada" },
  { value: 'floor', label: 'Supa', hint: 'Taxta supa' },
  { value: 'dome', label: 'Gumbaz', hint: "Dumaloq gumbaz, otish joyi cho'qqisida" },
  { value: 'glass', label: 'Shisha gumbaz', hint: 'Yaltiroq nurli shisha gumbaz, otish joyi ichida' },
  { value: 'onion', label: 'Piyoz gumbaz', hint: 'Sharqona piyozsimon gumbaz' },
  { value: 'cupola', label: 'Ayvon', hint: 'Ustunlar ustida gumbaz, otish joyi ostida' },
  { value: 'roof', label: 'Uchli tom', hint: 'Shaklga mos uchli tom' },
  { value: 'turrets', label: 'Burjli', hint: "Qal'a tishi, burchaklarida tomli kichik burjlar" },
  { value: 'pagoda', label: 'Pagoda', hint: "Uchlari qayrilgan bir necha qavat tom" },
  { value: 'thorns', label: 'Shoxli', hint: "Chetida tashqariga qayrilgan katta tosh shoxlar" },
  { value: 'stepped', label: 'Zinapoya', hint: 'Pog\'onali piramida, otish joyi tepasida' },
  { value: 'halo', label: 'Uchar halqa', hint: 'Otish joyi atrofida havoda turgan tosh halqa' },
]
const CROWN_LABELS: Record<CrownId, string> = {
  brazier: 'Mangal',
  crystal: 'Kristall',
  gem: 'Gavhar',
  orb: 'Shar',
  coil: "G'altak",
  cauldron: 'Qozon',
  cannon: "To'p",
  finial: 'Nayza',
  armillary: 'Halqalar',
  bell: "Qo'ng'iroq",
  mortar: 'Mortira',
  ballista: 'Arbalet',
  lotus: 'Nilufar',
  tiara: 'Toj',
  horns: 'Shoxlar',
}
const EXTRA_LABELS: Record<keyof TowerExtras, string> = {
  windows: 'Derazalar',
  runes: 'Runalar',
  cracks: 'Nurli yoriqlar',
  circle: 'Sehrli doira',
  shards: "O'sgan kristallar",
  rings: "Nurli belbog'",
  buttresses: 'Tayanchlar',
  flags: 'Bayroqlar',
  vines: 'Pechak',
  banners: 'Osma bayroq',
  balcony: 'Balkon',
  spikes: 'Tikanlar',
}
const MASONRY_OPTIONS: { value: Masonry; label: string; hint: string }[] = [
  { value: 'bricks', label: "G'isht", hint: "Oddiy g'isht terish" },
  { value: 'blocks', label: 'Katta blok', hint: "Katta yo'nilgan tosh bloklar" },
  { value: 'rubble', label: 'Xarsang', hint: "Har xil o'lchamdagi notekis toshlar" },
  { value: 'plaster', label: 'Suvoq', hint: "Suvoqli devor, ba'zi joyida g'isht ko'rinadi" },
  { value: 'planks', label: 'Yog\'och', hint: "Tik taxtalar, temir belbog'lar bilan" },
]
const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 1, label: 'Kichik' },
  { value: 2, label: "O'rta" },
  { value: 3, label: 'Katta' },
]
const shapeOptions = SHAPES.map(value => ({ value, label: SHAPE_LABELS[value] }))
const crownOptions = CROWN_IDS.map(value => ({ value, label: CROWN_LABELS[value] }))
const UPPER_LABEL: Record<TowerForm, string> = {
  keep: 'Ikkinchi shakl',
  tiered: 'Yuqori qavat',
  spire: 'Tepa qismi',
  floating: 'Uchar qismi',
  shrine: 'Ustunlar',
}



// The view
const showMuzzle = ref(false)
const zoom = ref<'fit' | number>('fit')
const background = ref<'ground' | 'export'>('ground')
const ZOOMS: { value: 'fit' | number; label: string; hint: string }[] = [
  { value: 'fit', label: "Sig'dir", hint: 'Oynaga sig\'adigan eng tiniq o\'lcham' },
  { value: 0.5, label: "O'yindagi", hint: "O'yindagi haqiqiy o'lcham (1 katak = 128 px)" },
  { value: 1, label: '1×', hint: 'Sprite pikselma-piksel' },
  { value: 2, label: '2×', hint: 'Ikki barobar' },
]

/** The tower being edited and how far along its picture is */
const current = computed(() => (selected.value ? spriteOf(selected.value.id) : undefined))
const status = computed<'updating' | 'refining' | 'ready'>(() => {
  if (!current.value || pending.value || current.value.quality === 'stale') return 'updating'
  return current.value.quality === 'draft' ? 'refining' : 'ready'
})

/** The name box edits a copy and renames on Enter or leaving it, so typing never clashes with another name */
const nameDraft = ref('')
watch(() => selected.value?.name, name => (nameDraft.value = name ?? ''), { immediate: true })
function commitName(): void {
  if (selected.value) rename(selected.value.id, nameDraft.value)
  nameDraft.value = selected.value?.name ?? ''
}

function applyPalette(id: string): void {
  const palette = PALETTES.find(p => p.id === id)
  if (selected.value && palette) selected.value.colors = structuredClone(palette.colors)
}
const paletteOn = (id: string) => {
  const colors = PALETTES.find(p => p.id === id)!.colors
  return JSON.stringify(colors) === JSON.stringify(selected.value?.colors)
}

// A note after the export that goes away by itself
const toast = ref<{ kind: 'done' | 'error'; text: string } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
function showToast(kind: 'done' | 'error', text: string): void {
  toast.value = { kind, text }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), kind === 'done' ? 4000 : 8000)
}
watch(() => exportState.value.status, s => {
  if (s === 'done' || s === 'error') showToast(s, exportState.value.message)
})

/** Opening a saved set (it replaces the current one, which is first offered as a download) */
const fileInput = ref<HTMLInputElement | null>(null)
async function onOpenFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!confirm(`"${file.name}" ochilsinmi? Hozirgi minoralar uning o'rniga almashadi (oldin ularni faylga saqlab olish tavsiya etiladi).`)) return
  if (await openProject(file)) showToast('done', `${file.name} ochildi: ${project.towers.length} minora`)
  else showToast('error', `${file.name}: bu faylda minoralar topilmadi`)
}
const SAVE_LABELS = {
  saved: { text: 'Saqlangan', hint: "Brauzerda va diskda (saves/ papka) saqlangan — sahifani yangilasangiz ham o'chmaydi" },
  saving: { text: 'Saqlanmoqda…', hint: 'Oxirgi o\'zgarish saqlanmoqda' },
  'browser-only': { text: 'Faqat brauzerda', hint: "Diskka yozib bo'lmadi (server ishlamayaptimi?). Brauzerda saqlangan; ehtiyot uchun JSON faylga ham saqlang" },
} as const
</script>

<template>
  <div class="relative flex min-h-0 flex-1">
    <!-- The towers -->
    <aside class="flex w-[17rem] shrink-0 flex-col border-r border-line bg-panel">
      <div class="flex items-center gap-1.5 px-4 pb-2 pt-4">
        <span class="section-title mr-auto"><Castle class="h-3.5 w-3.5" />Klanlar <span class="font-normal normal-case tracking-normal text-slate-600">{{ project.towers.length }} minora</span></span>
        <button class="btn-icon" title="Tanlangan minoradan nusxa" @click="duplicate"><Copy class="h-4 w-4" /></button>
        <button class="btn-icon hover:!bg-rose-500/20 hover:!text-rose-300" title="Tanlangan minorani o'chirish" :disabled="project.towers.length <= 1" @click="remove"><Trash2 class="h-4 w-4" /></button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
        <section
          v-for="group in clans"
          :key="group.clan.id"
          class="mb-1 rounded-xl transition-colors"
          :class="open.includes(group.clan.id) ? 'bg-white/[0.025]' : ''"
        >
          <!-- The folder: open/close it, add a tower to it, restore its six -->
          <div
            class="group/folder flex cursor-pointer select-none items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-white/[0.05]"
            role="button"
            :aria-expanded="open.includes(group.clan.id)"
            @click="toggleClan(group.clan.id)"
          >
            <ChevronRight class="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200" :class="{ 'rotate-90': open.includes(group.clan.id) }" />
            <component :is="open.includes(group.clan.id) ? FolderOpen : Folder" class="h-4 w-4 shrink-0" :style="{ color: clanColor(group.clan) }" />
            <span class="truncate text-sm text-slate-200">{{ group.clan.name }}</span>
            <span class="rounded-full bg-white/5 px-1.5 text-[10px] tabular-nums text-slate-400">{{ group.towers.length }}</span>
            <span
              v-if="group.towers.some(t => spriteOf(t.id)?.quality !== 'final')"
              class="ml-0.5"
              title="Yasalmoqda"
            ><LoaderCircle class="h-3 w-3 animate-spin text-amber-300/80" /></span>
            <span class="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover/folder:opacity-100">
              <button v-if="group.clan.id !== 'other'" class="btn h-6 w-6 text-slate-400 hover:bg-white/10 hover:text-slate-100" title="Boshlang'ich 6 taga qaytarish" @click.stop="confirmResetClan(group.clan)"><RotateCcw class="h-3 w-3" /></button>
              <button class="btn h-6 w-6 text-emerald-300 hover:bg-emerald-400/15" title="Bu klanga yangi minora" @click.stop="add(group.clan.id)"><Plus class="h-3.5 w-3.5" /></button>
            </span>
          </div>
          <TransitionGroup v-if="open.includes(group.clan.id)" tag="div" name="list" class="grid grid-cols-3 gap-1.5 px-1.5 pb-2.5 pt-0.5">
            <button
              v-for="tower in group.towers"
              :key="tower.id"
              class="group relative flex flex-col items-center rounded-xl p-1 transition duration-150 hover:-translate-y-0.5 active:scale-[0.97]"
              :class="tower.id === selectedId ? 'bg-emerald-400/10 ring-1 ring-emerald-400/60' : 'bg-white/[0.03] ring-1 ring-transparent hover:bg-white/[0.07] hover:ring-white/10'"
              :title="towerFileName(tower.name) + '.png'"
              @click="selectedId = tower.id"
            >
              <TileThumb v-if="spriteOf(tower.id)" :bitmap="spriteOf(tower.id)!.bitmap" :shown="400" :width="68" class="transition-opacity" :class="spriteOf(tower.id)!.quality === 'stale' ? 'opacity-50' : ''" />
              <div v-else class="skeleton h-[106px] w-[68px] rounded-lg" />
              <span class="w-full truncate text-center text-[10px]" :class="tower.id === selectedId ? 'text-emerald-200' : 'text-slate-400'">{{ tower.name }}</span>
              <span v-if="!spriteOf(tower.id) || spriteOf(tower.id)!.quality !== 'final'" class="absolute right-1.5 top-1.5 rounded-full bg-ink/80 p-0.5" title="Yasalmoqda">
                <LoaderCircle class="h-3 w-3 animate-spin text-amber-300" />
              </span>
            </button>
            <button
              key="add"
              class="flex min-h-[124px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/10 text-[10px] text-slate-500 transition hover:border-emerald-400/40 hover:bg-emerald-400/5 hover:text-emerald-300 active:scale-[0.97]"
              :title="`${group.clan.name} klaniga yangi minora`"
              @click="add(group.clan.id)"
            >
              <Plus class="h-4 w-4" />
              Qo'shish
            </button>
          </TransitionGroup>
        </section>
      </div>
      <div class="flex flex-col gap-3 border-t border-line p-4">
        <span class="section-title"><Upload class="h-3.5 w-3.5" />Eksport (hammasiga)</span>
        <RangeField v-model="project.brickSize" label="G'isht o'lchami" :min="0.6" :max="1.8" :step="0.1" />
        <RangeField v-model="project.outline" label="Kontur, px" :min="0" :max="3" :step="0.5" />
        <button class="chip justify-start !py-2" :class="{ 'chip-on': project.shadow }" @click="project.shadow = !project.shadow">
          <Check v-if="project.shadow" class="h-3.5 w-3.5" /><X v-else class="h-3.5 w-3.5" />
          Yerga soya tushsin
        </button>
        <button class="btn-primary" :disabled="building || exportState.status === 'busy'" @click="exportToGame">
          <LoaderCircle v-if="exportState.status === 'busy' || building" class="h-4 w-4 animate-spin" />
          <Upload v-else class="h-4 w-4" />
          {{ building ? 'Yasalmoqda…' : exportState.status === 'busy' ? 'Yozilmoqda…' : "O'yinga eksport" }}
        </button>
        <div class="flex items-center gap-1.5">
          <span
            class="mr-auto flex items-center gap-1 text-[11px]"
            :class="saveState === 'saved' ? 'text-emerald-400/80' : saveState === 'saving' ? 'text-slate-400' : 'text-amber-300'"
            :title="SAVE_LABELS[saveState].hint"
          >
            <LoaderCircle v-if="saveState === 'saving'" class="h-3 w-3 animate-spin" />
            <CircleCheck v-else-if="saveState === 'saved'" class="h-3 w-3" />
            <CircleAlert v-else class="h-3 w-3" />
            {{ SAVE_LABELS[saveState].text }}
          </span>
          <button class="btn-icon" title="Hamma minoralarni JSON faylga yuklab olish (zaxira)" @click="downloadProject"><Download class="h-4 w-4" /></button>
          <button class="btn-icon" title="Saqlangan JSON fayldan ochish" @click="fileInput?.click()"><FolderInput class="h-4 w-4" /></button>
          <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onOpenFile" />
        </div>
        <button class="btn h-8 text-xs text-slate-500 hover:bg-white/5 hover:text-slate-300" @click="confirmReset"><RotateCcw class="h-3.5 w-3.5" />Hammasini boshlang'ich holatga</button>
      </div>
    </aside>

    <!-- The tower being edited -->
    <main class="flex min-w-0 flex-1 flex-col">
      <div class="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5 text-xs text-slate-400">
        <label class="flex items-center rounded-lg bg-white/[0.04] pl-2.5 ring-1 ring-transparent transition focus-within:ring-emerald-400/50 hover:bg-white/[0.07]">
          <span class="text-slate-500">forge_tower_</span>
          <input
            v-model="nameDraft"
            class="h-8 w-32 bg-transparent text-sm text-slate-100 outline-none"
            spellcheck="false"
            title="Fayl nomi: lotin harflar, raqamlar, _"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
            @blur="commitName"
          />
          <span class="pr-2.5 text-slate-500">.png</span>
        </label>
        <div class="segmented" title="Fon">
          <button class="segment flex items-center gap-1.5" :class="{ 'segment-on': background === 'ground' }" title="O'yindagidek, katak ustida" @click="background = 'ground'"><Mountain class="h-3.5 w-3.5" />Yer</button>
          <button class="segment flex items-center gap-1.5" :class="{ 'segment-on': background === 'export' }" title="Eksport qilinadigan rasmning o'zi: katak kirmaydi" @click="background = 'export'"><Image class="h-3.5 w-3.5" />Eksport</button>
        </div>
        <div class="segmented">
          <button v-for="z in ZOOMS" :key="String(z.value)" class="segment" :class="{ 'segment-on': zoom === z.value }" :title="z.hint" @click="zoom = z.value">{{ z.label }}</button>
        </div>
        <button class="segment flex items-center gap-1.5 rounded-lg" :class="showMuzzle ? 'segment-on' : 'bg-white/[0.04]'" title="O'q qayerdan uchishi" @click="showMuzzle = !showMuzzle">
          <Crosshair class="h-3.5 w-3.5" />O'q
          <span v-if="showMuzzle && current" class="font-mono text-[10px] text-emerald-300">muzzleOffsetY {{ current.meta.muzzleOffsetY }}</span>
        </button>
        <Transition name="fade" mode="out-in">
          <span v-if="status === 'ready'" key="ready" class="ml-auto flex items-center gap-1.5 text-emerald-400"><CircleCheck class="h-4 w-4" />Tayyor</span>
          <span v-else-if="status === 'refining'" key="refining" class="ml-auto flex items-center gap-1.5 text-sky-300"><LoaderCircle class="h-4 w-4 animate-spin" />Sifat oshirilmoqda…</span>
          <span v-else key="updating" class="ml-auto flex items-center gap-1.5 text-amber-300"><LoaderCircle class="h-4 w-4 animate-spin" />Yangilanmoqda…</span>
        </Transition>
      </div>
      <div class="progress-line transition-opacity duration-300" :class="status === 'ready' ? 'opacity-0' : 'opacity-100'" />
      <div class="relative min-h-0 flex-1 bg-[radial-gradient(ellipse_at_center,#1a2230,#0b0e13_70%)]">
        <TowerPreview
          class="transition duration-200"
          :class="status === 'updating' && current ? 'opacity-70 saturate-50' : ''"
          :bitmap="current?.bitmap ?? null"
          :hd="current?.quality === 'final' ? current?.hd ?? null : null"
          :crown="current?.meta.crown ?? null"
          :show-muzzle="showMuzzle"
          :zoom="zoom"
          :background="background"
        />
        <Transition name="pop">
          <div v-if="status !== 'ready'" class="pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink/85 px-4 py-2 text-xs shadow-lg ring-1 ring-white/10 backdrop-blur">
            <LoaderCircle class="h-4 w-4 animate-spin" :class="status === 'refining' ? 'text-sky-300' : 'text-amber-300'" />
            <span class="text-slate-200">{{ status === 'refining' ? 'Qoralama tayyor — tiniq varianti chizilmoqda' : 'O\'zgarish qo\'llanmoqda…' }}</span>
          </div>
        </Transition>
        <p v-if="background === 'export'" class="pointer-events-none absolute left-5 top-4 max-w-xs text-[11px] leading-relaxed text-slate-500">
          Eksportda faqat shu rasm yoziladi: minora{{ project.shadow ? ', soyasi' : '' }}{{ selected?.extras.circle ? ', sehrli doira' : '' }}{{ selected && selected.glow > 0 ? ', nuri' : '' }}. Katak (yer) kirmaydi.
        </p>
      </div>
    </main>

    <!-- Its settings -->
    <aside v-if="selected" class="flex w-[21rem] shrink-0 flex-col gap-6 overflow-y-auto border-l border-line bg-panel p-5">
      <section class="flex flex-col gap-2.5">
        <h3 class="section-title"><Flag class="h-3.5 w-3.5" />Klan</h3>
        <ChipGroup v-model="clanModel" :options="clanOptions" :columns="4" />
        <p class="text-[11px] text-slate-500">Boshqa klanga o'tkazilsa, nomi ham o'sha klanga moslanadi.</p>
      </section>

      <section class="flex flex-col gap-2.5">
        <h3 class="section-title"><Castle class="h-3.5 w-3.5" />Tuzilishi</h3>
        <button class="btn-soft text-xs" title="Tuzilishi, shakli, tepasi, devori, bezaklari va o'lchamlari tasodifiy tanlanadi. Klan, ranglar, otish joyi va hajmi o'zgarmaydi." @click="randomize"><Shuffle class="h-3.5 w-3.5" />Tasodifiy ko'rinish</button>
        <ChipGroup v-model="selected.form" :options="BUILDING_FORMS" />
        <span class="mt-1 text-[11px] text-slate-500">Hajmi</span>
        <ChipGroup v-model="selected.level" :options="LEVEL_OPTIONS" />
      </section>

      <section class="flex flex-col gap-2.5">
        <h3 class="section-title"><Shapes class="h-3.5 w-3.5" />Shakl</h3>
        <span class="text-[11px] text-slate-500">Pastki qismi</span>
        <ChipGroup v-model="selected.shape" :options="shapeOptions" />
          <span class="text-[11px] text-slate-500">{{ UPPER_LABEL[selected.form] }}</span>
          <ChipGroup v-model="selected.upperShape" :options="shapeOptions" :disabled="selected.form === 'keep'" />
      </section>

      <section class="flex flex-col gap-2.5">
        <h3 class="section-title"><BrickWall class="h-3.5 w-3.5" />Devori</h3>
        <ChipGroup v-model="selected.masonry" :options="MASONRY_OPTIONS" />
      </section>

      <section class="flex flex-col gap-2.5">
        <h3 class="section-title"><Landmark class="h-3.5 w-3.5" />Tepasi</h3>
        <ChipGroup v-model="selected.top" :options="TOP_OPTIONS" />
        <p v-if="selected.form === 'shrine'" class="text-[11px] text-slate-500">Ustunlida "Qal'a tishi" va "Supa" ochiq bo'ladi (otish joyi halqa ustida suzadi), qolganlari ustunlar ustiga tom bo'lib quriladi.</p>
      </section>

      <section class="flex flex-col gap-2.5">
        <h3 class="section-title"><Target class="h-3.5 w-3.5" />Otish joyi</h3>
        <ChipGroup v-model="selected.crown" :options="crownOptions" />
      </section>

      <section class="flex flex-col gap-2.5">
        <h3 class="section-title"><Palette class="h-3.5 w-3.5" />Ranglar</h3>
        <div class="grid grid-cols-5 gap-1">
          <button
            v-for="palette in PALETTES"
            :key="palette.id"
            class="chip flex-col !gap-1 !px-1"
            :class="{ 'chip-on': paletteOn(palette.id) }"
            :title="palette.name"
            @click="applyPalette(palette.id)"
          >
            <span class="flex h-3 w-9 overflow-hidden rounded-full ring-1 ring-black/30">
              <span class="flex-1" :style="{ background: palette.colors.stone[1] }" />
              <span class="flex-1" :style="{ background: palette.colors.accent }" />
              <span class="flex-1" :style="{ background: palette.colors.glow }" />
            </span>
            <span class="text-[10px]">{{ palette.name }}</span>
          </button>
        </div>
        <div class="flex items-end justify-between rounded-xl bg-white/[0.03] p-2.5 text-[10px] text-slate-500">
          <label class="flex flex-col items-center gap-1"><span class="flex gap-1"><ColorField v-model="selected.colors.stone[0]" title="Tosh, to'q" /><ColorField v-model="selected.colors.stone[1]" title="Tosh, och" /></span>Tosh</label>
          <label class="flex flex-col items-center gap-1"><ColorField v-model="selected.colors.trim" title="Metall" />Metall</label>
          <label class="flex flex-col items-center gap-1"><ColorField v-model="selected.colors.accent" title="Tom, gumbaz, mato" />Tom, mato</label>
          <label class="flex flex-col items-center gap-1"><ColorField v-model="selected.colors.glow" title="Nur" />Nur</label>
        </div>
      </section>

      <section class="flex flex-col gap-2.5">
        <h3 class="section-title"><Sparkles class="h-3.5 w-3.5" />Bezaklar</h3>
        <div class="grid grid-cols-2 gap-1">
          <button v-for="id in EXTRA_IDS" :key="id" class="chip justify-start" :class="{ 'chip-on': selected.extras[id] }" @click="selected.extras[id] = !selected.extras[id]">
            <Check v-if="selected.extras[id]" class="h-3.5 w-3.5" />
            <Plus v-else class="h-3.5 w-3.5 opacity-50" />
            {{ EXTRA_LABELS[id] }}
          </button>
        </div>
      </section>

      <section class="flex flex-col gap-3.5">
        <h3 class="section-title"><SlidersHorizontal class="h-3.5 w-3.5" />O'lcham va effektlar</h3>
        <RangeField v-model="selected.width" label="Eni" :min="0.7" :max="1.3" :step="0.05" />
        <RangeField v-model="selected.height" label="Bo'yi" :min="0.6" :max="1.5" :step="0.05" />
        <RangeField v-model="selected.taper" label="Tepaga torayishi" :min="0" :max="0.4" :step="0.02" />
        <RangeField v-model="selected.glow" label="Nur (orqa fonda)" :min="0" :max="1" :step="0.05" />
        <RangeField v-model="selected.magic" label="Sehr kuchi" :min="0" :max="1" :step="0.05" />
        <RangeField v-model="selected.weathering" label="Mox va eskirish" :min="0" :max="1" :step="0.05" />
        <button class="btn-soft text-xs" @click="selected.seed = Math.floor(Math.random() * 999) + 1"><Dices class="h-3.5 w-3.5" />Boshqa naqsh</button>
      </section>
    </aside>

    <!-- Export result -->
    <Transition name="pop">
      <div
        v-if="toast"
        class="absolute bottom-5 right-5 flex max-w-md items-start gap-2.5 rounded-xl bg-raised px-4 py-3 text-sm shadow-2xl ring-1"
        :class="toast.kind === 'done' ? 'ring-emerald-400/40' : 'ring-rose-400/40'"
      >
        <CircleCheck v-if="toast.kind === 'done'" class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <CircleAlert v-else class="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
        <span class="break-all text-slate-200">{{ toast.text }}</span>
        <button class="ml-1 text-slate-500 transition hover:text-slate-200" @click="toast = null"><X class="h-4 w-4" /></button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 150ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.pop-enter-active,
.pop-leave-active {
  transition: opacity 180ms ease, transform 220ms var(--ease-snappy);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translate(var(--tw-translate-x, 0), 8px) scale(0.97);
}
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 220ms var(--ease-snappy);
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
.list-leave-active {
  position: absolute;
}
</style>
