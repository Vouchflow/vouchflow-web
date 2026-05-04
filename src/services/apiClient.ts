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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  headers['Authorization'] = `Bearer ${apiKey ?? config.adminKey}`

  const res = await fetch(url, { ...options, headers })

  if (!res.ok) {
    const text = await res.text()
    let parsed: unknown = text
    try { parsed = JSON.parse(text) } catch { /* fall through with raw text */ }
    throw new ApiError(res.status, parsed)
  }

  return res.json() as Promise<T>
}

// ── Customer ────────────────────────────────────────────────────────────────

export interface Customer {
  id:              string
  email:           string
  sandboxWriteKey: string
  sandboxReadKey:  string
  webhookSecret:   string
  createdAt:       string

  // Per-customer attestation parameters. All nullable; the server treats
  // an unset value as attestation-not-configured (confidence_ceiling=medium).
  androidPackageName?:      string | null
  androidSigningKeySha256?: string | null
  iosTeamId?:               string | null
  iosBundleId?:             string | null
}

export async function findOrCreateCustomer(email: string): Promise<Customer> {
  return apiFetch<Customer>('/v1/customers', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function updateCustomer(
  customerId: string,
  data: {
    orgName?:                 string
    billingEmail?:            string
    minimumConfidence?:       string
    networkOptIn?:            boolean
    // Per-customer attestation parameters. Pass `null` to clear, omit to
    // leave unchanged.
    androidPackageName?:      string | null
    androidSigningKeySha256?: string | null
    iosTeamId?:               string | null
    iosBundleId?:             string | null
  }
): Promise<Customer> {
  return apiFetch<Customer>(`/v1/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export interface LiveKeyInfo {
  id:         string
  scope:      'write' | 'read'
  createdAt:  string
  lastUsedAt: string | null
}

export interface GeneratedLiveKeyPair {
  writeKey: { id: string; rawKey: string; scope: 'write'; createdAt: string }
  readKey:  { id: string; rawKey: string; scope: 'read';  createdAt: string }
}

export interface GeneratedLiveKeySingle {
  key: { id: string; rawKey: string; scope: 'write' | 'read'; createdAt: string }
}

export type GeneratedLiveKeys = GeneratedLiveKeyPair | GeneratedLiveKeySingle

export async function getCustomer(customerId: string): Promise<Customer> {
  return apiFetch<Customer>(`/v1/customers/${customerId}`)
}

/**
 * Create one or more live keys. By default returns a write+read pair to
 * preserve the prior dashboard UX; pass `scope: 'write'` or `scope: 'read'`
 * to create a single key. The API caps active keys at 10 per customer and
 * returns 409 (key_limit_reached) on overflow.
 */
export async function generateLiveKeys(
  customerId: string,
  scope: 'pair' | 'write' | 'read' = 'pair',
): Promise<GeneratedLiveKeys> {
  return apiFetch<GeneratedLiveKeys>(`/v1/customers/${customerId}/live-keys`, {
    method: 'POST',
    body: JSON.stringify({ scope }),
  })
}

/** Mark a single live key deprecated. The schema's 14-day grace window
 *  applies — the key keeps working until deprecatedAt+14d so in-flight
 *  callers aren't immediately 401'd. */
export async function revokeLiveKey(customerId: string, keyId: string): Promise<void> {
  await apiFetch<{ key: unknown }>(
    `/v1/customers/${customerId}/live-keys/${keyId}`,
    { method: 'DELETE' },
  )
}

export async function deleteAccount(customerId: string): Promise<void> {
  await apiFetch<void>(`/v1/customers/${customerId}`, { method: 'DELETE' })
}

export async function getLiveKeys(customerId: string): Promise<{ keys: LiveKeyInfo[] }> {
  return apiFetch<{ keys: LiveKeyInfo[] }>(`/v1/customers/${customerId}/live-keys`)
}

// ── Stats ────────────────────────────────────────────────────────────────────

export interface OverviewStats {
  verificationCount: number
  deviceCount:       number
  highConfidencePct: number
  successRatePct:    number
  dailyBreakdown:    Array<{ date: string; high: number; low: number }>
}

export async function getOverviewStats(
  customerId: string,
  sandboxWriteKey: string,
  env: 'sandbox' | 'production' = 'sandbox'
): Promise<OverviewStats> {
  return apiFetch<OverviewStats>(
    `/v1/customers/${customerId}/stats?env=${env}`,
    {},
    sandboxWriteKey
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
}

export async function getVerifications(
  sandboxWriteKey: string,
  params: { limit?: number; offset?: number; confidence?: string; platform?: string; range?: string; env?: 'sandbox' | 'production' }
): Promise<{ rows: VerificationRow[] }> {
  const qs = new URLSearchParams()
  if (params.limit)      qs.set('limit',      String(params.limit))
  if (params.offset)     qs.set('offset',     String(params.offset))
  if (params.confidence) qs.set('confidence', params.confidence)
  if (params.platform)   qs.set('platform',   params.platform)
  if (params.range)      qs.set('range',      params.range)
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
