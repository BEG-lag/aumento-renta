/**
 * The DOF parsers, against real notes saved from SIDOF in test/fixtures.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dofNoteUrl, htmlToText, isCorrectionTitle, parseInpcMonthly, parseUdiTable, sidofNoteUrl } from '../src/data/dof.ts';

function fixture(name: string): string {
  return htmlToText(readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8'));
}

describe('htmlToText', () => {
  it('drops styles and tags and decodes entities', () => {
    expect(htmlToText('<style>.a{b:c}</style><p>Hola&nbsp;<b>M&eacute;xico</b> &amp; &#211;scar &#x41;</p>')).toBe('Hola México & Óscar A');
    expect(htmlToText('<script>x()</script>a&unknown;b')).toBe('a&unknown;b');
  });

  it('keeps the INPC statement of a raw DOF note and none of its CSS', () => {
    const text = fixture('dof-inpc-2026-10.html');
    expect(text).toContain('el Índice Nacional de Precios al Consumidor del mes de octubre de 2026 es 147.026');
    expect(text).not.toContain('font-family');
  });
});

describe('parseInpcMonthly', () => {
  it('reads October 2026 (DOF 10/11/2026) with the previous month and the variation', () => {
    expect(parseInpcMonthly(fixture('dof-inpc-2026-10.html'))).toEqual({
      month: '2026-10',
      value: '147.026',
      variation: '0.65',
      previous: { month: '2026-09', value: '146.075' },
    });
  });

  it('reads December 2019, which prints "puntos" after the value', () => {
    expect(parseInpcMonthly(fixture('dof-inpc-2019-12.html'))).toEqual({
      month: '2019-12',
      value: '105.934',
      variation: '0.56',
      previous: { month: '2019-11', value: '105.346' },
    });
  });

  it('reads the wrong August 2018 figure as printed, and the correction as corrected', () => {
    const original = parseInpcMonthly(fixture('dof-inpc-2018-08-original.html'));
    expect(original).toMatchObject({ month: '2018-08', value: '100.942', variation: '4.90' });
    const fixed = parseInpcMonthly(fixture('dof-inpc-2018-08-aclaracion.html'));
    expect(fixed).toEqual({ month: '2018-08', value: '100.492', variation: '0.58', previous: { month: '2018-07', value: '99.909' } });
  });

  it('returns null when there is no monthly statement', () => {
    expect(parseInpcMonthly('El Índice Nacional de Precios al Consumidor quincenal ... es de 100.343 puntos.')).toBeNull();
    expect(
      parseInpcMonthly('segunda quincena de julio de 2018=100 el Índice Nacional de Precios al Consumidor del mes de brumario de 2026 es 147.026'),
    ).toBeNull();
  });

  it('recognizes correction titles', () => {
    expect(isCorrectionTitle('Nota Aclaratoria que emite el Instituto Nacional de Estadística y Geografía, al Índice ...')).toBe(true);
    expect(isCorrectionTitle('ACLARACIÓN al Índice nacional de precios al consumidor')).toBe(true);
    expect(isCorrectionTitle('Índice nacional de precios al consumidor.')).toBe(false);
  });
});

describe('parseUdiTable', () => {
  const cases: [string, string, number, [string, string], [string, string]][] = [
    ['dof-udi-2026-11-10.html', '11-noviembre-2026', 15, ['2026-11-11', '8.899987'], ['2026-11-25', '8.932476']],
    ['dof-udi-2009-11-10.html', '12- noviembre-2009', 15, ['2009-11-11', '4.313618'], ['2009-11-25', '4.309396']],
    ['dof-udi-2020-02-25.html', '26/02/2020', 14, ['2020-02-26', '6.458664'], ['2020-03-10', '6.465984']],
    ['dof-udi-2020-07-10.html', '11-julio-20', 15, ['2020-07-11', '6.459435'], ['2020-07-25', '6.487510']],
    ['dof-udi-2020-02-10.html', '6.4 51423 (split value)', 15, ['2020-02-11', '6.451423'], ['2020-02-25', '6.458101']],
    ['dof-udi-2022-08-10.html', '11 de agosto de 2022', 15, ['2022-08-11', '7.447777'], ['2022-08-25', '7.463568']],
  ];
  it.each(cases)('%s (%s)', (file, _format, count, first, last) => {
    const rows = parseUdiTable(fixture(file));
    expect(rows).toHaveLength(count);
    expect([rows[0]?.date, rows[0]?.value]).toEqual(first);
    expect([rows.at(-1)?.date, rows.at(-1)?.value]).toEqual(last);
    for (const r of rows) expect(r.value).toMatch(/^\d\.\d{6}$/);
  });

  it('ignores impossible dates and unknown months', () => {
    expect(parseUdiTable('31-febrero-2026 8.000000 1-brumario-2026 8.000000 30/02/2026 8.000000 1-marzo-99 1.000000')).toEqual([
      { date: '1999-03-01', value: '1.000000' },
    ]);
  });
});

describe('links', () => {
  it('builds the public DOF and SIDOF note URLs', () => {
    expect(dofNoteUrl(5803352, '2026-11-10')).toBe('https://dof.gob.mx/nota_detalle.php?codigo=5803352&fecha=10/11/2026');
    expect(sidofNoteUrl(5803352)).toBe('https://sidof.segob.gob.mx/notas/5803352');
  });
});
