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
    return <div>Loading...</div>
  }

  if (path === '/dashboard') {
    if (!user) return null // Redirecting

    return (
      <div style={{ padding: '2rem' }}>
        <nav>
          <a href="/">Home</a>
        </nav>
        <h1>Welcome, {user.name || user.email || user.sub}</h1>
        <p>This is your protected dashboard.</p>

        <h3>Upstream Data (from /api/me):</h3>
        {upstreamError ? (
          <p style={{ color: 'red' }}>Failed to load upstream data: {upstreamError}</p>
        ) : (
          <pre>{JSON.stringify(upstreamData, null, 2)}</pre>
        )}

        <details style={{ marginTop: '2rem', fontSize: '0.85rem', color: '#666' }}>
          <summary>No JWT in your browser — verify it</summary>
          <p style={{ marginTop: '0.5rem' }}>
            Open DevTools → Application → Cookies → localhost. You should see only{' '}
            <code>__Host-session</code>. No access token. No JWT. That&apos;s bezzie working
            correctly — tokens stay in the Worker, never in the browser.
          </p>
        </details>

        <form method="POST" action="/auth/logout" style={{ marginTop: '1rem' }}>
          <button type="submit">Logout</button>
        </form>
      </div>
    )
  }

  // Landing page (path === '/')
  return (
    <div style={{ padding: '2rem' }}>
      <nav>
        {user && <span>Hello, {user.name || user.email || user.sub}</span>}
      </nav>
      <h1>bezzie demo</h1>
      <p>A BFF OAuth 2.0 auth library for Cloudflare Workers.</p>
      <p>
        Available on npm:{' '}
        <a href="https://www.npmjs.com/package/bezzie" target="_blank" rel="noreferrer">
          npmjs.com/package/bezzie
        </a>
      </p>
      {user ? (
        <a href="/dashboard">
          <button>Go to dashboard</button>
        </a>
      ) : (
        <a
          href="/auth/login?returnTo=/dashboard"
          onClick={() => setLoginLoading(true)}
        >
          <button disabled={loginLoading}>
            {loginLoading ? 'Redirecting...' : 'Login'}
          </button>
        </a>
      )}
    </div>
  )
}
