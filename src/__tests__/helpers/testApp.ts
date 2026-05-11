// Test harness for the web layer. Builds a minimal Fastify instance with
// session middleware (in-memory store, not Redis) and the routes under
// test. Provides a mockFetch helper that records every API call and
// returns scripted responses, so tests don't talk to a real API.
//
// Sessions are normally backed by Redis in production; for tests we use
// the @fastify/session in-memory default. A `seedSession` helper sets
// session fields directly via a temporary preHandler that runs before
// the route's own preHandler chain — simulating an already-logged-in
// user.

import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import session from '@fastify/session'
import webRoutes from '../../routes/web.js'

export interface MockedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

export interface FetchMock {
  calls: MockedCall[]
  reset: () => void
  /** Queue a response for the *next* call to a URL matching `urlMatcher`.
   *  Matchers are tried newest-first and consumed on match. */
  on: (urlMatcher: RegExp | string, handler: (req: MockedCall) => { status?: number; body?: unknown }) => void
}

/** Global per-test fetch mock. Install with installFetchMock() once per test
 *  file (or per `describe`); reset between tests via the returned object. */
export function installFetchMock(): FetchMock {
  const handlers: Array<{ matcher: RegExp | string; handler: (req: MockedCall) => { status?: number; body?: unknown } }> = []
  const calls: MockedCall[] = []

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers = (init?.headers as Record<string, string>) ?? {}
    const body = typeof init?.body === 'string' ? init.body : null
    const call: MockedCall = { url, method, headers, body }
    calls.push(call)
    // Newest matcher wins (so test setup can override defaults).
    for (let i = handlers.length - 1; i >= 0; i--) {
      const h = handlers[i]
      const matched = typeof h.matcher === 'string' ? url.includes(h.matcher) : h.matcher.test(url)
      if (matched) {
        const result = h.handler(call)
        const status = result.status ?? 200
        const text = result.body === undefined ? '' : JSON.stringify(result.body)
        return new Response(text, {
          status,
          headers: { 'content-type': 'application/json' },
        })
      }
    }
    // No matcher → 500 to surface unconfigured paths during tests.
    return new Response(JSON.stringify({ error: 'unmocked' }), { status: 500 })
  }) as typeof fetch

  return {
    calls,
    reset: () => { handlers.length = 0; calls.length = 0 },
    on: (matcher, handler) => { handlers.push({ matcher, handler }) },
  }
}

export interface SessionSeed {
  email?: string
  customerId?: string
  appId?: string
  appSlug?: string
  appName?: string
  sandboxWriteKey?: string
  sandboxReadKey?: string
  webhookSecret?: string
  env?: 'sandbox' | 'production'
  onboardingComplete?: boolean
  name?: string
  orgName?: string | null
  avatarUrl?: string | null
}

const DEFAULT_SEED: SessionSeed = {
  email: 'test@example.com',
  customerId: 'cust_test',
  appId: 'app_test',
  appSlug: 'default',
  appName: 'Default App',
  sandboxWriteKey: 'vsk_sandbox_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  sandboxReadKey:  'vsk_sandbox_read_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  webhookSecret: 'whsec_test',
  env: 'sandbox',
  onboardingComplete: true,
  name: 'Tester',
  orgName: null,
  avatarUrl: null,
}

/** Build a Fastify instance with the web routes registered and a seeded
 *  session. The `inject` helper on the returned wrapper applies the seed
 *  for that request. */
export async function buildWebTestApp(seed: SessionSeed = {}) {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(session, {
    secret: 'a'.repeat(64),
    cookie: { secure: false, httpOnly: true, sameSite: 'lax' },
    saveUninitialized: false,
  })

  // Seed the session before any other preHandler runs (incl. requireSession).
  app.addHook('preHandler', async (request) => {
    const merged = { ...DEFAULT_SEED, ...seed }
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined) request.session.set(k as any, v as any)
    }
  })
  await app.register(webRoutes)
  await app.ready()
  return app
}

export async function buildAnonWebTestApp(): Promise<FastifyInstance> {
  // No session seed — used to check requireSession redirects.
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(session, {
    secret: 'a'.repeat(64),
    cookie: { secure: false, httpOnly: true, sameSite: 'lax' },
    saveUninitialized: false,
  })
  await app.register(webRoutes)
  await app.ready()
  return app
}
