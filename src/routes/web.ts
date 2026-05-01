import type { FastifyInstance } from 'fastify'
import { requireSession } from '../middleware/requireSession.js'
import { sendPartnerInquiry } from '../services/email.js'
import {
  getOverviewStats,
  getVerifications,
  getVerification,
  getDevices,
  getUsage,
  getWebhooks,
  createWebhook,
  deleteWebhook,
  updateCustomer,
  getCustomer,
  generateLiveKeys,
  getLiveKeys,
  deleteAccount,
} from '../services/apiClient.js'

function maskKey(key: string): string {
  if (!key) return ''
  return key.slice(0, 12) + '••••••••••••••••••••••••••••••••'
}

export default async function webRoutes(fastify: FastifyInstance) {

  fastify.addHook('preHandler', requireSession)

  // GET /web/session — current user info for frontend on load.
  // Also fetches the live customer record so per-customer attestation
  // parameters reflect the latest DB state without requiring re-login.
  fastify.get('/web/session', async (request) => {
    const customerId = request.session.get('customerId') as string | undefined
    let customer: Awaited<ReturnType<typeof getCustomer>> | null = null
    if (customerId) {
      try { customer = await getCustomer(customerId) } catch { /* fall through with nulls */ }
    }
    return {
      email:              request.session.get('email'),
      customerId,
      sandboxWriteKey:    maskKey(request.session.get('sandboxWriteKey') as string),
      sandboxReadKey:     maskKey(request.session.get('sandboxReadKey')  as string),
      webhookSecret:      maskKey(request.session.get('webhookSecret')   as string),
      onboardingComplete: request.session.get('onboardingComplete'),
      name:               request.session.get('name'),
      orgName:            request.session.get('orgName'),
      avatarUrl:          request.session.get('avatarUrl'),
      // Per-customer attestation parameters (live from DB)
      iosTeamId:               customer?.iosTeamId               ?? null,
      iosBundleId:             customer?.iosBundleId             ?? null,
      androidPackageName:      customer?.androidPackageName      ?? null,
      androidSigningKeySha256: customer?.androidSigningKeySha256 ?? null,
    }
  })

  // GET /web/overview
  fastify.get('/web/overview', async (request) => {
    const customerId      = request.session.get('customerId') as string
    const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
    return getOverviewStats(customerId, sandboxWriteKey)
  })

  // GET /web/verifications
  fastify.get<{
    Querystring: { limit?: string; offset?: string; confidence?: string; platform?: string }
  }>('/web/verifications', async (request) => {
    const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
    return getVerifications(sandboxWriteKey, {
      limit:      request.query.limit      ? parseInt(request.query.limit)  : 20,
      offset:     request.query.offset     ? parseInt(request.query.offset) : 0,
      confidence: request.query.confidence,
      platform:   request.query.platform,
    })
  })

  // GET /web/verifications/:sessionId
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

  // GET /web/devices
  fastify.get('/web/devices', async (request) => {
    const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
    return getDevices(sandboxWriteKey)
  })

  // GET /web/keys — masked keys from session
  fastify.get('/web/keys', async (request) => ({
    sandboxWriteKey: maskKey(request.session.get('sandboxWriteKey') as string),
    sandboxReadKey:  maskKey(request.session.get('sandboxReadKey')  as string),
    webhookSecret:   maskKey(request.session.get('webhookSecret')   as string),
  }))

  // GET /web/usage
  fastify.get('/web/usage', async (request) => {
    const customerId      = request.session.get('customerId') as string
    const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
    return getUsage(customerId, sandboxWriteKey)
  })

  // PATCH /web/account
  fastify.patch<{
    Body: {
      orgName?:                 string
      billingEmail?:            string
      minimumConfidence?:       string
      networkOptIn?:            boolean
      androidPackageName?:      string | null
      androidSigningKeySha256?: string | null
      iosTeamId?:               string | null
      iosBundleId?:             string | null
    }
  }>('/web/account', async (request) => {
    const customerId = request.session.get('customerId') as string
    const result = await updateCustomer(customerId, request.body)
    if (request.body.orgName !== undefined) {
      request.session.set('orgName', request.body.orgName || null)
    }
    return result
  })

  // POST /web/webhooks
  fastify.post<{ Body: { url: string; events: string[] } }>(
    '/web/webhooks',
    async (request) => {
      const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
      return createWebhook(sandboxWriteKey, request.body)
    }
  )

  // DELETE /web/webhooks/:webhookId
  fastify.delete<{ Params: { webhookId: string } }>(
    '/web/webhooks/:webhookId',
    async (request) => {
      const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
      await deleteWebhook(sandboxWriteKey, request.params.webhookId)
      return { ok: true }
    }
  )

  // PATCH /web/onboarding — mark onboarding complete
  fastify.patch<{ Body: { complete: boolean } }>(
    '/web/onboarding',
    async (request) => {
      request.session.set('onboardingComplete', request.body.complete)
      return { ok: true }
    }
  )

  // GET /web/webhooks — list webhook endpoints
  fastify.get('/web/webhooks', async (request) => {
    const customerId      = request.session.get('customerId') as string
    const sandboxWriteKey = request.session.get('sandboxWriteKey') as string
    try {
      return await getWebhooks(customerId, sandboxWriteKey)
    } catch {
      return { webhooks: [] }
    }
  })

  // POST /web/partner-inquiry
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

  // GET /web/keys/reveal — full unmasked keys (session-protected, never logged)
  fastify.get('/web/keys/reveal', async (request) => ({
    sandboxWriteKey: request.session.get('sandboxWriteKey') as string,
    sandboxReadKey:  request.session.get('sandboxReadKey')  as string,
    webhookSecret:   request.session.get('webhookSecret')   as string,
  }))

  // POST /web/live-keys — generate live write+read key pair (raw keys returned once)
  fastify.post('/web/live-keys', async (request, reply) => {
    const customerId = request.session.get('customerId') as string
    try {
      const result = await generateLiveKeys(customerId)
      return result
    } catch (err) {
      fastify.log.error({ err, event: 'live_key_generation_failed' })
      return reply.status(500).send({ error: 'generation_failed' })
    }
  })

  // DELETE /web/account — permanently delete the customer account and all data
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

  // GET /web/live-keys — metadata for active live keys (no raw values)
  fastify.get('/web/live-keys', async (request, reply) => {
    const customerId = request.session.get('customerId') as string
    try {
      return await getLiveKeys(customerId)
    } catch (err) {
      fastify.log.error({ err, event: 'live_key_fetch_failed' })
      return reply.status(500).send({ error: 'fetch_failed' })
    }
  })
}
