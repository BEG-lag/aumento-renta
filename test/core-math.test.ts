import { describe, expect, it } from 'vitest';
import { Rational, q } from '../src/core/rational.ts';
import { formatCentavos, money, moneyFromCentavos, moneyToRational } from '../src/core/money.ts';
import {
  addDays,
  addMonths,
  addYears,
  compareDates,
  dayNumber,
  daysInMonth,
  formatMonth,
  fromDayNumber,
  fromDmy,
  isDate,
  isMonth,
  monthDiff,
  monthOf,
  parseDate,
  toDmy,
  wholeMonthsBetween,
  yearOf,
} from '../src/core/dates.ts';

describe('Rational', () => {
  it('parses decimals exactly, including what floats get wrong', () => {
    expect(q('0.1').add(q('0.2')).eq(q('0.3'))).toBe(true);
    expect(q('147.026').toString()).toBe('73513/500');
    expect(q(0.1).toString()).toBe('1/10');
    expect(q('1.5e3').toString()).toBe('1500');
    expect(q('2.5e-2').toString()).toBe('1/40');
    expect(q(12n).toString()).toBe('12');
    expect(q(q('3')).toString()).toBe('3');
    expect(q('-0.5').toString()).toBe('-1/2');
    expect(q('_1_000').toString()).toBe('1000');
  });

  it('rejects anything that is not a finite decimal', () => {
    expect(() => q('abc')).toThrow(RangeError);
    expect(() => q('.')).toThrow(RangeError);
    expect(() => q(Number.NaN)).toThrow(RangeError);
    expect(() => Rational.of(1, 0)).toThrow(RangeError);
    expect(() => q('1').div(Rational.ZERO)).toThrow(RangeError);
  });

  it('normalizes sign and gcd', () => {
    expect(Rational.of(2, -4).toString()).toBe('-1/2');
    expect(Rational.of(6n, 3n).isInteger()).toBe(true);
  });

  it('does arithmetic and comparisons', () => {
    const a = q('1.25');
    const b = q('0.75');
    expect(a.sub(b).toString()).toBe('1/2');
    expect(a.mul(b).toString()).toBe('15/16');
    expect(a.div(b).toString()).toBe('5/3');
    expect(a.neg().toString()).toBe('-5/4');
    expect(a.cmp(b)).toBe(1);
    expect(b.cmp(a)).toBe(-1);
    expect(a.cmp(q('1.25'))).toBe(0);
    expect(a.gt(b) && a.gte(b) && b.lt(a) && b.lte(a)).toBe(true);
    expect(Rational.min(a, b).eq(b) && Rational.max(a, b).eq(a)).toBe(true);
    expect(Rational.sum([a, b, q('1')]).toString()).toBe('3');
    expect(q('0').isZero() && q('-1').isNegative()).toBe(true);
    expect(q('-1.5').floor()).toBe(-2n);
    expect(q('1.5').floor()).toBe(1n);
    expect(q('-2').floor()).toBe(-2n);
    expect(q('0.25').toNumber()).toBe(0.25);
  });

  it('rounds half away from zero', () => {
    expect(q('1234.565').roundScaled(2)).toBe(123457n);
    expect(q('-1234.565').roundScaled(2)).toBe(-123457n);
    expect(q('1234.564').roundToCentavos()).toBe(123456n);
    expect(q('0.036949').round(4).toString()).toBe('369/10000');
    expect(q('2.5').toFixed(0)).toBe('3');
    expect(q('-0.004').toFixed(2)).toBe('0.00');
    expect(q('-0.005').toFixed(2)).toBe('-0.01');
    expect(q('1').div(q('3')).toDecimalString()).toBe('0.3333');
    expect(q('2.50').toDecimalString()).toBe('2.5');
    expect(q('7').toDecimalString()).toBe('7');
  });
});

describe('money', () => {
  it('formats Mexican pesos and rounds once', () => {
    expect(formatCentavos(123456789n)).toBe('$1,234,567.89');
    expect(formatCentavos(-5n)).toBe('-$0.05');
    expect(money(q('12368.555')).formatted).toBe('$12,368.56');
    expect(money(q('-0.005')).amount).toBe('-0.01');
    expect(moneyFromCentavos(100n).amount).toBe('1.00');
    expect(moneyToRational(money(q('10.5'))).toString()).toBe('21/2');
  });
});

describe('dates', () => {
  it('validates civil dates and months', () => {
    expect(isDate('2024-02-29')).toBe(true);
    expect(isDate('2025-02-29')).toBe(false);
    expect(isDate('1900-02-29')).toBe(false);
    expect(isDate('2000-02-29')).toBe(true);
    expect(isDate('2026-13-01')).toBe(false);
    expect(isDate('26-11-2026')).toBe(false);
    expect(isDate('1899-12-31')).toBe(false);
    expect(parseDate(' 2026-11-17 ')).toEqual({ y: 2026, m: 11, d: 17 });
    expect(isMonth('2026-11')).toBe(true);
    expect(isMonth('2026-00')).toBe(false);
    expect(isMonth('2026-1')).toBe(false);
    expect(isMonth('2300-01')).toBe(false);
    expect(daysInMonth(2026, 13)).toBe(0);
  });

  it('does month arithmetic', () => {
    expect(addMonths('2026-10', -12)).toBe('2025-10');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2025-12', 1)).toBe('2026-01');
    expect(addMonths('2025-12', 25)).toBe('2028-01');
    expect(monthDiff('2025-10', '2026-10')).toBe(12);
    expect(monthDiff('2026-10', '2025-10')).toBe(-12);
    expect(monthOf('2026-12-01')).toBe('2026-12');
    expect(yearOf('2026-12-01')).toBe(2026);
    expect(formatMonth(2026, 3)).toBe('2026-03');
    expect(() => addMonths('2026-13', 1)).toThrow(RangeError);
    expect(() => monthOf('nope')).toThrow(RangeError);
  });

  it('computes anniversaries, including February 29', () => {
    expect(addYears('2025-12-01', 1)).toBe('2026-12-01');
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
  });

  it('counts whole months the way a lease does', () => {
    expect(wholeMonthsBetween('2025-12-01', '2026-12-01')).toBe(12);
    expect(wholeMonthsBetween('2025-12-01', '2026-11-30')).toBe(11);
    expect(wholeMonthsBetween('2025-12-15', '2026-12-14')).toBe(11);
    expect(wholeMonthsBetween('2025-01-31', '2025-02-28')).toBe(1);
    expect(wholeMonthsBetween('2024-02-29', '2025-02-28')).toBe(12);
    expect(wholeMonthsBetween('2026-01-10', '2026-01-20')).toBe(0);
  });

  it('converts day numbers both ways', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2000-03-01')).toBe(11017);
    expect(fromDayNumber(dayNumber('2026-11-17'))).toBe('2026-11-17');
    expect(fromDayNumber(-1)).toBe('1969-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('1995-04-04', 11558)).toBe('2026-11-25');
    for (let n = 9000; n < 21000; n += 37) expect(dayNumber(fromDayNumber(n))).toBe(n);
  });

  it('compares and converts SIDOF dates', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareDates('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareDates('2026-01-01', '2026-01-01')).toBe(0);
    expect(fromDmy('17-11-2026')).toBe('2026-11-17');
    expect(fromDmy('32-11-2026')).toBeNull();
    expect(fromDmy('2026-11-17')).toBeNull();
    expect(toDmy('2026-11-07')).toBe('07-11-2026');
  });
});
