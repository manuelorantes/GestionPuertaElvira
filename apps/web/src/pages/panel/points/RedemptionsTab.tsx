import { Card } from '@/shared/ui/Card';

import { MovementsTab } from './MovementsTab';

/** En qué se pueden gastar los puntos (por ahora, el descuento al cobrar) y los canjes del mes. */
export function RedemptionsTab({ month }: { month: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="px-5 py-4">
        <h2 className="font-display text-xl font-semibold tracking-[0.04em] uppercase">
          Canjes disponibles
        </h2>
        <ul className="mt-2 text-sm">
          <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft py-2 last:border-b-0">
            <span>
              <strong>5 % de una cuota mensual</strong>
              <span className="block text-[13px] text-ink-muted">
                Se canjea al registrar el cobro de una cuota, con los puntos de ese mes.
              </span>
            </span>
            <span className="font-semibold">5 puntos</span>
          </li>
        </ul>
        <p className="mt-2 text-[13px] text-ink-muted">Más adelante habrá otros canjes.</p>
      </Card>
      <MovementsTab month={month} kind="redemption" />
    </div>
  );
}
