import Redis from 'ioredis'
import { config } from '../config.js'

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

redis.on('error', (err) => {
  console.error('Redis error:', err)
})
