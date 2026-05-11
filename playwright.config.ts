import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './audit',
  fullyParallel: false,        // sequential so screenshots/log files don't interleave
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.AUDIT_BASE_URL ?? 'https://vouchflow.dev',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  // All projects use Chromium (single browser engine installed). Mobile and
  // tablet are emulated via viewport + userAgent so we don't need WebKit
  // system deps.
  projects: [
    {
      name: 'mobile-375',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375,  height: 812  }, isMobile: false, hasTouch: true },
    },
    {
      name: 'tablet-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768,  height: 1024 }, isMobile: false, hasTouch: true },
    },
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900  } },
    },
  ],
})
