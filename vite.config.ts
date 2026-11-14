import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/** A sprite file name the export may write: lower-case letters, digits and underscores, .png */
const SAFE_NAME = /^[a-z0-9_]+\.png$/

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => (body += chunk))
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

/**
 * POST /api/export { files: [{ name, dataUrl }] }: writes the PNGs into FORGE_EXPORT_DIR (the game's sprite
 * folder). Only plain file names are accepted, so nothing can be written outside that folder.
 */
function exportPlugin(exportDir: string): Plugin {
  return {
    name: 'isoforge-export',
    configureServer(server) {
      server.middlewares.use('/api/export', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        try {
          const { files } = JSON.parse(await readBody(req)) as { files: { name: string; dataUrl: string }[] }
          if (!fs.existsSync(exportDir)) throw new Error(`Export folder not found: ${exportDir}`)
          for (const file of files) {
            if (!SAFE_NAME.test(file.name)) throw new Error(`Bad file name: ${file.name}`)
            const base64 = file.dataUrl.replace(/^data:image\/png;base64,/, '')
            fs.writeFileSync(path.join(exportDir, file.name), Buffer.from(base64, 'base64'))
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ written: files.length, dir: exportDir }))
        } catch (error) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
      })
    },
  }
}

/** A save's name: the studio's storage key (letters, digits, dots, dashes) */
const SAFE_SAVE = /^[a-z0-9.-]+$/i
/** How many dated copies of each save are kept (one a day) */
const KEEP_DAYS = 14

/**
 * POST /api/save?name=<key> { ... }: the studio's settings into saves/<key>.json in the project, so the work
 * outlives the browser's storage. The first save of a day also goes into saves/<key>.<date>.json (the last
 * two weeks are kept), so an older state can always be opened again.
 */
function savePlugin(saveDir: string): Plugin {
  return {
    name: 'isoforge-save',
    configureServer(server) {
      server.middlewares.use('/api/save', async (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? ''
        // GET: the save, to bring back work the browser no longer has
        if (req.method === 'GET' && SAFE_SAVE.test(name)) {
          const file = path.join(saveDir, `${name}.json`)
          if (!fs.existsSync(file)) {
            res.statusCode = 404
            res.end()
            return
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(fs.readFileSync(file))
          return
        }
        if (req.method !== 'POST' || !SAFE_SAVE.test(name)) {
          res.statusCode = 400
          res.end()
          return
        }
        try {
          const body = await readBody(req)
          JSON.parse(body)
          fs.mkdirSync(saveDir, { recursive: true })
          const tmp = path.join(saveDir, `${name}.json.tmp`)
          fs.writeFileSync(tmp, body)
          fs.renameSync(tmp, path.join(saveDir, `${name}.json`))
          const day = new Date().toISOString().slice(0, 10)
          const dated = path.join(saveDir, `${name}.${day}.json`)
          if (!fs.existsSync(dated)) {
            fs.writeFileSync(dated, body)
            const old = fs.readdirSync(saveDir).filter(f => f.startsWith(`${name}.`) && /\.\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
            for (const f of old.slice(0, Math.max(0, old.length - KEEP_DAYS))) fs.unlinkSync(path.join(saveDir, f))
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (error) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const exportDir = path.resolve(env.FORGE_EXPORT_DIR || '../Generator/src/assets/sprites')
  return {
    plugins: [vue(), tailwindcss(), exportPlugin(exportDir), savePlugin(path.resolve('saves'))],
    // The tower worker starts helper workers of its own
    worker: { format: 'es' },
    // Saving into saves/ must not reload the page
    server: { watch: { ignored: ['**/saves/**'] } },
  }
})
