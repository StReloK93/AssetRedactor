<script setup lang="ts">
import { ref } from 'vue'
import { Dices, RotateCcw, Upload, LoaderCircle } from 'lucide-vue-next'
import RangeField from './RangeField.vue'
import ColorField from './ColorField.vue'
import GroundPreview from './GroundPreview.vue'
import TileThumb from './TileThumb.vue'
import { useGroundStudio } from '../ground/useGroundStudio'
import { MATERIAL_IDS, type MaterialId } from '../ground/materials'

const { settings, tiles, pictures, building, exportState, reset, exportToGame } = useGroundStudio()

const MATERIAL_NAMES: Record<MaterialId, string> = { grass: "O't", dirt: 'Tuproq', stone: "Tosh yo'l", sand: 'Qum' }
const ACCENT_NAMES: Record<MaterialId, string> = { grass: "Yaproq uchi", dirt: 'Toshchalar', stone: 'Choklar', sand: 'Donalar' }
const previewSize = ref(10)
const previewSeed = ref(3)
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <!-- Settings -->
    <aside class="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/5 bg-slate-950/60 p-5">
      <section class="flex flex-col gap-4">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500">Umumiy</h2>
        <div class="flex items-end gap-2">
          <div class="flex-1">
            <RangeField v-model="settings.seed" label="Seed" :min="1" :max="999" :step="1" />
          </div>
          <button class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-slate-300 hover:bg-white/10" title="Tasodifiy seed" @click="settings.seed = Math.floor(Math.random() * 999) + 1">
            <Dices class="h-4 w-4" />
          </button>
        </div>
        <RangeField v-model="settings.variants" label="Variantlar" :min="1" :max="6" :step="1" />
        <RangeField v-model="settings.bladeDensity" label="O't qalinligi" :min="0" :max="1" :step="0.05" />
        <RangeField v-model="settings.bladeHeight" label="O't bo'yi" :min="0" :max="1" :step="0.05" />
        <label class="flex items-center justify-between text-xs text-slate-400">
          Xarita cheti (plita yoni)
          <ColorField v-model="settings.edgeColor" title="Plita yoni" />
        </label>
      </section>

      <section v-for="id in MATERIAL_IDS" :key="id" class="flex flex-col gap-3">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500">{{ MATERIAL_NAMES[id] }}</h2>
        <div class="flex items-center gap-2">
          <ColorField v-for="(_, i) in settings.materials[id].colors" :key="i" v-model="settings.materials[id].colors[i]" :title="`Rang ${i + 1}`" />
          <span class="mx-1 h-6 w-px bg-white/10" />
          <ColorField v-model="settings.materials[id].accent" :title="ACCENT_NAMES[id]" />
        </div>
        <RangeField v-model="settings.materials[id].scale" label="Naqsh o'lchami" :min="0.5" :max="2" :step="0.25" />
        <RangeField v-model="settings.materials[id].contrast" label="Kontrast" :min="0" :max="1" :step="0.05" />
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500">O'tish to'plami</h2>
        <div class="grid grid-cols-2 gap-2 text-xs text-slate-400">
          <label class="flex flex-col gap-1">
            Ustidan o'sadi
            <select v-model="settings.transition.over" class="h-9 rounded-lg bg-white/5 px-2 text-slate-200">
              <option v-for="id in MATERIAL_IDS" :key="id" :value="id" :disabled="id === settings.transition.under">{{ MATERIAL_NAMES[id] }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            Ostida
            <select v-model="settings.transition.under" class="h-9 rounded-lg bg-white/5 px-2 text-slate-200">
              <option v-for="id in MATERIAL_IDS" :key="id" :value="id" :disabled="id === settings.transition.over">{{ MATERIAL_NAMES[id] }}</option>
            </select>
          </label>
        </div>
      </section>

      <section class="mt-auto flex flex-col gap-2">
        <button
          class="flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500 font-medium text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
          :disabled="!tiles.length || exportState.status === 'busy'"
          @click="exportToGame"
        >
          <LoaderCircle v-if="exportState.status === 'busy'" class="h-4 w-4 animate-spin" />
          <Upload v-else class="h-4 w-4" />
          O'yinga eksport
        </button>
        <button class="flex h-9 items-center justify-center gap-2 rounded-lg bg-white/5 text-sm text-slate-300 hover:bg-white/10" @click="reset">
          <RotateCcw class="h-4 w-4" />
          Boshlang'ich holat
        </button>
        <p v-if="exportState.message" class="break-all text-xs" :class="exportState.status === 'error' ? 'text-rose-400' : 'text-emerald-400'">
          {{ exportState.message }}
        </p>
      </section>
    </aside>

    <!-- Preview and the pictures -->
    <main class="flex min-w-0 flex-1 flex-col">
      <div class="flex h-12 shrink-0 items-center gap-4 border-b border-white/5 px-5 text-xs text-slate-400">
        <span class="flex items-center gap-2">
          Xarita
          <select v-model.number="previewSize" class="h-8 rounded-lg bg-white/5 px-2 text-slate-200">
            <option :value="6">6 × 6</option>
            <option :value="10">10 × 10</option>
            <option :value="16">16 × 16</option>
          </select>
        </span>
        <button class="flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-3 text-slate-300 hover:bg-white/10" @click="previewSeed++">
          <Dices class="h-3.5 w-3.5" />
          Boshqa joylashuv
        </button>
        <span v-if="building" class="ml-auto flex items-center gap-1.5 text-slate-500">
          <LoaderCircle class="h-3.5 w-3.5 animate-spin" />
          Yasalmoqda
        </span>
      </div>
      <div class="flex min-h-0 flex-1 items-center justify-center bg-[radial-gradient(circle_at_center,#1b2430,#0c0f14)] p-6">
        <GroundPreview :pictures="pictures" :over="settings.transition.over" :under="settings.transition.under" :size="previewSize" :seed="previewSeed" />
      </div>
      <div class="flex h-36 shrink-0 gap-2 overflow-x-auto border-t border-white/5 bg-slate-950/60 p-3">
        <figure v-for="tile in tiles" :key="tile.name" class="flex w-20 shrink-0 flex-col items-center gap-1">
          <TileThumb :bitmap="tile.bitmap" class="rounded-lg bg-white/3" />
          <figcaption class="w-full truncate text-center text-[10px] text-slate-500">{{ tile.name }}</figcaption>
        </figure>
      </div>
    </main>
  </div>
</template>
