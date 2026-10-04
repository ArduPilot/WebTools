import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { UserConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { stageAssets, stagingDirectory } from './tooling/stage-assets.ts'

export default defineConfig(async ({ isPreview }): Promise<UserConfig> => {
  const prefix = process.env.PORTAL_BASE_PATH ?? '/'
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(prefix)) {
    throw new Error('PORTAL_BASE_PATH must be an absolute path, such as / or /Tools/WebTools/')
  }
  const base = prefix.endsWith('/') ? prefix : prefix + '/'
  if (!isPreview) await stageAssets()
  return {
    base,
    appType: 'mpa',
    publicDir: stagingDirectory,
    plugins: [react(), {
      name: 'portal-prefixed-html',
      configureServer(server) {
        // Vite has stripped the base by this point. Cloudflare's HTML lookup
        // restores originalUrl, so forward the path relative to the asset root.
        return () => server.middlewares.use((request, _response, next) => {
          if (request.url?.split('?')[0]?.endsWith('.html')) {
            request.originalUrl = request.url
          }
          next()
        })
      },
    }, cloudflare()],
  }
})
