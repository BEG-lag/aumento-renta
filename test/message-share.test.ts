import { describe, expect, it } from 'vitest';
import { calculate, type UpdateInput, type UpdateResult } from '../src/core/calculate.ts';
import { buildMessage, messageSubject } from '../src/core/message.ts';
import { decodeState, encodeState } from '../src/core/share.ts';
import { series } from './helpers.ts';

const INPUT: UpdateInput = {
  amount: '12,000',
  index: 'inpc',
  startDate: '2025-12-01',
  increaseDate: '2026-12-01',
  period: 'published',
  location: 'cdmx',
  use: 'housing',
  proposal: { kind: 'percent', value: '8' },
};

function result(patch: Partial<UpdateInput> = {}): UpdateResult {
  const r = calculate({ ...INPUT, ...patch }, series);
  if (!r.ok) throw new Error(r.errors.join(','));
  return r;
}

const URL = 'https://beg-lag.github.io/aumento-renta/#m=12000';

describe('message', () => {
  it('tenant, Spanish: values, sources, proposal, the CDMX rule and the link', () => {
    const text = buildMessage(result(), { lang: 'es', role: 'tenant', url: URL });
    expect(text).toBe(
      [
        'Hola. Te escribo sobre la actualización de la renta que aplicaría a partir del 1 de diciembre de 2026.',
        '',
        'Con el Índice Nacional de Precios al Consumidor (INPC) que publica el INEGI en el Diario Oficial de la Federación, de octubre de 2025 (141.708) a octubre de 2026 (147.026), la inflación del periodo fue de 3.75%. Aplicada a la renta actual de $12,000.00, la renta actualizada sería de $12,450.33, es decir, $450.33 más al mes.',
        '',
        'La propuesta de $12,960.00 equivale a un aumento de 8.00% ($960.00 al mes).',
        '',
        'Para vivienda en la Ciudad de México, el artículo 2448 D del Código Civil para el Distrito Federal dice que el incremento de la renta no será mayor a la inflación del año anterior (3.69% en 2025, de diciembre a diciembre; 3.75% en los 12 meses a octubre de 2026).',
        '',
        `Te comparto el cálculo con los valores oficiales y sus fuentes: ${URL}`,
        '',
        '¿Lo platicamos? Gracias.',
      ].join('\n'),
    );
  });

  it('landlord, English, UDIS, provisional, no CDMX rule outside Mexico City', () => {
    const text = buildMessage(result({ index: 'udis', location: 'other', proposal: { kind: 'percent', value: '3' } }), {
      lang: 'en',
      role: 'landlord',
      url: URL,
    });
    expect(text).toContain('Using the UDI value published by Banco de México');
    expect(text).toContain('the updated rent is $12,442.59');
    expect(text).toContain('This is provisional: the UDI value for December 1, 2026 is not published yet.');
    expect(text).toContain('The rent I propose is $12,360.00, an increase of 3.00%');
    expect(text).not.toContain('2448 D');
    expect(text.endsWith('Happy to answer any questions. Best regards.')).toBe(true);
  });

  it('provisional INPC and lower rent', () => {
    const es = buildMessage(result({ startDate: '2026-03-01', increaseDate: '2027-03-01', proposal: { kind: 'percent', value: '' } }), {
      lang: 'es',
      role: 'landlord',
      url: URL,
    });
    expect(es).toContain('Es un cálculo provisional: el INPC de enero de 2027 se publica a más tardar el 10 de febrero de 2027.');
    expect(es).not.toContain('La renta que propongo');
    expect(es).toContain('la renta actualizada queda en $12,450.33');
    const en = buildMessage(result({ period: 'custom', customFrom: '2026-04', customTo: '2026-06' }), { lang: 'en', role: 'tenant', url: URL });
    expect(en).toContain('less per month');
    expect(en).not.toContain('This is provisional');
    const es2 = buildMessage(result({ period: 'custom', customFrom: '2026-04', customTo: '2026-06', index: 'inpc' }), {
      lang: 'es',
      role: 'tenant',
      url: URL,
    });
    expect(es2).toContain('menos al mes');
    const enProv = buildMessage(result({ startDate: '2026-03-01', increaseDate: '2027-03-01' }), { lang: 'en', role: 'tenant', url: URL });
    expect(enProv).toContain('the INPC for January 2027 is due by February 10, 2027');
    const esUdi = buildMessage(result({ index: 'udis' }), { lang: 'es', role: 'tenant', url: URL });
    expect(esUdi).toContain('todavía no se publica el valor de la UDI del 1 de diciembre de 2026');
    expect(esUdi).toContain('Con el valor de la UDI que publica el Banco de México');
  });

  it('never uses the em dash', () => {
    const dash = String.fromCodePoint(0x2014);
    for (const lang of ['es', 'en'] as const) {
      for (const role of ['tenant', 'landlord'] as const) expect(buildMessage(result(), { lang, role, url: URL })).not.toContain(dash);
    }
  });

  it('subject line', () => {
    expect(messageSubject(result(), 'es')).toBe('Actualización de la renta a partir del 1 de diciembre de 2026');
    expect(messageSubject(result(), 'en')).toBe('Rent update from December 1, 2026');
  });
});

describe('share link', () => {
  it('round-trips the inputs through the URL fragment', () => {
    const fragment = encodeState(INPUT);
    expect(fragment).toBe('m=12000&i=inpc&a=2025-12-01&b=2026-12-01&p=published&e=cdmx&u=housing&pk=percent&pv=8');
    expect(decodeState(`#${fragment}`)).toEqual({ ...INPUT, amount: '12000' });
  });

  it('keeps custom months only in custom mode and drops anything invalid', () => {
    const custom = encodeState({ ...INPUT, period: 'custom', customFrom: '2025-10', customTo: '2026-10', location: 'other', proposal: { kind: 'newRent', value: 'abc' } });
    expect(custom).toBe('m=12000&i=inpc&a=2025-12-01&b=2026-12-01&p=custom&f=2025-10&t=2026-10&e=other');
    expect(encodeState({ ...INPUT, amount: 'doce', startDate: 'x', increaseDate: 'y', period: 'custom', customFrom: 'z', customTo: 'w' })).toBe(
      'i=inpc&p=custom&e=cdmx&u=housing&pk=percent&pv=8',
    );
    expect(decodeState('m=1e9&i=bitcoin&a=2025-02-30&b=hoy&p=x&f=2025-13&t=2026&e=mars&u=castle&pk=percent&pv=muchos&name=Juan')).toEqual({});
    expect(decodeState('#f=2025-10&t=2026-10&pk=increase&pv=500.5')).toEqual({
      customFrom: '2025-10',
      customTo: '2026-10',
      proposal: { kind: 'increase', value: '500.5' },
    });
  });
});
