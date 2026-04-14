import type { FastifyInstance } from 'fastify'
import { requireSession } from '../middleware/requireSession.js'

function redirectIfLoggedIn(request: any, reply: any, done: () => void) {
  if (request.session.get('customerId')) {
    return reply.redirect('/dashboard')
  }
  done()
}

export default async function pageRoutes(fastify: FastifyInstance) {

  // Public
  fastify.get('/',      async (_, reply) => reply.sendFile('index.html'))
  fastify.get('/signup', { preHandler: redirectIfLoggedIn }, async (_, reply) => reply.sendFile('signup.html'))
  fastify.get('/docs',                async (_, reply) => reply.sendFile('docs.html'))
  fastify.get('/docs/introduction',   async (_, reply) => reply.sendFile('docs-introduction.html'))
  fastify.get('/docs/ios-sdk',        async (_, reply) => reply.sendFile('docs-ios.html'))
  fastify.get('/docs/android-sdk',    async (_, reply) => reply.sendFile('docs-android.html'))
  fastify.get('/docs/backend',        async (_, reply) => reply.sendFile('docs-backend.html'))
  fastify.get('/docs/concepts',       async (_, reply) => reply.sendFile('docs-concepts.html'))
  fastify.get('/docs/guides',         async (_, reply) => reply.sendFile('docs-guides.html'))
  fastify.get('/api-reference',       async (_, reply) => reply.sendFile('api-reference.html'))
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
