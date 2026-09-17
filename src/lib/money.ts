import { Decimal } from 'decimal.js';

/**
 * Money helpers.
 *
 * Every monetary value in this system is a decimal, never a float. The base
 * currency is BHD, which has *three* decimal places (1 BHD = 1000 fils) — the
 * usual two-decimal assumption silently loses a digit on every Bahraini amount,
 * so the scale is always derived from the currency rather than hard-coded.
 */

export const CURRENCIES = ['BHD', 'USD', 'EUR', 'GBP', 'SAR', 'AED'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const BASE_CURRENCY: CurrencyCode = 'BHD';

/** Minor-unit precision per currency. */
const CURRENCY_SCALE: Record<CurrencyCode, number> = {
  BHD: 3,
  USD: 2,
  EUR: 2,
  GBP: 2,
  SAR: 2,
  AED: 2,
};

export type DecimalInput = Decimal | string | number | { toString(): string } | null | undefined;

export function scaleFor(currency: CurrencyCode): number {
  return CURRENCY_SCALE[currency] ?? 2;
}

/**
 * Coerce anything Prisma or a form might hand us into a Decimal.
 *
 * Prisma returns its own Decimal instance, form data arrives as strings, and
 * seeds use numbers. Going through `toString()` keeps all three exact — passing
 * a float straight to the Decimal constructor would reintroduce binary error.
 */
export function toDecimal(value: DecimalInput): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  if (value instanceof Decimal) return value;
  const asString = typeof value === 'string' ? value : value.toString();
  const parsed = new Decimal(asString);
  if (!parsed.isFinite()) {
    throw new Error(`Not a finite monetary value: ${asString}`);
  }
  return parsed;
}

/** Round to the currency's minor unit, half-up (the convention finance expects). */
export function roundMoney(value: DecimalInput, currency: CurrencyCode = BASE_CURRENCY): Decimal {
  return toDecimal(value).toDecimalPlaces(scaleFor(currency), Decimal.ROUND_HALF_UP);
}

/** Round a value for storage in a Decimal(18,3) column. */
export function toStorage(value: DecimalInput, currency: CurrencyCode = BASE_CURRENCY): string {
  return roundMoney(value, currency).toFixed(scaleFor(currency));
}

export function add(...values: DecimalInput[]): Decimal {
  return values.reduce<Decimal>((sum, v) => sum.plus(toDecimal(v)), new Decimal(0));
}

export function subtract(a: DecimalInput, b: DecimalInput): Decimal {
  return toDecimal(a).minus(toDecimal(b));
}

export function sum(values: DecimalInput[]): Decimal {
  return add(...values);
}

export function isZero(value: DecimalInput): boolean {
  return toDecimal(value).isZero();
}

export function isNegative(value: DecimalInput): boolean {
  return toDecimal(value).lt(0);
}

/**
 * Strictly greater than zero.
 *
 * Deliberately not `Decimal.isPositive()`, which tests the sign bit and so
 * returns *true for zero*. Every caller here means "is there actually money
 * here", and an unpaid booking must not read as part-paid.
 */
export function isPositive(value: DecimalInput): boolean {
  return toDecimal(value).gt(0);
}

export function gte(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).gte(toDecimal(b));
}

export function gt(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).gt(toDecimal(b));
}

/**
 * Convert a supplier cost into the base currency at the rate captured when the
 * booking was entered. The PRD is explicit that the entry-time rate is the one
 * that counts, so the caller passes the stored rate rather than looking up a
 * live one.
 */
export function convertToBase(
  amount: DecimalInput,
  fxRate: DecimalInput,
  baseCurrency: CurrencyCode = BASE_CURRENCY,
): Decimal {
  return roundMoney(toDecimal(amount).times(toDecimal(fxRate)), baseCurrency);
}

/** `percent` is a whole-number percentage: 12.5 means 12.5%. */
export function percentOf(
  amount: DecimalInput,
  percent: DecimalInput,
  currency: CurrencyCode = BASE_CURRENCY,
): Decimal {
  return roundMoney(toDecimal(amount).times(toDecimal(percent)).dividedBy(100), currency);
}

/**
 * Deposit due at booking time, from either a percentage or a flat amount.
 * The result is clamped to the booking total: a 120% deposit or a flat amount
 * larger than the booking would otherwise create a permanent credit balance.
 */
export function depositAmount(
  total: DecimalInput,
  depositType: 'PERCENT' | 'AMOUNT',
  depositValue: DecimalInput,
  currency: CurrencyCode = BASE_CURRENCY,
): Decimal {
  const totalDec = roundMoney(total, currency);
  const raw =
    depositType === 'PERCENT'
      ? percentOf(totalDec, depositValue, currency)
      : roundMoney(depositValue, currency);
  if (raw.isNegative()) return new Decimal(0);
  return raw.gt(totalDec) ? totalDec : raw;
}

/** Format for display, e.g. "BHD 1,250.500". */
export function formatMoney(
  value: DecimalInput,
  currency: CurrencyCode = BASE_CURRENCY,
  options: { withCode?: boolean } = {},
): string {
  const { withCode = true } = options;
  const scale = scaleFor(currency);
  const rounded = roundMoney(value, currency);
  const formatted = new Intl.NumberFormat('en-BH', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(rounded.toNumber());
  return withCode ? `${currency} ${formatted}` : formatted;
}

/** Arabic-Indic formatting for the AR invoice template. */
export function formatMoneyAr(value: DecimalInput, currency: CurrencyCode = BASE_CURRENCY): string {
  const scale = scaleFor(currency);
  const rounded = roundMoney(value, currency);
  const formatted = new Intl.NumberFormat('ar-BH', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(rounded.toNumber());
  return `${formatted} ${CURRENCY_NAMES_AR[currency]}`;
}

const CURRENCY_NAMES_AR: Record<CurrencyCode, string> = {
  BHD: 'د.ب',
  USD: '$',
  EUR: '€',
  GBP: '£',
  SAR: 'ر.س',
  AED: 'د.إ',
};

export { Decimal };
