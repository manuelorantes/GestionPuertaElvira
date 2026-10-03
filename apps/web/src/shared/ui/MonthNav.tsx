import { ChevronLeft, ChevronRight } from 'lucide-react';

const BUTTON =
  'flex size-10 cursor-pointer items-center justify-center rounded-sm border border-line-strong hover:bg-surface-muted';

interface MonthNavProps {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
}

/** «‹ Octubre 2026 ›»: navegación entre meses. */
export function MonthNav({ label, onPrevious, onNext }: MonthNavProps) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Mes anterior" onClick={onPrevious} className={BUTTON}>
        <ChevronLeft aria-hidden size={18} />
      </button>
      <p
        aria-live="polite"
        className="min-w-40 text-center font-display text-xl font-semibold tracking-[0.04em] uppercase"
      >
        {label}
      </p>
      <button type="button" aria-label="Mes siguiente" onClick={onNext} className={BUTTON}>
        <ChevronRight aria-hidden size={18} />
      </button>
    </div>
  );
}
