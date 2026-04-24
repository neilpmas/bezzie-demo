import { useEffect, useState } from 'react'

type User = {
  name?: string
  email?: string
  sub: string
  [key: string]: unknown
}

type ApiUserResponse = {
  user: User | null
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [upstreamData, setUpstreamData] = useState<unknown>(null)
  const [upstreamError, setUpstreamError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const path = window.location.pathname

  useEffect(() => {
    fetch('/api/user')
      .then((res) => res.json())
      .then((data: ApiUserResponse) => {
        setUser(data.user)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (path === '/dashboard' && !loading) {
      if (!user) {
        window.location.href = '/auth/login?returnTo=/dashboard'
        return
      }

      fetch('/api/me')
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
          return res.json()
        })
        .then((data) => setUpstreamData(data))
        .catch((err: Error) => setUpstreamError(err.message))
    }
  }, [path, user, loading])

  if (loading) {
    return <div className="loading">Loading…</div>
  }

  if (path === '/dashboard') {
    if (!user) return null

    const displayName = user.name || user.email || user.sub

    return (
      <>
        <nav className="nav">
          <div className="nav-inner">
            <a href="/" className="nav-logo">bezzie<span>.</span>demo</a>
            <ul className="nav-links">
              <li><a href="/">Home</a></li>
            </ul>
            <span className="nav-user">{displayName}</span>
          </div>
        </nav>

        <main className="page">
          <div className="section">
            <p className="welcome-subtitle">Your protected dashboard</p>
            <h1 className="welcome-title">Welcome back, {user.name?.split(' ')[0] || displayName}</h1>
          </div>

          <div className="section">
            <h2 className="section-title">Upstream API response</h2>
            {upstreamError ? (
              <div className="callout callout-error">
                <p className="callout-title">Upstream request failed</p>
                <p>{upstreamError}</p>
              </div>
            ) : upstreamData ? (
              <>
                <div className="callout callout-info" style={{ marginBottom: 'var(--space-4)' }}>
                  <p className="callout-title">Token injected by the Worker</p>
                  <p>
                    bezzie validated your session cookie, fetched a fresh access token from KV, and
                    attached it as <code>Authorization: Bearer …</code> before forwarding this
                    request. The upstream API verified the JWT — no token ever touched the browser.
                  </p>
                </div>
                <div className="code-block">
                  <pre>{JSON.stringify(upstreamData, null, 2)}</pre>
                </div>
              </>
            ) : (
              <div className="callout callout-info">
                <p>Loading upstream data…</p>
              </div>
            )}

            <details className="devtools-hint">
              <summary>Verify: no JWT in your browser</summary>
              <div className="devtools-hint-body">
                <p>
                  Open DevTools → Application → Cookies → localhost. You should see only{' '}
                  <code>__Host-session</code>. No access token. No JWT. That&apos;s bezzie
                  working correctly — tokens live in the Worker&apos;s KV store, never in the
                  browser.
                </p>
              </div>
            </details>
          </div>

          <div className="section">
            <form method="POST" action="/auth/logout">
              <button type="submit" className="btn btn-ghost">Logout</button>
            </form>
          </div>
        </main>
      </>
    )
  }

  // Landing page
  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <a href="/" className="nav-logo">bezzie<span>.</span>demo</a>
          <ul className="nav-links">
            <li>
              <a href="https://www.npmjs.com/package/bezzie" target="_blank" rel="noreferrer">
                npm
              </a>
            </li>
            <li>
              <a href="https://github.com/neilpmas/bezzie" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </li>
          </ul>
          {user && (
            <span className="nav-user">{user.name || user.email || user.sub}</span>
          )}
        </div>
      </nav>

      <main className="page">
        <div className="hero">
          <p className="hero-eyebrow">BFF OAuth for Cloudflare Workers</p>
          <h1 className="hero-title">
            Tokens in the Worker,{' '}
            <span className="hero-title-gradient">not the browser</span>
          </h1>
          <p className="hero-subtitle">
            bezzie implements the BFF pattern — your Cloudflare Worker owns the OAuth flow and
            holds JWTs in KV. The browser gets an HttpOnly session cookie and nothing else.
          </p>
          <div className="hero-actions">
            {user ? (
              <a href="/dashboard" className="btn btn-primary">Go to dashboard</a>
            ) : (
              <a
                href="/auth/login?returnTo=/dashboard"
                className="btn btn-primary"
                onClick={() => setLoginLoading(true)}
                aria-disabled={loginLoading}
              >
                {loginLoading ? 'Redirecting…' : 'Login'}
              </a>
            )}
            <a
              href="https://www.npmjs.com/package/bezzie"
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
            >
              View on npm
            </a>
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">How it works</h2>
          <div className="grid-2">
            <div className="card">
              <p className="card-label">The problem</p>
              <h3 className="card-title">SPAs put tokens in the browser</h3>
              <p className="card-body">
                A typical SPA stores the access token in memory or localStorage — exposed to
                any XSS on your page, and visible in DevTools to anyone with physical access.
              </p>
            </div>
            <div className="card">
              <p className="card-label">The solution</p>
              <h3 className="card-title">bezzie keeps them in the Worker</h3>
              <p className="card-body">
                The Worker exchanges the auth code, stores tokens in Cloudflare KV, and sets
                an HttpOnly cookie. The browser never sees a JWT — not even in DevTools.
              </p>
            </div>
            <div className="card">
              <p className="card-label">Session</p>
              <h3 className="card-title">HttpOnly + __Host- prefix</h3>
              <p className="card-body">
                The session cookie uses the <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>__Host-</code> prefix,
                enforcing Secure, no Domain, and path=/ — the strictest cookie posture available.
              </p>
            </div>
            <div className="card">
              <p className="card-label">Upstream</p>
              <h3 className="card-title">Bearer token injected by the Worker</h3>
              <p className="card-body">
                When the browser calls <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>/api/*</code>, the Worker validates the
                session, fetches the access token from KV, and forwards the request with{' '}
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>Authorization: Bearer …</code>.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
