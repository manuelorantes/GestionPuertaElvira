import { Banknote, CreditCard, Landmark } from 'lucide-react';

import type { PaymentMethod } from '@/features/billing/api';
import { ToggleButton } from '@/shared/ui/ToggleButton';

const METHODS = [
  { id: 'cash', label: 'Efectivo', Icon: Banknote },
  { id: 'card', label: 'Datáfono', Icon: CreditCard },
  { id: 'transfer', label: 'Transferencia', Icon: Landmark },
] as const;

/** «Forma de pago» de un cobro: efectivo, datáfono o transferencia. */
export function PaymentMethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Forma de pago</legend>
      <div className="grid grid-cols-3 gap-2">
        {METHODS.map(({ id, label, Icon }) => (
          <ToggleButton
            key={id}
            pressed={value === id}
            onClick={() => onChange(id)}
            className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 px-2 text-[13px] sm:text-sm"
          >
            <Icon aria-hidden size={16} />
            {label}
          </ToggleButton>
        ))}
      </div>
    </fieldset>
  );
}
