/// <reference lib="webworker" />
import { SPRITE_H, SPRITE_W } from '../core/format'
import type { BandRequest, BandResponse } from './bandWorker'
import type { TowerDef } from './model'
import { renderTower, spriteRegion, type RenderOptions } from './render'
import type { Scene } from './scene'

/** What a picture is for: the quick draft, the exported picture, the sharper preview */
export type PictureKind = 'draft' | 'final' | 'hd'

/** Thrown into a picture that is no longer wanted */
export class Cancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

interface Picture {
  id: string
  taskKey: string
  kind: PictureKind
  /** Newer pictures go first */
  priority: number
  def: TowerDef
  options: RenderOptions
  /** Bands not handed out yet, and bands handed out but not back */
  queued: [number, number][]
  out: number
  pixels: Uint8ClampedArray
  width: number
  promise: Promise<Uint8ClampedArray>
  resolve: (pixels: Uint8ClampedArray) => void
  reject: (error: Error) => void
}

/** The fewest rows a band has: smaller ones cost more in messages than they save */
const MIN_BAND_ROWS = 12

/**
 * Draws tower pictures on all of the computer's cores: a picture is cut into bands of rows, each drawn by one of
 * a few helper workers (bandWorker.ts), and put back together. The newest picture asked for goes first, and one
 * that is no longer wanted is dropped at once (a band already being drawn just finishes, a band is short).
 * Without workers inside workers it draws in place, one picture at a time.
 */
export class RenderPool {
  private readonly workers: Worker[] = []
  private readonly idle: Worker[] = []
  private readonly pictures = new Map<string, Picture>()
  /** Bands being drawn: job -> its picture and rows */
  private readonly jobs = new Map<number, { picture: Picture; rows: [number, number] }>()
  private nextJob = 0
  private priority = 0

  constructor() {
    if (typeof Worker === 'undefined') return
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4
    // One core stays for the page itself
    const size = Math.max(1, Math.min(12, cores - 1))
    try {
      for (let i = 0; i < size; i++) {
        const worker = new Worker(new URL('./bandWorker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<BandResponse>) => this.done(worker, event.data)
        this.workers.push(worker)
        this.idle.push(worker)
      }
    } catch {
      for (const worker of this.workers) worker.terminate()
      this.workers.length = 0
      this.idle.length = 0
    }
  }

  /** A tower's picture: the same picture asked for again is shared, and moves to the front */
  render(taskKey: string, kind: PictureKind, def: TowerDef, scene: Scene, options: RenderOptions): Promise<Uint8ClampedArray> {
    if (!this.workers.length) return Promise.resolve().then(() => renderTower(scene, options))
    const id = `${kind}|${taskKey}`
    const existing = this.pictures.get(id)
    if (existing) {
      existing.priority = ++this.priority
      return existing.promise
    }
    const scale = options.scale ?? 1
    const width = SPRITE_W * scale
    const height = SPRITE_H * scale
    const [, , y0, y1] = spriteRegion(scene, options.shadow)
    const top = y0 * scale
    const bottom = y1 * scale
    const count = Math.max(1, Math.min(this.workers.length * 3, Math.floor((bottom - top) / MIN_BAND_ROWS)))
    // A draft's bands start on even rows from the region's top (it casts one ray per 2 x 2 block)
    const even = kind === 'draft'
    const edges = [0]
    for (let k = 1; k < count; k++) {
      const y = top + ((bottom - top) * k) / count
      edges.push(even ? top + 2 * Math.round((y - top) / 2) : Math.round(y))
    }
    edges.push(height)
    const queued: [number, number][] = []
    for (let k = 0; k < count; k++) queued.push([edges[k], edges[k + 1]])

    let resolve!: Picture['resolve']
    let reject!: Picture['reject']
    const promise = new Promise<Uint8ClampedArray>((res, rej) => {
      resolve = res
      reject = rej
    })
    // A dropped picture's promise may have no one waiting on it any more
    promise.catch(() => {})
    const picture: Picture = {
      id,
      taskKey,
      kind,
      priority: ++this.priority,
      def,
      options,
      queued,
      out: 0,
      pixels: new Uint8ClampedArray(width * height * 4),
      width,
      promise,
      resolve,
      reject,
    }
    this.pictures.set(id, picture)
    this.dispatch()
    return promise
  }

  /** Drops every picture not for one of these sprites, and every sharper preview but the one of `hdKey` */
  retain(taskKeys: Set<string>, hdKey?: string): void {
    for (const picture of [...this.pictures.values()]) {
      if (taskKeys.has(picture.taskKey) && (picture.kind !== 'hd' || picture.taskKey === hdKey)) continue
      this.pictures.delete(picture.id)
      picture.reject(new Cancelled())
    }
  }

  private dispatch(): void {
    while (this.idle.length) {
      let next: Picture | undefined
      for (const picture of this.pictures.values()) {
        if (picture.queued.length && (!next || picture.priority > next.priority)) next = picture
      }
      if (!next) return
      const rows = next.queued.shift()!
      const worker = this.idle.pop()!
      const job = ++this.nextJob
      this.jobs.set(job, { picture: next, rows })
      next.out++
      const request: BandRequest = { job, def: next.def, options: { ...next.options, rows } }
      worker.postMessage(request)
    }
  }

  private done(worker: Worker, response: BandResponse): void {
    this.idle.push(worker)
    const job = this.jobs.get(response.job)
    this.jobs.delete(response.job)
    if (job && this.pictures.get(job.picture.id) === job.picture) {
      const picture = job.picture
      picture.pixels.set(response.pixels, job.rows[0] * picture.width * 4)
      picture.out--
      if (!picture.out && !picture.queued.length) {
        this.pictures.delete(picture.id)
        picture.resolve(picture.pixels)
      }
    }
    this.dispatch()
  }
}
