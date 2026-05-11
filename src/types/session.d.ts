export {}

declare module 'fastify' {
  interface Session {
    email: string
    customerId: string
    // Apps refactor: dashboard operates in the context of one App at a time.
    // Switching apps is a session-state change (PATCH /web/apps/current);
    // URLs don't carry the app slug. Sandbox keys are the *current app's*
    // keys — they refresh whenever the active app changes.
    appId: string
    appSlug: string
    appName: string
    sandboxWriteKey: string
    sandboxReadKey: string
    webhookSecret: string  // still customer-level
    createdAt: string
    onboardingComplete: boolean
    name: string
    orgName: string | null
    avatarUrl: string | null
    env: 'sandbox' | 'production'
  }
}
