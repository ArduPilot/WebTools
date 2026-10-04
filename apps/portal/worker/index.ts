import assets from '../legacy-assets.json'

const base = import.meta.env.BASE_URL
const legacyAssets = new Set(assets)
const directories = new Set(['', 'Dev/', ...assets.filter(path => path.endsWith('/index.html')).map(path => path.slice(0, -10))])

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (base !== '/' && url.pathname === base.slice(0, -1)) {
      url.pathname = base
      return Response.redirect(url.href, 308)
    }
    if (!url.pathname.startsWith(base)) {
      return new Response('Not found', { status: 404 })
    }
    const path = url.pathname.slice(base.length)
    if (!path.endsWith('/') && directories.has(path + '/')) {
      url.pathname += '/'
      return Response.redirect(url.href, 308)
    }
    // Only these two listings use React. Missing tools/assets must stay 404s.
    const portal = ['', 'index.html', 'Dev/', 'Dev/index.html'].includes(path)
    const asset = portal ? 'index.html' : directories.has(path) ? path + 'index.html' : path
    const devModule = import.meta.env.DEV && (
      ['@vite/client', '@react-refresh', 'src/main.tsx', 'src/App.tsx', 'src/tools.tsx'].includes(path)
      || path.startsWith('node_modules/.vite/')
      || (path.startsWith('@fs/') && path.endsWith('/vite/dist/client/env.mjs'))
    )
    if (!portal && !legacyAssets.has(asset) && !path.startsWith('assets/') && !devModule) {
      return new Response('Not found', { status: 404 })
    }
    // The dev ASSETS binding runs through Vite's base middleware; built assets
    // are stored at the bundle root. Public routes use the same base in both.
    url.pathname = (import.meta.env.DEV ? base : '/') + asset
    return env.ASSETS.fetch(new Request(url, request))
  },
} satisfies ExportedHandler<Env>
