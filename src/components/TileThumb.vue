<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { SPRITE_H, SPRITE_W } from '../core/format'

/**
 * A sprite's picture sits at the bottom of its tall canvas: show that lower part (`shown` px of it), `width` CSS
 * px wide, drawn at the screen's pixel density so it stays sharp.
 */
const props = withDefaults(defineProps<{ bitmap: ImageBitmap; shown?: number; width?: number }>(), { shown: 192, width: 80 })
const canvas = ref<HTMLCanvasElement | null>(null)

function draw(): void {
  const c = canvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const height = (props.width * props.shown) / SPRITE_W
  c.width = Math.round(props.width * dpr)
  c.height = Math.round(height * dpr)
  c.style.width = `${props.width}px`
  c.style.height = `${height}px`
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.drawImage(props.bitmap, 0, SPRITE_H - props.shown, SPRITE_W, props.shown, 0, 0, c.width, c.height)
}
onMounted(draw)
watch(() => [props.bitmap, props.shown, props.width], draw)
</script>

<template>
  <canvas ref="canvas" />
</template>
