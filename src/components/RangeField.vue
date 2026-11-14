<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ label: string; min: number; max: number; step: number }>()
const model = defineModel<number>({ required: true })
/** How far along the track the value is, for the filled part */
const fill = computed(() => `${((model.value - props.min) / (props.max - props.min)) * 100}%`)
const shown = computed(() => (props.step >= 1 ? String(model.value) : model.value.toFixed(props.step < 0.1 ? 2 : 1)))
</script>

<template>
  <label class="group flex flex-col gap-1">
    <span class="flex items-center justify-between text-xs text-slate-400 transition-colors group-hover:text-slate-300">
      {{ label }}
      <span class="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-300">{{ shown }}</span>
    </span>
    <input v-model.number="model" type="range" :min="min" :max="max" :step="step" class="w-full" :style="{ '--fill': fill }" />
  </label>
</template>
