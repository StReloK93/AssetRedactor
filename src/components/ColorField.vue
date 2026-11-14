<script setup lang="ts">
defineProps<{ title: string }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <input
    v-model="model"
    type="color"
    :title="title"
    class="h-8 w-8 shrink-0 rounded-lg ring-1 ring-white/10 transition duration-150 hover:scale-110 hover:ring-white/30 active:scale-95"
  />
</template>
