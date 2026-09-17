import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';

// Tests talk to a real Postgres, so they need DATABASE_URL. Load .env when it
// exists; in CI the variables are already exported and this is a no-op.
if (existsSync('.env')) {
  loadDotenv({ path: '.env', quiet: true });
}

// The suite truncates every table between cases, so it must never point at the
// development database. Redirect to TEST_DATABASE_URL and refuse to run without
// it rather than silently wiping someone's working data.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Tests truncate every table, so they require a ' +
      'dedicated database — pointing them at DATABASE_URL would destroy development data.',
  );
}
if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same database as DATABASE_URL.');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Integration tests share one database and truncate it between cases, so
    // test files must not run concurrently with each other.
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
