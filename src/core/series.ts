/**
 * Read access to the bundled index series, with publication dates.
 *
 * INPC: a month's value is "available" from the date of its DOF publication
 * when known (every month since August 2018). For older months the app uses
 * the legal deadline instead: CFF art. 20 orders INEGI to publish the INPC in
 * the DOF "dentro de los primeros diez días del mes siguiente", so the 10th
 * of the next month, flagged as an estimate.
 *
 * UDIS: one value per calendar day, from SIDOF, with the Banco de México DOF
 * note of the period when known (since 2018).
 */
import { addMonths, compareDates, dayNumber, addDays, monthOf, daysInMonth, parseMonth } from './dates.ts';
import { Rational } from './rational.ts';
import type { DofRef, InpcData, InpcMonth, UdiPublication, UdisData } from '../data/types.ts';

export interface IndexPoint {
  /** "YYYY-MM" for the INPC, "YYYY-MM-DD" for UDIS. */
  key: string;
  /** Value exactly as published. */
  value: string;
  exact: Rational;
  source: 'dof' | 'inegi-csv' | 'sidof';
  /** The DOF note that published it, when known. */
  dof?: DofRef;
  /** A DOF note that corrected it, when there was one. */
  correction?: DofRef;
  /** Date it was (or legally had to be) published. */
  published?: string;
  /** True when `published` is the CFF art. 20 deadline, not a known DOF date. */
  publishedEstimated?: boolean;
  /** For UDIS: the period covered by the DOF note. */
  period?: { from: string; to: string };
}

/** Day of the following month by which INEGI must publish (CFF art. 20, 2nd paragraph). */
export const INPC_PUBLICATION_DEADLINE_DAY = 10;

export class InpcSeries {
  readonly data: InpcData;
  private readonly byMonth: Map<string, InpcMonth>;
  readonly first: string;
  readonly last: string;

  constructor(data: InpcData) {
    this.data = data;
    if (data.months.length === 0) throw new RangeError('INPC series is empty');
    this.byMonth = new Map(data.months.map((m) => [m.month, m]));
    this.first = data.months[0]?.month ?? '';
    this.last = data.months[data.months.length - 1]?.month ?? '';
  }

  has(month: string): boolean {
    return this.byMonth.has(month);
  }

  /** Publication date of a month: the DOF date when known, else the legal deadline. */
  publication(month: string): { date: string; estimated: boolean } {
    const m = this.byMonth.get(month);
    if (m?.dof) return { date: m.dof.date, estimated: false };
    return { date: `${addMonths(month, 1)}-${String(INPC_PUBLICATION_DEADLINE_DAY).padStart(2, '0')}`, estimated: true };
  }

  get(month: string): IndexPoint | undefined {
    const m = this.byMonth.get(month);
    if (!m) return undefined;
    const pub = this.publication(month);
    const point: IndexPoint = {
      key: m.month,
      value: m.value,
      exact: Rational.parse(m.value),
      source: m.source,
      published: pub.date,
      publishedEstimated: pub.estimated,
    };
    if (m.dof) point.dof = m.dof;
    if (m.correction) point.correction = m.correction;
    return point;
  }

  /**
   * The most recent month whose INPC was published on or before `date`,
   * whether or not it is in the bundled data yet. Uses the real DOF date for
   * bundled months and the legal deadline (10th of the next month) beyond.
   */
  latestPublishedBy(date: string): string {
    // Candidate by the deadline rule.
    const month = monthOf(date);
    const day = Number(date.slice(8, 10));
    let candidate = addMonths(month, day >= INPC_PUBLICATION_DEADLINE_DAY ? -1 : -2);
    // A known DOF date can be earlier than the deadline (the 9th) or later
    // (a weekend or holiday), so check the neighbours against real dates.
    const next = addMonths(candidate, 1);
    if (this.byMonth.has(next) && compareDates(this.publication(next).date, date) <= 0) candidate = next;
    else if (this.byMonth.has(candidate) && compareDates(this.publication(candidate).date, date) > 0) candidate = addMonths(candidate, -1);
    return candidate;
  }
}

export class UdisSeries {
  readonly data: UdisData;
  readonly first: string;
  readonly last: string;
  private readonly startDay: number;

  constructor(data: UdisData) {
    this.data = data;
    if (data.values.length === 0) throw new RangeError('UDIS series is empty');
    this.first = data.start;
    this.last = addDays(data.start, data.values.length - 1);
    this.startDay = dayNumber(data.start);
    if (this.last !== data.end) throw new RangeError(`UDIS series: end ${data.end} does not match ${data.values.length} values`);
  }

  has(date: string): boolean {
    return compareDates(date, this.first) >= 0 && compareDates(date, this.last) <= 0;
  }

  private publicationOf(date: string): UdiPublication | undefined {
    const pubs = this.data.publications;
    let lo = 0;
    let hi = pubs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const p = pubs[mid];
      if (!p) break;
      if (compareDates(date, p.from) < 0) hi = mid - 1;
      else if (compareDates(date, p.to) > 0) lo = mid + 1;
      else return p;
    }
    return undefined;
  }

  get(date: string): IndexPoint | undefined {
    if (!this.has(date)) return undefined;
    const value = this.data.values[dayNumber(date) - this.startDay];
    if (value === undefined) return undefined;
    const point: IndexPoint = { key: date, value, exact: Rational.parse(value), source: 'sidof' };
    const pub = this.publicationOf(date);
    if (pub) {
      point.dof = { date: pub.date, note: pub.note };
      point.published = pub.date;
      point.publishedEstimated = false;
      point.period = { from: pub.from, to: pub.to };
    }
    return point;
  }
}

/** Last day of a month, "YYYY-MM-DD". */
export function lastDayOf(month: string): string {
  const p = parseMonth(month);
  if (!p) throw new RangeError(`Invalid month: ${month}`);
  return `${month}-${String(daysInMonth(p.y, p.m)).padStart(2, '0')}`;
}
