import { Rational } from './rational.ts';

/**
 * A rounded amount of Mexican pesos. `centavos` is the source of truth;
 * `amount` and `formatted` are derived from it.
 */
export interface Money {
  /** Whole centavos (1 peso = 100 centavos). */
  readonly centavos: bigint;
  /** Plain decimal string with two decimals, e.g. "12345.67". */
  readonly amount: string;
  /** Display string in Mexican format, e.g. "$12,345.67". */
  readonly formatted: string;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Formats an integer number of centavos as "$1,234.56" (or "-$1,234.56"). */
export function formatCentavos(centavos: bigint): string {
  const negative = centavos < 0n;
  const abs = negative ? -centavos : centavos;
  const pesos = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${groupThousands(pesos.toString())}.${cents}`;
}

export function moneyFromCentavos(centavos: bigint): Money {
  const negative = centavos < 0n;
  const abs = negative ? -centavos : centavos;
  const amount = `${negative ? '-' : ''}${(abs / 100n).toString()}.${(abs % 100n).toString().padStart(2, '0')}`;
  return { centavos, amount, formatted: formatCentavos(centavos) };
}

/**
 * Rounds an exact value to centavos, half away from zero ("redondeo
 * comercial": $0.005 becomes $0.01), and wraps it. This is the only rounding
 * applied to money in the app, and it happens once, at the end.
 */
export function money(value: Rational): Money {
  return moneyFromCentavos(value.roundToCentavos());
}

/** Exact Rational for a rounded Money value. */
export function moneyToRational(m: Money): Rational {
  return Rational.of(m.centavos, 100n);
}
