export {}

declare module 'fastify' {
  interface Session {
    email: string
    customerId: string
    sandboxWriteKey: string
    sandboxReadKey: string
    webhookSecret: string
    createdAt: string
    onboardingComplete: boolean
    name: string
    orgName: string | null
    avatarUrl: string | null
    // Dashboard env toggle. Default 'sandbox' when unset.
    env: 'sandbox' | 'production'
  }
}
