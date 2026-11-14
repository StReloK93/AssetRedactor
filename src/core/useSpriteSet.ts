import { onBeforeUnmount, ref, shallowRef, toRaw, watch } from 'vue'
import type { BuiltSprite, WorkerRequest, WorkerResponse } from './spriteWorker'

export type ExportState = { status: 'idle' | 'busy' | 'done' | 'error'; message: string }

/** Settings saved in the browser over the defaults (`merge` puts them together, so a setting added later keeps its default) */
export function loadSettings<S>(storageKey: string, defaults: S, merge: (defaults: S, saved: Partial<S>) => S): S {
  const fresh = structuredClone(defaults)
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<S> | null
    return saved ? merge(fresh, saved) : fresh
  } catch {
    return fresh
  }
}

/** How long the settings must rest before they are saved in the browser */
const SAVE_MS = 400
/** ...and on disk (saves/ in the project) */
const DISK_SAVE_MS = 1500

/**
 * The page side of a studio: sends the (reactive) settings to its worker on every change, keeps the sprites it
 * sends back, remembers the settings (in the browser, and on disk in saves/) and writes the set into the game's
 * sprite folder. `focus` names the sprite being edited: the worker builds it first.
 */
export function useSpriteSet<S extends object, M>(
  worker: Worker,
  settings: S,
  storageKey: string,
  focus?: () => string | undefined,
  /** Puts saved settings (from disk, when the browser has none) into place */
  restore?: (saved: Partial<S>) => void,
) {
  const sprites = shallowRef<BuiltSprite<M>[]>([])
  /** Something is still being built */
  const building = ref(false)
  /** A change was sent and the worker has not answered it yet */
  const pending = ref(false)
  const exportState = ref<ExportState>({ status: 'idle', message: '' })

  const send = (message: WorkerRequest<S>) => worker.postMessage(message)
  let requestId = 0
  let onExported: ((files: { name: string; dataUrl: string }[]) => void) | null = null
  /** The latest picture of every sprite; the worker only sends a picture when it changed */
  const pictures = new Map<string, ImageBitmap>()
  const hdPictures = new Map<string, ImageBitmap>()

  worker.onmessage = (event: MessageEvent<WorkerResponse<M>>) => {
    const message = event.data
    if (message.type === 'exported') {
      onExported?.(message.files)
      return
    }
    // Pictures from an older request are still the newest ones of their sprites: keep them
    let replaced = false
    for (const s of message.sprites) {
      if (s.hdBitmap) {
        hdPictures.get(s.name)?.close()
        hdPictures.set(s.name, s.hdBitmap)
        replaced = true
      }
      if (!s.bitmap) continue
      pictures.get(s.name)?.close()
      pictures.set(s.name, s.bitmap)
      replaced = true
    }
    if (message.id !== requestId) {
      // The list must not keep a picture that was just closed
      if (replaced) sprites.value = sprites.value.map(s => ({ ...s, bitmap: pictures.get(s.name) ?? s.bitmap, hd: s.hd && hdPictures.get(s.name) }))
      return
    }
    const names = new Set(message.sprites.map(s => s.name))
    for (const [name, bitmap] of pictures) {
      if (names.has(name)) continue
      bitmap.close()
      pictures.delete(name)
    }
    // A sharper picture of settings that changed since is dropped
    for (const s of message.sprites) {
      if (s.hd || !hdPictures.has(s.name)) continue
      hdPictures.get(s.name)!.close()
      hdPictures.delete(s.name)
    }
    sprites.value = message.sprites.flatMap(s => {
      const bitmap = pictures.get(s.name)
      return bitmap ? [{ name: s.name, meta: s.meta, quality: s.quality, bitmap, hd: hdPictures.get(s.name) }] : []
    })
    pending.value = false
    if (message.done) building.value = false
  }
  onBeforeUnmount(() => {
    worker.terminate()
    for (const bitmap of pictures.values()) bitmap.close()
    for (const bitmap of hdPictures.values()) bitmap.close()
  })

  function rebuild(): void {
    building.value = true
    pending.value = true
    send({ type: 'build', id: ++requestId, settings: structuredClone(toRaw(settings)) as S, focus: focus?.() })
  }

  // A slider fires many changes a frame: send one request per frame, save once they rest
  let frame = 0
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let diskTimer: ReturnType<typeof setTimeout> | undefined
  /** Changes not yet in the browser's storage / not yet on disk */
  let unsaved = false
  let unsavedOnDisk = false
  /** Where the work is kept: 'saved' once it is on disk too */
  const saveState = ref<'saved' | 'saving' | 'browser-only'>('saved')

  function saveToBrowser(): void {
    clearTimeout(saveTimer)
    if (!unsaved) return
    unsaved = false
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings))
    } catch {
      // Storage may be unavailable (private window): the disk copy still keeps it
    }
  }
  /** The settings into saves/<key>.json through the studio's server, so they outlive the browser's storage */
  async function saveToDisk(keepalive = false): Promise<void> {
    clearTimeout(diskTimer)
    if (!unsavedOnDisk) return
    unsavedOnDisk = false
    saveState.value = 'saving'
    try {
      const response = await fetch(`/api/save?name=${encodeURIComponent(storageKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
        keepalive,
      })
      if (!response.ok) throw new Error(response.statusText)
      if (!unsavedOnDisk) saveState.value = 'saved'
    } catch {
      // No server (a built copy): the browser's storage still has it
      if (!unsavedOnDisk) saveState.value = 'browser-only'
    }
  }
  /** Everything not saved yet, now (the page is closing or reloading) */
  function flush(): void {
    saveToBrowser()
    if (unsavedOnDisk) void saveToDisk(true)
  }
  window.addEventListener('pagehide', flush)
  const onHidden = () => document.visibilityState === 'hidden' && flush()
  document.addEventListener('visibilitychange', onHidden)
  onBeforeUnmount(() => {
    flush()
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onHidden)
  })

  watch(settings, () => {
    pending.value = true
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0
        rebuild()
      })
    }
    unsaved = true
    unsavedOnDisk = true
    saveState.value = 'saving'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveToBrowser, SAVE_MS)
    clearTimeout(diskTimer)
    diskTimer = setTimeout(() => void saveToDisk(), DISK_SAVE_MS)
  }, { deep: true })
  rebuild()

  let inBrowser = false
  try {
    inBrowser = localStorage.getItem(storageKey) !== null
  } catch {
    // No storage
  }
  if (inBrowser) {
    // Work the browser has goes to disk once at the start too (a set made before disk saves existed gets its copy)
    unsavedOnDisk = true
    void saveToDisk()
  } else if (restore) {
    // The browser has nothing (another browser, cleared data): bring back the disk's copy, never overwrite it
    void fetch(`/api/save?name=${encodeURIComponent(storageKey)}`)
      .then(response => (response.ok ? response.json() : null))
      .then(saved => {
        if (saved && typeof saved === 'object') restore(saved as Partial<S>)
      })
      .catch(() => {})
  }

  /** Every sprite of the set into the game's sprite folder (the worker encodes the PNGs) */
  async function exportToGame(): Promise<void> {
    exportState.value = { status: 'busy', message: '' }
    const files = await new Promise<{ name: string; dataUrl: string }[]>(resolve => {
      onExported = resolve
      send({ type: 'export' })
    })
    onExported = null
    try {
      const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) })
      const result = await response.json() as { written?: number; dir?: string; error?: string }
      exportState.value = response.ok
        ? { status: 'done', message: `${result.written} ta fayl yozildi: ${result.dir}` }
        : { status: 'error', message: result.error ?? response.statusText }
    } catch (error) {
      exportState.value = { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Tells the worker which sprite is now in focus (it makes that one's sharper preview) */
  function refocus(): void {
    send({ type: 'build', id: ++requestId, settings: structuredClone(toRaw(settings)) as S, focus: focus?.() })
  }

  return { sprites, building, pending, exportState, exportToGame, refocus, saveState }
}
