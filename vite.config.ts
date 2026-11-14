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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const exportDir = path.resolve(env.FORGE_EXPORT_DIR || '../Generator/src/assets/sprites')
  return {
    plugins: [vue(), tailwindcss(), exportPlugin(exportDir)],
  }
})
