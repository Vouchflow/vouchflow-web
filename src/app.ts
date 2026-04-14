import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import session from '@fastify/session'
import staticFiles from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import { redis } from './lib/redis.js'
import authRoutes from './routes/auth.js'
import pageRoutes from './routes/pages.js'
import webRoutes from './routes/web.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Minimal ioredis-compatible session store for @fastify/session
const SESSION_PREFIX = 'sess:'
const sessionStore = {
  async get(sid: string, cb: (err: any, session?: any) => void) {
    try {
      const val = await redis.get(SESSION_PREFIX + sid)
      cb(null, val ? JSON.parse(val) : null)
    } catch (err) { cb(err) }
  },
  async set(sid: string, session: any, cb: (err?: any) => void) {
    try {
      const expires = session?.cookie?.expires
      const ttl = expires
        ? Math.max(1, Math.floor((new Date(expires).getTime() - Date.now()) / 1000))
        : 30 * 24 * 60 * 60 // 30 days fallback
      await redis.set(SESSION_PREFIX + sid, JSON.stringify(session), 'EX', ttl)
      cb()
    } catch (err) { cb(err) }
  },
  async destroy(sid: string, cb: (err?: any) => void) {
    try {
      await redis.del(SESSION_PREFIX + sid)
      cb()
    } catch (err) { cb(err) }
  },
}

export async function buildApp() {
  const fastify = Fastify({
    logger: true,
    trustProxy: true,
  })

  // Rate limiting — backed by same Redis instance
  await fastify.register(rateLimit, {
    redis,
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
