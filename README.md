# vouchflow-web

Web dashboard and marketing site for Vouchflow. Handles OAuth sign-in, onboarding, and the customer dashboard (verifications, devices, API keys, webhooks, settings). Proxies dashboard data from the Vouchflow API server.

## Stack

- **Runtime**: Node.js 22, TypeScript
- **Framework**: Fastify 4
- **Auth**: OAuth 2.0 via `@fastify/oauth2` (Google + GitHub)
- **Sessions**: `@fastify/session` backed by Redis (Upstash)
- **Rate limiting**: `@fastify/rate-limit`
- **Frontend**: Vanilla HTML/CSS/JS — no frontend framework
- **Deployment**: Fly.io (`vouchflow-web`, `iad` region)

## Project structure

```
src/
  routes/
    auth.ts      GET /auth/google/callback, /auth/github/callback, POST /auth/signout
    pages.ts     Static page routes — marketing, docs, dashboard pages
    web.ts       GET|PATCH|POST|DELETE /web/* — session-protected dashboard API
  services/
    apiClient.ts     HTTP client for web→API calls (ADMIN_KEY auth)
    email.ts         Partner inquiry delivery via Resend
  middleware/
    requireSession.ts  Session guard for /web/* routes
  config.ts
  app.ts
  index.ts
public/
  index.html          Marketing home page
  signup.html         OAuth sign-in page (Google + GitHub)
  onboarding.html     Post-signup setup flow
  dashboard.html      Overview: verifications, devices, daily chart
  verifications.html  Paginated verification log with filters
  settings.html       API keys (sandbox + live), webhooks, account
  reputation.html     Device reputation inspector
  docs.html           Documentation index
  docs-introduction.html
  docs-ios.html
  docs-android.html
  docs-backend.html
  docs-concepts.html
  docs-guides.html
  api-reference.html
  terms.html
  privacy.html
```

## Routes

### Public pages

| Route | Page |
|---|---|
| `GET /` | Marketing home |
| `GET /signup` | OAuth sign-in (redirects to dashboard if logged in) |
| `GET /docs` | Documentation index |
| `GET /docs/introduction` | Introduction |
| `GET /docs/ios-sdk` | iOS SDK guide |
| `GET /docs/android-sdk` | Android SDK guide |
| `GET /docs/backend` | Backend integration guide |
| `GET /docs/concepts` | Key concepts |
| `GET /docs/guides` | Integration guides |
| `GET /api-reference` | Full API reference |
| `GET /terms` | Terms of service |
| `GET /privacy` | Privacy policy |

### Auth

| Route | Description |
|---|---|
| `GET /auth/google/callback` | Google OAuth callback — creates session, redirects |
| `GET /auth/github/callback` | GitHub OAuth callback — creates session, redirects |
| `POST /auth/signout` | Destroy session, redirect to `/` |

### Protected pages (session required)

| Route | Page |
|---|---|
| `GET /onboarding` | Setup flow for new accounts |
| `GET /dashboard` | Overview dashboard |
| `GET /verifications` | Verification log |
| `GET /settings` | API keys, webhooks, account settings |
| `GET /reputation` | Device reputation inspector |

### Dashboard API (`/web/*`)

All routes require an active session. Keys in responses are masked (first 12 chars + `••••••••••••••••••••••••••••••••`) unless explicitly revealed.

| Method | Route | Description |
|---|---|---|
| `GET` | `/web/session` | Current user info and masked keys |
| `GET` | `/web/overview` | Verification + device counts and daily breakdown |
| `GET` | `/web/verifications` | Paginated verification log (`limit`, `offset`, `confidence`, `platform`) |
| `GET` | `/web/verifications/:sessionId` | Single verification detail |
| `GET` | `/web/devices` | Device list |
| `GET` | `/web/keys` | Masked sandbox keys and webhook secret |
| `GET` | `/web/keys/reveal` | Unmasked sandbox keys (for one-time copy) |
| `GET` | `/web/usage` | Monthly verification count |
| `GET` | `/web/webhooks` | List webhook endpoints |
| `GET` | `/web/live-keys` | Active live key metadata (no raw values) |
| `PATCH` | `/web/account` | Update org name, billing email, minimum confidence, network opt-in |
| `PATCH` | `/web/onboarding` | Mark onboarding complete |
| `POST` | `/web/webhooks` | Register a webhook endpoint |
| `POST` | `/web/live-keys` | Generate live write+read key pair (raw keys shown once) |
| `POST` | `/web/partner-inquiry` | Send a partner inquiry email |
| `DELETE` | `/web/webhooks/:webhookId` | Remove a webhook endpoint |
| `DELETE` | `/web/account` | Permanently delete account and all data, destroy session |

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | Yes | 32-byte hex — signs session cookies |
| `REDIS_URL` | Yes | Redis connection string for session store (`rediss://` for Upstash TLS) |
| `API_BASE_URL` | Yes | Vouchflow API base URL (e.g. `https://api.vouchflow.dev`) |
| `ADMIN_KEY` | Yes | Matches the server's `ADMIN_KEY` — used for web→API calls |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth client secret |
| `RESEND_API_KEY` | Yes | Resend API key — partner inquiry emails |
| `NODE_ENV` | No | `development` or `production`. Default: `development` |
| `PORT` | No | HTTP port. Default: `3000` |

## Local development

```bash
npm install
cp .env.example .env   # fill in values
npm run dev
```

Set `NODE_ENV=development` so session cookies work over HTTP. Point `API_BASE_URL` at a locally-running instance of `vouchflow-server`.

## Deployment

Runs on Fly.io as `vouchflow-web` in the `iad` region. Traffic is restricted to Cloudflare IP ranges in `fly.toml`.

```bash
fly deploy
```

### First-time secrets

```bash
fly secrets set \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  REDIS_URL="rediss://..." \
  API_BASE_URL="https://api.vouchflow.dev" \
  ADMIN_KEY="..." \
  GOOGLE_CLIENT_ID="..." \
  GOOGLE_CLIENT_SECRET="..." \
  GITHUB_CLIENT_ID="..." \
  GITHUB_CLIENT_SECRET="..." \
  RESEND_API_KEY="re_..."
```
