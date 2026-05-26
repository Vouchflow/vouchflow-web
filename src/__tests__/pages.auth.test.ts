import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import session from '@fastify/session'
import staticFiles from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'
import pageRoutes from '../routes/pages.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function buildPageTestApp(seed: Record<string, unknown> = {}) {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(session, {
    secret: 'a'.repeat(64),
    cookie: { secure: false, httpOnly: true, sameSite: 'lax' },
    saveUninitialized: false,
  })
  await app.register(staticFiles, {
    root: path.join(__dirname, '../../public'),
    prefix: '/',
    index: false,
  })
  app.addHook('preHandler', async (request) => {
    for (const [key, value] of Object.entries(seed)) {
      request.session.set(key as any, value as any)
    }
  })
  await app.register(pageRoutes)
  await app.ready()
  return app
}

describe('page auth redirects', () => {
  it('redirects protected pages to signup when no customer session exists', async () => {
    const app = await buildPageTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/dashboard' })
      expect(res.statusCode).toBe(302)
      expect(res.headers.location).toBe('/signup')
    } finally {
      await app.close()
    }
  })

  it('renders signup for anonymous users', async () => {
    const app = await buildPageTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/signup' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('Sign in')
    } finally {
      await app.close()
    }
  })

  it('uses customerId consistently for dashboard and signup auth checks', async () => {
    const app = await buildPageTestApp({ customerId: 'cust_test' })
    try {
      const dashboard = await app.inject({ method: 'GET', url: '/dashboard' })
      expect(dashboard.statusCode).toBe(200)

      const signup = await app.inject({ method: 'GET', url: '/signup' })
      expect(signup.statusCode).toBe(302)
      expect(signup.headers.location).toBe('/dashboard')
    } finally {
      await app.close()
    }
  })
})
