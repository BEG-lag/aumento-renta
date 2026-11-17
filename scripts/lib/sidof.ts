/**
 * A small, polite client for the public SIDOF API (Secretaría de Gobernación),
 * which serves the Diario Oficial de la Federación as JSON with no account or
 * token. Endpoints and quirks are documented in docs/fuentes.md.
 *
 * - Sends a descriptive User-Agent and `Accept: application/json, *\/*`
 *   (`application/json` alone returns HTTP 406).
 * - Waits at least 300 ms between requests, retries 429 and 5xx with
 *   exponential backoff, and gives up after 20 s per request.
 * - Optionally caches responses on disk (`.cache/sidof`), so a backfill can
 *   be re-run without hitting the server again. Only past dates are cached.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toDmy } from '../../src/core/dates.ts';

export const SIDOF_BASE = 'https://sidof.segob.gob.mx/dof/sidof';
const USER_AGENT = 'aumento-renta/0.1 (+https://github.com/BEG-lag/aumento-renta)';
const MIN_INTERVAL_MS = 300;
const CACHE_DIR = resolve(import.meta.dirname, '../../.cache/sidof');

let last = 0;
let useCache = false;
let requests = 0;

export function enableCache(): void {
  useCache = true;
  mkdirSync(CACHE_DIR, { recursive: true });
}

export function requestCount(): number {
  return requests;
}

function sleep(ms: number): Promise<void> {
  return new Promise((ok) => setTimeout(ok, ms));
}

async function getJson(path: string, cacheable: boolean, missingOk = false): Promise<unknown> {
  const cacheFile = join(CACHE_DIR, `${path.replace(/[^a-z0-9]+/gi, '_')}.json`);
  if (useCache && cacheable && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8')) as unknown;
  for (let attempt = 0; ; attempt++) {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    requests++;
    try {
      const res = await fetch(`${SIDOF_BASE}${path}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, */*;q=0.8' },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (res.status === 404 && missingOk) return null;
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${path}`), { fatal: true });
      const body = (await res.json()) as unknown;
      if (useCache && cacheable) writeFileSync(cacheFile, JSON.stringify(body));
      return body;
    } catch (error) {
      if ((error as { fatal?: boolean }).fatal || attempt >= 4) throw error;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

export interface SidofNoteRow {
  codNota: number;
  titulo?: string;
  fecha: string;
  codOrgaDos?: string | null;
}

interface NotesResponse {
  NotasMatutinas?: SidofNoteRow[];
  NotasVespertinas?: SidofNoteRow[];
  NotasExtraordinarias?: SidofNoteRow[];
}

/** Every titled note published on a date (all editions). */
export async function notesOn(date: string, today: string): Promise<SidofNoteRow[]> {
  const body = (await getJson(`/notas/${toDmy(date)}`, date < today)) as NotesResponse;
  return [...(body.NotasMatutinas ?? []), ...(body.NotasVespertinas ?? []), ...(body.NotasExtraordinarias ?? [])].filter(
    (n) => typeof n.titulo === 'string' && n.titulo.trim() !== '',
  );
}

interface NoteResponse {
  Nota?: { codNota: number; titulo?: string; fecha: string; cadenaContenido?: string; codOrgaDos?: string };
}

/** Full HTML of one note. */
export async function noteHtml(codNota: number): Promise<{ title: string; date: string; html: string }> {
  const body = (await getJson(`/notas/nota/${codNota}`, true)) as NoteResponse;
  const nota = body.Nota;
  if (!nota?.cadenaContenido) throw new Error(`SIDOF note ${codNota} has no content`);
  return { title: nota.titulo ?? '', date: nota.fecha, html: nota.cadenaContenido };
}

interface IndicatorsResponse {
  ListaIndicadores?: { codTipoIndicador: number; fecha: string; valor: string }[];
}

/** SIDOF indicator type 159 is the UDI value per calendar day. */
export const UDIS_INDICATOR = 159;

/** One indicator over a date range (inclusive), as [DD-MM-YYYY, value] pairs. */
export async function indicatorRange(
  type: number,
  from: string,
  to: string,
  today: string,
): Promise<{ fecha: string; valor: string }[]> {
  // A range with no published values yet (in the future) answers 404.
  const body = (await getJson(`/indicadores/${type}/${toDmy(from)}/${toDmy(to)}`, to < today, true)) as IndicatorsResponse | null;
  return (body?.ListaIndicadores ?? []).filter((r) => r.codTipoIndicador === type);
}
