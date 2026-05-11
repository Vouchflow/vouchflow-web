import { defineConfig } from 'vitest/config'

// Web tests don't need a DB or Redis. They mock global fetch to fake the
// API and use Fastify .inject() against a single test instance per file.
export default defineConfig({
  test: {
    pool: { type: 'forks', maxWorkers: 1, minWorkers: 1 },
    fileParallelism: false,
    setupFiles: ['./src/__tests__/helpers/setup.ts'],
  },
})
