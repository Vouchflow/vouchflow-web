// Authed-pages audit — runs against a local HTTP server that serves the
// static public/ directory and intercepts /web/* with fixture data. This
// avoids needing OAuth credentials or a deployed app, while still exercising
// the real HTML/CSS/JS surface across viewports.
//
// The audit covers: dashboard, verifications, reputation, settings (apps
// list), onboarding, /apps/new, and /settings/apps/:appId.

import { test, expect, Page, Route } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = resolve(__dirname, '..', 'audit-screenshots')
mkdirSync(SHOTS, { recursive: true })
const PUBLIC = resolve(__dirname, '..', 'public')

// ── Local static server (mimics pages.ts routing) ──────────────────────

const PAGE_ROUTES: Record<string, string> = {
  '/dashboard':     'dashboard.html',
  '/verifications': 'verifications.html',
  '/reputation':    'reputation.html',
  '/settings':      'settings.html',
  '/onboarding':    'onboarding.html',
  '/apps/new':      'apps-new.html',
}

let server: ReturnType<typeof createServer> | null = null
let serverPort = 0

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url!, `http://localhost`)
    const p = u.pathname
    // Per-app detail page
    if (p.startsWith('/settings/apps/')) {
      const html = readFileSync(resolve(PUBLIC, 'apps-detail.html'), 'utf8')
      res.setHeader('content-type', 'text/html')
      res.end(html); return
    }
    // Static page routes
    const file = PAGE_ROUTES[p]
    if (file) {
      const fp = resolve(PUBLIC, file)
      if (existsSync(fp)) {
        res.setHeader('content-type', 'text/html')
        res.end(readFileSync(fp, 'utf8')); return
      }
    }
    // Fallback: try public/<path> directly (covers favicon, css, etc.)
    const direct = resolve(PUBLIC, p.replace(/^\//, ''))
    if (existsSync(direct) && !direct.includes('..')) {
      const ct = direct.endsWith('.css') ? 'text/css' :
                 direct.endsWith('.js')  ? 'application/javascript' :
                 'text/plain'
      res.setHeader('content-type', ct)
      res.end(readFileSync(direct)); return
    }
    res.statusCode = 404; res.end('not found')
  })
  await new Promise<void>(r => server!.listen(0, '127.0.0.1', r))
  // @ts-ignore
  serverPort = server!.address().port
})

test.afterAll(async () => {
  if (server) await new Promise<void>(r => server!.close(() => r()))
})

function urlFor(path: string): string {
  return `http://127.0.0.1:${serverPort}${path}`
}

// ── Fixture data ────────────────────────────────────────────────────────

const FIXTURE_APPS = [
  { id: 'app_aaa', name: 'Trusty Squire', slug: 'trusty-squire',
    description: null, webSdkEnabled: false,
    iosConfigured: true, androidConfigured: true,
    archivedAt: null, createdAt: '2025-09-01T10:00:00Z' },
  { id: 'app_bbb', name: 'Marketing Site', slug: 'marketing-site',
    description: 'Public-facing checkout', webSdkEnabled: true,
    iosConfigured: false, androidConfigured: false,
    archivedAt: null, createdAt: '2025-10-15T14:30:00Z' },
]
const FIXTURE_APP_DETAIL = {
  id: 'app_aaa', customerId: 'cust_xxx',
  name: 'Trusty Squire', slug: 'trusty-squire', description: null,
  iosTeamId: 'ABCDE12345', iosBundleId: 'com.acme.app',
  androidPackageName: 'com.acme.app',
  androidSigningKeySha256: 'A1:B2:C3:D4:E5:F6:07:08:09:0A:0B:0C:0D:0E:0F:10:11:12:13:14:15:16:17:18:19:1A:1B:1C:1D:1E:1F:20',
  webSdkEnabled: false, webRpId: null, webAllowedOrigins: [],
  signPayloadMinConfidence: 'high', verifyMinConfidence: null,
  contextConfidenceOverrides: {},
  sandboxWriteKeyPrefix: 'vsk_sandbox_abc',
  sandboxReadKeyPrefix:  'vsk_sandbox_read_xyz',
  archivedAt: null, createdAt: '2025-09-01T10:00:00Z',
}
const FIXTURE_SESSION = {
  email: 'demo@vouchflow.dev', customerId: 'cust_xxx',
  appId: 'app_aaa', appSlug: 'trusty-squire', appName: 'Trusty Squire',
  sandboxWriteKey: 'vsk_sandbox_abcdefabcdefabcdefabcdef',
  sandboxReadKey:  'vsk_sandbox_read_xyzxyzxyzxyzxyz',
  webhookSecret: 'whsec_demo123',
  createdAt: '2025-09-01T10:00:00Z', onboardingComplete: true,
  name: 'Demo User', orgName: 'Acme Corp', avatarUrl: null,
  env: 'sandbox', liveKeyCount: 4,
  // App-tab fields used by settings.html legacy hydration
  iosTeamId: FIXTURE_APP_DETAIL.iosTeamId, iosBundleId: FIXTURE_APP_DETAIL.iosBundleId,
  androidPackageName: FIXTURE_APP_DETAIL.androidPackageName,
  androidSigningKeySha256: FIXTURE_APP_DETAIL.androidSigningKeySha256,
  webRpId: null, webAllowedOrigins: [], webSdkEnabled: false,
  signPayloadMinConfidence: 'high', contextConfidenceOverrides: {},
}
const FIXTURE_OVERVIEW = {
  verificationCount: 1247, deviceCount: 312,
  successRate: 0.98, averageConfidence: 'high', series: [],
  byConfidence: { high: 950, medium: 200, low: 97 },
  byPlatform: { ios: 600, android: 400, web: 247 },
}
const FIXTURE_VERIFICATIONS = {
  verifications: Array.from({ length: 12 }, (_, i) => ({
    id: `ver_${i}`,
    sessionId: `sess_xxx${i.toString().padStart(3, '0')}`,
    deviceToken: `dev_${i.toString().padStart(8, '0')}`,
    type: i % 4 === 0 ? 'sign' : 'verify',
    confidence: ['high', 'high', 'medium', 'low'][i % 4],
    platform: ['ios', 'android', 'web'][i % 3],
    result: i === 5 ? 'failed' : 'verified',
    createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
    isSandbox: true,
  })),
  total: 1247, hasMore: true,
}
const FIXTURE_LIVE_KEYS = { keys: [
  { id: 'k_1', scope: 'write', createdAt: '2025-09-15T10:00:00Z', lastUsedAt: '2025-12-01T08:00:00Z' },
  { id: 'k_2', scope: 'read',  createdAt: '2025-09-15T10:00:00Z', lastUsedAt: null },
] }
const FIXTURE_REPUTATION = {
  totalDevices: 312, networkDevices: 287, optInRate: 0.92,
  signalEvents: [], series: [], byConfidence: FIXTURE_OVERVIEW.byConfidence,
}

async function installMocks(page: Page) {
  await page.route('**/web/**', async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })

    if (path === '/web/session') return json(FIXTURE_SESSION)
    if (path === '/web/env')     return json({ ok: true, env: 'sandbox' })

    if (path === '/web/apps' && method === 'GET') return json({ apps: FIXTURE_APPS })
    if (path === '/web/apps' && method === 'POST') return json({
      app: FIXTURE_APP_DETAIL,
      sandboxWriteKey: FIXTURE_SESSION.sandboxWriteKey,
      sandboxReadKey:  FIXTURE_SESSION.sandboxReadKey,
    })
    if (path === '/web/apps/current' && method === 'GET')   return json(FIXTURE_APP_DETAIL)
    if (path === '/web/apps/current' && method === 'PATCH') return json({ ok: true, app: FIXTURE_APP_DETAIL })

    const m = path.match(/^\/web\/apps\/(app_\w+)(\/(live-keys|webhooks|archive|unarchive)(\/.*)?)?$/)
    if (m) {
      const tail = m[3]
      if (!tail) return json(FIXTURE_APP_DETAIL)
      if (tail === 'live-keys') return method === 'POST'
        ? json({ writeKey: { rawKey: 'vsk_live_xxxxxxxxxxxxxxxxxxxxxxx', scope: 'write' } })
        : json(FIXTURE_LIVE_KEYS)
      if (tail === 'webhooks') return json(method === 'POST' ? { id: 'wh_1', url: 'https://x', events: ['verification.complete'] } : { webhooks: [] })
      if (tail === 'archive' || tail === 'unarchive') return json({ ok: true })
    }

    if (path === '/web/customer/overview') return json(FIXTURE_OVERVIEW)
    if (path === '/web/overview')          return json(FIXTURE_OVERVIEW)
    if (path === '/web/usage')             return json({ verificationCount: 1247 })
    if (path === '/web/verifications')     return json(FIXTURE_VERIFICATIONS)
    if (path.startsWith('/web/verifications/')) return json({
      ...FIXTURE_VERIFICATIONS.verifications[0],
      payloadSha256: 'a'.repeat(64),
      canonicalizedPayload: '{"context":"signup"}',
      signals: [],
    })
    if (path === '/web/reputation')        return json(FIXTURE_REPUTATION)
    if (path === '/web/keys' || path === '/web/keys/reveal')
      return json({ sandboxWriteKey: FIXTURE_SESSION.sandboxWriteKey, sandboxReadKey: FIXTURE_SESSION.sandboxReadKey })
    if (path === '/web/live-keys')         return json(FIXTURE_LIVE_KEYS)
    if (path === '/web/webhooks')          return json({ webhooks: [] })
    if (path === '/web/account' && method === 'PATCH') return json({ ok: true })
    return json({})
  })
}

function trapConsole(page: Page) {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
  return errors
}

const PAGES = [
  { path: '/dashboard',     key: 'dashboard' },
  { path: '/verifications', key: 'verifications' },
  { path: '/reputation',    key: 'reputation' },
  { path: '/settings',      key: 'settings' },
  { path: '/onboarding',    key: 'onboarding' },
  { path: '/apps/new',      key: 'apps-new' },
  { path: '/settings/apps/app_aaa', key: 'apps-detail' },
]

for (const { path, key } of PAGES) {
  test(`authed: ${key} (${path}) renders cleanly`, async ({ page }, info) => {
    await installMocks(page)
    const errors = trapConsole(page)
    const resp = await page.goto(urlFor(path), { waitUntil: 'domcontentloaded', timeout: 20_000 })
    expect(resp).not.toBeNull()
    expect(resp!.status(), `${path} status`).toBeLessThan(400)
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
    await page.waitForTimeout(400)
    await page.screenshot({
      path: resolve(SHOTS, `${key}-${info.project.name}.png`),
      fullPage: true,
    })
    const meaningful = errors.filter(e =>
      !/Failed to load resource.*favicon/i.test(e) &&
      !/Refused to load.*font/i.test(e) &&
      !/net::ERR_BLOCKED_BY_CLIENT/i.test(e)
    )
    expect(meaningful, `console errors on ${path}`).toEqual([])
  })
}

// Apps-detail mobile sanity (issue #1 of round 3 — mobile cramping bug).
test('apps-detail mobile: sections have visible padding + height', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await installMocks(page)
  await page.goto(urlFor('/settings/apps/app_aaa'), { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const padding = await page.evaluate(() => {
    const el = document.querySelector('.settings-content')
    if (!el) return null
    const cs = getComputedStyle(el)
    return { left: cs.paddingLeft, right: cs.paddingRight }
  })
  expect(padding).not.toBeNull()
  expect(parseFloat(padding!.left)).toBeGreaterThanOrEqual(12)
  expect(parseFloat(padding!.right)).toBeGreaterThanOrEqual(12)
  const h = await page.evaluate(() => {
    const el = document.querySelector('#input-app-name') as HTMLElement | null
    return el ? el.getBoundingClientRect().height : 0
  })
  expect(h).toBeGreaterThan(20)
})

// Dashboard env-pill compact (issue #2 of round 3).
test('dashboard env-pill is compact (not stretched)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installMocks(page)
  await page.goto(urlFor('/dashboard'), { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const w = await page.evaluate(() => {
    const el = document.querySelector('#env-toggle') as HTMLElement | null
    return el ? el.getBoundingClientRect().width : 0
  })
  expect(w, 'env-toggle width').toBeLessThan(160)
  expect(w).toBeGreaterThan(70)
})

// Verifications env filter (issue #3 of round 3).
test('verifications has env filter wired up', async ({ page }) => {
  await installMocks(page)
  await page.goto(urlFor('/verifications'), { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(300)
  expect(await page.locator('#filter-env').count()).toBe(1)
  const opts = await page.locator('#filter-env option').allTextContents()
  expect(opts).toContain('sandbox')
  expect(opts).toContain('production')
})
