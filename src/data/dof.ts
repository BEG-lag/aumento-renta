/**
 * Parsers for the two DOF notes the app reads:
 *
 * - INEGI, "Índice nacional de precios al consumidor." (around the 10th of
 *   each month): "Con base en la segunda quincena de julio de 2018=100 el
 *   Índice Nacional de Precios al Consumidor del mes de octubre de 2026 es
 *   147.026. Esta cifra representa una variación de 0.65 por ciento respecto
 *   del índice correspondiente al mes de septiembre de 2026, que fue de 146.075."
 * - Banco de México, "Valor de la unidad de inversión." (around the 10th and
 *   the 25th): a table of "11-noviembre-2026 8.899987" rows.
 *
 * Both arrive from SIDOF as a full HTML document (`cadenaContenido`). The
 * parsers work on plain text and are tested against real notes in
 * test/fixtures. Pure functions only: the network lives in scripts/.
 */
import { formatDate, formatMonth, isDate } from '../core/dates.ts';

const MONTHS_ES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  ordm: 'º',
  ordf: 'ª',
  deg: '°',
  laquo: '«',
  raquo: '»',
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
  ndash: '-',
  hellip: '...',
};

/** Strips tags, styles and scripts, decodes entities and collapses whitespace. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

function monthNumber(name: string): number | undefined {
  return MONTHS_ES[name.toLowerCase()];
}

export interface InpcMonthly {
  /** "YYYY-MM" */
  month: string;
  value: string;
  /** Monthly variation as printed, in percent ("0.65"). */
  variation?: string;
  previous?: { month: string; value: string };
}

const MONTHLY_RE =
  /segunda quincena de julio de 2018\s*=\s*100,?\s+el [ÍI]ndice Nacional de Precios al Consumidor del mes de ([a-záéíóú]+)\s+de\s+(\d{4})\s*,?\s+es(?:\s+de)?\s+(\d{2,3}\.\d{3})/i;
const VARIATION_RE =
  /variaci[óo]n de\s+(-?\d+\.\d+)\s+por ciento respecto del [íi]ndice correspondiente al mes de ([a-záéíóú]+)\s+de\s+(\d{4})\s*,?\s+que fue de\s+(\d{2,3}\.\d{3})/i;

/**
 * Reads the monthly INPC from the plain text of an INEGI DOF note. For a
 * "Nota aclaratoria" it reads the last statement after "Debe decir".
 * Returns null when the note has no monthly figure (for example, the
 * biweekly-only notes published around the 24th).
 */
export function parseInpcMonthly(text: string): InpcMonthly | null {
  const corrected = text.split(/Debe decir\s*:?/i);
  const body = corrected[corrected.length - 1] ?? text;
  // A correction may print the wrong text ("Dice") and the right one ("Debe
  // decir") one after the other: the last statement is the one that counts.
  const all = [...body.matchAll(new RegExp(MONTHLY_RE.source, 'gi'))];
  const m = all[all.length - 1];
  if (!m) return null;
  const month = monthNumber(m[1] ?? '');
  if (month === undefined) return null;
  const result: InpcMonthly = { month: formatMonth(Number(m[2]), month), value: m[3] ?? '' };
  const rest = body.slice(m.index + m[0].length);
  const v = VARIATION_RE.exec(rest);
  if (v && v.index < 400) {
    const prevMonth = monthNumber(v[2] ?? '');
    result.variation = v[1] ?? '';
    if (prevMonth !== undefined) result.previous = { month: formatMonth(Number(v[3]), prevMonth), value: v[4] ?? '' };
  }
  return result;
}

/** True for INEGI notes that correct an earlier INPC publication. */
export function isCorrectionTitle(title: string): boolean {
  return /aclarat|aclaraci|fe de erratas/i.test(title);
}

export interface UdiRow {
  date: string;
  value: string;
}

/**
 * A row is a date and a value with 6 decimals. Banco de México has printed
 * the dates as "11-noviembre-2026", "12- noviembre-2009", "11-julio-20",
 * "11 de agosto de 2022" and "26/02/2020", and a few notes split the value
 * across text runs ("6.4 51423"), so single spaces inside the decimals are
 * tolerated and removed. Callers cross-check every row against the SIDOF
 * value of the same day.
 */
const VALUE = String.raw`(\d{1,2}\.(?:\s?\d){6})(?!\d)`;
const NAMED_ROW_RE = new RegExp(String.raw`\b(\d{1,2})\s*(?:-|\s+de\s+)\s*([a-záéíóú]+)\s*(?:-|\s+de\s+)\s*(\d{4}|\d{2})\s+` + VALUE, 'gi');
const NUMERIC_ROW_RE = new RegExp(String.raw`\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s+` + VALUE, 'g');

function fullYear(text: string): number {
  const y = Number(text);
  return text.length === 4 ? y : y < 95 ? 2000 + y : 1900 + y;
}

/** Reads the daily table of a Banco de México "Valor de la unidad de inversión" note. */
export function parseUdiTable(text: string): UdiRow[] {
  const rows = new Map<string, string>();
  const add = (y: number, month: number | undefined, d: number, raw: string | undefined): void => {
    if (month === undefined) return;
    const date = formatDate({ y, m: month, d });
    if (isDate(date)) rows.set(date, (raw ?? '').replace(/\s/g, ''));
  };
  for (const m of text.matchAll(NAMED_ROW_RE)) add(fullYear(m[3] ?? ''), monthNumber(m[2] ?? ''), Number(m[1]), m[4]);
  for (const m of text.matchAll(NUMERIC_ROW_RE)) add(Number(m[3]), Number(m[2]), Number(m[1]), m[4]);
  return [...rows.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
}

/** Public DOF page of a note. Uses the bare domain (www. served a wrong certificate in testing). */
export function dofNoteUrl(note: number, date: string): string {
  const [y, m, d] = date.split('-');
  return `https://dof.gob.mx/nota_detalle.php?codigo=${note}&fecha=${d ?? ''}/${m ?? ''}/${y ?? ''}`;
}

/** SIDOF page of a note. */
export function sidofNoteUrl(note: number): string {
  return `https://sidof.segob.gob.mx/notas/${note}`;
}
