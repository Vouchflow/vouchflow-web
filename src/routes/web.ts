import type { FastifyInstance } from 'fastify'
import { requireSession } from '../middleware/requireSession.js'
import { sendPartnerInquiry } from '../services/email.js'
import {
  getOverviewStats,
  getCustomerOverview,
  getVerifications,
  getVerification,
  getDevices,
  getUsage,
  getWebhooks,
  createWebhook,
  deleteWebhook,
  updateCustomer,
  getLiveKeys,
  generateLiveKeys,
  revokeLiveKey,
  rotateLiveKey,
  generateInitialLiveKeys,
  deleteAccount,
  listApps,
  getApp,
  createApp,
  updateApp,
  archiveApp,
  unarchiveApp,
  listAppWebhooks,
  createAppWebhook,
  deleteAppWebhook,
  ApiError,
} from '../services/apiClient.js'
import type { AppPatch } from '../services/apiClient.js'

function maskKey(key: string): string {
  if (!key) return ''
  // Show the prefix and the last 4 chars so a key stays identifiable (e.g.
  // after rotation) without revealing the secret. The middle is masked.
  if (key.length < 16) return '••••••••'
  return key.slice(0, 12) + '••••••••' + key.slice(-4)
}

/** Forwards 4xx errors verbatim, 500s on 5xx. Used everywhere a /web route
 *  proxies the API and the dashboard wants to surface the API's error code. */
function relayApiError(fastify: FastifyInstance, reply: any, err: unknown, event: string) {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
    return reply.status(err.status).send(err.body)
  }
  fastify.log.error({ err, event })
  return reply.status(500).send({ error: 'request_failed' })
}

/** After mutations that change the active App's keys (create, switch, archive
 *  the current app), rewrite the relevant session fields atomically. */
async function setActiveApp(request: any, customerId: string, appId: string): Promise<void> {
  const detail = await getApp(customerId, appId)
  request.session.set('appId',   detail.id)
  request.session.set('appSlug', detail.slug)
  request.session.set('appName', detail.name)
  // Sandbox keys: the detail endpoint only returns prefixes. We preserve
  // whatever raw keys the session already holds for that app — switching
  // apps DOES NOT re-issue keys; raw values persist only across a single
  // creation event. Best-effort: store prefix as a placeholder if absent.
  if (!request.session.get('sandboxWriteKey')) {
    request.session.set('sandboxWriteKey', detail.sandboxWriteKeyPrefix ?? '')
  }
  if (!request.session.get('sandboxReadKey')) {
    request.session.set('sandboxReadKey', detail.sandboxReadKeyPrefix ?? '')
  }
}

export default async function webRoutes(fastify: FastifyInstance) {

  fastify.addHook('preHandler', requireSession)

  // GET /web/session — current user + current app context
  fastify.get('/web/session', async (request) => {
    const customerId = request.session.get('customerId') as string | undefined
    const appId      = request.session.get('appId') as string | undefined
    let appsList: Awaited<ReturnType<typeof listApps>>['apps'] = []
    let liveKeyCount = 0
    let currentApp: Awaited<ReturnType<typeof getApp>> | null = null

    if (customerId) {
      try { appsList = (await listApps(customerId)).apps } catch { /* fall through */ }
      if (appId) {
        try { currentApp = await getApp(customerId, appId) } catch { /* fall through */ }
        try { liveKeyCount = (await getLiveKeys(customerId, appId)).keys.length } catch { /* fall through */ }
      }
    }
    const env = (request.session.get('env') as 'sandbox' | 'production' | undefined) ?? 'sandbox'

    return {
      email:              request.session.get('email'),
      customerId,
      appId:              appId ?? null,
      appSlug:            request.session.get('appSlug') ?? null,
      appName:            request.session.get('appName') ?? null,
      apps:               appsList,
      sandboxWriteKey:    maskKey(request.session.get('sandboxWriteKey') as string),
      sandboxReadKey:     maskKey(request.session.get('sandboxReadKey')  as string),
      webhookSecret:      maskKey(request.session.get('webhookSecret')   as string),
      onboardingComplete: request.session.get('onboardingComplete'),
      name:               request.session.get('name'),
      orgName:            request.session.get('orgName'),
      avatarUrl:          request.session.get('avatarUrl'),
      // Per-app attestation parameters (live from DB)
      iosTeamId:               currentApp?.iosTeamId               ?? null,
      iosBundleId:             currentApp?.iosBundleId             ?? null,
      androidPackageName:      currentApp?.androidPackageName      ?? null,
      androidSigningKeySha256: currentApp?.androidSigningKeySha256 ?? null,
      // Web SDK + confidence policy from current App
      webSdkEnabled:              currentApp?.webSdkEnabled              ?? false,
      webRpId:                    currentApp?.webRpId                    ?? null,
      webAllowedOrigins:          currentApp?.webAllowedOrigins          ?? [],
      verifyMinConfidence:        currentApp?.verifyMinConfidence        ?? null,
      signPayloadMinConfidence:   currentApp?.signPayloadMinConfidence   ?? null,
      contextConfidenceOverrides: currentApp?.contextConfidenceOverrides ?? {},
      env,
      liveKeyCount,
    }
  })

  // ── Apps surface ───────────────────────────────────────────────────────

  // GET /web/apps — list apps for the current customer
  fastify.get<{ Querystring: { includeArchived?: string } }>(
    '/web/apps',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        return await listApps(customerId, { includeArchived: request.query.includeArchived === 'true' })
      } catch (err) {
        return relayApiError(fastify, reply, err, 'list_apps_failed')
      }
    }
  )

  // POST /web/apps — create a new app
  fastify.post<{ Body: { name?: string; slug?: string; description?: string } }>(
    '/web/apps',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        const created = await createApp(customerId, {
          name: request.body?.name ?? '',
          slug: request.body?.slug,
          description: request.body?.description,
        })
        return reply.status(201).send(created)
      } catch (err) {
        return relayApiError(fastify, reply, err, 'create_app_failed')
      }
    }
  )

  // GET /web/apps/current — full detail for the current app
  fastify.get('/web/apps/current', async (request, reply) => {
    const customerId = request.session.get('customerId') as string
    const appId      = request.session.get('appId') as string | undefined
    if (!appId) {
      return reply.status(404).send({ error: { code: 'no_active_app', message: 'No active app in session.' } })
    }
    try {
      return await getApp(customerId, appId)
    } catch (err) {
      return relayApiError(fastify, reply, err, 'get_current_app_failed')
    }
  })

  // PATCH /web/apps/current — switch the active app
  fastify.patch<{ Body: { appId: string } }>('/web/apps/current', async (request, reply) => {
    const customerId = request.session.get('customerId') as string
    const targetId = request.body?.appId
    if (!targetId || typeof targetId !== 'string') {
      return reply.status(400).send({ error: { code: 'invalid_request', message: 'appId required.' } })
    }
    try {
      // Verify the app belongs to this customer (4xx handled below).
      const detail = await getApp(customerId, targetId)
      if (detail.archivedAt) {
        return reply.status(409).send({ error: { code: 'app_archived', message: 'Cannot switch to an archived app.' } })
      }
      // Switching apps clears the previously-cached sandbox keys — they
      // belonged to the old app. The new app's raw keys are not in our
      // hands (App detail returns prefix only); the dashboard will treat
      // the placeholder as the masked value.
      request.session.set('sandboxWriteKey', '')
      request.session.set('sandboxReadKey',  '')
      request.session.set('appId',   detail.id)
      request.session.set('appSlug', detail.slug)
      request.session.set('appName', detail.name)
      // Switching to an app with no live keys forces sandbox env.
      try {
        const { keys } = await getLiveKeys(customerId, targetId)
        if (keys.length === 0 && request.session.get('env') === 'production') {
          request.session.set('env', 'sandbox')
        }
      } catch {}
      return { ok: true, app: { id: detail.id, slug: detail.slug, name: detail.name } }
    } catch (err) {
      return relayApiError(fastify, reply, err, 'switch_app_failed')
    }
  })

  // GET /web/apps/:appId
  fastify.get<{ Params: { appId: string } }>('/web/apps/:appId', async (request, reply) => {
    const customerId = request.session.get('customerId') as string
    try {
      return await getApp(customerId, request.params.appId)
    } catch (err) {
      return relayApiError(fastify, reply, err, 'get_app_failed')
    }
  })

  // PATCH /web/apps/:appId
  fastify.patch<{ Params: { appId: string }; Body: AppPatch }>(
    '/web/apps/:appId',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        const updated = await updateApp(customerId, request.params.appId, request.body)
        // If we PATCHed the currently-active app, sync session-cached name/slug.
        if (request.params.appId === request.session.get('appId')) {
          request.session.set('appSlug', updated.slug)
          request.session.set('appName', updated.name)
        }
        return updated
      } catch (err) {
        return relayApiError(fastify, reply, err, 'update_app_failed')
      }
    }
  )

  // POST /web/apps/:appId/archive
  fastify.post<{ Params: { appId: string } }>(
    '/web/apps/:appId/archive',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        await archiveApp(customerId, request.params.appId)
        // If the user just archived their currently-active app, switch to
        // another non-archived app. (The API blocks archiving the last
        // non-archived app with last_app, so a fallback always exists.)
        if (request.params.appId === request.session.get('appId')) {
          const { apps } = await listApps(customerId)
          const next = apps[0]
          if (next) {
            await setActiveApp(request, customerId, next.id)
          } else {
            request.session.set('appId',   '')
            request.session.set('appSlug', '')
            request.session.set('appName', '')
          }
        }
        return { ok: true }
      } catch (err) {
        return relayApiError(fastify, reply, err, 'archive_app_failed')
      }
    }
  )

  // POST /web/apps/:appId/unarchive
  fastify.post<{ Params: { appId: string } }>(
    '/web/apps/:appId/unarchive',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        await unarchiveApp(customerId, request.params.appId)
        return { ok: true }
      } catch (err) {
        return relayApiError(fastify, reply, err, 'unarchive_app_failed')
      }
    }
  )

  // GET /web/apps/:appId/live-keys
  fastify.get<{ Params: { appId: string } }>(
    '/web/apps/:appId/live-keys',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        return await getLiveKeys(customerId, request.params.appId)
      } catch (err) {
        return relayApiError(fastify, reply, err, 'list_live_keys_failed')
      }
    }
  )

  // POST /web/apps/:appId/live-keys
  fastify.post<{ Params: { appId: string }; Body: { scope?: 'pair' | 'write' | 'read' } }>(
    '/web/apps/:appId/live-keys',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        return await generateLiveKeys(customerId, request.params.appId, request.body?.scope ?? 'pair')
      } catch (err) {
        return relayApiError(fastify, reply, err, 'create_live_key_failed')
      }
    }
  )

  // DELETE /web/apps/:appId/live-keys/:keyId
  fastify.delete<{ Params: { appId: string; keyId: string } }>(
    '/web/apps/:appId/live-keys/:keyId',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        await revokeLiveKey(customerId, request.params.appId, request.params.keyId)
        return { ok: true }
      } catch (err) {
        return relayApiError(fastify, reply, err, 'revoke_live_key_failed')
      }
    }
  )

  // POST /web/apps/:appId/live-keys/rotate — rotate a live key (creates new, deprecates old)
  fastify.post<{ Params: { appId: string }; Body: { scope: 'write' | 'read' } }>(
    '/web/apps/:appId/live-keys/rotate',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        return await rotateLiveKey(customerId, request.params.appId, request.body.scope)
      } catch (err) {
        return relayApiError(fastify, reply, err, 'rotate_live_key_failed')
      }
    }
  )

  // POST /web/apps/:appId/live-keys/generate — generate initial live keys (write + read pair)
  fastify.post<{ Params: { appId: string } }>(
    '/web/apps/:appId/live-keys/generate',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        return await generateInitialLiveKeys(customerId, request.params.appId)
      } catch (err) {
        return relayApiError(fastify, reply, err, 'generate_initial_live_keys_failed')
      }
    }
  )

  // ── Per-app webhooks (admin proxy) ────────────────────────────────────
  fastify.get<{ Params: { appId: string } }>(
    '/web/apps/:appId/webhooks',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        return await listAppWebhooks(customerId, request.params.appId)
      } catch (err) {
        return relayApiError(fastify, reply, err, 'list_app_webhooks_failed')
      }
    }
  )
  fastify.post<{ Params: { appId: string }; Body: { url: string; events: string[] } }>(
    '/web/apps/:appId/webhooks',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        return await createAppWebhook(customerId, request.params.appId, request.body)
      } catch (err) {
        return relayApiError(fastify, reply, err, 'create_app_webhook_failed')
      }
    }
  )
  fastify.delete<{ Params: { appId: string; webhookId: string } }>(
    '/web/apps/:appId/webhooks/:webhookId',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      try {
        await deleteAppWebhook(customerId, request.params.appId, request.params.webhookId)
        return { ok: true }
      } catch (err) {
        return relayApiError(fastify, reply, err, 'delete_app_webhook_failed')
      }
    }
  )

  // GET /web/customer/overview — customer-wide aggregate across all apps
  fastify.get<{ Querystring: { range?: string } }>(
    '/web/customer/overview',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      const env = (request.session.get('env') as 'sandbox' | 'production' | undefined) ?? 'sandbox'
      try {
        return await getCustomerOverview(customerId, env, request.query.range ?? '7d')
      } catch (err) {
        return relayApiError(fastify, reply, err, 'customer_overview_failed')
      }
    }
  )

  // ── Existing dashboard surface (now app-scoped via session) ────────────

  fastify.patch<{ Body: { env?: string } }>(
    '/web/env',
    async (request, reply) => {
      const next = request.body?.env
      if (next !== 'sandbox' && next !== 'production') {
        return reply.code(400).send({
          error: { code: 'invalid_request', message: 'env must be "sandbox" or "production".' },
        })
      }
      if (next === 'production') {
        const customerId = request.session.get('customerId') as string
        const appId      = request.session.get('appId') as string | undefined
        if (!appId) {
          return reply.code(409).send({ error: { code: 'no_active_app', message: 'No active app in session.' } })
        }
        try {
          const { keys } = await getLiveKeys(customerId, appId)
          if (keys.length === 0) {
            return reply.code(409).send({
              error: {
                code: 'no_live_key',
                message: 'Create a live API key for this app before switching to production mode.',
              },
            })
          }
        } catch (err) {
          fastify.log.error({ err, event: 'env_switch_live_keys_check_failed' })
          return reply.code(500).send({ error: 'check_failed' })
        }
      }
      request.session.set('env', next)
      return { ok: true, env: next }
    }
  )

  // GET /web/overview — current app's stats
  fastify.get<{ Querystring: { range?: string } }>('/web/overview', async (request) => {
    const customerId      = request.session.get('customerId') as string
    const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
    const env             = (request.session.get('env') as 'sandbox' | 'production' | undefined) ?? 'sandbox'
    return getOverviewStats(customerId, sandboxWriteKey, env, request.query.range)
  })

  fastify.get<{
    Querystring: { limit?: string; offset?: string; confidence?: string; platform?: string; range?: string; result?: string; type?: string }
  }>('/web/verifications', async (request) => {
    const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
    const env             = (request.session.get('env') as 'sandbox' | 'production' | undefined) ?? 'sandbox'
    return getVerifications(sandboxWriteKey, {
      limit:      request.query.limit      ? parseInt(request.query.limit)  : 20,
      offset:     request.query.offset     ? parseInt(request.query.offset) : 0,
      confidence: request.query.confidence,
      platform:   request.query.platform,
      range:      request.query.range,
      result:     request.query.result,
      type:       request.query.type,
      env,
    })
  })

  fastify.get<{ Params: { sessionId: string } }>(
    '/web/verifications/:sessionId',
    async (request, reply) => {
      const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
      try {
        return await getVerification(request.params.sessionId, sandboxWriteKey)
      } catch {
        return reply.status(404).send({ error: 'not_found' })
      }
    }
  )

  fastify.get('/web/devices', async (request) => {
    const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
    return getDevices(sandboxWriteKey)
  })

  fastify.get('/web/keys', async (request) => ({
    sandboxWriteKey: maskKey(request.session.get('sandboxWriteKey') as string),
    sandboxReadKey:  maskKey(request.session.get('sandboxReadKey')  as string),
    webhookSecret:   maskKey(request.session.get('webhookSecret')   as string),
  }))

  fastify.get('/web/usage', async (request) => {
    const customerId      = request.session.get('customerId') as string
    const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
    return getUsage(customerId, sandboxWriteKey)
  })

  // PATCH /web/account — customer-level fields only (orgName, billingEmail,
  // minimumConfidence, networkOptIn). Per-app fields PATCH /web/apps/:id.
  fastify.patch<{
    Body: {
      orgName?:           string
      billingEmail?:      string
      minimumConfidence?: string
      networkOptIn?:      boolean
    }
  }>('/web/account', async (request) => {
    const customerId = request.session.get('customerId') as string
    const result = await updateCustomer(customerId, request.body)
    if (request.body.orgName !== undefined) {
      request.session.set('orgName', request.body.orgName || null)
    }
    return result
  })

  fastify.post<{ Body: { url: string; events: string[] } }>(
    '/web/webhooks',
    async (request) => {
      const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
      return createWebhook(sandboxWriteKey, request.body)
    }
  )

  fastify.delete<{ Params: { webhookId: string } }>(
    '/web/webhooks/:webhookId',
    async (request) => {
      const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
      await deleteWebhook(sandboxWriteKey, request.params.webhookId)
      return { ok: true }
    }
  )

  fastify.patch<{ Body: { complete: boolean } }>(
    '/web/onboarding',
    async (request) => {
      request.session.set('onboardingComplete', request.body.complete)
      return { ok: true }
    }
  )

  fastify.get('/web/webhooks', async (request) => {
    const customerId      = request.session.get('customerId') as string
    const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
    try {
      return await getWebhooks(customerId, sandboxWriteKey)
    } catch {
      return { webhooks: [] }
    }
  })

  fastify.post<{ Body: { building?: string; volume?: string; notes?: string } }>(
    '/web/partner-inquiry',
    async (request, reply) => {
      const email = request.session.get('email') as string
      try {
        await sendPartnerInquiry(email, {
          building: request.body.building ?? '',
          volume:   request.body.volume   ?? '',
          notes:    request.body.notes    ?? '',
        })
        return { ok: true }
      } catch (err) {
        fastify.log.error({ err, event: 'partner_inquiry_failed' })
        return reply.status(500).send({ error: 'send_failed' })
      }
    }
  )

  fastify.get('/web/keys/reveal', async (request) => ({
    sandboxWriteKey: request.session.get('sandboxWriteKey') as string,
    sandboxReadKey:  request.session.get('sandboxReadKey')  as string,
    webhookSecret:   request.session.get('webhookSecret')   as string,
  }))

  // Legacy /web/live-keys endpoints — proxy to the current app's keys for
  // back-compat with dashboard pages that haven't been updated to use the
  // /web/apps/:appId/live-keys path. New dashboard code should call the
  // app-scoped path directly.
  fastify.post<{ Body: { scope?: 'pair' | 'write' | 'read' } }>(
    '/web/live-keys',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      const appId      = request.session.get('appId') as string | undefined
      if (!appId) {
        return reply.status(409).send({ error: { code: 'no_active_app', message: 'No active app in session.' } })
      }
      try {
        return await generateLiveKeys(customerId, appId, request.body?.scope ?? 'pair')
      } catch (err) {
        return relayApiError(fastify, reply, err, 'live_key_generation_failed')
      }
    }
  )

  fastify.delete<{ Params: { keyId: string } }>(
    '/web/live-keys/:keyId',
    async (request, reply) => {
      const customerId = request.session.get('customerId') as string
      const appId      = request.session.get('appId') as string | undefined
      if (!appId) {
        return reply.status(409).send({ error: { code: 'no_active_app', message: 'No active app in session.' } })
      }
      try {
        await revokeLiveKey(customerId, appId, request.params.keyId)
        return { ok: true }
      } catch (err) {
        return relayApiError(fastify, reply, err, 'live_key_revocation_failed')
      }
    }
  )

  fastify.get('/web/live-keys', async (request, reply) => {
    const customerId = request.session.get('customerId') as string
    const appId      = request.session.get('appId') as string | undefined
    if (!appId) return { keys: [] }
    try {
      return await getLiveKeys(customerId, appId)
    } catch (err) {
      fastify.log.error({ err, event: 'live_key_fetch_failed' })
      return reply.status(500).send({ error: 'fetch_failed' })
    }
  })

  fastify.delete('/web/account', async (request, reply) => {
    const customerId = request.session.get('customerId') as string
    try {
      await deleteAccount(customerId)
      await request.session.destroy()
      return reply.send({ ok: true })
    } catch (err) {
      fastify.log.error({ err, event: 'account_deletion_failed' })
      return reply.status(500).send({ error: 'deletion_failed' })
    }
  })
}
