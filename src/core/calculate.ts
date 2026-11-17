/**
 * The calculation: update an amount between two dates with the INPC or UDIS,
 * compare it with what the landlord proposes, and (for a home in Mexico City)
 * check the cap of Código Civil para el Distrito Federal art. 2448 D.
 *
 * Rounding rules (also in docs/fuentes.md):
 * 1. Index values are used exactly as published (decimal strings, no floats).
 * 2. The factor is the exact quotient of the two values. It is shown with 6
 *    decimals but never rounded inside the calculation.
 * 3. Money is rounded once, at the end, to centavos, half away from zero.
 * 4. Percentages are shown with 2 decimals, half away from zero.
 * 5. The CDMX cap uses the exact annual variation of the INPC (shown with 2
 *    decimals, as INEGI and Banco de México report it). Using the rounded
 *    figure instead would move the cap by at most 0.005 percentage points.
 */
import { addMonths, compareDates, isDate, isMonth, monthDiff, monthOf, wholeMonthsBetween, yearOf } from './dates.ts';
import { money, type Money } from './money.ts';
import { Rational } from './rational.ts';
import type { IndexPoint, InpcSeries, UdisSeries } from './series.ts';

export type IndexKind = 'inpc' | 'udis';
/**
 * How the two INPC months are chosen:
 * - published: the latest INPC published by the increase date, against the
 *   same number of months earlier as there are between the two dates.
 * - cff: the month before each date (CFF art. 17-A convention); if the later
 *   one was not published by the increase date, the last one that was.
 * - calendar: December to December of the year before the increase.
 * - custom: two months chosen by the user.
 */
export type PeriodMode = 'published' | 'cff' | 'calendar' | 'custom';
export type ProposalKind = 'percent' | 'newRent' | 'increase';
export type Location = 'cdmx' | 'other';
export type PropertyUse = 'housing' | 'commercial';

export interface UpdateInput {
  amount: string;
  index: IndexKind;
  /** Start of the contract or date of the last increase, "YYYY-MM-DD". */
  startDate: string;
  /** Date the new rent applies (default: the anniversary), "YYYY-MM-DD". */
  increaseDate: string;
  period: PeriodMode;
  customFrom?: string;
  customTo?: string;
  proposal?: { kind: ProposalKind; value: string };
  location: Location;
  use: PropertyUse;
}

export type InputError =
  | 'amount'
  | 'start'
  | 'increase'
  | 'order'
  | 'span'
  | 'custom-from'
  | 'custom-to'
  | 'custom-order'
  | 'before-data'
  | 'not-published'
  | 'proposal';

export type Note =
  /** The INPC month the rule asks for is not published yet; the latest one was used. */
  | { code: 'provisional-inpc'; wanted: string; used: string; expected: string }
  /** The UDI of the increase date is not published yet; the latest one was used. */
  | { code: 'provisional-udis'; wanted: string; used: string }
  /** The December index was published after the increase date. */
  | { code: 'published-after'; month: string; published: string }
  /** The index went down: the updated amount is lower. */
  | { code: 'deflation' }
  /** A value comes from INEGI's re-based series (before August 2018). */
  | { code: 'rebased'; months: string[] }
  /** A value was corrected by a DOF "Nota aclaratoria". */
  | { code: 'corrected'; month: string; note: number; date: string };

export interface AnnualInflation {
  reading: 'calendar-year' | 'last-12';
  /** For calendar-year: the year measured. */
  year?: number;
  from: IndexPoint;
  to: IndexPoint;
  /** Exact rate (0.0369 is 3.69 %). */
  exact: Rational;
  /** Rate rounded to 2 decimals of a percent, as reported (for display). */
  reported: Rational;
  provisional: boolean;
}

export interface PendingInflation {
  reading: 'calendar-year';
  year: number;
  /** Month that is missing and when it is due. */
  month: string;
  expected: string;
}

export interface ProposalResult {
  kind: ProposalKind;
  value: Rational;
  newRent: Money;
  increase: Money;
  /** Exact rate of the proposal. */
  rate: Rational;
  /** Proposal minus the index update (positive: above the update). */
  vsUpdate: Money;
}

export type CapStatus = 'applies' | 'other-state' | 'commercial' | 'before-reform';
export type Verdict = 'within' | 'exceeds' | 'depends';

export interface CapReading {
  inflation: AnnualInflation;
  /** Highest new rent under this reading. */
  cap: Money;
  /** Exact cap, for comparisons. */
  capExact: Rational;
  proposalWithin?: boolean;
  updateWithin: boolean;
}

export interface CapResult {
  status: CapStatus;
  readings: CapReading[];
  pending: PendingInflation[];
  proposalVerdict?: Verdict;
  updateVerdict?: Verdict;
  /** 2448 D: rent can only be raised once a year. */
  frequency: 'ok' | 'less-than-a-year' | 'more-than-a-year';
}

export interface UpdateResult {
  ok: true;
  input: UpdateInput;
  amount: Rational;
  index: IndexKind;
  from: IndexPoint;
  to: IndexPoint;
  /** Months between the two INPC months (INPC only). */
  months?: number;
  factor: Rational;
  /** factor - 1 */
  rate: Rational;
  current: Money;
  updated: Money;
  increase: Money;
  provisional: boolean;
  notes: Note[];
  inflation: AnnualInflation[];
  pendingInflation: PendingInflation[];
  proposal?: ProposalResult;
  cap: CapResult;
}

export interface UpdateFailure {
  ok: false;
  errors: InputError[];
}

export interface Series {
  inpc: InpcSeries;
  udis: UdisSeries | null;
}

/** First day the 2024 text of art. 2448 D applies (GOCDMX 28/08/2024, in force the next day). */
export const CAP_IN_FORCE = '2024-08-29';
const MAX_AMOUNT = Rational.of(1_000_000_000n);

/** Parses "12,345.67", "$12345.67" or "12345" into an exact amount (Mexican format). */
export function parseAmount(value: string): Rational | null {
  const s = value.trim().replace(/^\$\s*/, '').replace(/\s+/g, '');
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,6})?$/.test(s)) return null;
  return Rational.parse(s.replace(/,/g, ''));
}

/** Parses "5", "5.25" or "5.25 %" into a rate (0.0525). Negative values are allowed. */
export function parsePercent(value: string): Rational | null {
  const s = value.trim().replace(/\s*%$/, '');
  if (!/^-?\d+(\.\d{1,6})?$/.test(s)) return null;
  return Rational.parse(s).div(Rational.of(100));
}

/** Rounds a rate to 2 decimals of a percent (4 decimals of the fraction), half away from zero. */
export function reportedRate(rate: Rational): Rational {
  return rate.round(4);
}

/** "3.69" for 0.0369. */
export function percentText(rate: Rational, digits = 2): string {
  return rate.mul(Rational.of(100)).toFixed(digits);
}

function inpcPoint(series: InpcSeries, month: string): IndexPoint | null {
  return series.get(month) ?? null;
}

function annual(series: InpcSeries, fromMonth: string, toMonth: string, reading: AnnualInflation['reading'], provisional: boolean): AnnualInflation | null {
  const from = inpcPoint(series, fromMonth);
  const to = inpcPoint(series, toMonth);
  if (!from || !to) return null;
  const exact = to.exact.div(from.exact).sub(Rational.ONE);
  const result: AnnualInflation = { reading, from, to, exact, reported: reportedRate(exact), provisional };
  if (reading === 'calendar-year') result.year = Number(toMonth.slice(0, 4));
  return result;
}

/**
 * Annual inflation around an increase date, in the two readings of "la
 * inflación ... en el año anterior" (CCDF art. 2448 D): the previous
 * calendar year (December to December), and the latest 12 months published
 * by the increase date.
 */
export function referenceInflation(series: InpcSeries, increaseDate: string): { readings: AnnualInflation[]; pending: PendingInflation[] } {
  const readings: AnnualInflation[] = [];
  const pending: PendingInflation[] = [];
  const year = yearOf(increaseDate) - 1;
  const dec = `${year}-12`;
  if (series.has(dec)) {
    const a = annual(series, `${year - 1}-12`, dec, 'calendar-year', false);
    if (a) readings.push(a);
  } else {
    pending.push({ reading: 'calendar-year', year, month: dec, expected: series.publication(dec).date });
  }
  const wanted = series.latestPublishedBy(increaseDate);
  const used = compareDates(`${wanted}-01`, `${series.last}-01`) > 0 ? series.last : wanted;
  const b = annual(series, addMonths(used, -12), used, 'last-12', used !== wanted);
  if (b) readings.push(b);
  return { readings, pending };
}

interface Resolved {
  from: IndexPoint;
  to: IndexPoint;
  months?: number;
  provisional: boolean;
  notes: Note[];
}

function resolveInpc(input: UpdateInput, series: InpcSeries): Resolved | InputError[] {
  const notes: Note[] = [];
  let fromMonth: string;
  let toMonth: string;
  let provisional = false;
  const clamp = (target: string): string => {
    if (monthDiff(series.last, target) > 0) {
      provisional = true;
      notes.push({ code: 'provisional-inpc', wanted: target, used: series.last, expected: series.publication(target).date });
      return series.last;
    }
    return target;
  };
  switch (input.period) {
    case 'published': {
      const span = wholeMonthsBetween(input.startDate, input.increaseDate);
      if (span < 1) return ['span'];
      toMonth = clamp(series.latestPublishedBy(input.increaseDate));
      fromMonth = addMonths(toMonth, -span);
      break;
    }
    case 'cff': {
      fromMonth = addMonths(monthOf(input.startDate), -1);
      const wanted = addMonths(monthOf(input.increaseDate), -1);
      const published = series.latestPublishedBy(input.increaseDate);
      toMonth = clamp(monthDiff(published, wanted) > 0 ? published : wanted);
      if (monthDiff(fromMonth, toMonth) < 1) return ['span'];
      break;
    }
    case 'calendar': {
      const year = yearOf(input.increaseDate) - 1;
      const dec = `${year}-12`;
      if (series.has(dec)) {
        toMonth = dec;
        const published = series.publication(dec).date;
        if (compareDates(published, input.increaseDate) > 0) notes.push({ code: 'published-after', month: dec, published });
      } else {
        toMonth = clamp(dec);
      }
      fromMonth = addMonths(toMonth, -12);
      break;
    }
    case 'custom': {
      const errors: InputError[] = [];
      if (!input.customFrom || !isMonth(input.customFrom)) errors.push('custom-from');
      if (!input.customTo || !isMonth(input.customTo)) errors.push('custom-to');
      if (errors.length > 0 || !input.customFrom || !input.customTo) return errors;
      if (monthDiff(input.customFrom, input.customTo) < 1) return ['custom-order'];
      if (!series.has(input.customTo)) return monthDiff(series.last, input.customTo) > 0 ? ['not-published'] : ['before-data'];
      fromMonth = input.customFrom;
      toMonth = input.customTo;
      break;
    }
  }
  const from = series.get(fromMonth);
  const to = series.get(toMonth);
  if (!from || !to) return ['before-data'];
  const rebased = [from, to].filter((p) => p.source === 'inegi-csv').map((p) => p.key);
  if (rebased.length > 0) notes.push({ code: 'rebased', months: rebased });
  for (const p of [from, to]) {
    if (p.correction) notes.push({ code: 'corrected', month: p.key, note: p.correction.note, date: p.correction.date });
  }
  return { from, to, months: monthDiff(fromMonth, toMonth), provisional, notes };
}

function resolveUdis(input: UpdateInput, series: UdisSeries | null): Resolved | InputError[] {
  if (!series) return ['before-data'];
  const notes: Note[] = [];
  const from = series.get(input.startDate);
  if (!from) return compareDates(input.startDate, series.first) < 0 ? ['before-data'] : ['not-published'];
  let toDate = input.increaseDate;
  let provisional = false;
  if (compareDates(toDate, series.last) > 0) {
    provisional = true;
    notes.push({ code: 'provisional-udis', wanted: toDate, used: series.last });
    toDate = series.last;
  }
  const to = series.get(toDate);
  if (!to) return ['before-data'];
  return { from, to, provisional, notes };
}

function proposalOf(input: UpdateInput, amount: Rational, updated: Money): ProposalResult | InputError | null {
  const p = input.proposal;
  if (!p || p.value.trim() === '') return null;
  let newRent: Rational;
  let value: Rational | null;
  switch (p.kind) {
    case 'percent':
      value = parsePercent(p.value);
      if (!value) return 'proposal';
      newRent = amount.mul(Rational.ONE.add(value));
      break;
    case 'newRent':
      value = parseAmount(p.value);
      if (!value) return 'proposal';
      newRent = value;
      break;
    case 'increase':
      value = parseAmount(p.value);
      if (!value) return 'proposal';
      newRent = amount.add(value);
      break;
  }
  const rent = money(newRent);
  return {
    kind: p.kind,
    value,
    newRent: rent,
    increase: money(newRent.sub(amount)),
    rate: newRent.div(amount).sub(Rational.ONE),
    vsUpdate: money(newRent.sub(Rational.of(updated.centavos, 100n))),
  };
}

function verdict(flags: boolean[]): Verdict | undefined {
  if (flags.length === 0) return undefined;
  if (flags.every(Boolean)) return 'within';
  if (flags.every((f) => !f)) return 'exceeds';
  return 'depends';
}

function capCheck(
  input: UpdateInput,
  amount: Rational,
  updateRate: Rational,
  inflation: AnnualInflation[],
  pending: PendingInflation[],
  proposal: ProposalResult | undefined,
): CapResult {
  const span = wholeMonthsBetween(input.startDate, input.increaseDate);
  const frequency = span < 12 ? 'less-than-a-year' : span > 12 ? 'more-than-a-year' : 'ok';
  const status: CapStatus =
    input.location !== 'cdmx'
      ? 'other-state'
      : input.use !== 'housing'
        ? 'commercial'
        : compareDates(input.increaseDate, CAP_IN_FORCE) < 0
          ? 'before-reform'
          : 'applies';
  if (status !== 'applies') return { status, readings: [], pending: [], frequency };
  const readings: CapReading[] = inflation.map((inf) => {
    const capExact = amount.mul(Rational.ONE.add(inf.exact));
    const reading: CapReading = { inflation: inf, cap: money(capExact), capExact, updateWithin: updateRate.lte(inf.exact) };
    if (proposal) reading.proposalWithin = proposal.rate.lte(inf.exact);
    return reading;
  });
  const result: CapResult = { status, readings, pending, frequency };
  const pv = proposal ? verdict(readings.map((r) => r.proposalWithin === true)) : undefined;
  if (pv) result.proposalVerdict = pv;
  const uv = verdict(readings.map((r) => r.updateWithin));
  if (uv) result.updateVerdict = uv;
  return result;
}

export function calculate(input: UpdateInput, series: Series): UpdateResult | UpdateFailure {
  const errors: InputError[] = [];
  const amount = parseAmount(input.amount);
  if (!amount || amount.isZero() || amount.gt(MAX_AMOUNT)) errors.push('amount');
  if (!isDate(input.startDate)) errors.push('start');
  if (!isDate(input.increaseDate)) errors.push('increase');
  if (errors.length === 0 && compareDates(input.startDate, input.increaseDate) >= 0) errors.push('order');
  if (errors.length > 0 || !amount) return { ok: false, errors };

  const resolved = input.index === 'inpc' ? resolveInpc(input, series.inpc) : resolveUdis(input, series.udis);
  if (Array.isArray(resolved)) return { ok: false, errors: resolved };

  const factor = resolved.to.exact.div(resolved.from.exact);
  const rate = factor.sub(Rational.ONE);
  const updatedExact = amount.mul(factor);
  const current = money(amount);
  const updated = money(updatedExact);
  const increase = money(updatedExact.sub(amount));
  const notes = [...resolved.notes];
  if (factor.lt(Rational.ONE)) notes.push({ code: 'deflation' });

  const proposal = proposalOf(input, amount, updated);
  if (typeof proposal === 'string') return { ok: false, errors: [proposal] };

  const { readings, pending } = referenceInflation(series.inpc, input.increaseDate);
  const cap = capCheck(input, amount, rate, readings, pending, proposal ?? undefined);

  const result: UpdateResult = {
    ok: true,
    input,
    amount,
    index: input.index,
    from: resolved.from,
    to: resolved.to,
    factor,
    rate,
    current,
    updated,
    increase,
    provisional: resolved.provisional,
    notes,
    inflation: readings,
    pendingInflation: pending,
    cap,
  };
  if (resolved.months !== undefined) result.months = resolved.months;
  if (proposal) result.proposal = proposal;
  return result;
}
