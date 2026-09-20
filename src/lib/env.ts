import { z } from 'zod';

/**
 * Server-side configuration, validated once at first import.
 *
 * Everything optional has a sensible default so the app boots with only
 * DATABASE_URL and AUTH_SECRET set — which is what makes the WhatsApp "manual"
 * fallback usable on day one, before Meta credentials exist.
 */

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const intWithDefault = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return fallback;
      const parsed = Number.parseInt(v, 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  AUTH_URL: z.string().url().optional(),
  AUTH_TRUST_HOST: booleanish,

  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage/uploads'),
  STORAGE_MAX_BYTES: intWithDefault(10 * 1024 * 1024),

  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters'),

  WHATSAPP_PROVIDER: z.enum(['manual', 'meta']).default('manual'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_STAFF_NUMBERS: z.string().optional(),

  REMINDER_BALANCE_DAYS_BEFORE: intWithDefault(7),
  // Two membership-renewal reminder stages: one month out, then one week out.
  REMINDER_MEMBERSHIP_DAYS_BEFORE: intWithDefault(30),
  REMINDER_MEMBERSHIP_DAYS_BEFORE_SHORT: intWithDefault(7),
  GROUP_CAPACITY_ALERT_THRESHOLD: intWithDefault(80),

  BASE_CURRENCY: z.enum(['BHD', 'USD', 'EUR', 'GBP', 'SAR', 'AED']).default('BHD'),
});

export type Env = z.infer<typeof envSchema> & {
  /** Parsed from WHATSAPP_STAFF_NUMBERS. */
  staffNumbers: string[];
};

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const staffNumbers = (parsed.data.WHATSAPP_STAFF_NUMBERS ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  // Fail loudly rather than silently queueing messages that will never send.
  if (parsed.data.WHATSAPP_PROVIDER === 'meta') {
    const missing = (['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN'] as const).filter(
      (key) => !parsed.data[key],
    );
    if (missing.length > 0) {
      throw new Error(
        `WHATSAPP_PROVIDER is "meta" but ${missing.join(' and ')} ` +
          `${missing.length === 1 ? 'is' : 'are'} not set. ` +
          'Set them, or use WHATSAPP_PROVIDER="manual" to queue messages for staff to send.',
      );
    }
  }

  return { ...parsed.data, staffNumbers };
}

let cached: Env | null = null;

/** Lazily validated so that importing this module never crashes a build step. */
export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test-only: forget the cached parse so a test can vary process.env. */
export function resetEnvCache(): void {
  cached = null;
}
