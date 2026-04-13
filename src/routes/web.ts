import type { FastifyInstance } from 'fastify'
import { requireSession } from '../middleware/requireSession.js'
import {
  getOverviewStats,
  getVerifications,
  getVerification,
  getDevices,
  getUsage,
  createWebhook,
  deleteWebhook,
  updateCustomer,
} from '../services/apiClient.js'

function maskKey(key: string): string {
  if (!key) return ''
  return key.slice(0, 12) + '••••••••••••••••••••••••••••••••'
}

export default async function webRoutes(fastify: FastifyInstance) {

  fastify.addHook('preHandler', requireSession)

  // GET /web/session — current user info for frontend on load
  fastify.get('/web/session', async (request) => ({
    email:              request.session.get('email'),
    customerId:         request.session.get('customerId'),
    sandboxWriteKey:    maskKey(request.session.get('sandboxWriteKey') as string),
    sandboxReadKey:     maskKey(request.session.get('sandboxReadKey')  as string),
    webhookSecret:      maskKey(request.session.get('webhookSecret')   as string),
    onboardingComplete: request.session.get('onboardingComplete'),
  }))

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
    Body: { orgName?: string; billingEmail?: string; minimumConfidence?: string; networkOptIn?: boolean }
  }>('/web/account', async (request) => {
    const customerId = request.session.get('customerId') as string
    return updateCustomer(customerId, request.body)
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
}
