/**
 * The ready-to-send message (WhatsApp, email, print). Polite and neutral: it
 * states the official values and the arithmetic, never a legal conclusion.
 */
import type { UpdateResult } from './calculate.ts';
import { dateLong, monthName, percent, pointLabel, type Lang } from './format.ts';
import { indexText } from './format.ts';

export type Role = 'tenant' | 'landlord';

function indexPhrase(r: UpdateResult, lang: Lang): string {
  const from = `${pointLabel(r.from, lang)} (${indexText(r.from)})`;
  const to = `${pointLabel(r.to, lang)} (${indexText(r.to)})`;
  if (r.index === 'inpc') {
    return lang === 'es'
      ? `Con el Índice Nacional de Precios al Consumidor (INPC) que publica el INEGI en el Diario Oficial de la Federación, de ${from} a ${to}, la inflación del periodo fue de ${percent(r.rate)}.`
      : `Using the National Consumer Price Index (INPC) published by INEGI in the Diario Oficial de la Federación, from ${from} to ${to}, inflation for the period was ${percent(r.rate)}.`;
  }
  return lang === 'es'
    ? `Con el valor de la UDI que publica el Banco de México en el Diario Oficial de la Federación, del ${from} al ${to}, la variación fue de ${percent(r.rate)}.`
    : `Using the UDI value published by Banco de México in the Diario Oficial de la Federación, from ${from} to ${to}, the change was ${percent(r.rate)}.`;
}

function capPhrase(r: UpdateResult, lang: Lang): string | null {
  if (r.cap.status !== 'applies' || r.cap.readings.length === 0) return null;
  const parts = r.cap.readings.map((reading) => {
    const inf = reading.inflation;
    if (inf.reading === 'calendar-year') {
      return lang === 'es'
        ? `${percent(inf.reported)} en ${inf.year ?? ''}, de diciembre a diciembre`
        : `${percent(inf.reported)} in ${inf.year ?? ''}, December to December`;
    }
    return lang === 'es'
      ? `${percent(inf.reported)} en los 12 meses a ${monthName(inf.to.key, lang)}`
      : `${percent(inf.reported)} in the 12 months to ${monthName(inf.to.key, lang)}`;
  });
  return lang === 'es'
    ? `Para vivienda en la Ciudad de México, el artículo 2448 D del Código Civil para el Distrito Federal dice que el incremento de la renta no será mayor a la inflación del año anterior (${parts.join('; ')}).`
    : `For homes in Mexico City, article 2448 D of the Civil Code for the Federal District says the rent increase may not exceed the previous year's inflation (${parts.join('; ')}).`;
}

function provisionalPhrase(r: UpdateResult, lang: Lang): string | null {
  const note = r.notes.find((n) => n.code === 'provisional-inpc' || n.code === 'provisional-udis');
  if (!note) return null;
  if (note.code === 'provisional-inpc') {
    return lang === 'es'
      ? `Es un cálculo provisional: el INPC de ${monthName(note.wanted, lang)} se publica a más tardar el ${dateLong(note.expected, lang)}.`
      : `This is provisional: the INPC for ${monthName(note.wanted, lang)} is due by ${dateLong(note.expected, lang)}.`;
  }
  return lang === 'es'
    ? `Es un cálculo provisional: todavía no se publica el valor de la UDI del ${dateLong(note.wanted, lang)}.`
    : `This is provisional: the UDI value for ${dateLong(note.wanted, lang)} is not published yet.`;
}

export function buildMessage(r: UpdateResult, opts: { lang: Lang; role: Role; url: string }): string {
  const { lang, role, url } = opts;
  const when = dateLong(r.input.increaseDate, lang);
  const lines: string[] = [];
  if (lang === 'es') {
    lines.push(
      role === 'tenant'
        ? `Hola. Te escribo sobre la actualización de la renta que aplicaría a partir del ${when}.`
        : `Hola. Te escribo sobre la actualización de la renta a partir del ${when}.`,
    );
    lines.push('');
    lines.push(
      `${indexPhrase(r, lang)} Aplicada a la renta actual de ${r.current.formatted}, la renta actualizada ${role === 'tenant' ? 'sería de' : 'queda en'} ${r.updated.formatted}, es decir, ${r.increase.formatted} ${r.increase.centavos < 0n ? 'menos' : 'más'} al mes.`,
    );
  } else {
    lines.push(
      role === 'tenant'
        ? `Hi. I am writing about the rent update that would apply from ${when}.`
        : `Hi. I am writing about the rent update from ${when}.`,
    );
    lines.push('');
    lines.push(
      `${indexPhrase(r, lang)} Applied to the current rent of ${r.current.formatted}, the updated rent ${role === 'tenant' ? 'would be' : 'is'} ${r.updated.formatted}, that is, ${r.increase.formatted} ${r.increase.centavos < 0n ? 'less' : 'more'} per month.`,
    );
  }
  const provisional = provisionalPhrase(r, lang);
  if (provisional) lines.push('', provisional);
  if (r.proposal) {
    const p = r.proposal;
    lines.push('');
    if (lang === 'es') {
      lines.push(
        role === 'tenant'
          ? `La propuesta de ${p.newRent.formatted} equivale a un aumento de ${percent(p.rate)} (${p.increase.formatted} al mes).`
          : `La renta que propongo es de ${p.newRent.formatted}, un aumento de ${percent(p.rate)} (${p.increase.formatted} al mes).`,
      );
    } else {
      lines.push(
        role === 'tenant'
          ? `The proposed rent of ${p.newRent.formatted} is an increase of ${percent(p.rate)} (${p.increase.formatted} per month).`
          : `The rent I propose is ${p.newRent.formatted}, an increase of ${percent(p.rate)} (${p.increase.formatted} per month).`,
      );
    }
  }
  const cap = capPhrase(r, lang);
  if (cap) lines.push('', cap);
  lines.push('');
  lines.push(
    lang === 'es'
      ? `Te comparto el cálculo con los valores oficiales y sus fuentes: ${url}`
      : `Here is the calculation with the official values and their sources: ${url}`,
  );
  lines.push('');
  lines.push(
    role === 'tenant'
      ? lang === 'es'
        ? '¿Lo platicamos? Gracias.'
        : 'Can we talk it over? Thank you.'
      : lang === 'es'
        ? 'Quedo a tus órdenes para cualquier duda. Saludos.'
        : 'Happy to answer any questions. Best regards.',
  );
  return lines.join('\n');
}

/** Subject line for the email. */
export function messageSubject(r: UpdateResult, lang: Lang): string {
  return lang === 'es' ? `Actualización de la renta a partir del ${dateLong(r.input.increaseDate, lang)}` : `Rent update from ${dateLong(r.input.increaseDate, lang)}`;
}
