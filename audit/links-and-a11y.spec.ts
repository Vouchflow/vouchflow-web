// Lightweight link + a11y audit. We don't pull in axe-core (extra dep);
// these are signal-quality smoke checks.

import { test, expect, Page } from '@playwright/test'

const PUBLIC_PAGES = [
  '/', '/signup', '/docs', '/docs/introduction', '/docs/ios-sdk',
  '/docs/android-sdk', '/docs/web-sdk', '/docs/backend',
  '/docs/concepts', '/docs/guides', '/api-reference',
  '/terms', '/privacy', '/contact',
]

// All <a href> on each public page should resolve to 2xx/3xx (not 4xx/5xx).
// We only check internal links to avoid third-party flakiness.
test.describe('Internal links resolve', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} internal links 2xx/3xx`, async ({ page, baseURL }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      const hrefs = await page.$$eval('a[href]', (els) => Array.from(new Set(
        els.map(a => (a as HTMLAnchorElement).getAttribute('href'))
           .filter(h => h && !h.startsWith('http') && !h.startsWith('mailto:') && !h.startsWith('#') && !h.startsWith('javascript:')) as string[]
      )))
      const broken: Array<{ href: string; status: number }> = []
      for (const href of hrefs) {
        // Resolve relative.
        const url = href.startsWith('/') ? href : new URL(href, page.url()).pathname
        try {
          const r = await page.request.get(`${baseURL}${url}`, { maxRedirects: 5 })
          if (r.status() >= 400) broken.push({ href: url, status: r.status() })
        } catch (e) {
          broken.push({ href: url, status: -1 })
        }
      }
      expect(broken, `broken internal links on ${path}`).toEqual([])
    })
  }
})

// Basic a11y signal: every <img> with non-decorative use should have alt,
// every form input should have a label or aria-label.
test.describe('Basic a11y', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} a11y signals`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      const issues = await page.evaluate(() => {
        const out: string[] = []
        // Images without alt
        document.querySelectorAll('img').forEach((img, i) => {
          if (!img.hasAttribute('alt')) out.push(`img #${i} (${img.src.slice(-40)}) missing alt`)
        })
        // Inputs without labels
        document.querySelectorAll('input, textarea, select').forEach((el, i) => {
          const id = el.id
          const hasLabel = id && document.querySelector(`label[for="${id}"]`)
          const hasAriaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
          const isHiddenOrSubmit = (el as HTMLInputElement).type === 'hidden' ||
                                   (el as HTMLInputElement).type === 'submit' ||
                                   (el as HTMLInputElement).type === 'button'
          if (!hasLabel && !hasAriaLabel && !isHiddenOrSubmit) {
            out.push(`<${el.tagName.toLowerCase()}#${id || '?'}> missing label`)
          }
        })
        // Buttons without accessible name (no text, no aria-label)
        document.querySelectorAll('button').forEach((btn, i) => {
          const txt = (btn.textContent || '').trim()
          const ariaLabel = btn.getAttribute('aria-label')
          const ariaLabelledBy = btn.getAttribute('aria-labelledby')
          if (!txt && !ariaLabel && !ariaLabelledBy) {
            out.push(`<button> #${i} has no accessible name`)
          }
        })
        return out
      })
      // Allow up to 3 minor issues (small icon buttons that don't carry text);
      // > 3 is a smell.
      expect(issues.length, `a11y issues on ${path}: ${issues.join('; ')}`).toBeLessThanOrEqual(3)
    })
  }
})

// Page should not have horizontal scroll on mobile (375px viewport).
test.describe('No horizontal scroll on mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } })
  for (const path of PUBLIC_PAGES) {
    test(`${path} no horizontal scroll`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(300)
      const overflow = await page.evaluate(() => {
        const html = document.documentElement
        const body = document.body
        return {
          html: html.scrollWidth - html.clientWidth,
          body: body.scrollWidth - body.clientWidth,
          viewport: window.innerWidth,
        }
      })
      // Allow 1px slop for sub-pixel rounding.
      expect(overflow.html, `html overflow on ${path}`).toBeLessThanOrEqual(1)
      expect(overflow.body, `body overflow on ${path}`).toBeLessThanOrEqual(1)
    })
  }
})
