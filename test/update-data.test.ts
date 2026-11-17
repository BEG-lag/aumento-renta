/**
 * The committed data files are exactly what the updater writes, so a
 * scheduled refresh only ever appends lines.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeInpc, serializeUdis } from '../scripts/update-data.ts';
import { inpcData, ROOT, udisData } from './helpers.ts';

describe('data files', () => {
  it('data/inpc.json is in the updater format', () => {
    expect(serializeInpc(inpcData)).toBe(readFileSync(resolve(ROOT, 'data/inpc.json'), 'utf8'));
  });

  it('data/udis.json is in the updater format, one line per month of values', () => {
    const text = readFileSync(resolve(ROOT, 'data/udis.json'), 'utf8');
    expect(serializeUdis(udisData)).toBe(text);
    expect(text).toContain('\n    "1.000000", "1.001918", ');
  });

  it('cites its official sources', () => {
    expect(inpcData.base).toBe('Segunda quincena de julio de 2018 = 100');
    expect(inpcData.sources.map((s) => s.id)).toEqual(['dof', 'inegi-csv']);
    expect(udisData.sources.map((s) => s.id)).toEqual(['sidof', 'dof']);
    for (const s of [...inpcData.sources, ...udisData.sources]) {
      expect(s.url).toMatch(/^https:\/\/(sidof\.segob\.gob\.mx|www\.inegi\.org\.mx)\//);
      expect(s.consulted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
