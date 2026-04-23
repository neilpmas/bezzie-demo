import { Hono } from 'hono'
import { createBezzie, providers, cloudflareKV } from 'bezzie'
import type { Variables } from 'bezzie'

type Env = {
  AUTH0_DOMAIN: string
  AUTH0_CLIENT_ID: string
  AUTH0_CLIENT_SECRET: string
  AUTH0_AUDIENCE: string
  APP_BASE_URL: string
  UPSTREAM_URL: string
  SESSION_KV: KVNamespace
  ASSETS: Fetcher  // add this
}


export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const auth = createBezzie({
      ...providers.auth0(env.AUTH0_DOMAIN),
      clientId: env.AUTH0_CLIENT_ID,
      clientSecret: env.AUTH0_CLIENT_SECRET,
      audience: env.AUTH0_AUDIENCE,
      adapter: cloudflareKV(env.SESSION_KV),
      baseUrl: env.APP_BASE_URL,
    })

    const app = new Hono<{ Bindings: Env; Variables: Variables }>()

    app.route('/auth', auth.routes())

    app.get('/api/user', auth.optionalMiddleware(), (c) => {
      return c.json({ user: c.var.user ?? null })
    })

    app.get('/api/me', auth.middleware(), async (c) => {
      const res = await fetch(`${env.UPSTREAM_URL}/api/me`, {
        headers: {
          Authorization: `Bearer ${c.var.accessToken}`,
        },
      })
      const data = await res.json()
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    })
// Catch-all: delegate to static assets (serves index.html for unknown paths)
    app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

    return app.fetch(request, env, ctx)
  }
}
