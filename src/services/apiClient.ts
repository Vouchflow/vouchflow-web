import { config } from '../config.js'

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
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
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
}

export async function findOrCreateCustomer(email: string): Promise<Customer> {
  return apiFetch<Customer>('/v1/customers', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function updateCustomer(
  customerId: string,
  data: { orgName?: string; billingEmail?: string; minimumConfidence?: string; networkOptIn?: boolean }
): Promise<Customer> {
  return apiFetch<Customer>(`/v1/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// ── Stats ────────────────────────────────────────────────────────────────────

export interface OverviewStats {
  verificationCount: number
  deviceCount:       number
  highConfidencePct: number
  avgDurationMs:     number
  dailyBreakdown:    Array<{ date: string; high: number; low: number }>
}

export async function getOverviewStats(
  customerId: string,
  sandboxWriteKey: string
): Promise<OverviewStats> {
  return apiFetch<OverviewStats>(
    `/v1/customers/${customerId}/stats`,
    {},
    sandboxWriteKey
  )
}

// ── Verifications ────────────────────────────────────────────────────────────

export interface VerificationRow {
  sessionId:  string
  confidence: string
  platform:   string
  biometric:  string
  durationMs: number
  createdAt:  string
}

export async function getVerifications(
  sandboxWriteKey: string,
  params: { limit?: number; offset?: number; confidence?: string; platform?: string }
): Promise<{ rows: VerificationRow[] }> {
  const qs = new URLSearchParams()
  if (params.limit)      qs.set('limit',      String(params.limit))
  if (params.offset)     qs.set('offset',     String(params.offset))
  if (params.confidence) qs.set('confidence', params.confidence)
  if (params.platform)   qs.set('platform',   params.platform)

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
