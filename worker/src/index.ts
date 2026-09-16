import { Hono } from 'hono'
import { createBezzie, providers, cloudflareKVAdapter } from 'bezzie'
import type { Bezzie, Variables } from 'bezzie'

type Env = {
  AUTH0_DOMAIN: string
  AUTH0_CLIENT_ID: string
  AUTH0_CLIENT_SECRET: string
  AUTH0_AUDIENCE: string
  APP_BASE_URL: string
  UPSTREAM_URL: string
  SESSION_KV: KVNamespace
  ASSETS: Fetcher
}

// Module-scope singleton so bezzie's internal discovery cache actually
// persists across requests on a warm isolate, instead of every request
// paying for a fresh OIDC discovery fetch — which matters now that
// cspContributions() below calls it on every request too.
let auth: Bezzie<Record<string, unknown>> | undefined

function getAuth(env: Env): Bezzie<Record<string, unknown>> {
  if (!auth) {
    auth = createBezzie({
      ...providers.auth0(env.AUTH0_DOMAIN),
      clientId: env.AUTH0_CLIENT_ID,
      clientSecret: env.AUTH0_CLIENT_SECRET,
      audience: env.AUTH0_AUDIENCE,
      adapter: cloudflareKVAdapter(env.SESSION_KV),
      baseUrl: env.APP_BASE_URL,
      defaultReturnTo: '/dashboard',
      // __Host- cookies need HTTPS; production always uses it, but local
      // dev runs on plain http://localhost. Without this, the CSRF/session
      // cookies get the __Host- prefix anyway and become unreliable
      // (browser-dependent) over HTTP.
      secureCookies: env.APP_BASE_URL.startsWith('https://'),
    })
  }
  return auth
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const auth = getAuth(env)

    const app = new Hono<{ Bindings: Env; Variables: Variables }>()

    // App-wide CSP, merged with the origins bezzie's OIDC discovery says the
    // login flow needs (auth.routes() below merges its own frame-ancestors
    // requirement into this rather than replacing it — see bezzie's README
    // Security section).
    app.use('*', async (c, next) => {
      const contributions = await auth.cspContributions()
      // Union each directive rather than letting one side overwrite the
      // other — bezzie's empty connect-src/frame-src mean "the login flow
      // doesn't need this," not "the app doesn't need this." The app's own
      // connect-src 'self' (for its same-origin /api/* fetches) must survive
      // regardless of what bezzie contributes.
      const csp: Record<string, string[]> = {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'"],
        'connect-src': ["'self'"],
      }
      for (const [directive, sources] of Object.entries(contributions)) {
        csp[directive] = [...new Set([...(csp[directive] ?? []), ...sources])]
      }
      const header = Object.entries(csp)
        .map(([directive, sources]) => `${directive} ${sources.join(' ')}`.trim())
        .join('; ')
      c.header('Content-Security-Policy', header)
      await next()
    })

    app.route('/auth', auth.routes())

    app.get('/api/user', auth.optionalMiddleware(), (c) => {
      return c.json({ user: c.var.user ?? null })
    })

    // Rate-limited on top of auth.middleware() — this route makes a real
    // request to the upstream on every call, keyed on the authenticated
    // user rather than IP (auth.rateLimiter() defaults to c.var.user.sub).
    app.get('/api/me', auth.middleware(), auth.rateLimiter({ limit: 30, windowSeconds: 60 }), async (c) => {
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
    app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

    return app.fetch(request, env, ctx)
  }
}
