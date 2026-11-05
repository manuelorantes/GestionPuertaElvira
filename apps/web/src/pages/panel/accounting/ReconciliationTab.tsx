import { useMutation } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  acceptReconciliation,
  adjustedFees,
  type Reconciliation,
  type ReconciliationAcceptance,
  type ReconciliationAppItem,
  type ReconciliationFee,
  type ReconciliationItem,
  reconcileStatement,
  releaseReconciliation,
} from '@/features/accounting/api';
import { useAccountingMutation, useCategoryOptions } from '@/features/accounting/hooks';
import { type BankMovement, readStatement, StatementError } from '@/features/accounting/statement';
import { formatCents } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Kpi } from '@/shared/ui/Kpi';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { ToggleButton } from '@/shared/ui/ToggleButton';
import { useToast } from '@/shared/ui/Toast';

import { AdjustFeesDialog } from './AdjustFeesDialog';
import { FeePicker } from './FeePicker';

type Filter = 'review' | 'matched' | 'all';

const STATUS = {
  matched: { label: 'Cuadra', tone: 'success' },
  suggested: { label: 'Sugerencia', tone: 'warning' },
  pending: { label: 'Por elegir', tone: 'neutral' },
} as const;

const METHOD: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  bank: 'Banco',
};

const keyOf = (i: { source: string; sourceId: string }) => `${i.source}:${i.sourceId}`;

/** Conciliación con el extracto del banco: solo superadministración (la pestaña no sale a las demás cuentas). */
export function ReconciliationTab() {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [movements, setMovements] = useState<BankMovement[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [filter, setFilter] = useState<Filter>('review');
  const reconcile = useMutation({ mutationFn: reconcileStatement });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReadError(null);
    setReading(true);
    try {
      const read = await readStatement(file);
      setMovements(read);
      reconcile.mutate(read);
    } catch (error) {
      setReadError(
        error instanceof StatementError
          ? error.message
          : 'No se ha podido leer el fichero: sube el Excel o el PDF del banco.',
      );
    } finally {
      setReading(false);
      if (input.current) input.current.value = '';
    }
  }

  const view = reconcile.data;
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold">Conciliar con el banco</h2>
          <p className="text-sm text-ink-muted">
            Sube el extracto de la cuenta (Excel o PDF de la banca online). Lo que cuadra queda
            recordado; lo demás no cambia hasta que aceptes cada sugerencia.
          </p>
        </div>
        <label htmlFor={inputId} className="shrink-0">
          <input
            ref={input}
            id={inputId}
            type="file"
            accept=".xls,.xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="sr-only"
            aria-label="Extracto del banco"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <span className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-sm bg-brand px-4 text-sm font-semibold text-surface-raised hover:bg-brand-strong">
            <FileUp aria-hidden size={18} />
            {reading || reconcile.isPending ? 'Leyendo…' : 'Subir extracto'}
          </span>
        </label>
      </Card>
      {readError && <Alert>{readError}</Alert>}
      {reconcile.isError && <Alert>{apiErrorMessage(reconcile.error)}</Alert>}
      {view && movements && (
        <ReconciliationResult
          view={view}
          filter={filter}
          onFilter={setFilter}
          onAccepted={() => reconcile.mutate(movements)}
        />
      )}
    </div>
  );
}

function ReconciliationResult({
  view,
  filter,
  onFilter,
  onAccepted,
}: {
  view: Reconciliation;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  onAccepted: () => void;
}) {
  const review = view.items.filter((i) => i.status !== 'matched');
  const shown =
    filter === 'all'
      ? view.items
      : filter === 'matched'
        ? view.items.filter((i) => i.status === 'matched')
        : review;
  const balance = (label: string, day: string, bank: number, app: number) => (
    <Kpi
      label={`${label} (${formatDate(day)})`}
      value={formatCents(bank)}
      hint={`En la app: ${formatCents(app)} · Diferencia: ${formatCents(bank - app)}`}
    />
  );
  return (
    <>
      <p className="text-sm text-ink-muted">
        Extracto del {formatDate(view.from)} al {formatDate(view.to)}: {view.items.length}{' '}
        movimientos.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {balance(
          'Saldo del banco al empezar',
          view.from,
          view.bank.openingCents,
          view.app.openingCents,
        )}
        {balance(
          'Saldo del banco al terminar',
          view.to,
          view.bank.closingCents,
          view.app.closingCents,
        )}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Qué movimientos ver">
        <ToggleButton pressed={filter === 'review'} onClick={() => onFilter('review')}>
          Por revisar ({review.length})
        </ToggleButton>
        <ToggleButton pressed={filter === 'matched'} onClick={() => onFilter('matched')}>
          Cuadran ({view.items.length - review.length})
        </ToggleButton>
        <ToggleButton pressed={filter === 'all'} onClick={() => onFilter('all')}>
          Todos
        </ToggleButton>
      </div>
      {shown.length === 0 ? (
        <p className="text-ink-muted">
          {filter === 'review' ? 'Todo cuadra con el banco.' : 'No hay movimientos.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((item) => (
            <li key={item.key}>
              <MovementCard item={item} onAccepted={onAccepted} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AppItemLine({ item }: { item: ReconciliationAppItem }) {
  return (
    <span className="flex flex-wrap gap-x-3 text-sm">
      <span className="text-ink-muted tabular-nums">{formatDate(item.date)}</span>
      <span className="min-w-0 flex-1">{item.concept}</span>
      <span className="text-ink-muted">{METHOD[item.method] ?? item.method}</span>
      <span className="font-semibold tabular-nums">{formatCents(item.amountCents)}</span>
    </span>
  );
}

type Mode = 'proposal' | 'choose' | 'record' | null;

function MovementCard({ item, onAccepted }: { item: ReconciliationItem; onAccepted: () => void }) {
  const { movement, proposal } = item;
  // Lo del banco siempre se puede elegir a mano o apuntar como un registro nuevo (salvo sacar o ingresar efectivo).
  const canRecord = ['income', 'expense', 'card_settlement'].includes(item.kind);
  const canFees = item.kind === 'income' || item.kind === 'card_settlement';
  const canChoose = canFees || item.candidates.length > 0;
  const recordKind = movement.amountCents < 0 ? 'expense' : 'income';
  const initialMode: Mode =
    item.status === 'matched'
      ? null
      : proposal
        ? 'proposal'
        : canChoose
          ? 'choose'
          : canRecord
            ? 'record'
            : null;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [concept, setConcept] = useState(
    proposal?.record?.concept ?? [...movement.concept].slice(0, 120).join(''),
  );
  const [category, setCategory] = useState(proposal?.record?.category ?? '');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [fees, setFees] = useState<ReconciliationFee[]>([]);
  const [confirming, setConfirming] = useState(false);
  const categories = useCategoryOptions(recordKind);
  const accept = useAccountingMutation(acceptReconciliation);
  const release = useAccountingMutation(releaseReconciliation);
  const toast = useToast();
  const target = Math.abs(movement.amountCents);
  const fixedSum = item.fixed.reduce((sum, i) => sum + i.amountCents, 0);
  const chosenItems = item.candidates.filter((c) => chosen.has(keyOf(c)));
  const chosenSum =
    fixedSum +
    chosenItems.reduce((sum, i) => sum + i.amountCents, 0) +
    fees.reduce((sum, f) => sum + f.amountCents, 0);
  const difference = target - chosenSum;
  // Con cuotas elegidas, lo que no cuadra se reparte entre ellas (sin dejar ninguna a cero).
  const adjustable =
    fees.length > 0 &&
    difference !== 0 &&
    adjustedFees(fees, difference).every((f) => f.chargedCents > 0);
  const recordCategory = category || categories[0]?.value || '';

  function send(acceptance: Omit<ReconciliationAcceptance, 'movement'>) {
    accept.mutate(
      { movement, ...acceptance },
      {
        onSuccess: () => {
          setConfirming(false);
          toast('Movimiento conciliado');
          onAccepted();
        },
      },
    );
  }

  function acceptProposal() {
    if (!proposal) return;
    send({
      items: proposal.items.map(({ source, sourceId }) => ({ source, sourceId })),
      record: proposal.record ? { concept: concept.trim(), category: recordCategory } : null,
      transfer: proposal.transfer !== null,
      fees: proposal.fees.map((f) => f.studentId),
      adjust: false,
    });
  }

  function acceptChosen(adjust: boolean) {
    send({
      items: [...item.fixed, ...chosenItems].map(({ source, sourceId }) => ({ source, sourceId })),
      record: null,
      transfer: false,
      fees: fees.map((f) => f.studentId),
      adjust,
    });
  }

  function undo() {
    release.mutate(movement, {
      onSuccess: () => {
        toast('Casamiento deshecho');
        onAccepted();
      },
    });
  }

  /** Los botones para pasar a las otras formas de casarlo. */
  const switches = (
    <>
      {proposal && mode !== 'proposal' && (
        <Button size="md" variant="ghost" onClick={() => setMode('proposal')}>
          Volver a la sugerencia
        </Button>
      )}
      {canChoose && mode !== 'choose' && (
        <Button size="md" variant="ghost" onClick={() => setMode('choose')}>
          Elegir a mano
        </Button>
      )}
      {canRecord && mode !== 'record' && !(mode === 'proposal' && proposal?.record) && (
        <Button size="md" variant="ghost" onClick={() => setMode('record')}>
          {recordKind === 'income' ? 'Crear un ingreso' : 'Crear un gasto'}
        </Button>
      )}
    </>
  );

  const status = STATUS[item.status];
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <span className="text-sm text-ink-muted tabular-nums">
          {formatDate(movement.operationDate)}
        </span>
        <span className="min-w-0 flex-1 font-medium break-words">{movement.concept}</span>
        <span
          className={`font-semibold tabular-nums ${movement.amountCents < 0 ? 'text-danger-fg' : 'text-success-fg'}`}
        >
          {formatCents(movement.amountCents)}
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="text-sm text-ink-soft">{item.note}</p>
      {item.matched.length > 0 && (
        <ul className="flex flex-col gap-1 border-l-2 border-line pl-3">
          {item.matched.map((m) => (
            <li key={keyOf(m)}>
              <AppItemLine item={m} />
            </li>
          ))}
        </ul>
      )}
      {item.status === 'matched' && (
        <div>
          <Button
            size="md"
            variant="ghost"
            busy={release.isPending}
            busyLabel="Deshaciendo…"
            onClick={undo}
          >
            Deshacer
          </Button>
        </div>
      )}
      {mode === 'proposal' && proposal && (
        <div className="flex flex-col gap-3 rounded-sm bg-surface-muted p-3">
          {proposal.changes.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {proposal.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          )}
          {proposal.items.length > 0 && proposal.changes.length === 0 && (
            <ul className="flex flex-col gap-1">
              {proposal.items.map((m) => (
                <li key={keyOf(m)}>
                  <AppItemLine item={m} />
                </li>
              ))}
            </ul>
          )}
          {proposal.record && (
            <RecordFields
              concept={concept}
              onConcept={setConcept}
              category={recordCategory}
              onCategory={setCategory}
              categories={categories}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="md"
              busy={accept.isPending}
              busyLabel="Aceptando…"
              disabled={proposal.record !== null && concept.trim() === ''}
              onClick={acceptProposal}
            >
              Aceptar
            </Button>
            {switches}
          </div>
        </div>
      )}
      {mode === 'choose' && (
        <fieldset className="flex flex-col gap-2 rounded-sm bg-surface-muted p-3">
          <legend className="sr-only">Lo que le corresponde en la app</legend>
          {item.fixed.length > 0 && (
            <>
              <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
                Ya cuenta
              </p>
              {item.fixed.map((m) => (
                <AppItemLine key={keyOf(m)} item={m} />
              ))}
            </>
          )}
          {item.candidates.length > 0 && (
            <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
              Elige lo que le corresponde
            </p>
          )}
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {item.candidates.map((c) => (
              <li key={keyOf(c)}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={chosen.has(keyOf(c))}
                    onChange={(e) => {
                      const next = new Set(chosen);
                      if (e.target.checked) next.add(keyOf(c));
                      else next.delete(keyOf(c));
                      setChosen(next);
                    }}
                  />
                  <AppItemLine item={c} />
                </label>
              </li>
            ))}
          </ul>
          {canFees && <FeePicker day={item.day} fees={fees} onChange={setFees} />}
          <p className="text-sm" aria-live="polite">
            Elegido: <strong className="tabular-nums">{formatCents(chosenSum)}</strong> de{' '}
            <span className="tabular-nums">{formatCents(target)}</span>
            {adjustable &&
              (difference > 0
                ? ` · ${formatCents(difference)} de más: quedará a su favor`
                : ` · faltan ${formatCents(-difference)}: quedará pendiente`)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="md"
              busy={accept.isPending && !confirming}
              busyLabel="Aceptando…"
              disabled={
                (chosenItems.length === 0 && fees.length === 0) || (difference !== 0 && !adjustable)
              }
              onClick={() => (difference === 0 ? acceptChosen(false) : setConfirming(true))}
            >
              Casar con lo elegido
            </Button>
            {switches}
          </div>
        </fieldset>
      )}
      {mode === 'record' && (
        <div className="flex flex-col gap-3 rounded-sm bg-surface-muted p-3">
          <p className="text-sm">
            {recordKind === 'income' ? 'Apuntar un ingreso' : 'Apuntar un gasto'} de{' '}
            {formatCents(target)} el {formatDate(item.day)}
            {item.kind === 'card_settlement' ? ' con tarjeta' : ''}
          </p>
          <RecordFields
            concept={concept}
            onConcept={setConcept}
            category={recordCategory}
            onCategory={setCategory}
            categories={categories}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="md"
              busy={accept.isPending}
              busyLabel="Aceptando…"
              disabled={concept.trim() === '' || recordCategory === ''}
              onClick={() =>
                send({
                  items: [],
                  record: { concept: concept.trim(), category: recordCategory },
                  transfer: false,
                  fees: [],
                  adjust: false,
                })
              }
            >
              Apuntar
            </Button>
            {switches}
          </div>
        </div>
      )}
      {mode === null && item.status !== 'matched' && switches}
      {confirming && (
        <AdjustFeesDialog
          fees={fees}
          bankCents={target}
          differenceCents={difference}
          busy={accept.isPending}
          error={accept.isError ? apiErrorMessage(accept.error) : null}
          onConfirm={() => acceptChosen(true)}
          onCancel={() => setConfirming(false)}
        />
      )}
      {accept.isError && !confirming && <Alert>{apiErrorMessage(accept.error)}</Alert>}
      {release.isError && <Alert>{apiErrorMessage(release.error)}</Alert>}
    </Card>
  );
}

function RecordFields({
  concept,
  onConcept,
  category,
  onCategory,
  categories,
}: {
  concept: string;
  onConcept: (concept: string) => void;
  category: string;
  onCategory: (category: string) => void;
  categories: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <TextField
        label="Concepto"
        value={concept}
        maxLength={120}
        onChange={(e) => onConcept(e.target.value)}
      />
      <Select label="Categoría" options={categories} value={category} onChange={onCategory} />
    </div>
  );
}
