<script setup lang="ts" generic="T extends string | number">
/** A row of buttons, one of them chosen: quicker to read and click than a drop-down */
defineProps<{ options: { value: T; label: string; hint?: string }[]; columns?: number; disabled?: boolean }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    class="grid gap-1 transition-opacity"
    :class="disabled ? 'pointer-events-none opacity-35' : ''"
    :style="{ gridTemplateColumns: `repeat(${columns ?? 3}, minmax(0, 1fr))` }"
    role="radiogroup"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :title="option.hint"
      class="chip"
      :class="{ 'chip-on': model === option.value }"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
