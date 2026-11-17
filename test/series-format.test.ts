import { describe, expect, it } from 'vitest';
import { InpcSeries, UdisSeries, lastDayOf } from '../src/core/series.ts';
import { addDays, addMonths, dayNumber, monthDiff } from '../src/core/dates.ts';
import {
  dateLong,
  dateShort,
  factorText,
  indexShortened,
  indexText,
  monthName,
  monthShort,
  percent,
  pointLabel,
  pointUrl,
  signedPercent,
} from '../src/core/format.ts';
import { q } from '../src/core/rational.ts';
import { inpcData, series, udisData } from './helpers.ts';

describe('INPC series', () => {
  it('covers January 2003 to at least October 2026, month by month without gaps', () => {
    expect(series.inpc.first).toBe('2003-01');
    expect(series.inpc.last >= '2026-10').toBe(true);
    expect(inpcData.months).toHaveLength(monthDiff('2003-01', series.inpc.last) + 1);
    inpcData.months.forEach((m, i) => expect(m.month).toBe(addMonths('2003-01', i)));
    // Every month from August 2018 comes from its DOF publication.
    for (const m of inpcData.months) expect(m.source === 'dof').toBe(m.month >= '2018-08');
  });

  it('knows when each month was published', () => {
    // Known DOF dates, including the 9th and the 8th (weekends).
    expect(series.inpc.publication('2026-10')).toEqual({ date: '2026-11-10', estimated: false });
    expect(series.inpc.publication('2026-04')).toEqual({ date: '2026-05-08', estimated: false });
    // Before the 2018 base, the CFF art. 20 deadline.
    expect(series.inpc.publication('2015-06')).toEqual({ date: '2015-07-10', estimated: true });
    expect(series.inpc.publication('2027-01')).toEqual({ date: '2027-02-10', estimated: true });
  });

  it('finds the latest INPC published by a date, using real DOF dates', () => {
    expect(series.inpc.latestPublishedBy('2026-11-10')).toBe('2026-10');
    expect(series.inpc.latestPublishedBy('2026-11-09')).toBe('2026-09');
    // September 2026 came out on Friday 9 October: available on the 9th.
    expect(series.inpc.latestPublishedBy('2026-10-09')).toBe('2026-09');
    // April 2026 came out on Friday 8 May.
    expect(series.inpc.latestPublishedBy('2026-05-08')).toBe('2026-04');
    expect(series.inpc.latestPublishedBy('2026-05-07')).toBe('2026-03');
    expect(series.inpc.latestPublishedBy('2026-12-01')).toBe('2026-10');
    expect(series.inpc.latestPublishedBy('2099-03-01')).toBe('2099-01');
    expect(series.inpc.latestPublishedBy('2015-07-10')).toBe('2015-06');
  });

  it('rejects an empty series', () => {
    expect(() => new InpcSeries({ ...inpcData, months: [] })).toThrow(RangeError);
  });
});

describe('UDIS series', () => {
  it('has one value per day from 1995-04-04 to at least 2026-11-25', () => {
    const udis = new UdisSeries(udisData);
    expect(udis.first).toBe('1995-04-04');
    expect(udis.last >= '2026-11-25').toBe(true);
    expect(udisData.values).toHaveLength(dayNumber(udis.last) - dayNumber(udis.first) + 1);
    for (const v of udisData.values) expect(v).toMatch(/^\d{1,2}\.\d{6}$/);
    expect(udis.get('1995-04-04')?.value).toBe('1.000000');
    expect(udis.get('1995-04-03')).toBeUndefined();
    expect(udis.get(addDays(udis.last, 1))).toBeUndefined();
    // Settled with the DOF: SIDOF skipped 2004-07-25 and duplicated 2012-08-15.
    expect(udis.get('2004-07-25')?.value).toBe('3.417744');
    expect(udis.get('2012-08-15')?.value).toBe('4.780673');
    expect(udis.get('2012-07-15')?.value).toBe('4.752686');
  });

  it('links a value to the DOF note of its period', () => {
    const p = series.udis?.get('2026-11-17');
    expect(p?.dof).toEqual({ date: '2026-11-10', note: 5803350 });
    expect(p?.period).toEqual({ from: '2026-11-11', to: '2026-11-25' });
    expect(series.udis?.get('2010-01-01')?.dof).toBeUndefined();
  });

  it('every period since 2018 is covered once, back to back', () => {
    const pubs = udisData.publications;
    expect(pubs.length).toBeGreaterThan(200);
    for (let i = 1; i < pubs.length; i++) expect((pubs[i]?.from ?? '') > (pubs[i - 1]?.to ?? '')).toBe(true);
  });

  it('rejects inconsistent data', () => {
    expect(() => new UdisSeries({ ...udisData, values: [] })).toThrow(RangeError);
    expect(() => new UdisSeries({ ...udisData, end: '2026-11-24' })).toThrow(RangeError);
    expect(() => new UdisSeries({ ...udisData, end: addDays(udisData.end, 1) })).toThrow(RangeError);
  });

  it('last day of a month', () => {
    expect(lastDayOf('2024-02')).toBe('2024-02-29');
    expect(() => lastDayOf('2024-13')).toThrow(RangeError);
  });
});

describe('format', () => {
  it('months and dates in both languages', () => {
    expect(monthName('2026-10', 'es')).toBe('octubre de 2026');
    expect(monthName('2026-10', 'en')).toBe('October 2026');
    expect(monthShort('2026-09', 'es')).toBe('sep. 2026');
    expect(monthShort('2026-09', 'en')).toBe('Sep 2026');
    expect(dateLong('2026-12-01', 'es')).toBe('1 de diciembre de 2026');
    expect(dateLong('2026-12-01', 'en')).toBe('December 1, 2026');
    expect(dateShort('2026-12-01', 'es')).toBe('01/12/2026');
    expect(dateShort('2026-12-01', 'en')).toBe('Dec 1, 2026');
    expect(monthName('x', 'es')).toBe('x');
    expect(monthShort('x', 'es')).toBe('x');
    expect(dateLong('x', 'es')).toBe('x');
    expect(dateShort('x', 'es')).toBe('x');
  });

  it('percentages and factors', () => {
    expect(percent(q('0.036919'))).toBe('3.69%');
    expect(signedPercent(q('0.0375'))).toBe('+3.75%');
    expect(signedPercent(q('-0.0012'))).toBe('-0.12%');
    expect(factorText(q('147.026').div(q('141.708')))).toBe('1.037528');
  });

  it('index values and their links', () => {
    const rebased = series.inpc.get('2010-01');
    const dof = series.inpc.get('2026-10');
    const corrected = series.inpc.get('2018-08');
    const udi = series.udis?.get('2026-11-17');
    const oldUdi = series.udis?.get('2010-01-01');
    if (!rebased || !dof || !corrected || !udi || !oldUdi) throw new Error('missing data');
    expect(indexText(rebased)).toBe('72.552046');
    expect(indexShortened(rebased)).toBe(true);
    expect(indexText(dof)).toBe('147.026');
    expect(indexShortened(dof)).toBe(false);
    expect(pointLabel(dof, 'es')).toBe('octubre de 2026');
    expect(pointLabel(udi, 'en')).toBe('November 17, 2026');
    expect(pointUrl(dof)).toBe('https://dof.gob.mx/nota_detalle.php?codigo=5803352&fecha=10/11/2026');
    expect(pointUrl(corrected)).toBe('https://dof.gob.mx/nota_detalle.php?codigo=5537585&fecha=11/09/2018');
    expect(pointUrl(rebased)).toBe('https://www.inegi.org.mx/programas/inpc/2018/#datos_abiertos');
    expect(pointUrl(udi)).toBe('https://dof.gob.mx/nota_detalle.php?codigo=5803350&fecha=10/11/2026');
    expect(pointUrl(oldUdi)).toBe('https://sidof.segob.gob.mx/dof/sidof/indicadores/159/01-01-2010/01-01-2010');
  });
});
