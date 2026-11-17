import { describe, expect, it } from 'vitest';
import {
  anniversary,
  defaultState,
  initialLang,
  localToday,
  stateFromHash,
  toInput,
  withIncreaseDate,
  withStartDate,
} from '../src/app/state.ts';
import { STRINGS } from '../src/app/i18n.ts';

describe('app state', () => {
  it('defaults to an anniversary today, INPC, a home in Mexico City', () => {
    const s = defaultState('2026-11-17', 'es');
    expect([s.startDate, s.increaseDate, s.index, s.period, s.location, s.use, s.amount]).toEqual([
      '2025-11-17',
      '2026-11-17',
      'inpc',
      'published',
      'cdmx',
      'housing',
      '',
    ]);
    expect(defaultState('2028-02-29', 'en').startDate).toBe('2027-02-28');
  });

  it('reads the inputs from the link', () => {
    const s = stateFromHash('#m=12000&i=udis&a=2025-12-01&p=custom&f=2025-10&t=2026-10&e=other&u=commercial&pk=newRent&pv=13000', '2026-11-17', 'es');
    expect(s).toMatchObject({
      amount: '12000',
      index: 'udis',
      startDate: '2025-12-01',
      increaseDate: '2026-12-01',
      increaseEdited: false,
      period: 'custom',
      customFrom: '2025-10',
      customTo: '2026-10',
      location: 'other',
      use: 'commercial',
      proposalKind: 'newRent',
      proposalValue: '13000',
    });
    expect(stateFromHash('#a=2025-12-01&b=2026-12-15', '2026-11-17', 'en').increaseEdited).toBe(true);
    expect(stateFromHash('', '2026-11-17', 'es')).toEqual(defaultState('2026-11-17', 'es'));
  });

  it('keeps the increase date on the anniversary until the user edits it', () => {
    let s = defaultState('2026-11-17', 'es');
    s = withStartDate(s, '2025-03-01');
    expect(s.increaseDate).toBe('2026-03-01');
    s = withIncreaseDate(s, '2026-04-01');
    expect(s.increaseEdited).toBe(true);
    s = withStartDate(s, '2025-05-01');
    expect(s.increaseDate).toBe('2026-04-01');
    expect(anniversary(s)).toBe('2026-05-01');
    s = withIncreaseDate(s, '2026-05-01');
    expect(s.increaseEdited).toBe(false);
    s = withStartDate(s, 'nope');
    expect(anniversary(s)).toBeNull();
    expect(withIncreaseDate(s, '2026-01-01').increaseEdited).toBe(true);
  });

  it('builds the calculation input', () => {
    const s = { ...defaultState('2026-11-17', 'es'), amount: '9000', proposalValue: ' ', customFrom: '2025-01' };
    expect(toInput(s)).toEqual({
      amount: '9000',
      index: 'inpc',
      startDate: '2025-11-17',
      increaseDate: '2026-11-17',
      period: 'published',
      location: 'cdmx',
      use: 'housing',
    });
    expect(toInput({ ...s, period: 'custom', proposalValue: '5' })).toMatchObject({ customFrom: '2025-01', customTo: '', proposal: { kind: 'percent', value: '5' } });
  });

  it('language and today', () => {
    expect(initialLang('en')).toBe('en');
    expect(initialLang(null)).toBe('es');
    expect(initialLang('fr')).toBe('es');
    expect(localToday(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-07');
  });
});

describe('strings', () => {
  it('Spanish and English have the same keys and no em dash', () => {
    const dash = String.fromCodePoint(0x2014);
    const keys = (o: object): string[] => Object.keys(o).sort();
    expect(keys(STRINGS.en)).toEqual(keys(STRINGS.es));
    const all = JSON.stringify(STRINGS, (_k, v: unknown) => (typeof v === 'function' ? String(v) : v));
    expect(all).not.toContain(dash);
  });

  it('carries the legal disclaimer in both languages', () => {
    expect(STRINGS.es.legalNote).toContain('No constituye opinión legal; valida con un abogado o la autoridad competente.');
    expect(STRINGS.en.legalNote).toContain('not a legal opinion');
  });
});
