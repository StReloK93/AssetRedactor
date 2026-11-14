/// <reference lib="webworker" />
import { serveSprites } from '../core/spriteWorker'
import type { TowerProject } from './model'
import { RenderPool } from './renderPool'
import { towerTasks, type TowerMeta } from './tasks'

/** Builds the tower set off the main thread (see serveSprites), every picture drawn on all cores */
const pool = new RenderPool()
serveSprites<TowerProject, TowerMeta>(set => towerTasks(set, pool), {
  // A newer request: pictures nobody needs any more are dropped at once
  onRequest: (tasks, focus) => pool.retain(new Set(tasks.map(t => t.key)), tasks.find(t => t.name === focus)?.key),
})
