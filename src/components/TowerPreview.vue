<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FACE_CENTER_Y, FACE_HALF_H, FACE_HALF_W, SPRITE_H, SPRITE_W } from '../core/format'

/**
 * One tower, sharp: drawn at the screen's pixel density, from a twice-as-sharp picture once it is ready, cut
 * down to the tower so it fills the space. `background` shows it on a tile (as in the game) or on a checkerboard, exactly as it
 * is exported (the tile is never part of the sprite).
 */
const props = defineProps<{
  bitmap: ImageBitmap | null
  /** The same tower drawn twice as sharp, when it is ready */
  hd?: ImageBitmap | null
  crown: { x: number; y: number } | null
  showMuzzle: boolean
  /** 'fit' fills the space; a number is a fixed scale (0.5 = the game's size) */
  zoom: 'fit' | number
  background: 'ground' | 'export'
}>()
const box = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const space = ref({ w: 0, h: 0 })

/** The empty sky above the tower is cut off: the shown part starts a little above its top */
const top = ref(70)
const cropH = computed(() => SPRITE_H - top.value)

/** Where the picture's topmost visible pixel is (in steps, so the view does not jump at every change) */
function measureTop(bitmap: ImageBitmap): number {
  const probe = new OffscreenCanvas(SPRITE_W, SPRITE_H)
  const ctx = probe.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, SPRITE_W, SPRITE_H)
  const alpha = ctx.getImageData(0, 0, SPRITE_W, SPRITE_H).data
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) if (alpha[(y * SPRITE_W + x) * 4 + 3] > 8) return Math.max(0, Math.floor((y - 24) / 32) * 32)
  }
  return 200
}

const scale = computed(() => {
  if (props.zoom !== 'fit') return props.zoom
  // As big as the space allows; the sharp picture keeps it crisp up to twice the size
  return Math.min(4, Math.max(0.25, Math.min((space.value.w - 48) / SPRITE_W, (space.value.h - 48) / cropH.value)))
})

function draw(): void {
  const c = canvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const k = scale.value
  const TOP = top.value
  const CROP_H = cropH.value
  c.style.width = `${SPRITE_W * k}px`
  c.style.height = `${CROP_H * k}px`
  c.width = Math.round(SPRITE_W * k * dpr)
  c.height = Math.round(CROP_H * k * dpr)
  const ctx = c.getContext('2d')!
  const px = k * dpr
  ctx.setTransform(px, 0, 0, px, 0, 0)
  ctx.clearRect(0, 0, SPRITE_W, CROP_H)
  if (props.background === 'ground') {
    const cy = FACE_CENTER_Y - TOP
    ctx.fillStyle = '#4c6b3c'
    ctx.strokeStyle = '#6d8f55'
    ctx.lineWidth = 1.5 / k
    ctx.beginPath()
    ctx.moveTo(FACE_HALF_W, cy - FACE_HALF_H)
    ctx.lineTo(SPRITE_W, cy)
    ctx.lineTo(FACE_HALF_W, cy + FACE_HALF_H)
    ctx.lineTo(0, cy)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  if (!props.bitmap) return
  const source = props.hd ?? props.bitmap
  const ss = source.width / SPRITE_W
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, TOP * ss, SPRITE_W * ss, CROP_H * ss, 0, 0, SPRITE_W, CROP_H)
  if (props.showMuzzle && props.crown) {
    const mx = props.crown.x
    const my = props.crown.y - TOP
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.lineWidth = 1.5 / k
    ctx.beginPath()
    ctx.arc(mx, my, 6 / Math.sqrt(k), 0, Math.PI * 2)
    ctx.moveTo(mx - 12 / Math.sqrt(k), my)
    ctx.lineTo(mx - 3 / Math.sqrt(k), my)
    ctx.moveTo(mx + 3 / Math.sqrt(k), my)
    ctx.lineTo(mx + 12 / Math.sqrt(k), my)
    ctx.stroke()
  }
}

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    space.value = { w: entry.contentRect.width, h: entry.contentRect.height }
  })
  if (box.value) observer.observe(box.value)
  draw()
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => props.bitmap, bitmap => {
  if (bitmap) top.value = measureTop(bitmap)
}, { immediate: true })
watch(() => [props.bitmap, props.hd, props.crown, props.showMuzzle, props.background, scale.value, top.value], draw)
</script>

<template>
  <div ref="box" class="flex h-full w-full items-center justify-center overflow-auto">
    <div class="rounded-xl transition-shadow duration-300" :class="background === 'export' ? 'checker shadow-[0_0_0_1px_rgb(255_255_255/0.08)]' : ''">
      <canvas ref="canvas" class="block" />
    </div>
  </div>
</template>
