<script setup lang="ts">
import { ref } from 'vue'
import { Castle, Layers, Mountain, Shapes } from 'lucide-vue-next'
import GroundStudio from './components/GroundStudio.vue'
import TowerStudio from './components/TowerStudio.vue'

type Studio = 'ground' | 'tower'
const STUDIO_KEY = 'isoforge.studio'

function savedStudio(): Studio {
  // A link can open a studio directly: #tower, #ground
  if (location.hash === '#tower' || location.hash === '#ground') return location.hash.slice(1) as Studio
  try {
    return localStorage.getItem(STUDIO_KEY) === 'tower' ? 'tower' : 'ground'
  } catch {
    return 'ground'
  }
}
const studio = ref<Studio>(savedStudio())
function open(next: Studio): void {
  studio.value = next
  try {
    localStorage.setItem(STUDIO_KEY, next)
  } catch {
    // Not remembered in a private window: nothing else depends on it
  }
}
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden">
    <header class="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-panel px-5">
      <div class="flex items-center gap-2 font-semibold tracking-wide text-slate-100">
        <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 ring-1 ring-emerald-400/30">
          <Layers class="h-4 w-4 text-emerald-300" />
        </span>
        IsoForge
      </div>
      <nav class="segmented text-sm">
        <button class="segment flex items-center gap-2 !px-3 !py-1.5" :class="{ 'segment-on': studio === 'ground' }" @click="open('ground')">
          <Mountain class="h-4 w-4" />
          Yer
        </button>
        <button class="segment flex items-center gap-2 !px-3 !py-1.5" :class="{ 'segment-on': studio === 'tower' }" @click="open('tower')">
          <Castle class="h-4 w-4" />
          Minoralar
        </button>
        <span class="flex cursor-not-allowed items-center gap-2 px-3 py-1.5 text-slate-600" title="Keyingi bosqich">
          <Shapes class="h-4 w-4" />
          Primitivlar
        </span>
      </nav>
    </header>
    <!-- Only the open studio exists: each has its own worker -->
    <Transition name="studio" mode="out-in">
      <GroundStudio v-if="studio === 'ground'" key="ground" />
      <TowerStudio v-else key="tower" />
    </Transition>
  </div>
</template>

<style>
.studio-enter-active,
.studio-leave-active {
  transition: opacity 160ms ease;
}
.studio-enter-from,
.studio-leave-to {
  opacity: 0;
}
</style>
