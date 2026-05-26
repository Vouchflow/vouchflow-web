import type { FastifyRequest, FastifyReply } from 'fastify'

export function hasAuthenticatedSession(request: FastifyRequest) {
  return Boolean(request.session.get('customerId'))
}

export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!hasAuthenticatedSession(request)) {
    return reply.redirect('/signup')
  }
}
