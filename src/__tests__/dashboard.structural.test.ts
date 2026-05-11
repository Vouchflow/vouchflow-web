// Structural smoke tests for the dashboard HTML pages. These don't render
// the pages in a browser — they assert that the static markup contains the
// anchors the apps refactor depends on, so that diffs that accidentally
// remove the App switcher or the new App tab are caught in CI.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PUBLIC = resolve(__dirname, '../../public')
function read(p: string): string { return readFileSync(resolve(PUBLIC, p), 'utf8') }

describe('app switcher: present on all dashboard pages', () => {
  for (const page of ['dashboard.html', 'verifications.html', 'reputation.html', 'settings.html', 'onboarding.html']) {
    it(`${page} has the app-switcher button + popover + load script`, () => {
      const html = read(page)
      expect(html, 'switcher button').toContain('id="app-switcher-button"')
      expect(html, 'switcher popover').toContain('id="app-switcher-popover"')
      expect(html, 'list container').toContain('id="app-switcher-list"')
      expect(html, '+ New app link').toContain('href="/apps/new"')
      expect(html, 'load function').toContain('vfLoadAppSwitcher')
      expect(html, 'switch handler').toContain('vfSwitchApp')
    })
  }
})

describe('settings.html: restructured tabs', () => {
  const html = read('settings.html')
  it('has all five tabs in the new order', () => {
    // App should be the first (and default-active) tab.
    const tabsBlock = html.split('class="settings-tabs"')[1]?.split('</div>')[0] ?? ''
    expect(tabsBlock).toContain(">App<")
    expect(tabsBlock).toContain(">API Keys<")
    expect(tabsBlock).toContain(">Webhooks<")
    expect(tabsBlock).toContain(">Billing<")
    expect(tabsBlock).toContain(">Account<")
    // App tab is default-active
    expect(html).toContain('class="settings-tab active" onclick="switchTab(\'app\')"')
  })
  it('has panel-app, panel-webhooks, panel-api-keys, panel-billing, panel-account', () => {
    expect(html).toContain('id="panel-app"')
    expect(html).toContain('id="panel-webhooks"')
    expect(html).toContain('id="panel-api-keys"')
    expect(html).toContain('id="panel-billing"')
    expect(html).toContain('id="panel-account"')
  })
  it('panel-app default-active, panel-api-keys not active', () => {
    expect(html).toContain('class="panel active" id="panel-app"')
    expect(html).toContain('class="panel" id="panel-api-keys"')
  })
})

describe('settings.html: App tab fields', () => {
  const html = read('settings.html')
  it('has identity inputs (name, slug, description)', () => {
    expect(html).toContain('id="input-app-name"')
    expect(html).toContain('id="input-app-slug"')
    expect(html).toContain('id="input-app-description"')
  })
  it('has iOS attestation inputs', () => {
    expect(html).toContain('id="input-ios-team-id"')
    expect(html).toContain('id="input-ios-bundle-id"')
  })
  it('has Android attestation inputs', () => {
    expect(html).toContain('id="input-android-package-name"')
    expect(html).toContain('id="input-android-signing-key-sha256"')
  })
  it('has Web SDK section: enable toggle, RP ID, allowed origins, JWKs URL', () => {
    expect(html).toContain('id="web-sdk-toggle"')
    expect(html).toContain('id="input-web-rp-id"')
    expect(html).toContain('id="web-origins-list"')
    expect(html).toContain('id="btn-add-origin"')
    expect(html).toContain('id="jwks-url"')
    expect(html).toContain('https://api.vouchflow.dev/.well-known/jwks.json')
  })
  it('has confidence policy controls', () => {
    expect(html).toContain('id="select-verify-min"')
    expect(html).toContain('id="select-sign-min"')
    expect(html).toContain('id="context-overrides-list"')
    expect(html).toContain('id="btn-add-context-override"')
  })
  it('has archive button', () => {
    expect(html).toContain('id="btn-archive-app"')
  })
})

describe('settings.html: Account tab no longer carries app fields', () => {
  const html = read('settings.html')
  it('Account panel does not contain attestation inputs', () => {
    // panel-account exists but should not duplicate the App-tab attestation fields.
    const accountPanel = html.split('id="panel-account"')[1]?.split('id="panel-app"')[0] ?? ''
    // Look for the comment that marks the moved-out section. The Account
    // panel should NOT contain a fresh ios-team-id input within its own
    // body. (panel-account is later in the file so we check up to end of
    // file from that anchor.)
    const tail = html.slice(html.indexOf('id="panel-account"'))
    // Tail before its panel close. We assume one input-ios-team-id exists
    // in the App panel (above panel-account in the file order).
    const occurrences = (tail.match(/id="input-ios-team-id"/g) ?? []).length
    expect(occurrences).toBe(0)
  })
})

describe('apps-new.html: 3-step create flow', () => {
  const html = read('apps-new.html')
  it('exists and has all three steps', () => {
    expect(html).toContain('id="step-1"')
    expect(html).toContain('id="step-2"')
    expect(html).toContain('id="step-3"')
  })
  it('step 1 has name/slug inputs and a create button', () => {
    expect(html).toContain('id="input-name"')
    expect(html).toContain('id="input-slug"')
    expect(html).toContain('id="btn-create"')
  })
  it('step 2 displays raw sandbox keys with copy', () => {
    expect(html).toContain('id="display-write-key"')
    expect(html).toContain('id="display-read-key"')
  })
  it('step 3 has platform cards and a finish button', () => {
    expect(html).toContain('data-platform="ios"')
    expect(html).toContain('data-platform="android"')
    expect(html).toContain('data-platform="web"')
    expect(html).toContain('id="btn-finish"')
  })
  it('POSTs to /web/apps and switches to the new app on finish', () => {
    expect(html).toContain("fetch('/web/apps'")
    expect(html).toContain("/web/apps/current")
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
    // The existing platform select has options "All platforms / iOS / Android / Web"
    expect(html).toMatch(/<option>iOS<\/option>\s*<option>Android<\/option>\s*<option>Web<\/option>/)
  })
  it('currentFilters() includes type', () => {
    expect(html).toContain("filters.type")
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
  it('switchTab knows the new tab ids', () => {
    expect(html).toContain("'web-install'")
    expect(html).toContain("'ios-verify'")
    expect(html).toContain("'web-verify'")
  })
})

describe('shared markup invariants', () => {
  it('all dashboard pages still load DM Sans / DM Mono', () => {
    for (const page of ['dashboard.html', 'verifications.html', 'reputation.html', 'settings.html', 'onboarding.html', 'apps-new.html']) {
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
