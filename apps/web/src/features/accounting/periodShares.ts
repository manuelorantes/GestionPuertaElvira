import { centsFromText, centsToText, formatCents, monthName } from '@/features/billing/money';

/** Lo que corresponde a un mes («AAAA-MM») de un movimiento. */
export interface Share {
  period: string;
  amountCents: number;
}

/**
 * Lo elegido en «Mes al que corresponde»: un solo mes (vacío: el de la fecha) o varios, a partes iguales (`amounts`
 * null) o con lo que va a cada uno escrito a mano.
 */
export type PeriodChoice =
  | { kind: 'one'; period: string }
  | { kind: 'many'; months: string[]; amounts: Record<string, string> | null };

/** A partes iguales: cada mes, el cociente; los primeros, un céntimo más hasta agotar el resto (como la API). */
export function equalShares(totalCents: number, months: string[]): Share[] {
  const sorted = [...months].sort();
  if (sorted.length === 0) return [];
  const quotient = Math.trunc(totalCents / sorted.length);
  const rest = totalCents - quotient * sorted.length;
  return sorted.map((period, i) => ({ period, amountCents: quotient + (i < rest ? 1 : 0) }));
}

/** Lo elegido para un movimiento que ya tiene reparto (al editarlo). */
export function initialChoice(
  shares: Share[] | null | undefined,
  dateMonth: string,
  totalCents: number,
): PeriodChoice {
  if (!shares || shares.length <= 1) {
    const period = shares?.[0]?.period ?? '';
    return { kind: 'one', period: period === dateMonth ? '' : period };
  }
  const months = shares.map((s) => s.period);
  const equal = equalShares(totalCents, months);
  const isEqual = equal.every((s, i) => s.amountCents === shares[i]?.amountCents);
  return {
    kind: 'many',
    months,
    amounts: isEqual
      ? null
      : Object.fromEntries(shares.map((s) => [s.period, centsToText(s.amountCents)])),
  };
}

/** Lo que se envía a la API, lo que corresponde a cada mes y, si no cuadra, por qué. */
export interface ResolvedChoice {
  period: string | null;
  shares: Share[] | null;
  effective: Share[];
  problem: string | null;
}

export function resolveChoice(
  choice: PeriodChoice,
  dateMonth: string,
  totalCents: number,
): ResolvedChoice {
  if (choice.kind === 'one') {
    const period = choice.period || dateMonth;
    return {
      period: choice.period || null,
      shares: null,
      effective: [{ period, amountCents: totalCents }],
      problem: null,
    };
  }
  const months = [...choice.months].sort();
  if (months.length < 2) {
    return {
      period: months[0] ?? null,
      shares: null,
      effective: [{ period: months[0] ?? dateMonth, amountCents: totalCents }],
      problem: 'Elige al menos dos meses.',
    };
  }
  const shares = choice.amounts
    ? months.map((period) => ({
        period,
        amountCents: centsFromText(choice.amounts?.[period] ?? '') ?? -1,
      }))
    : equalShares(totalCents, months);
  const sum = shares.reduce((total, s) => total + Math.max(0, s.amountCents), 0);
  let problem: string | null = null;
  if (shares.some((s) => s.amountCents <= 0)) problem = 'Cada mes tiene que llevar más de 0 €.';
  else if (sum !== totalCents) {
    problem = `El reparto suma ${formatCents(sum)} y el importe es ${formatCents(totalCents)}.`;
  }
  return { period: months[0] ?? null, shares, effective: shares, problem };
}

/** «octubre, noviembre y diciembre 2026»; con meses de dos años, «diciembre 2026, enero 2027». */
export function sharesLabel(shares: Share[]): string {
  const byYear = new Map<string, string[]>();
  for (const s of [...shares].sort((a, b) => a.period.localeCompare(b.period))) {
    const year = s.period.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), monthName(s.period)]);
  }
  return [...byYear]
    .map(([year, names]) => {
      const last = names.at(-1) ?? '';
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${last}` : last;
      return `${list} ${year}`;
    })
    .join(', ');
}

/** Para la lista de cambios: «Octubre 2026» o «Octubre 2026 (100 €), noviembre 2026 (200 €)». */
export function sharesDetail(shares: Share[]): string {
  const text =
    shares.length === 1
      ? sharesLabel(shares)
      : [...shares]
          .sort((a, b) => a.period.localeCompare(b.period))
          .map((s) => `${sharesLabel([s])} (${formatCents(s.amountCents)})`)
          .join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
