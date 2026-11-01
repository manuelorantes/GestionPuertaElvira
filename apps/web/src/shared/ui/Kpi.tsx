import { Card } from './Card';

/** Cifra clave del diseño: etiqueta, valor grande y una línea de detalle; `accent` marca la principal. */
export function Kpi({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  /** Sin él, la tarjeta solo muestra la cifra. */
  hint?: string | undefined;
  accent?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden px-6 py-5">
      {accent && (
        <span
          aria-hidden
          className="absolute top-0 right-0 size-11 bg-brand [clip-path:polygon(0_0,100%_0,100%_100%)]"
        />
      )}
      <p className="relative text-[13px] font-medium text-ink-muted">{label}</p>
      <p className="relative mt-1 font-display text-[40px] leading-tight font-bold">{value}</p>
      {hint && <p className="relative text-[13px] text-ink-muted">{hint}</p>}
    </Card>
  );
}
