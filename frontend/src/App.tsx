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
  const [upstreamData, setUpstreamData] = useState<any>(null)
  const path = window.location.pathname

  useEffect(() => {
    fetch('/api/user')
      .then((res) => res.json())
      .then((data: ApiUserResponse) => {
        setUser(data.user)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to fetch user', err)
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
        .then((res) => res.json())
        .then((data) => setUpstreamData(data))
        .catch((err) => console.error('Failed to fetch upstream data', err))
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
        <pre>{JSON.stringify(upstreamData, null, 2)}</pre>
        <form method="POST" action="/auth/logout">
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
      {user ? (
        <a href="/dashboard">
          <button>Go to dashboard</button>
        </a>
      ) : (
        <a href="/auth/login?returnTo=/dashboard">
          <button>Login</button>
        </a>
      )}
    </div>
  )
}
