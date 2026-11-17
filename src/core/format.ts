/**
 * Display helpers shared by the app, the message and the README example.
 * Spanish (Mexico) and English. Numbers keep the Mexican convention in both
 * languages: comma for thousands, point for decimals.
 */
import { parseDate, parseMonth } from './dates.ts';
import { Rational } from './rational.ts';
import { dofNoteUrl } from '../data/dof.ts';
import type { IndexPoint } from './series.ts';

export type Lang = 'es' | 'en';

const MONTHS: Record<Lang, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

const MONTHS_SHORT: Record<Lang, string[]> = {
  es: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** "octubre de 2026" / "October 2026" */
export function monthName(month: string, lang: Lang): string {
  const p = parseMonth(month);
  if (!p) return month;
  const name = MONTHS[lang][p.m - 1] ?? '';
  return lang === 'es' ? `${name} de ${p.y}` : `${name} ${p.y}`;
}

/** "oct. 2026" / "Oct 2026" */
export function monthShort(month: string, lang: Lang): string {
  const p = parseMonth(month);
  if (!p) return month;
  return `${MONTHS_SHORT[lang][p.m - 1] ?? ''} ${p.y}`;
}

/** "1 de diciembre de 2026" / "December 1, 2026" */
export function dateLong(date: string, lang: Lang): string {
  const p = parseDate(date);
  if (!p) return date;
  const name = MONTHS[lang][p.m - 1] ?? '';
  return lang === 'es' ? `${p.d} de ${name} de ${p.y}` : `${name} ${p.d}, ${p.y}`;
}

/** "01/12/2026" (day first, as in Mexico) / "Dec 1, 2026" */
export function dateShort(date: string, lang: Lang): string {
  const p = parseDate(date);
  if (!p) return date;
  if (lang === 'en') return `${MONTHS_SHORT.en[p.m - 1] ?? ''} ${p.d}, ${p.y}`;
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`;
}

/** "3.69%" for 0.0369, half away from zero. */
export function percent(rate: Rational, digits = 2): string {
  return `${rate.mul(Rational.of(100)).toFixed(digits)}%`;
}

/** "+3.69%" / "-0.12%" */
export function signedPercent(rate: Rational, digits = 2): string {
  const text = percent(rate, digits);
  return rate.isNegative() || text.startsWith('-') ? text : `+${text}`;
}

/** Factor with 6 decimals: "1.030713". */
export function factorText(factor: Rational): string {
  return factor.toFixed(6);
}

/** Index value for display: up to 6 decimals (INEGI's re-based values carry 12). */
export function indexText(point: IndexPoint): string {
  const decimals = point.value.split('.')[1]?.length ?? 0;
  return decimals > 6 ? Rational.parse(point.value).toFixed(6) : point.value;
}

/** True when `indexText` shortened the published value. */
export function indexShortened(point: IndexPoint): boolean {
  return (point.value.split('.')[1]?.length ?? 0) > 6;
}

/** Label of an index point: the month for the INPC, the day for UDIS. */
export function pointLabel(point: IndexPoint, lang: Lang): string {
  return point.key.length === 7 ? monthName(point.key, lang) : dateLong(point.key, lang);
}

export const INEGI_CSV_PAGE = 'https://www.inegi.org.mx/programas/inpc/2018/#datos_abiertos';
export const SIDOF_UDIS = 'https://sidof.segob.gob.mx/dof/sidof/indicadores/159/';

/** The best public link for a value: its DOF note, else the official dataset. */
export function pointUrl(point: IndexPoint): string {
  if (point.correction) return dofNoteUrl(point.correction.note, point.correction.date);
  if (point.dof) return dofNoteUrl(point.dof.note, point.dof.date);
  if (point.source === 'inegi-csv') return INEGI_CSV_PAGE;
  const [y, m, d] = point.key.split('-');
  const dmy = `${d ?? ''}-${m ?? ''}-${y ?? ''}`;
  return `${SIDOF_UDIS}${dmy}/${dmy}`;
}
