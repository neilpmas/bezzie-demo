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
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>()

    const auth = createBezzie({
      ...providers.auth0(env.AUTH0_DOMAIN),
      clientId: env.AUTH0_CLIENT_ID,
      clientSecret: env.AUTH0_CLIENT_SECRET,
      audience: env.AUTH0_AUDIENCE,
      adapter: cloudflareKV(env.SESSION_KV),
      baseUrl: env.APP_BASE_URL,
    })

    // Mount auth routes
    app.route('/auth', auth.routes())

    // GET /api/user — public, returns user if logged in or null
    // Used by the frontend nav to conditionally show the username
    app.get('/api/user', auth.optionalMiddleware(), (c) => {
      return c.json({ user: c.var.user ?? null })
    })

    // GET /api/me — protected, proxies to upstream with Authorization: Bearer
    app.get('/api/me', auth.middleware(), async (c) => {
      const res = await fetch(`${c.env.UPSTREAM_URL}/api/me`, {
        headers: {
          Authorization: c.req.header('Authorization') ?? '',
        },
      })
      const data = await res.json()
      return c.json(data, res.status as any)
    })

    return app.fetch(request, env, ctx)
  }
}
