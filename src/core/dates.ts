/**
 * Civil dates ("YYYY-MM-DD") and months ("YYYY-MM") as plain strings, with
 * integer arithmetic only. No time zones are involved: a rent is due on a
 * calendar day, and the index series are keyed by calendar day or month.
 */

export type IsoDate = string;
export type YearMonth = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
}

export interface DateParts {
  y: number;
  m: number;
  d: number;
}

/** Parses and validates "YYYY-MM-DD" (years 1900 to 2199). */
export function parseDate(value: string): DateParts | null {
  const match = DATE_RE.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1900 || y > 2199 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isDate(value: string): boolean {
  return parseDate(value) !== null;
}

/** Parses and validates "YYYY-MM" (years 1900 to 2199). */
export function parseMonth(value: string): { y: number; m: number } | null {
  const match = MONTH_RE.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (y < 1900 || y > 2199 || m < 1 || m > 12) return null;
  return { y, m };
}

export function isMonth(value: string): boolean {
  return parseMonth(value) !== null;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

export function formatDate({ y, m, d }: DateParts): IsoDate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function formatMonth(y: number, m: number): YearMonth {
  return `${pad(y, 4)}-${pad(m)}`;
}

function mustDate(value: IsoDate): DateParts {
  const p = parseDate(value);
  if (!p) throw new RangeError(`Invalid date: ${value}`);
  return p;
}

function mustMonth(value: YearMonth): { y: number; m: number } {
  const p = parseMonth(value);
  if (!p) throw new RangeError(`Invalid month: ${value}`);
  return p;
}

/** The month a date belongs to: "2026-12-01" is "2026-12". */
export function monthOf(date: IsoDate): YearMonth {
  const { y, m } = mustDate(date);
  return formatMonth(y, m);
}

export function yearOf(date: IsoDate): number {
  return mustDate(date).y;
}

/** Adds (or subtracts) whole months to a month. */
export function addMonths(month: YearMonth, n: number): YearMonth {
  const { y, m } = mustMonth(month);
  const index = y * 12 + (m - 1) + n;
  return formatMonth(Math.floor(index / 12), (index % 12) + 1);
}

/** Months from `a` to `b` ("2025-10" to "2026-10" is 12). */
export function monthDiff(a: YearMonth, b: YearMonth): number {
  const pa = mustMonth(a);
  const pb = mustMonth(b);
  return pb.y * 12 + pb.m - (pa.y * 12 + pa.m);
}

/**
 * Adds whole years to a date. February 29 becomes February 28 in a common
 * year, so the anniversary of 2024-02-29 is 2025-02-28.
 */
export function addYears(date: IsoDate, n: number): IsoDate {
  const { y, m, d } = mustDate(date);
  const year = y + n;
  return formatDate({ y: year, m, d: Math.min(d, daysInMonth(year, m)) });
}

/** Adds whole days (positive or negative). */
export function addDays(date: IsoDate, n: number): IsoDate {
  return fromDayNumber(dayNumber(date) + n);
}

/** Days since 1970-01-01 for a civil date (proleptic Gregorian). */
export function dayNumber(date: IsoDate): number {
  const { y, m, d } = mustDate(date);
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(n: number): IsoDate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return formatDate({ y, m, d });
}

/**
 * Whole months elapsed from `a` to `b`, counting a month only when its day
 * is reached: 2025-12-01 to 2026-12-01 is 12, to 2026-11-30 is 11. When the
 * start day does not exist in the end month (the 31st, February 29), the last
 * day of that month completes it.
 */
export function wholeMonthsBetween(a: IsoDate, b: IsoDate): number {
  const pa = mustDate(a);
  const pb = mustDate(b);
  let months = (pb.y - pa.y) * 12 + (pb.m - pa.m);
  const dayNeeded = Math.min(pa.d, daysInMonth(pb.y, pb.m));
  if (pb.d < dayNeeded) months -= 1;
  return months;
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Converts "DD-MM-YYYY" (SIDOF style) to "YYYY-MM-DD". */
export function fromDmy(value: string): IsoDate | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const iso = `${match[3] ?? ''}-${match[2] ?? ''}-${match[1] ?? ''}`;
  return isDate(iso) ? iso : null;
}

/** Converts "YYYY-MM-DD" to "DD-MM-YYYY" (SIDOF style). */
export function toDmy(date: IsoDate): string {
  const { y, m, d } = mustDate(date);
  return `${pad(d)}-${pad(m)}-${pad(y, 4)}`;
}
