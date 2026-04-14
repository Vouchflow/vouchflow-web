export const config = {
  port:               parseInt(process.env.PORT ?? '3000', 10),
  host:               process.env.HOST ?? '0.0.0.0',
  nodeEnv:            process.env.NODE_ENV ?? 'development',
  sessionSecret:      requireEnv('SESSION_SECRET'),
  resendApiKey:       requireEnv('RESEND_API_KEY'),
  redisUrl:           process.env.REDIS_URL ?? 'redis://localhost:6379',
  apiBaseUrl:         process.env.API_BASE_URL ?? 'https://api.vouchflow.dev',
  adminKey:           requireEnv('ADMIN_KEY'),
  webBaseUrl:         process.env.WEB_BASE_URL ?? 'https://vouchflow.dev',
  googleClientId:     requireEnv('GOOGLE_CLIENT_ID'),
  googleClientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
  githubClientId:     requireEnv('GITHUB_CLIENT_ID'),
  githubClientSecret: requireEnv('GITHUB_CLIENT_SECRET'),
} as const

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}
