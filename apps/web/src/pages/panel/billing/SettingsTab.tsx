import { useState, type FormEvent, type ReactNode } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { updateSettings, type BillingSettings } from '@/features/billing/api';
import { useBillingMutation, useBillingSettings } from '@/features/billing/hooks';
import { useTeachers } from '@/features/classes/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { useToast } from '@/shared/ui/Toast';

type PriceKey = 'threeHours' | 'twoHours' | 'hourAndHalf' | 'oneHour' | 'membershipFee';
type PercentKey = 'familyPercent' | 'threeMonthsPercent' | 'sixMonthsPercent' | 'seasonPercent';

const PRICES: { key: PriceKey; label: string; help: string }[] = [
  { key: 'threeHours', label: '3 h o más a la semana', help: 'Al mes' },
  { key: 'twoHours', label: '2 h a la semana', help: 'Al mes' },
  { key: 'hourAndHalf', label: '1 h y media a la semana', help: 'Al mes' },
  { key: 'oneHour', label: '1 h a la semana', help: 'Al mes' },
  { key: 'membershipFee', label: 'Cuota de socio', help: 'Una vez por temporada' },
];

const PERCENTS: { key: PercentKey; label: string }[] = [
  { key: 'familyPercent', label: 'Familiar (hermanos en el club)' },
  { key: 'threeMonthsPercent', label: 'Pago adelantado de 3 meses' },
  { key: 'sixMonthsPercent', label: 'Pago adelantado de 6 meses' },
  { key: 'seasonPercent', label: 'Todo el año (septiembre a junio)' },
];

function Title({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 font-display text-xl font-semibold tracking-[0.04em] uppercase">
      {children}
    </h2>
  );
}

function Amount({
  label,
  help,
  unit,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `setting-${label.replace(/\W+/g, '-')}`;
  return (
    <div className="flex items-center gap-3 border-t border-line-soft py-3">
      <div className="flex-1">
        <label htmlFor={id} className="block font-medium">
          {label}
        </label>
        {help && (
          <span id={`${id}-help`} className="block text-[13px] text-ink-muted">
            {help}
          </span>
        )}
      </div>
      <span className="flex h-10 w-32 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 focus-within:border-brand">
        <input
          id={id}
          aria-describedby={help ? `${id}-help` : undefined}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent text-right font-semibold outline-none"
        />
        <span className="text-[13px] text-ink-muted">{unit}</span>
      </span>
    </div>
  );
}

export function SettingsTab() {
  const settings = useBillingSettings();
  if (settings.isPending) return <p className="text-ink-muted">Cargando ajustes…</p>;
  if (!settings.data) return <Alert>No se han podido cargar los ajustes.</Alert>;
  return <SettingsForm initial={settings.data} />;
}

function SettingsForm({ initial }: { initial: BillingSettings }) {
  const [values, setValues] = useState(initial);
  const teachers = useTeachers();
  const save = useBillingMutation(updateSettings);
  const toast = useToast();
  const set = <K extends keyof BillingSettings>(key: K, value: BillingSettings[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const privateRates = Object.fromEntries(
      Object.entries(values.privateRates).filter(([, rate]) => rate.trim() !== ''),
    );
    await save.mutateAsync({ ...values, privateRates }).then(
      () => toast('Ajustes guardados'),
      () => undefined,
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-6">
        <Card className="p-6">
          <Title>Cuotas de clases</Title>
          {PRICES.map((p) => (
            <Amount
              key={p.key}
              label={p.label}
              help={p.help}
              unit="€"
              value={values[p.key]}
              onChange={(v) => set(p.key, v)}
            />
          ))}
        </Card>
        <Card className="p-6">
          <Title>Descuentos</Title>
          {PERCENTS.map((p) => (
            <Amount
              key={p.key}
              label={p.label}
              unit="%"
              value={String(values[p.key])}
              onChange={(v) => set(p.key, Number(v.replace(/\D/g, '') || 0))}
            />
          ))}
          <p className="mt-3 rounded-sm bg-surface-muted p-3 text-[13px] text-ink-muted">
            Los descuentos se suman sobre la cuota base. Ejemplo: hermanos (10 %) que pagan 3 meses
            (10 %) tienen un 20 % de descuento. Los puntos se canjean con un descuento especial al
            cobrar.
          </p>
        </Card>
        <Card className="p-6">
          <Title>Clases particulares</Title>
          <p className="text-[13px] text-ink-muted">
            Precio por hora que paga el alumno. En la ficha de cada alumno se puede pactar otro.
          </p>
          <Amount
            label="Precio por defecto"
            unit="€/h"
            value={values.defaultPrivateRate}
            onChange={(v) => set('defaultPrivateRate', v)}
          />
          {(teachers.data ?? [])
            .filter((t) => t.active)
            .map((teacher) => (
              <Amount
                key={teacher.id}
                label={teacher.fullName}
                help="Vacío: el precio por defecto"
                unit="€/h"
                value={values.privateRates[teacher.id] ?? ''}
                onChange={(v) => set('privateRates', { ...values.privateRates, [teacher.id]: v })}
              />
            ))}
        </Card>
        <Card className="flex flex-col gap-3 p-6">
          <Title>Datos fiscales del club</Title>
          {(
            [
              ['clubName', 'Nombre'],
              ['clubTaxId', 'NIF'],
              ['clubAddress', 'Dirección'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex flex-col gap-1.5 text-sm font-medium">
              {label}
              <input
                value={values[key]}
                onChange={(e) => set(key, e.target.value)}
                className="h-11 rounded-sm border border-line-strong bg-surface px-3 font-normal outline-none focus:border-brand"
              />
            </label>
          ))}
          <p className="text-[13px] text-ink-muted">Aparecen en los recibos y en las facturas.</p>
        </Card>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-[13px] text-ink-muted">
          Los cambios se aplican a las cuotas y cobros nuevos; los ya registrados no cambian.
        </p>
        <Button type="submit" busy={save.isPending} busyLabel="Guardando…">
          Guardar ajustes
        </Button>
      </div>
    </form>
  );
}
