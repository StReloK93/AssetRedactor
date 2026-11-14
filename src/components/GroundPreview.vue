<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { drawPreview } from '../ground/preview'
import type { GroundPictures } from '../ground/useGroundStudio'
import type { MaterialId } from '../ground/materials'

const props = defineProps<{ pictures: GroundPictures | null; over: MaterialId; under: MaterialId; size: number; seed: number }>()
const canvas = ref<HTMLCanvasElement | null>(null)

function draw(): void {
  if (canvas.value && props.pictures) drawPreview(canvas.value, props.pictures, props.over, props.under, props.size, props.seed)
}
onMounted(draw)
watch(() => [props.pictures, props.size, props.seed], draw)
</script>

<template>
  <canvas ref="canvas" class="max-h-full max-w-full object-contain" />
</template>
