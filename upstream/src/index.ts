import { createRemoteJWKSet, jwtVerify } from 'jose'

type Env = {
  AUTH0_DOMAIN: string
  AUTH0_AUDIENCE: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/me' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization')

      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const token = authHeader.slice(7)
      const JWKS = createRemoteJWKSet(
        new URL(`https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`)
      )

      try {
        await jwtVerify(token, JWKS, {
          issuer: `https://${env.AUTH0_DOMAIN}/`,
          audience: env.AUTH0_AUDIENCE,
        })
      } catch {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(
        JSON.stringify({
          message: 'Hello from the upstream API',
          timestamp: new Date().toISOString(),
          receivedAuthorization: true,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response('Not Found', { status: 404 })
  },
}
