import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { InpcSeries, UdisSeries } from '../src/core/series.ts';
import type { InpcData, UdisData } from '../src/data/types.ts';
import type { Series } from '../src/core/calculate.ts';

export const ROOT = resolve(import.meta.dirname, '..');

export const inpcData = JSON.parse(readFileSync(resolve(ROOT, 'data/inpc.json'), 'utf8')) as InpcData;
export const udisData = JSON.parse(readFileSync(resolve(ROOT, 'data/udis.json'), 'utf8')) as UdisData;

export const series: Series = { inpc: new InpcSeries(inpcData), udis: new UdisSeries(udisData) };
