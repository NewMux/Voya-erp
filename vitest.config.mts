import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';

// Tests talk to a real Postgres, so they need DATABASE_URL. Load .env when it
// exists; in CI the variable is already exported and this is a no-op.
if (existsSync('.env')) {
  loadDotenv({ path: '.env', quiet: true });
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Integration tests share one Postgres database and truncate it between
    // cases, so test files must not run concurrently with each other.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
