// Stamps env vars that src/config.ts requires at module load. Real values
// are irrelevant for tests; only presence matters. The test harness
// intercepts global fetch so the API_BASE_URL never resolves.

if (!process.env.SESSION_SECRET)      process.env.SESSION_SECRET      = '0'.repeat(64)
if (!process.env.RESEND_API_KEY)      process.env.RESEND_API_KEY      = 'test'
if (!process.env.ADMIN_KEY)           process.env.ADMIN_KEY           = '0'.repeat(64)
if (!process.env.GOOGLE_CLIENT_ID)    process.env.GOOGLE_CLIENT_ID    = 'g_id'
if (!process.env.GOOGLE_CLIENT_SECRET) process.env.GOOGLE_CLIENT_SECRET = 'g_secret'
if (!process.env.GITHUB_CLIENT_ID)    process.env.GITHUB_CLIENT_ID    = 'gh_id'
if (!process.env.GITHUB_CLIENT_SECRET) process.env.GITHUB_CLIENT_SECRET = 'gh_secret'
if (!process.env.API_BASE_URL)        process.env.API_BASE_URL        = 'http://test-api.local'
