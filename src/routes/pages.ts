import type { FastifyInstance } from 'fastify'
import { requireSession } from '../middleware/requireSession.js'

export default async function pageRoutes(fastify: FastifyInstance) {

  // Public
  fastify.get('/',              async (_, reply) => reply.sendFile('index.html'))
  fastify.get('/signup',        async (_, reply) => reply.sendFile('signup.html'))
  fastify.get('/docs',          async (_, reply) => reply.sendFile('docs.html'))
  fastify.get('/api-reference', async (_, reply) => reply.sendFile('api-reference.html'))
  fastify.get('/terms',         async (_, reply) => reply.sendFile('terms.html'))
  fastify.get('/privacy',       async (_, reply) => reply.sendFile('privacy.html'))

  // Protected
  const guard = { preHandler: requireSession }

  fastify.get('/onboarding',    guard, async (_, reply) => reply.sendFile('onboarding.html'))
  fastify.get('/dashboard',     guard, async (_, reply) => reply.sendFile('dashboard.html'))
  fastify.get('/verifications', guard, async (_, reply) => reply.sendFile('verifications.html'))
  fastify.get('/settings',      guard, async (_, reply) => reply.sendFile('settings.html'))
  fastify.get('/reputation',    guard, async (_, reply) => reply.sendFile('reputation.html'))
}
