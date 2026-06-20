# bezzie-demo

A reference app for [bezzie](https://github.com/neilpmas/bezzie) — a BFF (Backend for Frontend) OIDC auth library for Cloudflare Workers. Available on npm: [npmjs.com/package/bezzie](https://www.npmjs.com/package/bezzie).

**Live demo:** [bezzie-demo.neilmason.dev](https://bezzie-demo.neilmason.dev)

This is the fastest way to see bezzie working end to end: a real OAuth login, a session cookie, and an authenticated API call to an upstream service — with tokens that never touch the browser.

---

## What this is

A complete BFF auth flow built on bezzie and Auth0, in three parts:

- A **React frontend** (Vite) — public landing page + protected dashboard
- A **BFF Worker** — runs bezzie: handles the OAuth flow, issues a session cookie, proxies API calls with a Bearer token
- A **mock upstream API** (a second Worker) — validates the `Authorization: Bearer` token bezzie injects, against Auth0's JWKS

JWTs never reach the browser. The BFF Worker owns the tokens; the browser only ever holds an opaque session cookie.

```
Browser ──(session cookie)──▶ BFF Worker ──(Bearer token)──▶ Upstream API
                                  │  ▲
                                  ▼  │
                                 Auth0
```

Everything runs on the Cloudflare free tier.

### bezzie features this demo exercises

| Feature | Where |
|---|---|
| `auth.routes()` | Mounts `/auth/login`, `/auth/callback`, `/auth/logout` |
| `auth.middleware()` | Protects `/api/me` — 401s without a valid session, exposes `c.var.accessToken` |
| `auth.optionalMiddleware()` | `/api/user` — returns the user if logged in, `null` otherwise (used to render the nav) |
| `cloudflareKVAdapter` | Server-side session storage in Workers KV |
| `providers.auth0()` | Provider preset for endpoints, scopes, and PKCE |
| `defaultReturnTo: '/dashboard'` | Post-login redirect, so login links don't need `?returnTo=` |

---

## Project structure

```
bezzie-demo/
├── frontend/          React + Vite app (landing page + dashboard)
│   ├── src/           App.tsx, styles, tokens
│   └── dist/          build output (served by the BFF Worker)
├── worker/            BFF Worker — runs bezzie
│   ├── src/index.ts   routes, session cookie, API proxy
│   ├── wrangler.toml             local dev config (Auth0 vars, KV)
│   ├── wrangler.production.toml  deploy config (gitignored)
│   └── .dev.vars                 local secret (gitignored)
├── upstream/          Mock upstream API — a second Worker
│   ├── src/index.ts   validates Bearer tokens against Auth0 JWKS
│   └── wrangler.toml
└── deploy.sh          builds the frontend, deploys both Workers
```

The frontend builds to `frontend/dist`, which the BFF Worker serves as static assets. In production it's a single Worker serving both the UI and the auth/API routes.

---

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) — bundled per package; use `npx wrangler`, or `npm install -g wrangler` for a global install
- A free [Auth0](https://auth0.com) account
- A free [Cloudflare](https://cloudflare.com) account (only needed to deploy — not for local dev)

---

## Auth0 setup

You need two things in Auth0: an **Application** (for the OAuth flow) and an **API** (for the audience / access token).

### 1. Create an Application

1. Go to **Applications → Applications → Create Application**
2. Name: `bezzie-demo`
3. Type: **Regular Web Application**
4. Click **Create**

> **Why Regular Web Application and not Single Page Application?** Auth0's app type describes where the token exchange happens — not what the UI looks like. bezzie is a BFF: the *Worker* exchanges the auth code for tokens server-side using a client secret. That's a confidential client = Regular Web Application. A SPA type has no client secret and puts tokens in the browser, which is exactly what bezzie is designed to avoid.

On the **Settings** tab, fill in:

| Field | Value |
|---|---|
| Allowed Callback URLs | `http://localhost:8787/auth/callback` |
| Allowed Logout URLs | `http://localhost:8787` |
| Allowed Web Origins | `http://localhost:8787` |

Then:

- **Advanced Settings → Grant Types** — ensure **Refresh Token** is checked.
- **Refresh Token Rotation** (main Settings tab) — enable **Allow Refresh Token Rotation**. Leave Rotation Overlap Period at `0`.
- **Refresh Token Expiration** — enable both **Absolute Expiration** and **Idle Expiration**. Idle must be less than absolute (e.g. `2592000` = 30 days absolute, `1296000` = 15 days idle).

Save. Note your **Domain**, **Client ID**, and **Client Secret** — you'll need them below.

### 2. Create an API

This gives the access token an `audience` claim, which the upstream API validates.

1. Go to **Applications → APIs → Create API**
2. Name: `bezzie-demo`
3. Identifier (audience): `https://api.bezzie-demo.com` (any URL works — it just needs to match your config)
4. Click **Create**

> **Why do I need an API?** The upstream Worker validates the Bearer token's audience claim (`aud`) against this identifier. Without an API, Auth0 issues opaque access tokens that can't be verified as JWTs. The identifier doesn't have to be a real URL — it's just a string the BFF and upstream agree on.

---

## Local development

You'll run three processes: the upstream mock API, the BFF Worker, and (for the UI) either a one-off build or the Vite dev server.

### 1. Install dependencies

```sh
cd upstream  && npm install && cd ..
cd worker    && npm install && cd ..
cd frontend  && npm install && cd ..
```

### 2. Configure the upstream Worker

Open `upstream/wrangler.toml` and fill in your Auth0 values:

```toml
[vars]
AUTH0_DOMAIN   = "your-tenant.auth0.com"
AUTH0_AUDIENCE = "https://api.bezzie-demo.com"   # must match the API Identifier above
WORKER_ORIGIN  = "http://localhost:8787"          # the BFF Worker's URL — used to restrict CORS
```

### 3. Configure the BFF Worker

Create a KV namespace for local dev:

```sh
cd worker && npx wrangler kv namespace create SESSION_KV --preview
```

Copy the `preview_id` from the output into `worker/wrangler.toml`:

```toml
[[kv_namespaces]]
binding    = "SESSION_KV"
id         = ""   # fill in for production
preview_id = ""   # paste the preview_id from the command above
```

Fill in the non-secret Auth0 values in the same file:

```toml
[vars]
AUTH0_DOMAIN    = "your-tenant.auth0.com"
AUTH0_CLIENT_ID = "your-client-id"
AUTH0_AUDIENCE  = "https://api.bezzie-demo.com"
APP_BASE_URL    = "http://localhost:8787"
UPSTREAM_URL    = "http://localhost:8788"
```

Then put the **client secret** in `worker/.dev.vars` (gitignored — never committed):

```sh
cp worker/.dev.vars.example worker/.dev.vars
```

`.dev.vars` holds only the secret. Everything else lives in `wrangler.toml [vars]`:

```
AUTH0_CLIENT_SECRET=your-auth0-client-secret
```

> For production, set the secret with `wrangler secret put AUTH0_CLIENT_SECRET` — never put real secrets in `wrangler.toml`.

### 4. Build the frontend

The BFF Worker serves the React app as static files, so build it once:

```sh
cd frontend && npm run build && cd ..
```

### 5. Start the upstream mock API

In one terminal:

```sh
cd upstream && npm run dev
# http://localhost:8788
```

### 6. Start the BFF Worker

In another terminal:

```sh
cd worker && npm run dev
# http://localhost:8787
```

### 7. Open the app

Visit [http://localhost:8787](http://localhost:8787). You should see the landing page with a **Login** button.

---

## Testing the full flow

Work through these in order:

- [ ] **Landing page loads** — visit `http://localhost:8787`, see the landing page, no user in the nav
- [ ] **Login** — click Login, complete the Auth0 flow, land on `/dashboard` (via `defaultReturnTo`)
- [ ] **Dashboard** — see your name and the upstream API response
- [ ] **Upstream data** — the JSON block shows `"receivedAuthorization": true`
- [ ] **Nav on landing page** — go back to `/`; your name appears in the nav (`optionalMiddleware` working)
- [ ] **`returnTo` override** — log out, then visit `http://localhost:8787/auth/login?returnTo=/` directly. After login you should land on `/`, not `/dashboard` — proving the query param overrides `defaultReturnTo`.
- [ ] **Logout** — click Logout; session cleared, back to the landing page, nav empty

---

## Frontend development (hot reload)

If you're iterating on the React app, run the Vite dev server instead of rebuilding each time. It proxies `/auth` and `/api` to the BFF Worker:

```sh
# Terminal 1 — upstream
cd upstream && npm run dev

# Terminal 2 — BFF Worker
cd worker && npm run dev

# Terminal 3 — frontend with HMR
cd frontend && npm run dev
# http://localhost:5173
```

---

## Deploy

### 1. Create a production KV namespace

```sh
cd worker && npx wrangler kv namespace create SESSION_KV
```

Note the `id` from the output.

### 2. Set the client secret

```sh
cd worker && npx wrangler secret put AUTH0_CLIENT_SECRET
```

### 3. Create production config files

These are gitignored — they hold real values and must never be committed.

**`upstream/wrangler.production.toml`:**
```toml
name = "bezzie-demo-upstream"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
AUTH0_DOMAIN   = "your-tenant.auth0.com"
AUTH0_AUDIENCE = "https://api.bezzie-demo.com"
WORKER_ORIGIN  = "https://your-worker-url"   # the deployed BFF Worker URL
```

**`worker/wrangler.production.toml`:**
```toml
name = "bezzie-demo-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Optional: custom domain
# routes = [
#   { pattern = "your-domain.com", custom_domain = true }
# ]

[assets]
directory = "../frontend/dist"
not_found_handling = "single-page-application"
binding = "ASSETS"

[vars]
AUTH0_DOMAIN    = "your-tenant.auth0.com"
AUTH0_CLIENT_ID = "your-client-id"
AUTH0_AUDIENCE  = "https://api.bezzie-demo.com"
APP_BASE_URL    = "https://your-worker-url"
UPSTREAM_URL    = "https://your-upstream-url"

[[kv_namespaces]]
binding    = "SESSION_KV"
id         = "your-kv-namespace-id"
preview_id = "your-preview-namespace-id"
```

### 4. Update Auth0

In your Auth0 Application settings, add the deployed BFF Worker URL to:

- **Allowed Callback URLs:** `https://<your-worker-url>/auth/callback`
- **Allowed Logout URLs:** `https://<your-worker-url>`
- **Allowed Web Origins:** `https://<your-worker-url>`

### 5. Deploy

```sh
./deploy.sh
```

The script builds the frontend and deploys both Workers using the production config files.

---

## How it works

1. User clicks **Login** → browser hits `GET /auth/login`.
2. bezzie generates a PKCE challenge + state and redirects to Auth0.
3. Auth0 authenticates the user and redirects back to `GET /auth/callback`.
4. bezzie validates state, exchanges the code for tokens, stores them in KV, and sets a session cookie (`SameSite=Lax`, `HttpOnly`, `Secure`). The browser now holds only an opaque session ID — tokens stay in the Worker.
5. The dashboard calls `GET /api/me`. `auth.middleware()` validates the session and exposes the access token as `c.var.accessToken`; the Worker calls the upstream API with `Authorization: Bearer <token>` and returns the result.
6. `GET /api/user` uses `auth.optionalMiddleware()` — returns the user if logged in, `null` if not. The frontend uses this to render the nav on public pages.
7. **Logout** → `POST /auth/logout` clears the KV session and the cookie, then redirects to Auth0's logout endpoint.

---

## Learn more

- bezzie on npm — [npmjs.com/package/bezzie](https://www.npmjs.com/package/bezzie)
- bezzie source & docs — [github.com/neilpmas/bezzie](https://github.com/neilpmas/bezzie)
