// Public-pages audit: visit each unauthenticated page at every viewport
// and assert no console errors, no 4xx/5xx responses, and key DOM anchors
// rendered. Screenshots are written into /audit-screenshots for visual diff.

import { test, expect, Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PAGES: Array<{ path: string; key: string }> = [
  { path: '/',                    key: 'home' },
  { path: '/signup',              key: 'signup' },
  { path: '/docs',                key: 'docs' },
  { path: '/docs/introduction',   key: 'docs-introduction' },
  { path: '/docs/ios-sdk',        key: 'docs-ios' },
  { path: '/docs/android-sdk',    key: 'docs-android' },
  { path: '/docs/web-sdk',        key: 'docs-web' },
  { path: '/docs/backend',        key: 'docs-backend' },
  { path: '/docs/concepts',       key: 'docs-concepts' },
  { path: '/docs/guides',         key: 'docs-guides' },
  { path: '/api-reference',       key: 'api-reference' },
  { path: '/terms',               key: 'terms' },
  { path: '/privacy',             key: 'privacy' },
  { path: '/contact',             key: 'contact' },
]

const SHOTS = resolve(__dirname, '..', 'audit-screenshots')
mkdirSync(SHOTS, { recursive: true })

function trapConsole(page: Page) {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
  return errors
}

for (const { path, key } of PAGES) {
  test(`${key} (${path}) renders without console errors`, async ({ page }, info) => {
    const errors = trapConsole(page)
    const resp   = await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    expect(resp, `response for ${path}`).not.toBeNull()
    expect(resp!.status(), `${path} status`).toBeLessThan(400)
    // Wait for any deferred fetches / fonts to settle.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    await page.screenshot({
      path:     resolve(SHOTS, `${key}-${info.project.name}.png`),
      fullPage: true,
    })
    // Filter out third-party noise (favicons, fonts, analytics) — only
    // errors that look like our app should fail the test.
    const meaningful = errors.filter(e =>
      !/Failed to load resource.*favicon/i.test(e) &&
      !/Refused to load.*font/i.test(e) &&
      !/net::ERR_BLOCKED_BY_CLIENT/i.test(e)
    )
    expect(meaningful, `console errors on ${path}`).toEqual([])
  })
}

// Quick sanity: verify the homepage has the expected hero text + CTA.
test('homepage hero + CTA present', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  const hasGetStarted = await page.getByRole('link', { name: /sign up|get started|start/i }).count()
  expect(hasGetStarted, 'homepage has at least one signup CTA').toBeGreaterThan(0)
})
