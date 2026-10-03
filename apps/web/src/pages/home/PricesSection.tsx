import type { ReactNode, Ref } from 'react';

import { formatCents } from '@/features/billing/money';
import { usePublicPrices } from '@/features/public/prices';

/** Cómo se reparte cada tramo en el horario del club (texto del diseño). */
const TIER_TEXT: Record<number, { title: string; detail: string }> = {
  3: { title: '3 horas semanales', detail: '2 clases de 1 h y media' },
  2: { title: '2 horas semanales', detail: '2 clases de 1 h' },
  1.5: { title: '1 hora y media semanal', detail: '1 día a la semana' },
  1: { title: '1 hora semanal', detail: '1 día a la semana' },
};

/** Reglas de puntos del club: se canjean como descuento especial al pagar. */
const POINTS = [
  ['1 punto', 'por cada viernes que vengas al club'],
  [
    '1 punto',
    'por cada foto que te hagas con la equipación oficial, en los torneos a los que vayas',
  ],
  ['5 puntos = 5 %', 'de descuento'],
];

function PriceCard({
  title,
  dark = false,
  children,
}: {
  title: string;
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line-soft bg-surface-raised shadow-card">
      <h3
        className={`px-6 py-3 font-display text-[22px] font-semibold tracking-[0.06em] uppercase ${dark ? 'bg-ink-strong text-paper' : 'bg-brand text-surface-raised'}`}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function percent(value: number): string {
  return `${value} %`;
}

export function PricesSection({ ref }: { ref?: Ref<HTMLElement> }) {
  const prices = usePublicPrices();
  const p = prices.data;
  const title = `Precios y descuentos ${p?.season ?? ''}`.trim();

  return (
    <section
      ref={ref}
      aria-label={title}
      className="mx-auto max-w-[1280px] scroll-mt-24 px-4 py-16 md:px-12"
    >
      <div className="mb-8 flex items-center gap-4">
        <h2 className="font-display text-4xl font-bold tracking-[0.04em] text-ink-strong uppercase">
          {title}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-ink-strong opacity-30" />
      </div>
      {!p ? (
        <p className="text-ink-muted">
          {prices.isError ? 'No se han podido cargar los precios.' : 'Cargando precios…'}
        </p>
      ) : (
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-6">
          <PriceCard title="Cuotas de clases">
            <div className="px-6 pt-4 pb-6">
              <p className="mb-3 text-sm text-ink-muted">
                Las cuotas se abonan del día 1 al 5 de cada mes.
              </p>
              <ul aria-label="Cuotas de clases">
                {p.tiers.map((tier) => {
                  const text = TIER_TEXT[tier.weeklyHours] ?? {
                    title: `${tier.weeklyHours} h semanales`,
                    detail: '',
                  };
                  return (
                    <li
                      key={tier.weeklyHours}
                      aria-label={text.title}
                      className="flex items-center justify-between gap-4 border-t border-line-soft py-3"
                    >
                      <span>
                        <span className="block text-[15px] font-semibold">{text.title}</span>
                        <span className="block text-[13px] text-ink-muted">{text.detail}</span>
                      </span>
                      <span className="min-w-18 rounded-sm bg-brand px-3 py-1 text-center font-display text-[26px] font-bold text-surface-raised">
                        {formatCents(tier.monthlyCents)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 border-t border-line-soft pt-3 text-[13px] text-ink-muted">
                Clases particulares: {formatCents(p.privateHourCents)} la hora.
              </p>
            </div>
          </PriceCard>
          <div className="flex flex-col gap-6">
            <PriceCard title="Cuota de socio">
              <div className="flex items-center justify-between gap-4 px-6 py-5">
                <span className="font-semibold">De septiembre a junio</span>
                <span className="rounded-sm bg-ink-strong px-3 py-1 font-display text-[26px] font-bold text-paper">
                  {formatCents(p.membershipCents)}
                </span>
              </div>
            </PriceCard>
            <PriceCard title="Descuento familiar">
              <div className="flex items-center gap-5 px-6 py-5">
                <span className="font-display text-5xl leading-none font-bold whitespace-nowrap text-ink-strong">
                  {percent(p.familyPercent)}
                </span>
                <span className="text-sm text-ink-soft">
                  de descuento para más de una persona del mismo núcleo familiar (hermanos y padres)
                </span>
              </div>
            </PriceCard>
          </div>
          <div className="flex flex-col gap-6">
            <PriceCard title="Descuentos por pago anticipado">
              <div className="grid grid-cols-3 gap-3 px-6 py-5">
                {[
                  ['Trimestre', p.prepaymentPercent.threeMonths],
                  ['Semestre', p.prepaymentPercent.sixMonths],
                  ['Todo el año', p.prepaymentPercent.season],
                ].map(([label, value]) => (
                  <div key={label} className="text-center">
                    <p className="text-[13px] font-semibold tracking-[0.04em] uppercase">{label}</p>
                    <p className="font-display text-[40px] leading-tight font-bold text-brand">
                      {percent(Number(value))}
                    </p>
                    <p className="text-xs text-ink-muted">de descuento</p>
                  </div>
                ))}
              </div>
            </PriceCard>
            <PriceCard title="¡Suma puntos y consigue descuentos!" dark>
              <ul className="px-6 pt-3 pb-5">
                {POINTS.map(([points, detail]) => (
                  <li
                    key={detail}
                    className="flex gap-3 border-t border-line-soft py-2 text-sm first:border-t-0"
                  >
                    <span className="min-w-26 font-bold text-brand">{points}</span>
                    <span className="text-ink-soft">{detail}</span>
                  </li>
                ))}
              </ul>
            </PriceCard>
          </div>
        </div>
      )}
      {p && (
        <p className="mt-6 text-[13px] text-ink-muted">
          Los descuentos se suman: hermanos que pagan el trimestre tienen un{' '}
          {percent(p.familyPercent + p.prepaymentPercent.threeMonths)} de descuento.
        </p>
      )}
    </section>
  );
}
