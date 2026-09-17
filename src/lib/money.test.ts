import { describe, expect, it } from 'vitest';
import {
  add,
  convertToBase,
  Decimal,
  depositAmount,
  formatMoney,
  percentOf,
  roundMoney,
  scaleFor,
  subtract,
  sum,
  toDecimal,
  toStorage,
} from './money';

describe('currency scale', () => {
  it('gives BHD three decimal places and USD two', () => {
    // The whole reason this module exists: BHD is a 3-decimal currency.
    expect(scaleFor('BHD')).toBe(3);
    expect(scaleFor('USD')).toBe(2);
  });
});

describe('toDecimal', () => {
  it('treats empty and null as zero', () => {
    expect(toDecimal(null).toString()).toBe('0');
    expect(toDecimal(undefined).toString()).toBe('0');
    expect(toDecimal('').toString()).toBe('0');
  });

  it('parses via toString so floats do not drift', () => {
    expect(toDecimal(0.1).plus(toDecimal(0.2)).toString()).toBe('0.3');
  });

  it('accepts Prisma-style decimals that only expose toString', () => {
    const prismaish = { toString: () => '1250.500' };
    expect(toDecimal(prismaish).toString()).toBe('1250.5');
  });

  it('rejects values that are not finite numbers', () => {
    expect(() => toDecimal('not-a-number')).toThrow();
    expect(() => toDecimal(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('rounding', () => {
  it('keeps three decimals for BHD instead of truncating to two', () => {
    expect(roundMoney('12.3456', 'BHD').toString()).toBe('12.346');
    expect(roundMoney('12.3456', 'USD').toString()).toBe('12.35');
  });

  it('rounds half away from zero, as finance expects', () => {
    expect(roundMoney('0.0005', 'BHD').toString()).toBe('0.001');
    expect(roundMoney('1.005', 'USD').toString()).toBe('1.01');
  });

  it('pads to the full scale for storage', () => {
    expect(toStorage('12.5', 'BHD')).toBe('12.500');
    expect(toStorage(0, 'BHD')).toBe('0.000');
  });
});

describe('arithmetic', () => {
  it('adds and subtracts exactly', () => {
    expect(add('0.1', '0.2').toString()).toBe('0.3');
    expect(subtract('10.005', '0.005').toString()).toBe('10');
    expect(sum(['1.111', '2.222', '3.333']).toString()).toBe('6.666');
  });

  it('sums an empty list to zero', () => {
    expect(sum([]).toString()).toBe('0');
  });
});

describe('percentOf', () => {
  it('computes a whole-number percentage', () => {
    expect(percentOf('1000', 30).toString()).toBe('300');
  });

  it('handles fractional percentages at BHD scale', () => {
    expect(percentOf('1000', '12.5').toString()).toBe('125');
    expect(percentOf('99.999', '10').toString()).toBe('10');
  });
});

describe('convertToBase', () => {
  it('applies the entry-time rate and rounds to base scale', () => {
    // 500 USD at 0.376 -> 188.000 BHD
    expect(convertToBase('500', '0.376').toString()).toBe('188');
  });

  it('does not lose fils on awkward rates', () => {
    // 123.45 * 0.376 = 46.4172, which rounds to three decimals as 46.417.
    expect(convertToBase('123.45', '0.376').toFixed(3)).toBe('46.417');
  });

  it('is identity at rate 1', () => {
    expect(convertToBase('250.750', '1').toFixed(3)).toBe('250.750');
  });
});

describe('depositAmount', () => {
  it('computes the PRD example: 30% of the booking', () => {
    expect(depositAmount('1000', 'PERCENT', 30).toString()).toBe('300');
  });

  it('takes a flat amount as given', () => {
    expect(depositAmount('1000', 'AMOUNT', '250.500').toFixed(3)).toBe('250.500');
  });

  it('clamps a deposit larger than the booking total', () => {
    // Otherwise the booking would sit in permanent credit and never roll up to
    // FULLY_PAID correctly.
    expect(depositAmount('100', 'AMOUNT', '500').toString()).toBe('100');
    expect(depositAmount('100', 'PERCENT', 120).toString()).toBe('100');
  });

  it('floors a negative deposit at zero', () => {
    expect(depositAmount('100', 'AMOUNT', '-50').toString()).toBe('0');
  });

  it('treats a 100% deposit as payment in full', () => {
    expect(depositAmount('750.250', 'PERCENT', 100).toFixed(3)).toBe('750.250');
  });
});

describe('formatMoney', () => {
  it('shows three decimals and the code for BHD', () => {
    expect(formatMoney('1250.5', 'BHD')).toBe('BHD 1,250.500');
  });

  it('can omit the currency code for table columns', () => {
    expect(formatMoney('1250.5', 'BHD', { withCode: false })).toBe('1,250.500');
  });

  it('uses two decimals for USD', () => {
    expect(formatMoney('99.9', 'USD')).toBe('USD 99.90');
  });
});

describe('Decimal re-export', () => {
  it('is the decimal.js constructor, so services can type against it', () => {
    expect(new Decimal('1.5').plus(1).toString()).toBe('2.5');
  });
});
