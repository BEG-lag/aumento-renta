/**
 * Form state of the app. Pure functions only, so they can be tested without
 * a browser. The inputs live in the URL fragment (see core/share.ts); the
 * only thing kept in localStorage is the language.
 */
import type { IndexKind, Location, PeriodMode, PropertyUse, ProposalKind, UpdateInput } from '../core/calculate.ts';
import { addYears, isDate } from '../core/dates.ts';
import type { Lang } from '../core/format.ts';
import type { Role } from '../core/message.ts';
import { decodeState } from '../core/share.ts';

export interface AppState {
  lang: Lang;
  role: Role;
  amount: string;
  index: IndexKind;
  startDate: string;
  increaseDate: string;
  /** False while the increase date follows the anniversary automatically. */
  increaseEdited: boolean;
  period: PeriodMode;
  customFrom: string;
  customTo: string;
  location: Location;
  use: PropertyUse;
  proposalKind: ProposalKind;
  proposalValue: string;
}

export const LANG_KEY = 'aumento-renta:lang';

/** Defaults: an anniversary today, so the result is about a raise due now. */
export function defaultState(today: string, lang: Lang): AppState {
  const start = addYears(today, -1);
  return {
    lang,
    role: 'tenant',
    amount: '',
    index: 'inpc',
    startDate: start,
    increaseDate: addYears(start, 1),
    increaseEdited: false,
    period: 'published',
    customFrom: '',
    customTo: '',
    location: 'cdmx',
    use: 'housing',
    proposalKind: 'percent',
    proposalValue: '',
  };
}

/** Defaults overridden by whatever valid inputs the URL fragment carries. */
export function stateFromHash(hash: string, today: string, lang: Lang): AppState {
  const base = defaultState(today, lang);
  const d = decodeState(hash);
  const state: AppState = { ...base };
  if (d.amount !== undefined) state.amount = d.amount;
  if (d.index) state.index = d.index;
  if (d.startDate) {
    state.startDate = d.startDate;
    state.increaseDate = addYears(d.startDate, 1);
  }
  if (d.increaseDate) {
    state.increaseDate = d.increaseDate;
    state.increaseEdited = d.increaseDate !== addYears(state.startDate, 1);
  }
  if (d.period) state.period = d.period;
  if (d.customFrom) state.customFrom = d.customFrom;
  if (d.customTo) state.customTo = d.customTo;
  if (d.location) state.location = d.location;
  if (d.use) state.use = d.use;
  if (d.proposal) {
    state.proposalKind = d.proposal.kind;
    state.proposalValue = d.proposal.value;
  }
  return state;
}

/** New start date: the increase date follows it unless the user changed it. */
export function withStartDate(state: AppState, startDate: string): AppState {
  const next = { ...state, startDate };
  if (!state.increaseEdited && isDate(startDate)) next.increaseDate = addYears(startDate, 1);
  return next;
}

export function withIncreaseDate(state: AppState, increaseDate: string): AppState {
  const anniversary = isDate(state.startDate) ? addYears(state.startDate, 1) : '';
  return { ...state, increaseDate, increaseEdited: increaseDate !== anniversary };
}

export function anniversary(state: AppState): string | null {
  return isDate(state.startDate) ? addYears(state.startDate, 1) : null;
}

export function toInput(state: AppState): UpdateInput {
  const input: UpdateInput = {
    amount: state.amount,
    index: state.index,
    startDate: state.startDate,
    increaseDate: state.increaseDate,
    period: state.period,
    location: state.location,
    use: state.use,
  };
  if (state.period === 'custom') {
    input.customFrom = state.customFrom;
    input.customTo = state.customTo;
  }
  if (state.proposalValue.trim() !== '') input.proposal = { kind: state.proposalKind, value: state.proposalValue };
  return input;
}

/** Language: the saved choice, else Spanish. */
export function initialLang(saved: string | null): Lang {
  return saved === 'en' ? 'en' : 'es';
}

/** Today's civil date in the browser's time zone. */
export function localToday(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
