/**
 * Shareable link: the inputs travel in the URL fragment (after #), which the
 * browser never sends to any server. Only numbers, dates and option codes are
 * included: no names, no addresses, no free text.
 */
import type { IndexKind, Location, PeriodMode, PropertyUse, ProposalKind, UpdateInput } from './calculate.ts';
import { isDate, isMonth } from './dates.ts';

const INDEX: readonly IndexKind[] = ['inpc', 'udis'];
const PERIOD: readonly PeriodMode[] = ['published', 'cff', 'calendar', 'custom'];
const PROPOSAL: readonly ProposalKind[] = ['percent', 'newRent', 'increase'];
const LOCATION: readonly Location[] = ['cdmx', 'other'];
const USE: readonly PropertyUse[] = ['housing', 'commercial'];

const NUMBER_RE = /^-?\d{1,12}(\.\d{1,6})?$/;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => a === value);
}

/** Encodes the inputs as "m=12000&i=inpc&a=2025-12-01...". */
export function encodeState(input: UpdateInput): string {
  const p = new URLSearchParams();
  const amount = input.amount.replace(/[$,\s]/g, '');
  if (NUMBER_RE.test(amount)) p.set('m', amount);
  p.set('i', input.index);
  if (isDate(input.startDate)) p.set('a', input.startDate);
  if (isDate(input.increaseDate)) p.set('b', input.increaseDate);
  p.set('p', input.period);
  if (input.period === 'custom') {
    if (input.customFrom && isMonth(input.customFrom)) p.set('f', input.customFrom);
    if (input.customTo && isMonth(input.customTo)) p.set('t', input.customTo);
  }
  p.set('e', input.location);
  if (input.location === 'cdmx') p.set('u', input.use);
  const value = input.proposal?.value.replace(/[$,%\s]/g, '') ?? '';
  if (input.proposal && NUMBER_RE.test(value)) {
    p.set('pk', input.proposal.kind);
    p.set('pv', value);
  }
  return p.toString();
}

/** Decodes a fragment (with or without the leading #). Invalid values are dropped. */
export function decodeState(fragment: string): Partial<UpdateInput> {
  const p = new URLSearchParams(fragment.replace(/^#/, ''));
  const out: Partial<UpdateInput> = {};
  const m = p.get('m');
  if (m !== null && NUMBER_RE.test(m)) out.amount = m;
  const i = pick(p.get('i'), INDEX);
  if (i) out.index = i;
  const a = p.get('a');
  if (a !== null && isDate(a)) out.startDate = a;
  const b = p.get('b');
  if (b !== null && isDate(b)) out.increaseDate = b;
  const period = pick(p.get('p'), PERIOD);
  if (period) out.period = period;
  const f = p.get('f');
  if (f !== null && isMonth(f)) out.customFrom = f;
  const t = p.get('t');
  if (t !== null && isMonth(t)) out.customTo = t;
  const e = pick(p.get('e'), LOCATION);
  if (e) out.location = e;
  const u = pick(p.get('u'), USE);
  if (u) out.use = u;
  const pk = pick(p.get('pk'), PROPOSAL);
  const pv = p.get('pv');
  if (pk && pv !== null && NUMBER_RE.test(pv)) out.proposal = { kind: pk, value: pv };
  return out;
}
