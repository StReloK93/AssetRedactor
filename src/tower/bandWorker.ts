/// <reference lib="webworker" />
import type { TowerDef } from './model'
import { renderTower, type RenderOptions } from './render'
import { buildScene, type Scene } from './scene'

/** A helper of the tower worker: draws one band (a run of rows) of a tower's picture. Several of these draw one picture together. */
export interface BandRequest {
  job: number
  def: TowerDef
  options: RenderOptions
}
export interface BandResponse {
  job: number
  pixels: Uint8ClampedArray
}

const scope = self as unknown as DedicatedWorkerGlobalScope
/** The bands of one picture come one after another: its scene is made once */
let lastKey = ''
let lastScene: Scene | null = null

scope.onmessage = (event: MessageEvent<BandRequest>) => {
  const { job, def, options } = event.data
  const key = JSON.stringify(def)
  if (key !== lastKey || !lastScene) {
    lastScene = buildScene(def)
    lastKey = key
  }
  const pixels = renderTower(lastScene, options)
  const response: BandResponse = { job, pixels }
  scope.postMessage(response, [pixels.buffer])
}
