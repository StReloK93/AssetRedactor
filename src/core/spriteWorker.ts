/// <reference lib="webworker" />

/**
 * The worker side of a studio: builds a set of sprites off the main thread, so the studio never freezes.
 * Sprites are kept by key (a key is exactly what a sprite depends on): a change rebuilds only the sprites it
 * touches. A slow sprite may have a quick draft: every changed sprite gets its draft first, then its final
 * picture, the one in focus (the one being edited) always first. A newer request stops an older one between
 * sprites, so dragging a slider only ever finishes the last position.
 */

export interface SpriteTask<M> {
  name: string
  key: string
  meta: M
  build: () => OffscreenCanvas
  /** A quicker, rougher picture shown until `build` is done */
  draft?: () => OffscreenCanvas
  /** A sharper, bigger picture for the preview only, made for the sprite in focus once it is final */
  hd?: () => OffscreenCanvas
}

/** final: done; draft: the quick picture so far; stale: still the picture of the settings before */
export type SpriteQuality = 'final' | 'draft' | 'stale'

export interface BuiltSprite<M> {
  name: string
  meta: M
  bitmap: ImageBitmap
  quality: SpriteQuality
  /** The sharper preview picture, when there is one for the current settings */
  hd?: ImageBitmap
}

/** A sprite as the worker reports it: its picture only when that changed since the last report */
export interface SpriteState<M> {
  name: string
  meta: M
  quality: SpriteQuality
  bitmap?: ImageBitmap
  /** There is a sharper preview picture for the current settings; sent when it is new */
  hd: boolean
  hdBitmap?: ImageBitmap
}

export type WorkerRequest<S> =
  | { type: 'build'; id: number; settings: S; focus?: string }
  | { type: 'export' }

export type WorkerResponse<M> =
  | { type: 'built'; id: number; done: boolean; sprites: SpriteState<M>[] }
  | { type: 'exported'; files: { name: string; dataUrl: string }[] }

/** How often a slow build shows what it has so far */
const PROGRESS_MS = 250
/**
 * How long the settings must stay still before the final pictures start. A final picture cannot be stopped
 * half way, so starting one while a slider is still moving would hold up the next draft.
 */
const SETTLE_MS = 400

export function serveSprites<S, M>(tasksFor: (settings: S) => SpriteTask<M>[]): void {
  const scope = self as unknown as DedicatedWorkerGlobalScope
  const cache = new Map<string, OffscreenCanvas>()
  const drafts = new Map<string, OffscreenCanvas>()
  /** The last picture made under each name: stands in for a sprite until its rebuild is done */
  const lastByName = new Map<string, OffscreenCanvas>()
  let latest = 0
  let current: SpriteTask<unknown>[] = []

  /** Give queued messages (a newer request) a chance to arrive */
  const breathe = () => new Promise(resolve => setTimeout(resolve, 0))

  /** The picture last sent under each name: only changed pictures are sent again */
  const sent = new Map<string, OffscreenCanvas>()
  const hdCache = new Map<string, OffscreenCanvas>()
  const sentHd = new Map<string, OffscreenCanvas>()

  async function post(id: number, tasks: SpriteTask<M>[], done: boolean): Promise<void> {
    const sprites: SpriteState<M>[] = await Promise.all(tasks.map(async t => {
      const canvas = cache.get(t.key) ?? drafts.get(t.key) ?? lastByName.get(t.name)
      const quality: SpriteQuality = cache.has(t.key) ? 'final' : drafts.has(t.key) ? 'draft' : 'stale'
      const hdCanvas = hdCache.get(t.key)
      const state: SpriteState<M> = { name: t.name, meta: t.meta, quality, hd: !!hdCanvas }
      if (canvas && sent.get(t.name) !== canvas) {
        sent.set(t.name, canvas)
        state.bitmap = await createImageBitmap(canvas)
      }
      if (hdCanvas && sentHd.get(t.name) !== hdCanvas) {
        sentHd.set(t.name, hdCanvas)
        state.hdBitmap = await createImageBitmap(hdCanvas)
      }
      return state
    }))
    const response: WorkerResponse<M> = { type: 'built', id, done, sprites }
    scope.postMessage(response, sprites.flatMap(s => [s.bitmap, s.hdBitmap].filter((b): b is ImageBitmap => !!b)))
  }

  async function build(id: number, settings: S, focus?: string): Promise<void> {
    const tasks = tasksFor(settings)
    const focused = tasks.find(t => t.name === focus)
    const order = focused ? [focused, ...tasks.filter(t => t !== focused)] : tasks
    let lastPost = 0

    /** Builds one picture; false if a newer request came in meanwhile */
    const step = async (task: SpriteTask<M>, make: () => OffscreenCanvas, into: Map<string, OffscreenCanvas>) => {
      const canvas = make()
      into.set(task.key, canvas)
      lastByName.set(task.name, canvas)
      await breathe()
      if (id !== latest) return false
      // The one being edited shows at once, the rest now and then
      if (task === focused || performance.now() - lastPost > PROGRESS_MS) {
        await post(id, tasks, false)
        lastPost = performance.now()
      }
      return true
    }

    for (const task of order) {
      if (id !== latest) return
      if (task.draft && !cache.has(task.key) && !drafts.has(task.key) && !(await step(task, task.draft, drafts))) return
    }
    if (order.some(t => t.draft && !cache.has(t.key))) {
      await new Promise(resolve => setTimeout(resolve, SETTLE_MS))
      if (id !== latest) return
    }
    for (const task of order) {
      if (id !== latest) return
      if (!cache.has(task.key) && !(await step(task, task.build, cache))) return
    }
    if (id !== latest) return
    // The sharper preview of the sprite in focus (only that one is kept)
    if (focused?.hd && !hdCache.has(focused.key)) {
      hdCache.clear()
      hdCache.set(focused.key, focused.hd())
      await breathe()
      if (id !== latest) return
    }

    // Only this set's sprites stay in memory
    const keep = new Set(tasks.map(t => t.key))
    for (const key of cache.keys()) if (!keep.has(key)) cache.delete(key)
    drafts.clear()
    const names = new Set(tasks.map(t => t.name))
    for (const name of lastByName.keys()) if (!names.has(name)) lastByName.delete(name)
    for (const name of sent.keys()) if (!names.has(name)) sent.delete(name)
    for (const name of sentHd.keys()) if (!names.has(name)) sentHd.delete(name)
    current = tasks
    await post(id, tasks, true)
  }

  scope.onmessage = async (event: MessageEvent<WorkerRequest<S>>) => {
    const message = event.data
    if (message.type === 'build') {
      latest = message.id
      await build(message.id, message.settings, message.focus)
    } else {
      const files = await Promise.all(current.map(async t => ({ name: `${t.name}.png`, dataUrl: await toDataUrl(cache.get(t.key)!) })))
      const response: WorkerResponse<M> = { type: 'exported', files }
      scope.postMessage(response)
    }
  }
}

async function toDataUrl(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/png;base64,${btoa(binary)}`
}
