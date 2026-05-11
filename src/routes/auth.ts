import type { FastifyInstance } from 'fastify'
import oauthPlugin from '@fastify/oauth2'
import type { OAuth2Namespace } from '@fastify/oauth2'
import { findOrCreateCustomer, updateCustomer, listApps, getApp } from '../services/apiClient.js'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth2: OAuth2Namespace
    githubOAuth2: OAuth2Namespace
  }
}

// Domains that are not indicative of a company
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk',
  'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'pm.me', 'live.com', 'msn.com', 'aol.com',
])

function detectOrgName(
  email: string,
  googleHd: string | null | undefined,
  githubCompany: string | null | undefined
): string | null {
  // GitHub company field is most explicit
  if (githubCompany) {
    const cleaned = githubCompany.replace(/^@/, '').trim()
    if (cleaned) return cleaned
  }
  // Google Workspace hosted domain (hd = hosted domain, e.g. "acme.com")
  if (googleHd && !PERSONAL_DOMAINS.has(googleHd)) {
    const name = googleHd.split('.')[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  // Fall back to email domain
  const domain = email.split('@')[1]?.toLowerCase()
  if (domain && !PERSONAL_DOMAINS.has(domain)) {
    const name = domain.split('.')[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  return null
}

async function finalizeLogin(
  fastify: FastifyInstance,
  request: any,
  reply: any,
  opts: {
    email:     string
    name:      string
    avatarUrl: string | null
    orgName:   string | null
    provider:  string
  }
) {
  const { email, name, avatarUrl, orgName, provider } = opts

  let customer
  let isNew = false
  try {
    const before = Date.now()
    customer = await findOrCreateCustomer(email)
    const age = Date.now() - new Date(customer.createdAt).getTime()
    isNew = age < 8000 && Date.now() - before < 8000
  } catch (err) {
    fastify.log.error({ err, event: 'customer_create_failed', provider })
    return reply.redirect('/signup?error=server_error')
  }

  // Save org name to customer record on first login (best-effort)
  if (isNew && orgName) {
    try { await updateCustomer(customer.id, { orgName }) } catch {}
  }

  // Apps refactor: pick the default App for this session. For new customers
  // the API auto-created one with sandbox keys returned in the
  // findOrCreateCustomer response; for existing customers we list their
  // apps and grab the first non-archived (alphabetical by slug) — usually
  // the migration's "default" app. If a customer has zero non-archived
  // apps (rare edge case post-migration) we still finalize the session
  // without app context; the dashboard middleware redirects them to the
  // create-an-app page.
  let appId: string | null = null
  let appSlug: string | null = null
  let appName: string | null = null
  let sandboxWriteKey: string | null = customer.sandboxWriteKey ?? null
  let sandboxReadKey:  string | null = customer.sandboxReadKey  ?? null

  try {
    const { apps } = await listApps(customer.id)
    if (apps.length > 0) {
      const sorted = [...apps].sort((a, b) => a.slug.localeCompare(b.slug))
      const target = sorted[0]
      appId   = target.id
      appSlug = target.slug
      appName = target.name
      // Need raw sandbox keys — the find-existing customer response doesn't
      // carry them. The App detail endpoint returns prefix only, so the
      // raw keys persist only across creation. For an EXISTING customer
      // without keys in the response, we have to look them up directly via
      // a privileged path — currently there isn't one. For now, prefer the
      // create-time keys when present, otherwise leave the session keys
      // null (existing customers retain whatever keys they already have
      // from a prior login). Future hardening: add a privileged
      // GET /v1/customers/:id/apps/:appId/sandbox-keys endpoint.
      if (!sandboxWriteKey) {
        try {
          const detail = await getApp(customer.id, target.id)
          // Detail returns prefix only — store the prefix so the dashboard
          // shows a placeholder, and rely on session preservation across
          // logins for the raw key.
          sandboxWriteKey = detail.sandboxWriteKeyPrefix ?? null
          sandboxReadKey  = detail.sandboxReadKeyPrefix  ?? null
        } catch {}
      }
    }
  } catch (err) {
    fastify.log.warn({ err, event: 'list_apps_failed_at_login' })
  }

  request.session.set('email',              customer.email)
  request.session.set('customerId',         customer.id)
  request.session.set('appId',              appId ?? '')
  request.session.set('appSlug',            appSlug ?? '')
  request.session.set('appName',            appName ?? '')
  request.session.set('sandboxWriteKey',    sandboxWriteKey ?? '')
  request.session.set('sandboxReadKey',     sandboxReadKey  ?? '')
  request.session.set('webhookSecret',      customer.webhookSecret)
  request.session.set('createdAt',          customer.createdAt)
  request.session.set('onboardingComplete', !isNew)
  request.session.set('name',              name)
  request.session.set('orgName',           orgName)
  request.session.set('avatarUrl',         avatarUrl)

  fastify.log.info({ customerId: customer.id, appId, isNew, provider, event: 'oauth_login' })
  return reply.redirect(isNew ? '/onboarding' : '/dashboard')
}

export default async function authRoutes(fastify: FastifyInstance) {

  // ── Google OAuth2 ──────────────────────────────────────────────────────────

  await fastify.register(oauthPlugin, {
    name: 'googleOAuth2',
    credentials: {
      client: { id: config.googleClientId, secret: config.googleClientSecret },
      auth: oauthPlugin.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: '/auth/google',
    callbackUri: `${config.webBaseUrl}/auth/google/callback`,
    scope: ['openid', 'email', 'profile'],
  })

  fastify.get('/auth/google/callback', async (request, reply) => {
    try {
      const { token } = await fastify.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request)

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      })
      if (!profileRes.ok) throw new Error(`Google userinfo failed: ${profileRes.status}`)

      const profile = await profileRes.json() as {
        email?: string
        email_verified?: boolean
        name?: string
        picture?: string
        hd?: string
      }

      if (!profile.email || !profile.email_verified) {
        return reply.redirect('/signup?error=unverified_email')
      }

      const email     = profile.email.toLowerCase()
      const name      = profile.name ?? email.split('@')[0]
      const avatarUrl = profile.picture ?? null
      const orgName   = detectOrgName(email, profile.hd, null)

      return finalizeLogin(fastify, request, reply, { email, name, avatarUrl, orgName, provider: 'google' })
    } catch (err) {
      fastify.log.error({ err, event: 'google_oauth_failed' })
      return reply.redirect('/signup?error=oauth_failed')
    }
  })

  // ── GitHub OAuth2 ──────────────────────────────────────────────────────────

  await fastify.register(oauthPlugin, {
    name: 'githubOAuth2',
    credentials: {
      client: { id: config.githubClientId, secret: config.githubClientSecret },
      auth: oauthPlugin.GITHUB_CONFIGURATION,
    },
    startRedirectPath: '/auth/github',
    callbackUri: `${config.webBaseUrl}/auth/github/callback`,
    scope: ['user:email', 'read:user'],
  })

  fastify.get('/auth/github/callback', async (request, reply) => {
    try {
      const { token } = await fastify.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request)

      const headers = {
        Authorization: `Bearer ${token.access_token}`,
        'User-Agent': 'Vouchflow',
        Accept: 'application/vnd.github+json',
      }

      const userRes = await fetch('https://api.github.com/user', { headers })
      if (!userRes.ok) throw new Error(`GitHub user failed: ${userRes.status}`)

      const user = await userRes.json() as {
        email:      string | null
        name:       string | null
        login:      string
        avatar_url: string
        company:    string | null
      }

      // GitHub may not expose email publicly; fetch the emails list
      let email = user.email
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', { headers })
        if (emailsRes.ok) {
          const emails = await emailsRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>
          email = emails.find(e => e.primary && e.verified)?.email ?? null
        }
      }

      if (!email) {
        return reply.redirect('/signup?error=no_github_email')
      }

      const name      = user.name ?? user.login
      const avatarUrl = user.avatar_url ?? null
      const orgName   = detectOrgName(email, null, user.company)

      return finalizeLogin(fastify, request, reply, {
        email: email.toLowerCase(), name, avatarUrl, orgName, provider: 'github',
      })
    } catch (err) {
      fastify.log.error({ err, event: 'github_oauth_failed' })
      return reply.redirect('/signup?error=oauth_failed')
    }
  })

  // ── Sign out ───────────────────────────────────────────────────────────────

  fastify.post('/auth/signout', async (request, reply) => {
    await request.session.destroy()
    return reply.redirect('/')
  })
}
