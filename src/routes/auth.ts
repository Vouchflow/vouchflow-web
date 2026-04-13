import type { FastifyInstance } from 'fastify'
import { createToken, consumeToken, checkRateLimit } from '../services/tokenStore.js'
import { sendMagicLink } from '../services/email.js'
import { findOrCreateCustomer } from '../services/apiClient.js'

const BLOCKED_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'protonmail.com', 'mail.com', 'aol.com', 'yandex.com', 'gmx.com',
  'guerrillamail.com', 'temp-mail.org', 'mailinator.com', 'throwaway.email',
  '10minutemail.com', 'trashmail.com', 'sharklasers.com', 'tempmail.com',
])

export default async function authRoutes(fastify: FastifyInstance) {

  // POST /auth/magic-link
  fastify.post<{ Body: { email: string } }>(
    '/auth/magic-link',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string', format: 'email' } },
        },
      },
    },
    async (request, reply) => {
      const email  = request.body.email.toLowerCase().trim()
      const domain = email.split('@')[1]

      if (!domain || BLOCKED_DOMAINS.has(domain)) {
        return reply.status(400).send({ error: 'invalid_email_domain' })
      }

      const allowed = await checkRateLimit(email)
      if (!allowed) {
        return reply.status(429).send({ error: 'rate_limit_exceeded' })
      }

      const token = await createToken(email)
      await sendMagicLink(email, token)

      const masked = `${email.slice(0, 2)}***@${domain}`
      fastify.log.info({ masked, event: 'magic_link_sent' })

      return reply.send({ ok: true })
    }
  )

  // GET /auth/verify
  fastify.get<{ Querystring: { token?: string } }>(
    '/auth/verify',
    async (request, reply) => {
      const { token } = request.query

      if (!token) {
        return reply.redirect('/signup?error=missing_token')
      }

      const email = await consumeToken(token)
      if (!email) {
        return reply.redirect('/signup?error=invalid_token')
      }

      let customer
      let isNew = false
      try {
        // findOrCreateCustomer returns the existing customer if found, or creates one.
        // We determine isNew by checking if createdAt is very recent (within 5s).
        const before = Date.now()
        customer = await findOrCreateCustomer(email)
        const age = Date.now() - new Date(customer.createdAt).getTime()
        isNew = age < 5000 && Date.now() - before < 5000
      } catch (err) {
        fastify.log.error({ err, event: 'customer_create_failed' })
        return reply.redirect('/signup?error=server_error')
      }

      fastify.log.info({ customerId: customer.id, event: 'magic_link_verified' })

      request.session.set('email',              customer.email)
      request.session.set('customerId',         customer.id)
      request.session.set('sandboxWriteKey',    customer.sandboxWriteKey)
      request.session.set('sandboxReadKey',     customer.sandboxReadKey)
      request.session.set('webhookSecret',      customer.webhookSecret)
      request.session.set('createdAt',          customer.createdAt)
      request.session.set('onboardingComplete', !isNew)

      return reply.redirect(isNew ? '/onboarding' : '/dashboard')
    }
  )

  // POST /auth/signout
  fastify.post('/auth/signout', async (request, reply) => {
    await request.session.destroy()
    return reply.redirect('/')
  })
}
