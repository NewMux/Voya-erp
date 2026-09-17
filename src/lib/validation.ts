import { z } from 'zod';

/**
 * Shared zod schemas.
 *
 * Every server action validates its FormData through one of these before
 * touching the database, so a malformed or hand-crafted POST is rejected at the
 * edge of the server rather than deep inside a service.
 */

/** Trim, and treat an empty string as absent — HTML forms send "" for blanks. */
export const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable();

export const requiredString = (field: string, max = 200) =>
  z.string().trim().min(1, `${field} is required`).max(max);

/** `<input type="date">` value, as a UTC calendar date. */
export const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .transform((v) => new Date(`${v}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), 'Use a valid date');

export const optionalDateOnly = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date')
  .transform((v) => (v === null ? null : new Date(`${v}T00:00:00.000Z`)));

/**
 * A monetary amount from a form field.
 *
 * Kept as a string all the way to Prisma so the decimal is never routed through
 * a JavaScript float. Up to three decimal places, because BHD has three.
 */
export const money = (field = 'Amount') =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .regex(/^-?\d+(\.\d{1,3})?$/, `${field} must be a number with up to 3 decimal places`)
    .refine((v) => Number.parseFloat(v) >= 0, `${field} cannot be negative`);

export const optionalMoney = (field = 'Amount') =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .refine(
      (v) => v === null || /^-?\d+(\.\d{1,3})?$/.test(v),
      `${field} must be a number with up to 3 decimal places`,
    );

export const percent = (field = 'Percentage') =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? '0' : v))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), `${field} must be a number`)
    .refine((v) => Number.parseFloat(v) <= 100, `${field} cannot exceed 100`);

/** FX rate, up to six decimal places. */
export const fxRate = z
  .string()
  .trim()
  .transform((v) => (v === '' ? '1' : v))
  .refine((v) => /^\d+(\.\d{1,6})?$/.test(v), 'Exchange rate must be a positive number')
  .refine((v) => Number.parseFloat(v) > 0, 'Exchange rate must be greater than zero');

/** Non-negative whole number from a form field. */
export const count = (field: string, min = 0) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? String(min) : v))
    .refine((v) => /^\d+$/.test(v), `${field} must be a whole number`)
    .transform((v) => Number.parseInt(v, 10))
    .refine((v) => v >= min, `${field} must be at least ${min}`);

/**
 * A phone number.
 *
 * Deliberately permissive about formatting — staff paste numbers in many
 * shapes, and `normalisePhone` canonicalises them at send time. What is
 * enforced is that there are enough digits to be a real number.
 */
export const phone = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .refine((v) => v.replace(/\D/g, '').length >= 8, 'Enter a valid phone number');

export const optionalPhone = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine(
    (v) => v === null || v.replace(/\D/g, '').length >= 8,
    'Enter a valid phone number',
  );

export const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine((v) => v === null || z.string().email().safeParse(v).success, 'Enter a valid email');

export const CURRENCY_VALUES = ['BHD', 'USD', 'EUR', 'GBP', 'SAR', 'AED'] as const;
export const currency = z.enum(CURRENCY_VALUES);

/** `true` for a checked checkbox; HTML omits the field entirely when unchecked. */
export const checkbox = z
  .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal('')])
  .nullable()
  .optional()
  .transform((v) => v === 'on' || v === 'true');

/** Turn a ZodError into a field -> message map for the form to render. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    result[key] ??= issue.message;
  }
  return result;
}
