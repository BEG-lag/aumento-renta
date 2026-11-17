/**
 * Builds and refreshes the bundled index data from official sources that need
 * no account or token:
 *
 *   data/inpc.json  INPC (INEGI), base 2nd half of July 2018 = 100, monthly.
 *                   2003-01 to 2024-07 from INEGI's open-data file; from
 *                   2018-08 on, every month is read from its DOF publication
 *                   (via the SIDOF API) and the overlap is cross-checked.
 *   data/udis.json  UDI value per calendar day from SIDOF (indicator 159),
 *                   cross-checked against Banco de México's DOF notes.
 *
 *   node scripts/update-data.ts             incremental update (CI)
 *   node scripts/update-data.ts --backfill  rebuild everything (caches in .cache/)
 *   TODAY=2026-11-17 node scripts/update-data.ts   pin "today" (Mexico City)
 *
 * Files are rewritten only when a value changes, so a scheduled run that finds
 * nothing new leaves the working tree clean. Any inconsistency (a DOF value
 * that disagrees with INEGI's file, a printed monthly variation that does not
 * match the values, a UDI value that changed after publication) stops the
 * script with exit code 1 and writes nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, addMonths, compareDates, dayNumber, fromDmy, monthOf, parseDate } from '../src/core/dates.ts';
import { Rational } from '../src/core/rational.ts';
import { htmlToText, isCorrectionTitle, parseInpcMonthly, parseUdiTable, type InpcMonthly } from '../src/data/dof.ts';
import type { DofRef, InpcData, InpcMonth, SourceInfo, UdiPublication, UdisData } from '../src/data/types.ts';
import { enableCache, indicatorRange, noteHtml, notesOn, requestCount, UDIS_INDICATOR, type SidofNoteRow } from './lib/sidof.ts';

const ROOT = resolve(import.meta.dirname, '..');
const INPC_FILE = resolve(ROOT, 'data/inpc.json');
const UDIS_FILE = resolve(ROOT, 'data/udis.json');
const CACHE = resolve(ROOT, '.cache');

export const INEGI_CSV_URL = 'https://www.inegi.org.mx/contenidos/programas/inpc/2018/datosabiertos/inpc_indicador_mensual_csv.zip';
const INEGI_CSV_PATH = 'conjunto_de_datos/conjunto_de_datos_inpc_mensual.csv';
const INEGI_CONCEPT = 'Índice nacional de precios al consumidor (mensual), Resumen, Subíndices subyacente y complementarios, Precios al Consumidor (INPC)';
/** First month published in the DOF on the 2018 base (announced 10 Sep 2018). */
const FIRST_DOF_MONTH = '2018-08';
const FIRST_UDI_PUBLICATION_MONTH = '2018-01';
const UDIS_START = '1995-04-04';

const BACKFILL = process.argv.includes('--backfill');
const TODAY = process.env.TODAY ?? mexicoCityToday();

function mexicoCityToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

const problems: string[] = [];
function problem(message: string): void {
  problems.push(message);
  console.error(`  PROBLEM ${message}`);
}

function log(message: string): void {
  console.log(message);
}

// ---------------------------------------------------------------- sources

function inpcSources(consulted: string): SourceInfo[] {
  return [
    {
      id: 'dof',
      name: 'Diario Oficial de la Federación, publicación mensual del INPC por el INEGI (vía la API pública del SIDOF)',
      url: 'https://sidof.segob.gob.mx/dof/sidof/notas/',
      note: 'Valor de cada mes desde agosto de 2018, con la nota del DOF que lo publicó (CFF art. 20: dentro de los primeros diez días del mes siguiente).',
      consulted,
    },
    {
      id: 'inegi-csv',
      name: 'INEGI, datos abiertos del INPC mensual (conjunto_de_datos_inpc_mensual.csv)',
      url: INEGI_CSV_URL,
      note: 'Serie reexpresada en base 2a. quincena de julio de 2018 = 100, de enero de 2003 a julio de 2024. Se usa para los meses anteriores a agosto de 2018 y para verificar los publicados en el DOF.',
      consulted,
    },
  ];
}

function udisSources(consulted: string): SourceInfo[] {
  return [
    {
      id: 'sidof',
      name: 'SIDOF (Secretaría de Gobernación), indicador 159: UDIS',
      url: 'https://sidof.segob.gob.mx/dof/sidof/indicadores/159/',
      note: 'Valor diario de la UDI desde el 4 de abril de 1995, tal como lo publica el Banco de México en el DOF.',
      consulted,
    },
    {
      id: 'dof',
      name: 'Diario Oficial de la Federación, "Valor de la unidad de inversión" (Banco de México)',
      url: 'https://sidof.segob.gob.mx/dof/sidof/notas/',
      note: 'Notas del DOF de cada periodo desde 2018; cada valor de SIDOF se verificó contra la tabla de su nota.',
      consulted,
    },
  ];
}

// ---------------------------------------------------------------- files

function readJson(file: string): unknown {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown) : null;
}

export function serializeInpc(data: InpcData): string {
  const head = JSON.stringify({ ...data, months: [] }, null, 2).replace(/\n {2}"months": \[\]\n\}$/, '');
  const months = data.months.map((m) => `    ${JSON.stringify(m)}`).join(',\n');
  return `${head}\n  "months": [\n${months}\n  ]\n}\n`;
}

export function serializeUdis(data: UdisData): string {
  const head = JSON.stringify({ ...data, values: [], publications: [] }, null, 2).replace(
    /\n {2}"values": \[\],\n {2}"publications": \[\]\n\}$/,
    '',
  );
  // One line per calendar month of values, so each refresh appends to the last line.
  const lines: string[] = [];
  let current: string[] = [];
  let currentMonth = monthOf(data.start);
  data.values.forEach((v, i) => {
    const month = monthOf(addDays(data.start, i));
    if (month !== currentMonth && current.length > 0) {
      lines.push(current.join(', '));
      current = [];
    }
    currentMonth = month;
    current.push(JSON.stringify(v));
  });
  if (current.length > 0) lines.push(current.join(', '));
  const values = lines.map((l) => `    ${l}`).join(',\n');
  const pubs = data.publications.map((p) => `    ${JSON.stringify(p)}`).join(',\n');
  return `${head}\n  "values": [\n${values}\n  ],\n  "publications": [\n${pubs}\n  ]\n}\n`;
}

function write(file: string, text: string): boolean {
  const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (old === text) return false;
  writeFileSync(file, text);
  return true;
}

// ---------------------------------------------------------------- INEGI CSV

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function inegiCsv(): Promise<Map<string, string>> {
  mkdirSync(resolve(CACHE, 'inegi'), { recursive: true });
  const zip = resolve(CACHE, 'inegi/inpc_indicador_mensual_csv.zip');
  if (!existsSync(zip)) {
    log(`download ${INEGI_CSV_URL}`);
    const res = await fetch(INEGI_CSV_URL, { headers: { 'User-Agent': 'aumento-renta/0.1 (+https://github.com/BEG-lag/aumento-renta)' } });
    if (!res.ok) throw new Error(`INEGI CSV: HTTP ${res.status}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  const csv = execFileSync('unzip', ['-p', zip, INEGI_CSV_PATH], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replace(/^\uFEFF/, '');
  const [header, ...rows] = csv.split(/\r?\n/).filter(Boolean);
  const cols = parseCsvLine(header ?? '');
  const iFecha = cols.indexOf('FECHA');
  const iConcepto = cols.indexOf('CONCEPTO');
  const iValor = cols.indexOf('VALOR');
  const iUnidad = cols.indexOf('UNIDAD_MEDIDA');
  const out = new Map<string, string>();
  for (const row of rows) {
    const c = parseCsvLine(row);
    if (c[iConcepto] !== INEGI_CONCEPT) continue;
    if (c[iUnidad] !== 'Índice') throw new Error(`INEGI CSV: unexpected unit ${c[iUnidad] ?? ''}`);
    const month = (c[iFecha] ?? '').slice(0, 7);
    out.set(month, c[iValor] ?? '');
  }
  return new Map([...out.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
}

// ---------------------------------------------------------------- INPC from the DOF

function isInegi(n: SidofNoteRow): boolean {
  return /ESTAD[IÍ]STICA Y GEOGRAF/i.test(n.codOrgaDos ?? '');
}

function isInpcTitle(title: string): boolean {
  return /precios al consumidor/i.test(title);
}

/** Order in which days of the following month are tried: the 10th first (CFF art. 20). */
const INPC_DAYS = [10, 9, 11, 8, 12, 7, 13, 6, 14, 15];

interface DofInpc extends InpcMonthly {
  dof: DofRef;
}

async function findInpcPublication(month: string): Promise<DofInpc | null> {
  const next = addMonths(month, 1);
  for (const day of INPC_DAYS) {
    const date = `${next}-${String(day).padStart(2, '0')}`;
    if (date > TODAY) continue;
    const notes = (await notesOn(date, TODAY)).filter((n) => isInegi(n) && isInpcTitle(n.titulo ?? '') && !isCorrectionTitle(n.titulo ?? ''));
    for (const n of notes) {
      const { html } = await noteHtml(n.codNota);
      const parsed = parseInpcMonthly(htmlToText(html));
      if (parsed?.month === month) return { ...parsed, dof: { date, note: n.codNota } };
    }
  }
  return null;
}

/** Looks for an INEGI "Nota aclaratoria" to a month in the 30 days after its publication. */
async function findInpcCorrection(month: string, after: string): Promise<DofInpc | null> {
  for (let i = 1; i <= 30; i++) {
    const date = addDays(after, i);
    if (date > TODAY) break;
    const notes = (await notesOn(date, TODAY)).filter((n) => isInegi(n) && isInpcTitle(n.titulo ?? '') && isCorrectionTitle(n.titulo ?? ''));
    for (const n of notes) {
      const { html } = await noteHtml(n.codNota);
      const parsed = parseInpcMonthly(htmlToText(html));
      if (parsed?.month === month) return { ...parsed, dof: { date, note: n.codNota } };
    }
  }
  return null;
}

/** The monthly variation INEGI prints, recomputed from the two values (2 decimals, half away from zero). */
function variationOk(p: InpcMonthly): boolean {
  if (p.variation === undefined || p.previous === undefined) return true;
  const computed = Rational.parse(p.value).div(Rational.parse(p.previous.value)).sub(Rational.ONE).mul(Rational.of(100)).toFixed(2);
  return computed === Rational.parse(p.variation).toFixed(2);
}

function sameAt3(a: string, b: string): boolean {
  return Rational.parse(a).toFixed(3) === Rational.parse(b).toFixed(3);
}

async function dofMonth(month: string, known: Map<string, string>): Promise<InpcMonth | null> {
  const pub = await findInpcPublication(month);
  if (!pub) return null;
  let entry: InpcMonth = { month, value: pub.value, source: 'dof', dof: pub.dof };
  const prevKnown = pub.previous ? known.get(pub.previous.month) : undefined;
  const prevMismatch = pub.previous !== undefined && prevKnown !== undefined && !sameAt3(prevKnown, pub.previous.value);
  if (prevMismatch) {
    problem(`${month}: DOF ${pub.dof.date} says the previous month was ${pub.previous?.value ?? ''}, the data has ${prevKnown}`);
  }
  if (!variationOk(pub)) {
    log(`  ${month}: DOF ${pub.dof.date} note ${pub.dof.note} is inconsistent (value ${pub.value}, variation ${pub.variation ?? '?'}); looking for a correction`);
    const fix = await findInpcCorrection(month, pub.dof.date);
    if (fix && variationOk(fix)) {
      log(`  ${month}: corrected by DOF ${fix.dof.date} note ${fix.dof.note}: ${pub.value} -> ${fix.value}`);
      entry = { month, value: fix.value, source: 'dof', dof: pub.dof, correction: fix.dof };
    } else {
      problem(`${month}: DOF value ${pub.value} fails the variation check and no correction was found`);
    }
  }
  return entry;
}

// ---------------------------------------------------------------- UDIS

/**
 * SIDOF occasionally returns two records for one day under indicator 159
 * (seen for 5 days between 2006 and 2012, the extra one being another
 * indicator's value). Those days are settled with the Banco de México DOF note
 * that published the period.
 */
async function sidofUdis(from: string, to: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const conflicts = new Map<string, Set<string>>();
  let start = from;
  while (compareDates(start, to) <= 0) {
    const year = start.slice(0, 4);
    const chunkEnd = `${year}-12-31` < to ? `${year}-12-31` : to;
    const rows = await indicatorRange(UDIS_INDICATOR, start, chunkEnd, TODAY);
    for (const raw of rows) {
      const r = { fecha: raw.fecha, valor: normalizeUdi(raw.valor) };
      const date = fromDmy(r.fecha);
      if (!date) throw new Error(`SIDOF UDIS: bad date ${r.fecha}`);
      const prev = out.get(date);
      if (prev !== undefined && prev !== r.valor) {
        const set = conflicts.get(date) ?? new Set([prev]);
        set.add(r.valor);
        conflicts.set(date, set);
        continue;
      }
      out.set(date, r.valor);
    }
    start = addDays(chunkEnd, 1);
  }
  // Days SIDOF skipped (2004-07-25 at least) are read from the DOF note.
  const dates = [...out.keys()].sort();
  const lastDate = dates[dates.length - 1];
  if (lastDate !== undefined) {
    for (let date = from; compareDates(date, lastDate) < 0; date = addDays(date, 1)) {
      if (out.has(date) || compareDates(date, UDIS_START) < 0) continue;
      const official = await udiFromDof(date);
      if (official === null) problem(`UDIS ${date}: missing from SIDOF and from the DOF`);
      else {
        log(`  UDIS ${date}: missing from SIDOF; the DOF note says ${official}`);
        out.set(date, official);
      }
    }
  }
  for (const [date, values] of conflicts) {
    const official = await udiFromDof(date);
    if (official !== null && values.has(official)) {
      log(`  UDIS ${date}: SIDOF returned ${[...values].join(' and ')}; the DOF note says ${official}`);
      out.set(date, official);
    } else {
      problem(`UDIS ${date}: SIDOF returned ${[...values].join(' and ')} and the DOF note could not settle it (${official ?? 'not found'})`);
    }
  }
  return out;
}

/**
 * SIDOF values sometimes carry stray spaces or drop trailing zeros (the
 * first UDI, 1995-04-04, is "1"). Values are stored with 6 decimals, as the
 * DOF prints them.
 */
function normalizeUdi(value: string): string {
  const v = value.trim();
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(v);
  // SIDOF drops trailing zeros ("1.00384"); padding them back is exact.
  return m ? `${m[1] ?? ''}.${(m[2] ?? '').padEnd(6, '0')}` : v;
}

/** Banco de México publishes on the 10th (days 11 to 25) and the 25th (days 26 to 10). */
function udiPublicationTarget(date: string): string {
  const day = Number(date.slice(8, 10));
  if (day >= 11 && day <= 25) return `${date.slice(0, 7)}-10`;
  if (day >= 26) return `${date.slice(0, 7)}-25`;
  return `${addMonths(date.slice(0, 7), -1)}-25`;
}

async function udiFromDof(date: string): Promise<string | null> {
  const target = udiPublicationTarget(date);
  for (const offset of [0, -1, -2, -3, 1, -4, -5]) {
    const day = addDays(target, offset);
    const notes = (await notesOn(day, TODAY)).filter((n) => isBanxico(n) && /unidad de inversi/i.test(n.titulo ?? ''));
    for (const n of notes) {
      const { html } = await noteHtml(n.codNota);
      const row = parseUdiTable(htmlToText(html)).find((r) => r.date === date);
      if (row) return row.value;
    }
  }
  return null;
}

/**
 * UDI values move a few hundredths of a percent per day (0.33% at the peak of
 * the 1995 crisis); flag any jump above 1% as a likely data error.
 */
function checkSmooth(values: string[], start: string): void {
  for (let i = 1; i < values.length; i++) {
    const a = Rational.parse(values[i - 1] ?? '0');
    const b = Rational.parse(values[i] ?? '0');
    const change = b.div(a).sub(Rational.ONE);
    if (change.gt(Rational.parse('0.01')) || change.lt(Rational.parse('-0.01'))) {
      problem(`UDIS ${addDays(start, i)}: jump of ${change.mul(Rational.of(100)).toFixed(3)}% from the previous day`);
    }
  }
}

function isBanxico(n: SidofNoteRow): boolean {
  return /BANCO DE M[EÉ]XICO/i.test(n.codOrgaDos ?? '');
}

async function udiPublicationsOn(date: string, values: Map<string, string>): Promise<UdiPublication[]> {
  const notes = (await notesOn(date, TODAY)).filter((n) => isBanxico(n) && /unidad de inversi/i.test(n.titulo ?? ''));
  const out: UdiPublication[] = [];
  for (const n of notes) {
    const { html } = await noteHtml(n.codNota);
    const rows = parseUdiTable(htmlToText(html));
    if (rows.length === 0) {
      problem(`UDI note ${n.codNota} (${date}) has no table`);
      continue;
    }
    for (const r of rows) {
      const v = values.get(r.date);
      if (v === undefined) problem(`UDI ${r.date} in DOF note ${n.codNota} is missing from SIDOF`);
      else if (v !== r.value) problem(`UDI ${r.date}: SIDOF ${v} vs DOF note ${n.codNota} ${r.value}`);
    }
    const dates = rows.map((r) => r.date).sort();
    out.push({ from: dates[0] ?? date, to: dates[dates.length - 1] ?? date, date, note: n.codNota });
  }
  return out;
}

function contiguous(values: Map<string, string>, start: string): { values: string[]; end: string } {
  const out: string[] = [];
  let date = start;
  for (;;) {
    const v = values.get(date);
    if (v === undefined) break;
    out.push(v);
    date = addDays(date, 1);
  }
  return { values: out, end: addDays(date, -1) };
}

// ---------------------------------------------------------------- main

async function backfill(): Promise<void> {
  enableCache();
  log(`backfill (today ${TODAY})`);

  // INPC
  const csv = await inegiCsv();
  log(`INEGI CSV: ${csv.size} months, ${[...csv.keys()][0] ?? ''} to ${[...csv.keys()].at(-1) ?? ''}`);
  const known = new Map(csv);
  const months: InpcMonth[] = [...csv.entries()]
    .filter(([m]) => m < FIRST_DOF_MONTH)
    .map(([month, value]) => ({ month, value, source: 'inegi-csv' }));
  let checked = 0;
  for (let month = FIRST_DOF_MONTH; ; month = addMonths(month, 1)) {
    if (`${addMonths(month, 1)}-06` > TODAY) break;
    const entry = await dofMonth(month, known);
    if (!entry) {
      log(`  ${month}: not published yet`);
      break;
    }
    const fromCsv = csv.get(month);
    if (fromCsv !== undefined) {
      checked++;
      if (Rational.parse(fromCsv).cmp(Rational.parse(entry.value)) !== 0) problem(`${month}: DOF ${entry.value} vs INEGI CSV ${fromCsv}`);
    }
    known.set(month, entry.value);
    months.push(entry);
    log(`  ${month} ${entry.value} DOF ${entry.dof?.date ?? ''}${entry.correction ? ` (corrected ${entry.correction.date})` : ''}`);
  }
  log(`INPC: ${months.length} months; ${checked} DOF values cross-checked against the INEGI CSV`);
  const inpc: InpcData = {
    schema: 1,
    series: 'Índice Nacional de Precios al Consumidor (INPC), general, mensual',
    base: 'Segunda quincena de julio de 2018 = 100',
    updated: TODAY,
    sources: inpcSources(TODAY),
    months,
  };

  // UDIS
  const until = addDays(TODAY, 45);
  const values = await sidofUdis(UDIS_START, until);
  const { values: series, end } = contiguous(values, UDIS_START);
  if (values.size !== series.length) problem(`UDIS: ${values.size - series.length} values after a gap (series ends ${end})`);
  checkSmooth(series, UDIS_START);
  log(`UDIS: ${series.length} daily values, ${UDIS_START} to ${end}`);
  const publications: UdiPublication[] = [];
  const seen = new Set<number>();
  for (let month = FIRST_UDI_PUBLICATION_MONTH; `${month}-01` <= TODAY; month = addMonths(month, 1)) {
    for (const target of [10, 25]) {
      const base = `${month}-${String(target).padStart(2, '0')}`;
      for (const offset of [0, -1, -2, -3, 1, -4]) {
        const date = addDays(base, offset);
        if (date > TODAY) continue;
        const pubs = (await udiPublicationsOn(date, values)).filter((p) => !seen.has(p.note));
        if (pubs.length > 0) {
          for (const p of pubs) {
            seen.add(p.note);
            publications.push(p);
          }
          break;
        }
      }
    }
  }
  publications.sort((a, b) => compareDates(a.from, b.from));
  checkPublicationCoverage(publications);
  log(`UDIS: ${publications.length} DOF publications since ${FIRST_UDI_PUBLICATION_MONTH}`);
  const udis: UdisData = {
    schema: 1,
    series: 'Valor de la Unidad de Inversión (UDI) en pesos, diario',
    updated: TODAY,
    sources: udisSources(TODAY),
    start: UDIS_START,
    end,
    values: series,
    publications,
  };

  finish(inpc, udis);
}

function checkPublicationCoverage(pubs: UdiPublication[]): void {
  for (let i = 1; i < pubs.length; i++) {
    const prev = pubs[i - 1];
    const cur = pubs[i];
    if (prev && cur && addDays(prev.to, 1) !== cur.from) problem(`UDI publications: gap or overlap between ${prev.to} and ${cur.from}`);
  }
}

async function incremental(): Promise<void> {
  log(`update (today ${TODAY})`);
  const oldInpc = readJson(INPC_FILE) as InpcData | null;
  const oldUdis = readJson(UDIS_FILE) as UdisData | null;
  if (!oldInpc || !oldUdis) throw new Error('data files missing: run with --backfill first');

  // INPC: add every month published since the last one.
  const known = new Map(oldInpc.months.map((m) => [m.month, m.value]));
  const months = [...oldInpc.months];
  let changed = false;
  for (let month = addMonths(months.at(-1)?.month ?? FIRST_DOF_MONTH, 1); `${addMonths(month, 1)}-06` <= TODAY; month = addMonths(month, 1)) {
    const entry = await dofMonth(month, known);
    if (!entry) {
      log(`INPC ${month}: not published yet`);
      break;
    }
    log(`INPC ${month}: ${entry.value} (DOF ${entry.dof?.date ?? ''}, note ${entry.dof?.note ?? ''})`);
    months.push(entry);
    known.set(month, entry.value);
    changed = true;
  }
  const inpc: InpcData = changed ? { ...oldInpc, updated: TODAY, sources: inpcSources(TODAY), months } : oldInpc;

  // UDIS: re-read the last 45 days (they must not change) and append what is new.
  const from = addDays(oldUdis.end, -45);
  const fetched = await sidofUdis(from, addDays(TODAY, 60));
  const startIndex = dayNumber(from) - dayNumber(oldUdis.start);
  oldUdis.values.slice(startIndex).forEach((v, i) => {
    const date = addDays(from, i);
    const now = fetched.get(date);
    if (now !== undefined && now !== v) problem(`UDI ${date} changed after publication: ${v} -> ${now}`);
  });
  const all = new Map(oldUdis.values.map((v, i) => [addDays(oldUdis.start, i), v]));
  for (const [date, v] of fetched) if (!all.has(date)) all.set(date, v);
  const { values, end } = contiguous(all, oldUdis.start);
  checkSmooth(values.slice(startIndex), from);
  const publications = [...oldUdis.publications];
  const lastPub = publications.at(-1)?.date ?? addDays(TODAY, -20);
  const seen = new Set(publications.map((p) => p.note));
  for (let date = addDays(lastPub, 1); date <= TODAY; date = addDays(date, 1)) {
    for (const p of await udiPublicationsOn(date, all)) {
      if (seen.has(p.note)) continue;
      seen.add(p.note);
      publications.push(p);
      log(`UDIS: DOF ${p.date} note ${p.note}, ${p.from} to ${p.to}`);
    }
  }
  publications.sort((a, b) => compareDates(a.from, b.from));
  checkPublicationCoverage(publications);
  const udisChanged = end !== oldUdis.end || publications.length !== oldUdis.publications.length;
  if (end !== oldUdis.end) log(`UDIS: ${oldUdis.end} -> ${end}`);
  const udis: UdisData = udisChanged ? { ...oldUdis, updated: TODAY, sources: udisSources(TODAY), end, values, publications } : oldUdis;

  finish(inpc, udis);
}

function finish(inpc: InpcData, udis: UdisData): void {
  log(`${requestCount()} SIDOF requests`);
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s); nothing was written.`);
    process.exit(1);
  }
  const a = write(INPC_FILE, serializeInpc(inpc));
  const b = write(UDIS_FILE, serializeUdis(udis));
  log(a || b ? `written: ${[a ? 'data/inpc.json' : '', b ? 'data/udis.json' : ''].filter(Boolean).join(', ')}` : 'no changes');
}

if (!parseDate(TODAY)) throw new Error(`TODAY must be YYYY-MM-DD, got ${TODAY}`);
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await (BACKFILL ? backfill() : incremental());
