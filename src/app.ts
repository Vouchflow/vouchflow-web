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

  // Health
  fastify.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }))

  return fastify
}
