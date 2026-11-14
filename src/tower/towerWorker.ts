/// <reference lib="webworker" />
import { serveSprites } from '../core/spriteWorker'
import { towerTasks } from './tasks'

/** Builds the tower set off the main thread (see serveSprites) */
serveSprites(towerTasks)
