/// <reference lib="webworker" />
import { serveSprites } from '../core/spriteWorker'
import { groundTasks } from './tiles'

/** Builds the ground set off the main thread (see serveSprites) */
serveSprites(groundTasks)
