# bezzie-demo

A demo app for [bezzie](https://github.com/neilpmas/bezzie) — a BFF (Backend for Frontend) OAuth 2.0 auth library for Cloudflare Workers. Available on npm: [npmjs.com/package/bezzie](https://www.npmjs.com/package/bezzie).

**Live demo:** [bezzie-demo.neilmason.dev](https://bezzie-demo.neilmason.dev)

---

## What this is

This app demonstrates the full BFF auth flow using bezzie and Auth0:

- A **React frontend** — public landing page + protected dashboard
- A **BFF Worker** — handles the OAuth flow, issues a session cookie, proxies API calls
- A **mock upstream API** — validates the `Authorization: Bearer` header bezzie injects

JWTs never touch the browser. The Worker owns the tokens.

```
Browser → Worker (bezzie, session cookie) → Upstream API (Bearer token)
                        ↕
                     Auth0
```

---

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) — `npm install -g wrangler` (or use `npx wrangler` without a global install)
- A free [Auth0](https://auth0.com) account
- A free [Cloudflare](https://cloudflare.com) account (for deployment — not needed for local dev)

---

## Auth0 setup

You need two things in Auth0: an **Application** (for the OAuth flow) and an **API** (for the audience/access token).

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

Scroll to **Advanced Settings → Grant Types** and ensure **Refresh Token** is checked.

Back in the main **Settings** tab, scroll down to **Refresh Token Rotation** and enable **Allow Refresh Token Rotation**. Leave the Rotation Overlap Period at `0`.

Continue scrolling to **Refresh Token Expiration** and enable both **Absolute Expiration** and **Idle Expiration**. The idle lifetime must be less than the absolute lifetime (e.g. `2592000` seconds = 30 days for absolute, `1296000` = 15 days for idle).

Save changes. Note your **Domain**, **Client ID**, and **Client Secret** — you'll need them below.

### 2. Create an API

This gives the access token an `audience` claim, which the upstream API validates.

1. Go to **Applications → APIs → Create API**
2. Name: `bezzie-demo`
3. Identifier (audience): `https://api.bezzie-demo.com` (or any URL — just needs to match your config)
4. Click **Create**

> **Why do I need an API?** The upstream Worker validates the Bearer token's `audience` claim (`aud`) against this identifier. Without it, Auth0 issues opaque tokens that can't be verified as JWTs. The identifier doesn't need to be a real URL — it's just a string that both the BFF and upstream agree on.

### 3. Configure the upstream Worker

The upstream Worker validates Bearer tokens against Auth0's JWKS. Add its credentials to `upstream/wrangler.toml`:

```toml
[vars]
AUTH0_DOMAIN = "your-tenant.auth0.com"
AUTH0_AUDIENCE = "https://api.bezzie-demo.com"   # must match the API Identifier above
WORKER_ORIGIN = "http://localhost:8787"           # update to your deployed worker URL in production
```

---

## Local development

### 1. Install dependencies

```sh
cd upstream && npm install && cd ..
cd worker && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Configure the worker

Create a KV namespace for local development:

```sh
cd worker && npx wrangler kv namespace create SESSION_KV --preview
```

Copy the `preview_id` from the output and add it to `worker/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SESSION_KV"
id = ""           # fill in for production: npx wrangler kv namespace create SESSION_KV
preview_id = ""   # paste the preview_id from the command above
```

Open `worker/wrangler.toml` and fill in your Auth0 values:

```toml
[vars]
AUTH0_DOMAIN = "your-tenant.auth0.com"
AUTH0_CLIENT_ID = "your-client-id"
AUTH0_AUDIENCE = "https://api.bezzie-demo.com"
APP_BASE_URL = "http://localhost:8787"
UPSTREAM_URL = "http://localhost:8788"
```

Create `worker/.dev.vars` from the example (this file is gitignored):

```sh
cp worker/.dev.vars.example worker/.dev.vars
```

Edit `worker/.dev.vars` and fill in your real Auth0 values:

```
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret
```

> For production, set these via `wrangler secret put AUTH0_DOMAIN` etc. — never commit real values to `wrangler.toml`.

### 3. Build the frontend

The worker serves the React app as static files, so build it first:

```sh
cd frontend && npm run build && cd ..
```

### 4. Start the upstream mock API

In one terminal:

```sh
cd upstream && npm run dev
# Runs on http://localhost:8788
```

### 5. Start the BFF worker

In another terminal:

```sh
cd worker && wrangler dev
# Runs on http://localhost:8787
```

### 6. Open the app

Go to [http://localhost:8787](http://localhost:8787)

You should see the landing page with a **Login** button.

---

## Testing the full flow

Work through each of these in order:

- [ ] **Landing page loads** — visit `http://localhost:8787`, see the landing page, no user in nav
- [ ] **Login** — click Login, complete the Auth0 flow, land on `/dashboard`
- [ ] **Dashboard** — see your name and the upstream API response
- [ ] **Upstream data** — the JSON block should show `"receivedAuthorization": true`
- [ ] **Nav on landing page** — go back to `/`, your name should appear in the nav (optionalMiddleware working)
- [ ] **Deep link** — log out, then visit `http://localhost:8787/auth/login?returnTo=/dashboard` directly — after login you should land on `/dashboard`
- [ ] **Logout** — click Logout, session cleared, back to landing page, nav empty

---

## Frontend development (with hot reload)

If you're iterating on the React app, run the Vite dev server instead of building each time. It proxies `/auth` and `/api` to the worker:

```sh
# Terminal 1 — upstream
cd upstream && npm run dev

# Terminal 2 — worker
cd worker && wrangler dev

# Terminal 3 — frontend with HMR
cd frontend && npm run dev
# Open http://localhost:5173
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

These files are gitignored — they contain real values and must never be committed.

**`upstream/wrangler.production.toml`:**
```toml
name = "bezzie-demo-upstream"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
AUTH0_DOMAIN = "your-tenant.auth0.com"
AUTH0_AUDIENCE = "https://api.bezzie-demo.com"
WORKER_ORIGIN = "https://your-worker-url"
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
AUTH0_DOMAIN = "your-tenant.auth0.com"
AUTH0_CLIENT_ID = "your-client-id"
AUTH0_AUDIENCE = "https://api.bezzie-demo.com"
APP_BASE_URL = "https://your-worker-url"
UPSTREAM_URL = "https://your-upstream-url"

[[kv_namespaces]]
binding = "SESSION_KV"
id = "your-kv-namespace-id"
preview_id = "your-preview-namespace-id"
```

### 4. Update Auth0

In your Auth0 application settings, add the deployed worker URL to:
- **Allowed Callback URLs:** `https://<your-worker-url>/auth/callback`
- **Allowed Logout URLs:** `https://<your-worker-url>`
- **Allowed Web Origins:** `https://<your-worker-url>`

### 5. Deploy

```sh
./deploy.sh
```

That's it — the script builds the frontend and deploys both workers using the production config files.

---

## How it works

1. User clicks **Login** → browser is redirected to `GET /auth/login`
2. Worker generates a PKCE challenge + state, redirects to Auth0
3. Auth0 authenticates the user, redirects back to `GET /auth/callback`
4. Worker validates the response, exchanges the code for tokens, stores them in KV, sets a `__Host-session` cookie
5. Browser now has a session cookie — tokens never leave the Worker
6. Dashboard calls `GET /api/me` → Worker validates the session, fetches the upstream API with `Authorization: Bearer <access_token>`, returns the result
7. On `GET /api/user` → Worker uses `optionalMiddleware()` — returns user if logged in, `null` if not
8. Logout → `POST /auth/logout` → Worker clears the KV session and cookie, redirects to Auth0 logout
