import { config } from '../config.js'

/** Thrown by apiFetch on non-2xx responses. Web routes can `instanceof`-check
 *  this to forward 4xx errors verbatim to the dashboard with the API's
 *  error code/message, while still 500-ing on 5xx and network failures. */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, body: unknown) {
    super(`API error ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  apiKey?: string
): Promise<T> {
  const url = `${config.apiBaseUrl}${path}`

  // Resolve auth: undefined → ADMIN_KEY (internal admin call). Explicit empty
  // string means the caller intended to pass a user key but had none — fail
  // fast (don't silently send `Bearer ` which 401s, and don't fall back to
  // ADMIN_KEY which would over-privilege the call across tenants).
  let bearer: string
  if (apiKey === undefined) {
    bearer = config.adminKey
  } else if (apiKey.trim() === '') {
    throw new ApiError(401, {
      error: { code: 'missing_api_key', message: 'No API key available for this request.' },
    })
  } else {
    bearer = apiKey
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  headers['Authorization'] = `Bearer ${bearer}`

  const res = await fetch(url, { ...options, headers })

  if (!res.ok) {
    const text = await res.text()
    let parsed: unknown = text
    try { parsed = JSON.parse(text) } catch { /* fall through with raw text */ }
    throw new ApiError(res.status, parsed)
  }
  // 204 No Content path — Fastify .send() with no body
  if (res.status === 204) return undefined as unknown as T
  const text = await res.text()
  if (!text) return undefined as unknown as T
  return JSON.parse(text) as T
}

// ── Customer ────────────────────────────────────────────────────────────────

export interface Customer {
  id:              string
  email:           string
  webhookSecret:   string
  createdAt:       string
}

export interface CustomerWithDefaultApp extends Customer {
  /** Sandbox keys returned ONCE on create; the response carries the new
   *  default App's keys for back-compat with the prior auth flow. On
   *  subsequent calls (find-existing) these are null — fetch the App. */
  sandboxWriteKey: string | null
  sandboxReadKey:  string | null
}

export async function findOrCreateCustomer(email: string): Promise<CustomerWithDefaultApp> {
  return apiFetch<CustomerWithDefaultApp>('/v1/customers', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function updateCustomer(
  customerId: string,
  data: {
    orgName?:           string
    billingEmail?:      string
    minimumConfidence?: string
    networkOptIn?:      boolean
  }
): Promise<Customer> {
  return apiFetch<Customer>(`/v1/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteAccount(customerId: string): Promise<void> {
  await apiFetch<void>(`/v1/customers/${customerId}`, { method: 'DELETE' })
}

// ── Apps ────────────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'low' | 'medium' | 'high'

export interface AppSummary {
  id:            string
  name:          string
  slug:          string
  description:   string | null
  webSdkEnabled: boolean
  iosConfigured: boolean
  androidConfigured: boolean
  archivedAt:    string | null
  createdAt:     string
}

export interface AppDetail extends AppSummary {
  customerId:                 string
  // Attestation
  iosTeamId:                  string | null
  iosBundleId:                string | null
  androidPackageName:         string | null
  androidSigningKeySha256:    string | null
  // Web SDK
  webRpId:                    string | null
  webAllowedOrigins:          string[]
  // Confidence policy
  verifyMinConfidence:        ConfidenceLevel | null
  signPayloadMinConfidence:   ConfidenceLevel | null
  contextConfidenceOverrides: Record<string, ConfidenceLevel>
  // Sandbox key prefixes (raw values returned only on create)
  sandboxWriteKeyPrefix:      string | null
  sandboxReadKeyPrefix:       string | null
  updatedAt:                  string
}

export interface CreatedApp {
  app: AppDetail
  sandboxWriteKey: string
  sandboxReadKey: string
  // Auto-generated at creation since the live-keys refactor — each app now
  // ships with one canonical write + read key. These are returned raw
  // exactly once; subsequent GETs only return prefixes.
  liveWriteKey:    string
  liveReadKey:     string
}

export async function listApps(
  customerId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<{ apps: AppSummary[] }> {
  const qs = opts.includeArchived ? '?includeArchived=true' : ''
  return apiFetch<{ apps: AppSummary[] }>(`/v1/customers/${customerId}/apps${qs}`)
}

export async function getApp(customerId: string, appId: string): Promise<AppDetail> {
  return apiFetch<AppDetail>(`/v1/customers/${customerId}/apps/${appId}`)
}

export async function createApp(
  customerId: string,
  data: { name: string; slug?: string; description?: string },
): Promise<CreatedApp> {
  return apiFetch<CreatedApp>(`/v1/customers/${customerId}/apps`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export type AppPatch = Partial<{
  name:                       string
  slug:                       string
  description:                string | null
  iosTeamId:                  string | null
  iosBundleId:                string | null
  androidPackageName:         string | null
  androidSigningKeySha256:    string | null
  webSdkEnabled:              boolean
  webRpId:                    string | null
  webAllowedOrigins:          string[]
  verifyMinConfidence:        ConfidenceLevel | null
  signPayloadMinConfidence:   ConfidenceLevel
  contextConfidenceOverrides: Record<string, ConfidenceLevel>
}>

export async function updateApp(
  customerId: string,
  appId: string,
  data: AppPatch,
): Promise<AppDetail> {
  return apiFetch<AppDetail>(`/v1/customers/${customerId}/apps/${appId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function archiveApp(customerId: string, appId: string): Promise<void> {
  await apiFetch<void>(`/v1/customers/${customerId}/apps/${appId}/archive`, { method: 'POST' })
}

export async function unarchiveApp(customerId: string, appId: string): Promise<void> {
  await apiFetch<void>(`/v1/customers/${customerId}/apps/${appId}/unarchive`, { method: 'POST' })
}

// ── Live keys (per-app) ─────────────────────────────────────────────────────

export interface LiveKeyInfo {
  id:           string
  scope:        'write' | 'read' | 'pair'
  /** Last 4 chars of the raw key, for identification. Null for keys created
   *  before the keyLast4 column existed (raw value unrecoverable). */
  keyLast4:     string | null
  createdAt:    string
  lastUsedAt:   string | null
  deprecated:   boolean
  deprecatedAt: string | null
}

// Returned by GET — now includes deprecated keys (for the "Recently rotated"
// section in the dashboard). Auth-time the 14-day grace from deprecatedAt
// keeps deprecated keys working until expiry.
export interface ListLiveKeysResponse { keys: LiveKeyInfo[] }

// Rotation creates a new active key + demotes the prior active key of the
// same scope to deprecated state. The 14-day grace is enforced server-side.
export interface RotatedLiveKey {
  key:        { id: string; rawKey: string; scope: 'write' | 'read'; createdAt: string }
  // For pair-key auto-split: when the prior active was a pair, rotation
  // also generates the *other* scope so both write+read are reset to fresh
  // active keys. companion is non-null in that case.
  companion:  { id: string; rawKey: string; scope: 'write' | 'read'; createdAt: string } | null
  // The key that was demoted (null if the app had no active key of this
  // scope yet — e.g. first rotation on a backfilled app with no live keys).
  deprecated: { id: string; scope: string; deprecatedAt: string } | null
}

export interface GeneratedInitialLiveKeys {
  liveWriteKey: string
  liveReadKey:  string
}

export async function getLiveKeys(customerId: string, appId: string): Promise<ListLiveKeysResponse> {
  return apiFetch<ListLiveKeysResponse>(`/v1/customers/${customerId}/apps/${appId}/live-keys`)
}

export async function rotateLiveKey(
  customerId: string,
  appId: string,
  scope: 'write' | 'read',
): Promise<RotatedLiveKey> {
  return apiFetch<RotatedLiveKey>(
    `/v1/customers/${customerId}/apps/${appId}/live-keys/rotate`,
    { method: 'POST', body: JSON.stringify({ scope }) },
  )
}

export async function generateInitialLiveKeys(
  customerId: string,
  appId: string,
): Promise<GeneratedInitialLiveKeys> {
  return apiFetch<GeneratedInitialLiveKeys>(
    `/v1/customers/${customerId}/apps/${appId}/live-keys/generate`,
    { method: 'POST' },
  )
}

// ── Legacy live-keys endpoints (kept for back-compat with existing /web
// proxy routes; the dashboard now uses rotate + generate exclusively). ───

export interface GeneratedLiveKeyPair {
  writeKey: { id: string; rawKey: string; scope: 'write'; createdAt: string }
  readKey:  { id: string; rawKey: string; scope: 'read';  createdAt: string }
}
export interface GeneratedLiveKeySingle {
  key: { id: string; rawKey: string; scope: 'write' | 'read' | 'pair'; createdAt: string }
}
export type GeneratedLiveKeys = GeneratedLiveKeyPair | GeneratedLiveKeySingle

export async function generateLiveKeys(
  customerId: string,
  appId: string,
  scope: 'pair' | 'write' | 'read' = 'pair',
): Promise<GeneratedLiveKeys> {
  return apiFetch<GeneratedLiveKeys>(`/v1/customers/${customerId}/apps/${appId}/live-keys`, {
    method: 'POST',
    body: JSON.stringify({ scope }),
  })
}

export async function revokeLiveKey(customerId: string, appId: string, keyId: string): Promise<void> {
  await apiFetch<{ key: unknown }>(
    `/v1/customers/${customerId}/apps/${appId}/live-keys/${keyId}`,
    { method: 'DELETE' },
  )
}

// ── Per-app webhooks (admin-keyed) ──────────────────────────────────────────

export interface AppWebhook {
  id:        string
  url:       string
  events:    string[]
  createdAt: string
}

export async function listAppWebhooks(customerId: string, appId: string): Promise<{ webhooks: AppWebhook[] }> {
  return apiFetch<{ webhooks: AppWebhook[] }>(`/v1/customers/${customerId}/apps/${appId}/webhooks`)
}

export async function createAppWebhook(
  customerId: string, appId: string, data: { url: string; events: string[] },
): Promise<AppWebhook & { secret: string }> {
  return apiFetch<AppWebhook & { secret: string }>(
    `/v1/customers/${customerId}/apps/${appId}/webhooks`,
    { method: 'POST', body: JSON.stringify(data) },
  )
}

export async function deleteAppWebhook(customerId: string, appId: string, webhookId: string): Promise<void> {
  await apiFetch<void>(`/v1/customers/${customerId}/apps/${appId}/webhooks/${webhookId}`, { method: 'DELETE' })
}

// ── Stats ────────────────────────────────────────────────────────────────────

export interface OverviewStats {
  verificationCount: number
  deviceCount:       number
  highConfidencePct: number | null
  successRatePct:    number | null
  dailyBreakdown:    Array<{ date: string; high: number; low: number }>
}

export async function getOverviewStats(
  customerId: string,
  sandboxWriteKey: string,
  env: 'sandbox' | 'production' = 'sandbox',
  range: string = '7d'
): Promise<OverviewStats> {
  return apiFetch<OverviewStats>(
    `/v1/customers/${customerId}/stats?env=${env}&range=${encodeURIComponent(range)}`,
    {},
    sandboxWriteKey
  )
}

export interface CustomerOverview {
  appCount:          number
  verificationCount: number
  deviceCount:       number
  successRatePct:    number | null
  highConfidencePct: number | null
  perApp:            Array<{ appId: string; verificationCount: number }>
}

export async function getCustomerOverview(
  customerId: string,
  env: 'sandbox' | 'production' = 'sandbox',
  range: string = '7d',
): Promise<CustomerOverview> {
  return apiFetch<CustomerOverview>(
    `/v1/customers/${customerId}/overview?env=${env}&range=${encodeURIComponent(range)}`,
  )
}

// ── Verifications ────────────────────────────────────────────────────────────

export interface VerificationRow {
  sessionId:   string
  deviceToken: string | null
  confidence:  string
  platform:    string
  biometric:   string
  durationMs:  number
  createdAt:   string
  type?:       'verify' | 'sign'
}

export async function getVerifications(
  sandboxWriteKey: string,
  params: { limit?: number; offset?: number; confidence?: string; platform?: string; range?: string; result?: string; type?: string; env?: 'sandbox' | 'production' }
): Promise<{ rows: VerificationRow[] }> {
  const qs = new URLSearchParams()
  if (params.limit)      qs.set('limit',      String(params.limit))
  if (params.offset)     qs.set('offset',     String(params.offset))
  if (params.confidence) qs.set('confidence', params.confidence)
  if (params.platform)   qs.set('platform',   params.platform)
  if (params.range)      qs.set('range',      params.range)
  if (params.result)     qs.set('result',     params.result)
  if (params.type)       qs.set('type',       params.type)
  qs.set('env', params.env ?? 'sandbox')

  return apiFetch<{ rows: VerificationRow[] }>(
    `/v1/verifications?${qs}`,
    {},
    sandboxWriteKey
  )
}

export async function getVerification(
  sessionId: string,
  sandboxWriteKey: string
): Promise<VerificationRow> {
  return apiFetch<VerificationRow>(
    `/v1/verifications/${sessionId}`,
    {},
    sandboxWriteKey
  )
}

// ── Devices ──────────────────────────────────────────────────────────────────

export interface Device {
  id:                string
  platform:          string
  attestationLevel:  string
  enrolledAt:        string
  verificationCount: number
  lastVerifiedAt:    string
}

export async function getDevices(sandboxWriteKey: string): Promise<{ devices: Device[] }> {
  return apiFetch<{ devices: Device[] }>('/v1/devices', {}, sandboxWriteKey)
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

export interface Webhook {
  id:        string
  url:       string
  events:    string[]
  createdAt: string
}

export async function getWebhooks(
  customerId: string,
  sandboxWriteKey: string
): Promise<{ webhooks: Webhook[] }> {
  return apiFetch<{ webhooks: Webhook[] }>(
    `/v1/customers/${customerId}/webhooks`,
    {},
    sandboxWriteKey
  )
}

export async function createWebhook(
  sandboxWriteKey: string,
  data: { url: string; events: string[] }
): Promise<Webhook> {
  return apiFetch<Webhook>('/v1/webhooks', {
    method: 'POST',
    body: JSON.stringify(data),
  }, sandboxWriteKey)
}

export async function deleteWebhook(
  sandboxWriteKey: string,
  webhookId: string
): Promise<void> {
  await apiFetch<void>(`/v1/webhooks/${webhookId}`, {
    method: 'DELETE',
  }, sandboxWriteKey)
}

// ── Usage ────────────────────────────────────────────────────────────────────

export interface Usage {
  verificationCount: number
  deviceCount:       number
  periodStart:       string
  periodEnd:         string
}

export async function getUsage(
  customerId: string,
  sandboxWriteKey: string
): Promise<Usage> {
  return apiFetch<Usage>(
    `/v1/customers/${customerId}/usage`,
    {},
    sandboxWriteKey
  )
}
