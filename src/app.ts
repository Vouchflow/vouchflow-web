import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import session from '@fastify/session'
import staticFiles from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import authRoutes from './routes/auth.js'
import pageRoutes from './routes/pages.js'
import webRoutes from './routes/web.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// In-process session store. We run a single web machine; an external store
// just paid per-request Upstash commands for every /web/session / /web/apps
// hit. Trade: a deploy restarts the process and logs everyone out. At this
// scale that's acceptable; deploys are infrequent and re-login is one click.
//
// Records are { value, expiresAt }; expired entries are pruned by the
// reaper below so the Map doesn't grow without bound from abandoned sessions.
type StoredSession = { value: unknown; expiresAt: number }
const sessions = new Map<string, StoredSession>()
const ONE_DAY_MS = 24 * 60 * 60 * 1000

const sessionStore = {
  get(sid: string, cb: (err: any, session?: any) => void) {
    const row = sessions.get(sid)
    if (!row) return cb(null, null)
    if (row.expiresAt <= Date.now()) {
      sessions.delete(sid)
      return cb(null, null)
    }
    cb(null, row.value)
  },
  set(sid: string, value: any, cb: (err?: any) => void) {
    const expires = value?.cookie?.expires
    const expiresAt = expires
      ? new Date(expires).getTime()
      : Date.now() + 30 * ONE_DAY_MS
    sessions.set(sid, { value, expiresAt })
    cb()
  },
  destroy(sid: string, cb: (err?: any) => void) {
    sessions.delete(sid)
    cb()
  },
}

// Reap expired sessions hourly so abandoned sessions don't pile up. Cheap
// linear scan over the Map; at our cardinality this is microseconds.
setInterval(() => {
  const now = Date.now()
  for (const [sid, row] of sessions) {
    if (row.expiresAt <= now) sessions.delete(sid)
  }
}, 60 * 60 * 1000).unref()

export async function buildApp() {
  const fastify = Fastify({
    logger: true,
    trustProxy: true,
  })

  // Rate limiting — in-process Map (default). One web machine = no
  // distribution needed; Redis was paying per-request commands for what's
  // effectively a counter.
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => `web:${req.ip}:${req.routeOptions.url}`,
  })

  // Session — cookie must be registered first
  await fastify.register(cookie)
  await fastify.register(session, {
    secret: config.sessionSecret,
    store: sessionStore,
    cookie: {
      secure: config.nodeEnv === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
    saveUninitialized: false,
  })

  // Static files — serves public/ at /
  // index: false — pages.ts handles routing explicitly
  await fastify.register(staticFiles, {
    root: path.join(__dirname, '../public'),
    prefix: '/',
    index: false,
  })

  // Routes
  await fastify.register(authRoutes)
  await fastify.register(pageRoutes)
  await fastify.register(webRoutes)

  // GET /web/me — unauthenticated session peek for public pages (docs topbar, landing page)
  fastify.get('/web/me', async (request) => {
    const customerId = request.session.get('customerId')
    if (!customerId) return null
    return {
      name:      request.session.get('name'),
      orgName:   request.session.get('orgName'),
      avatarUrl: request.session.get('avatarUrl'),
      email:     request.session.get('email'),
    }
  })

  // Health
  fastify.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }))

  return fastify
}
