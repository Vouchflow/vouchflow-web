// Structural smoke tests for the dashboard HTML pages (Option A IA).
// Asserts the pages have the right anchors so accidental diffs are caught.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PUBLIC = resolve(__dirname, '../../public')
function read(p: string): string { return readFileSync(resolve(PUBLIC, p), 'utf8') }

describe('app switcher: removed (Option A — list view replaces it)', () => {
  for (const page of ['dashboard.html', 'verifications.html', 'reputation.html', 'settings.html', 'onboarding.html']) {
    it(`${page} no longer carries the topbar app switcher`, () => {
      const html = read(page)
      expect(html, 'switcher button absent').not.toContain('id="app-switcher-button"')
      expect(html, 'switcher popover absent').not.toContain('id="app-switcher-popover"')
      expect(html, 'switcher loader absent').not.toContain('vfLoadAppSwitcher')
    })
  }
})

describe('app filter chip (option B): present on data pages, absent on others', () => {
  for (const page of ['dashboard.html', 'verifications.html', 'reputation.html']) {
    it(`${page} has the app filter chip + popover + loader`, () => {
      const html = read(page)
      expect(html, 'chip').toContain('id="app-chip"')
      expect(html, 'popover').toContain('id="app-chip-popover"')
      expect(html, 'list container').toContain('id="app-chip-list"')
      expect(html, 'search input').toContain('id="app-chip-search"')
      expect(html, '+ New app link in popover').toContain('href="/apps/new"')
      expect(html, 'loader fn').toContain('async function vfLoadAppChip')
      expect(html, 'switch fn').toContain('async function vfSelectAppChip')
      expect(html, 'PATCH /web/apps/current').toContain("'/web/apps/current'")
    })
  }
  for (const page of ['settings.html', 'onboarding.html']) {
    it(`${page} does NOT carry the chip (settings is the apps list itself; onboarding is single-app)`, () => {
      const html = read(page)
      expect(html, `${page} has no chip`).not.toContain('id="app-chip"')
    })
  }
})

describe('settings.html: Option A tab structure', () => {
  const html = read('settings.html')
  it('has three tabs: Apps | Billing | Account', () => {
    const tabsBlock = html.split('class="settings-tabs"')[1]?.split('</div>')[0] ?? ''
    expect(tabsBlock).toContain(">Apps<")
    expect(tabsBlock).toContain(">Billing<")
    expect(tabsBlock).toContain(">Account<")
  })
  it('uses data-tab attributes (not positional indexing) for tab activation', () => {
    expect(html).toContain('data-tab="apps"')
    expect(html).toContain('data-tab="billing"')
    expect(html).toContain('data-tab="account"')
    expect(html).toContain("t.getAttribute('data-tab') === tab")
  })
  it('Apps panel is default-active', () => {
    expect(html).toContain('class="panel active" id="panel-apps"')
  })
  it('panel-app, panel-api-keys, panel-webhooks no longer present', () => {
    expect(html).not.toContain('id="panel-app"')
    expect(html).not.toContain('id="panel-api-keys"')
    expect(html).not.toContain('id="panel-webhooks"')
  })
  it('panel-billing and panel-account remain', () => {
    expect(html).toContain('id="panel-billing"')
    expect(html).toContain('id="panel-account"')
  })
})

describe('settings.html: Apps list', () => {
  const html = read('settings.html')
  it('panel-apps has list container and "+ New app" link', () => {
    expect(html).toContain('id="apps-list"')
    expect(html).toContain('href="/apps/new"')
  })
  it('include-archived checkbox controls list filter', () => {
    expect(html).toContain('id="apps-include-archived"')
  })
  it('vfLoadApps is the loader function', () => {
    expect(html).toContain('async function vfLoadApps')
    expect(html).toContain("'/web/apps'")
  })
})

describe('settings.html: billing — "Lock in founding rate" removed', () => {
  const html = read('settings.html')
  it('partner inquiry CTA no longer rendered', () => {
    expect(html).not.toContain('Lock in founding rate')
    expect(html).not.toContain('id="partner-overlay"')
    expect(html).not.toContain('showPartnerForm')
    expect(html).not.toContain('hidePartnerForm')
  })
})

describe('apps-detail.html: per-app detail page', () => {
  const html = read('apps-detail.html')
  it('exists and loads DM Sans', () => {
    expect(html).toContain('DM Sans')
  })
  it('reads app id from /settings/apps/:id URL', () => {
    expect(html).toContain('/settings/apps/')
    expect(html).toContain('window.__VF_APP_ID__')
  })
  it('has identity inputs', () => {
    expect(html).toContain('id="input-app-name"')
    expect(html).toContain('id="input-app-slug"')
    expect(html).toContain('id="input-app-description"')
  })
  it('has API keys section with sandbox + live keys', () => {
    expect(html).toContain('id="sandbox-write-prefix"')
    expect(html).toContain('id="sandbox-read-prefix"')
    expect(html).toContain('id="live-keys-list"')
    expect(html).toContain('id="btn-create-live-key"')
  })
  it('has iOS attestation inputs', () => {
    expect(html).toContain('id="input-ios-team-id"')
    expect(html).toContain('id="input-ios-bundle-id"')
  })
  it('has Android attestation inputs', () => {
    expect(html).toContain('id="input-android-package-name"')
    expect(html).toContain('id="input-android-signing-key-sha256"')
  })
  it('has Web SDK section with toggle, RP ID, origins, JWKs URL', () => {
    expect(html).toContain('id="web-sdk-toggle"')
    expect(html).toContain('id="input-web-rp-id"')
    expect(html).toContain('id="web-origins-list"')
    expect(html).toContain('id="jwks-url"')
    expect(html).toContain('https://api.vouchflow.dev/.well-known/jwks.json')
  })
  it('has webhooks section', () => {
    expect(html).toContain('id="webhooks-list"')
    expect(html).toContain('id="input-new-webhook-url"')
    expect(html).toContain('id="btn-add-webhook"')
  })
  it('has confidence policy controls', () => {
    expect(html).toContain('id="select-verify-min"')
    expect(html).toContain('id="select-sign-min"')
    expect(html).toContain('id="context-overrides-list"')
  })
  it('has archive button + restore handler', () => {
    expect(html).toContain('id="btn-archive-app"')
    expect(html).toContain('id="btn-unarchive-app"')
  })
  it('PATCHes /web/apps/:appId for save flows', () => {
    expect(html).toContain('`/web/apps/${APP_ID}`')
  })
})

describe('apps-new.html: 3-step create flow (unchanged)', () => {
  const html = read('apps-new.html')
  it('exists and has all three steps', () => {
    expect(html).toContain('id="step-1"')
    expect(html).toContain('id="step-2"')
    expect(html).toContain('id="step-3"')
  })
  it('POSTs to /web/apps and redirects on finish', () => {
    expect(html).toContain("fetch('/web/apps'")
  })
})

describe('verifications.html: type filter + Web platform', () => {
  const html = read('verifications.html')
  it('has the type filter select', () => {
    expect(html).toContain('id="filter-type"')
    expect(html).toContain('value="verify">verify()')
    expect(html).toContain('value="sign">signPayload()')
  })
  it('platform filter includes Web', () => {
    expect(html).toMatch(/<option>iOS<\/option>\s*<option>Android<\/option>\s*<option>Web<\/option>/)
  })
  it('currentFilters() includes type', () => {
    expect(html).toContain('filters.type')
  })
})

describe('onboarding.html: Web platform tab in step 1 and step 2', () => {
  const html = read('onboarding.html')
  it('step 1 has Web (TypeScript) tab + web-install panel', () => {
    expect(html).toContain("switchTab(event,'web-install')")
    expect(html).toContain('id="web-install"')
    expect(html).toContain('@vouchflow/web')
  })
  it('step 2 has platform tabs incl. Web (TypeScript)', () => {
    expect(html).toContain("switchTab(event,'web-verify')")
    expect(html).toContain('id="web-verify"')
    expect(html).toContain('id="ios-verify"')
    expect(html).toContain('id="android-verify"')
  })
  it('Web snippet has a sandbox-read-key placeholder for injection', () => {
    expect(html).toContain('class="vf-sandbox-read-key"')
  })
})

describe('shared markup invariants', () => {
  it('all dashboard pages still load DM Sans', () => {
    for (const page of ['dashboard.html', 'verifications.html', 'reputation.html', 'settings.html', 'onboarding.html', 'apps-new.html', 'apps-detail.html']) {
      const html = read(page)
      expect(html, `${page} loads DM Sans`).toContain('DM Sans')
    }
  })
  it('settings.html still references the existing visual tokens', () => {
    const html = read('settings.html')
    for (const tok of ['--ink', '--ground', '--border', '--success', '--danger']) {
      expect(html).toContain(tok)
    }
  })
})
