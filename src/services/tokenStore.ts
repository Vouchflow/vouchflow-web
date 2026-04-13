import { redis } from '../lib/redis.js'
import { randomBytes } from 'crypto'

const TOKEN_TTL   = 60 * 15  // 15 minutes
const RATE_WINDOW = 60 * 60  // 1 hour
const RATE_MAX    = 3

export async function createToken(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await redis.set(`vweb:token:${token}`, email, 'EX', TOKEN_TTL)
  return token
}

export async function consumeToken(token: string): Promise<string | null> {
  // Atomic: pipeline get + del so concurrent requests can't both succeed
  const pipeline = redis.pipeline()
  pipeline.get(`vweb:token:${token}`)
  pipeline.del(`vweb:token:${token}`)
  const results = await pipeline.exec()
  const email = results?.[0]?.[1] as string | null
  return email ?? null
}

export async function checkRateLimit(email: string): Promise<boolean> {
  const key = `vweb:ratelimit:${email}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, RATE_WINDOW)
  return count <= RATE_MAX
}
