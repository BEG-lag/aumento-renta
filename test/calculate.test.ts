/**
 * Worked examples with real published values. Each expected number was
 * computed by hand from the values in the comments (exact fractions, rounded
 * once to centavos, half away from zero) and is checked against the code.
 */
import { describe, expect, it } from 'vitest';
import { calculate, parseAmount, parsePercent, percentText, referenceInflation, type UpdateInput, type UpdateResult } from '../src/core/calculate.ts';
import { q } from '../src/core/rational.ts';
import { series } from './helpers.ts';

const BASE: UpdateInput = {
  amount: '12,000',
  index: 'inpc',
  startDate: '2025-12-01',
  increaseDate: '2026-12-01',
  period: 'published',
  location: 'cdmx',
  use: 'housing',
};

function run(patch: Partial<UpdateInput> = {}): UpdateResult {
  const r = calculate({ ...BASE, ...patch }, series);
  if (!r.ok) throw new Error(`unexpected errors: ${r.errors.join(', ')}`);
  return r;
}

describe('published values used by the examples', () => {
  it.each([
    ['2024-12', '137.949', '2025-01-10'],
    ['2025-10', '141.708', '2025-11-10'],
    ['2025-11', '142.645', '2025-12-10'],
    ['2025-12', '143.042', '2026-01-09'],
    ['2026-10', '147.026', '2026-11-10'],
  ])('INPC %s = %s (DOF %s)', (month, value, dof) => {
    const p = series.inpc.get(month);
    expect(p?.value).toBe(value);
    expect(p?.dof?.date).toBe(dof);
  });

  it.each([
    ['2025-12-01', '8.614745'],
    ['2026-11-17', '8.913896'],
    ['2026-11-25', '8.932476'],
  ])('UDI %s = %s', (date, value) => {
    expect(series.udis?.get(date)?.value).toBe(value);
  });
});

describe('INPC update, contract from 2025-12-01, increase on 2026-12-01, rent $12,000', () => {
  it('published: latest INPC published by 2026-12-01 is October 2026 (DOF 10/11/2026), against October 2025', () => {
    // 147.026 / 141.708 = 1.037527874...; 12,000 x factor = 12,450.3345 -> $12,450.33
    const r = run();
    expect([r.from.key, r.to.key, r.months]).toEqual(['2025-10', '2026-10', 12]);
    expect(r.factor.eq(q('147.026').div(q('141.708')))).toBe(true);
    expect(r.factor.toFixed(6)).toBe('1.037528');
    expect(r.updated.formatted).toBe('$12,450.33');
    expect(r.increase.formatted).toBe('$450.33');
    expect(percentText(r.rate)).toBe('3.75');
    expect(r.provisional).toBe(false);
    expect(r.notes).toEqual([]);
  });

  it('cff: month before each date, November 2025 to November 2026; November 2026 is not out by 2026-12-01, so October 2026', () => {
    // CFF art. 17-A, 2nd paragraph: use the last index published. 147.026 / 142.645 -> $12,368.55
    const r = run({ period: 'cff' });
    expect([r.from.key, r.to.key, r.months]).toEqual(['2025-11', '2026-10', 11]);
    expect(r.updated.formatted).toBe('$12,368.55');
    expect(percentText(r.rate)).toBe('3.07');
  });

  it('calendar: December 2024 to December 2025, the inflation of 2025', () => {
    // 143.042 / 137.949 = 1.036919441...; -> $12,443.03, 3.69%
    const r = run({ period: 'calendar' });
    expect([r.from.key, r.to.key]).toEqual(['2024-12', '2025-12']);
    expect(r.updated.formatted).toBe('$12,443.03');
    expect(percentText(r.rate)).toBe('3.69');
  });

  it('custom months, using the corrected August 2018 value (DOF Nota aclaratoria of 11/09/2018)', () => {
    // 103.670 / 100.492 (not the 100.942 first printed) -> $12,379.49
    const r = run({ period: 'custom', customFrom: '2018-08', customTo: '2019-08' });
    expect(r.from.value).toBe('100.492');
    expect(r.updated.formatted).toBe('$12,379.49');
    expect(r.notes).toContainEqual({ code: 'corrected', month: '2018-08', note: 5537585, date: '2018-09-11' });
  });

  it('older contracts use INEGI re-based values with all their decimals', () => {
    // 75.295991345634 / 72.552045976151 x 8,500 = 8,821.4732... -> $8,821.47
    const r = run({ amount: '8500', period: 'custom', customFrom: '2010-01', customTo: '2011-01' });
    expect(r.updated.formatted).toBe('$8,821.47');
    expect(r.notes).toContainEqual({ code: 'rebased', months: ['2010-01', '2011-01'] });
  });
});

describe('UDIS update', () => {
  it('uses the UDI of each date', () => {
    // 8.913896 / UDI(2025-11-17) on $15,000 -> $15,561.55
    const r = run({ index: 'udis', amount: '15000', startDate: '2025-11-17', increaseDate: '2026-11-17' });
    expect(r.to.value).toBe('8.913896');
    expect(r.to.dof).toEqual({ date: '2026-11-10', note: 5803350 });
    expect(r.updated.formatted).toBe('$15,561.55');
    expect(percentText(r.rate)).toBe('3.74');
  });

  it('is provisional when the UDI of the increase date is not published yet', () => {
    // UDIS are published to 2026-11-25: 8.932476 / 8.614745 -> $12,442.59
    const r = run({ index: 'udis' });
    expect(r.provisional).toBe(true);
    expect(r.to.key).toBe('2026-11-25');
    expect(r.updated.formatted).toBe('$12,442.59');
    expect(r.notes).toContainEqual({ code: 'provisional-udis', wanted: '2026-12-01', used: '2026-11-25' });
  });

  it('rejects dates before the first UDI (1995-04-04)', () => {
    expect(calculate({ ...BASE, index: 'udis', startDate: '1995-01-01' }, series)).toEqual({ ok: false, errors: ['before-data'] });
    expect(calculate({ ...BASE, index: 'udis' }, { ...series, udis: null })).toEqual({ ok: false, errors: ['before-data'] });
  });
});

describe('provisional and edge cases', () => {
  it('a future increase uses the latest INPC and says when the right one is due', () => {
    const r = run({ startDate: '2026-03-01', increaseDate: '2027-03-01' });
    expect(r.provisional).toBe(true);
    expect([r.from.key, r.to.key]).toEqual(['2025-10', '2026-10']);
    expect(r.notes).toContainEqual({ code: 'provisional-inpc', wanted: '2027-01', used: '2026-10', expected: '2027-02-10' });
  });

  it('calendar mode before December is published is provisional too', () => {
    const r = run({ period: 'calendar', startDate: '2026-01-05', increaseDate: '2027-01-05' });
    expect(r.provisional).toBe(true);
    expect(r.notes[0]).toMatchObject({ code: 'provisional-inpc', wanted: '2026-12' });
  });

  it('notes when December was published after the increase date', () => {
    const r = run({ period: 'calendar', startDate: '2025-01-05', increaseDate: '2026-01-05' });
    expect(r.notes).toContainEqual({ code: 'published-after', month: '2025-12', published: '2026-01-09' });
  });

  it('flags deflation', () => {
    // INPC fell from April to June 2026 (145.831 -> 145.131)
    const r = run({ period: 'custom', customFrom: '2026-04', customTo: '2026-06' });
    expect(r.increase.centavos < 0n).toBe(true);
    expect(r.notes).toContainEqual({ code: 'deflation' });
  });

  it('validates the inputs', () => {
    const errors = (patch: Partial<UpdateInput>): string[] => {
      const r = calculate({ ...BASE, ...patch }, series);
      return r.ok ? [] : r.errors;
    };
    expect(errors({ amount: 'doce mil' })).toEqual(['amount']);
    expect(errors({ amount: '0' })).toEqual(['amount']);
    expect(errors({ amount: '2,000,000,000' })).toEqual(['amount']);
    expect(errors({ startDate: '2025-02-30', increaseDate: 'x' })).toEqual(['start', 'increase']);
    expect(errors({ increaseDate: '2025-12-01' })).toEqual(['order']);
    expect(errors({ increaseDate: '2025-12-20' })).toEqual(['span']);
    expect(errors({ period: 'cff', startDate: '2026-11-02', increaseDate: '2026-11-30' })).toEqual(['span']);
    expect(errors({ period: 'custom' })).toEqual(['custom-from', 'custom-to']);
    expect(errors({ period: 'custom', customFrom: '2026-05', customTo: '2026-05' })).toEqual(['custom-order']);
    expect(errors({ period: 'custom', customFrom: '2026-05', customTo: '2027-05' })).toEqual(['not-published']);
    expect(errors({ period: 'custom', customFrom: '2001-05', customTo: '2002-05' })).toEqual(['before-data']);
    expect(errors({ period: 'custom', customFrom: '2001-05', customTo: '2004-05' })).toEqual(['before-data']);
    expect(errors({ startDate: '2002-01-01' })).toEqual(['before-data']);
    expect(errors({ proposal: { kind: 'percent', value: 'mucho' } })).toEqual(['proposal']);
    expect(errors({ proposal: { kind: 'newRent', value: '-5' } })).toEqual(['proposal']);
    expect(errors({ proposal: { kind: 'increase', value: 'x' } })).toEqual(['proposal']);
  });

  it('parses amounts and percentages in Mexican format', () => {
    expect(parseAmount('$12,345.67')?.toString()).toBe('1234567/100');
    expect(parseAmount('12345')?.toString()).toBe('12345');
    expect(parseAmount('12,34')).toBeNull();
    expect(parseAmount('1.234,50')).toBeNull();
    expect(parsePercent('5.25 %')?.toString()).toBe('21/400');
    expect(parsePercent('-1')?.toString()).toBe('-1/100');
    expect(parsePercent('5,5')).toBeNull();
  });
});

describe('proposal and the Mexico City cap (CCDF art. 2448 D)', () => {
  it('8% on $12,000 for 2026-12-01 exceeds both readings of "inflation of the previous year"', () => {
    // Reading 1, 2025 (Dec 2024 to Dec 2025): 3.69%, max rent 12,000 x 143.042 / 137.949 = $12,443.03
    // Reading 2, 12 months to October 2026: 3.75%, max rent $12,450.33
    const r = run({ proposal: { kind: 'percent', value: '8' } });
    expect(r.proposal?.newRent.formatted).toBe('$12,960.00');
    expect(r.proposal?.vsUpdate.formatted).toBe('$509.67');
    expect(r.cap.status).toBe('applies');
    expect(r.cap.readings.map((c) => [c.inflation.reading, percentText(c.inflation.reported), c.cap.formatted])).toEqual([
      ['calendar-year', '3.69', '$12,443.03'],
      ['last-12', '3.75', '$12,450.33'],
    ]);
    expect(r.cap.proposalVerdict).toBe('exceeds');
    expect(r.cap.updateVerdict).toBe('depends');
    expect(r.cap.frequency).toBe('ok');
  });

  it('3.7% is within one reading and above the other', () => {
    const r = run({ proposal: { kind: 'percent', value: '3.7' } });
    expect(r.proposal?.newRent.formatted).toBe('$12,444.00');
    expect(r.cap.readings.map((c) => c.proposalWithin)).toEqual([false, true]);
    expect(r.cap.proposalVerdict).toBe('depends');
  });

  it('accepts the proposal as a new rent or an increase in pesos', () => {
    const a = run({ proposal: { kind: 'newRent', value: '12,400' } });
    expect(a.cap.proposalVerdict).toBe('within');
    expect(percentText(a.proposal?.rate ?? q('0'))).toBe('3.33');
    const b = run({ proposal: { kind: 'increase', value: '400' } });
    expect(b.proposal?.newRent.formatted).toBe('$12,400.00');
    expect(b.proposal?.vsUpdate.formatted).toBe('-$50.33');
    const c = run({ proposal: { kind: 'percent', value: '' } });
    expect(c.proposal).toBeUndefined();
  });

  it('the cap applies only to homes in Mexico City from 2024-08-29', () => {
    expect(run({ location: 'other' }).cap.status).toBe('other-state');
    expect(run({ use: 'commercial' }).cap.status).toBe('commercial');
    expect(run({ startDate: '2023-06-01', increaseDate: '2024-06-01' }).cap.status).toBe('before-reform');
    expect(run({ startDate: '2023-08-29', increaseDate: '2024-08-29' }).cap.status).toBe('applies');
  });

  it('warns about increases more than once a year, or after more than a year', () => {
    expect(run({ startDate: '2026-06-01' }).cap.frequency).toBe('less-than-a-year');
    expect(run({ startDate: '2024-12-01' }).cap.frequency).toBe('more-than-a-year');
  });

  it('says when the calendar-year inflation is not published yet', () => {
    const { readings, pending } = referenceInflation(series.inpc, '2027-01-05');
    expect(pending).toEqual([{ reading: 'calendar-year', year: 2026, month: '2026-12', expected: '2027-01-10' }]);
    expect(readings.map((r) => [r.reading, r.to.key, r.provisional])).toEqual([['last-12', '2026-10', true]]);
  });

  it('the update of the same 12 months is exactly at the reading-2 cap', () => {
    const r = run();
    const last12 = r.cap.readings.find((c) => c.inflation.reading === 'last-12');
    expect(last12?.cap.formatted).toBe(r.updated.formatted);
    expect(last12?.updateWithin).toBe(true);
  });
});
