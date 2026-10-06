import { ArrowLeft, Check, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import { useId, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { formatCents, monthName } from '@/features/billing/money';
import { useGroups } from '@/features/classes/hooks';
import {
  importRow,
  previewImport,
  type Candidate,
  type Decision,
  type ImportResult,
  type PreviewRow,
} from '@/features/import/api';
import { useStudents } from '@/features/students/hooks';
import { ApiError } from '@/shared/api/client';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { ToggleButton } from '@/shared/ui/ToggleButton';

type Outcome = { status: 'done'; result: ImportResult } | { status: 'failed'; message: string };

interface DuplicateWarning {
  line: number;
  message: string;
  candidates: Candidate[];
}

/** Decisión limpia para cada acción: vincular (con el mejor candidato), crear (con los datos de la hoja) u omitir. */
function decisionFor(row: PreviewRow, action: Decision['action']): Decision {
  if (action === 'skip') return { line: row.line, action };
  if (action === 'link') {
    const best = row.match?.id ?? row.suggestions[0]?.id;
    return best ? { line: row.line, action, studentId: best } : { line: row.line, action };
  }
  return {
    line: row.line,
    action,
    // Los grupos que la hoja ya nombra vienen elegidos; el resto se elige a mano.
    groupIds: row.groups.map((g) => g.groupId).filter((id): id is string => id !== null),
    fullName: row.fullName,
    birthDate: row.birthDate ?? '',
    guardianName: row.guardianName ?? '',
    guardianPhone: row.guardianPhone ?? '',
    email: row.email ?? '',
  };
}

/** Decisión inicial: vincular si hay coincidencia exacta; si no, proponer el alta. */
function initialDecision(row: PreviewRow): Decision {
  return decisionFor(row, row.match ? 'link' : 'create');
}

function summary(row: PreviewRow): string {
  const months = Object.entries(row.monthlyCents);
  const parts: string[] = [];
  if (months.length > 0) {
    const total = months.reduce((sum, [, cents]) => sum + cents, 0);
    parts.push(
      `${months.length} ${months.length === 1 ? 'mes' : 'meses'} (${months.map(([m]) => monthName(m).slice(0, 3)).join(', ')}) · ${formatCents(total)}`,
    );
  }
  if (row.membershipCents) parts.push(`socio ${formatCents(row.membershipCents)}`);
  if (row.kitCents) parts.push(`chándal y polo ${formatCents(row.kitCents)}`);
  if (row.federationCents) parts.push(`federativa ${formatCents(row.federationCents)}`);
  return parts.length > 0 ? `Se registrará: ${parts.join(' · ')}` : 'Sin cobros en la hoja';
}

function done(result: ImportResult): string {
  const parts = [result.action === 'link' ? 'vinculada' : 'alumno creado'];
  if (result.payments > 0)
    parts.push(`${result.payments} ${result.payments === 1 ? 'cobro' : 'cobros'}`);
  if (result.member) parts.push('socio');
  if (result.entries > 0)
    parts.push(`${result.entries} ${result.entries === 1 ? 'ingreso' : 'ingresos'}`);
  return `Importada: ${parts.join(' · ')}`;
}

/** Un alumno nuevo no se puede crear sin grupo, ni un menor sin teléfono del tutor; vincular exige elegir alumno. */
function problem(decision: Decision): string | null {
  if (decision.action === 'link')
    return decision.studentId ? null : 'Elige el alumno al que vincular.';
  if (decision.action !== 'create') return null;
  if ((decision.groupIds ?? []).filter(Boolean).length === 0) {
    return 'Elige un grupo para crear el alumno.';
  }
  if (!decision.birthDate) return 'Falta la fecha de nacimiento.';
  const age = new Date().getFullYear() - Number(decision.birthDate.slice(0, 4));
  if (age < 18 && (!decision.guardianName || !decision.guardianPhone))
    return 'Un menor necesita un tutor con teléfono.';
  return null;
}

interface RowCardProps {
  row: PreviewRow;
  decision: Decision;
  outcome: Outcome | undefined;
  busy: boolean;
  onChange: (decision: Decision) => void;
  onAccept: () => void;
  groups: { value: string; label: string }[];
  students: { value: string; label: string }[];
}

function RowCard({
  row,
  decision,
  outcome,
  busy,
  onChange,
  onAccept,
  groups,
  students,
}: RowCardProps) {
  const set = (changes: Partial<Decision>) => onChange({ ...decision, ...changes });
  const year = new Date().getFullYear();
  const linkOptions = [
    ...row.suggestions.map((s) => ({ value: s.id, label: `${s.fullName} (parecido)` })),
    ...students.filter((s) => !row.suggestions.some((c) => c.id === s.value)),
  ];
  const issue = problem(decision);
  const lookalike = row.suggestions[0];

  return (
    <li
      aria-label={row.fullName}
      className={`flex flex-col gap-3 border-t border-line-soft p-4 first:border-t-0 ${outcome?.status === 'done' ? 'bg-success-bg/30' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-ink-muted">Fila {row.line}</span>
        <span className="font-semibold">{row.fullName}</span>
        {row.match ? (
          <Badge tone="success">Encontrado: {row.match.fullName}</Badge>
        ) : lookalike ? (
          <Badge tone="warning">Posible duplicado: {lookalike.fullName}</Badge>
        ) : (
          <Badge>Nuevo</Badge>
        )}
        <span className="text-[13px] text-ink-muted">{summary(row)}</span>
      </div>
      {outcome?.status === 'done' ? (
        <p className="flex items-center gap-2 text-sm font-medium text-success-fg">
          <Check aria-hidden size={16} />
          {done(outcome.result)}
        </p>
      ) : (
        <>
          {row.warnings.map((w) => (
            <Alert key={w} tone="info">
              {w}
            </Alert>
          ))}
          {outcome?.status === 'failed' && <Alert>{outcome.message}</Alert>}
          {decision.action === 'create' && lookalike && (
            <Alert tone="info">
              Ya hay un alumno parecido ({lookalike.fullName}). Si es la misma persona, vincula la
              fila; si no, al aceptar se te pedirá confirmar que es otra.
            </Alert>
          )}
          <div
            role="group"
            aria-label={`Qué hacer con ${row.fullName}`}
            className="flex flex-wrap gap-2"
          >
            {(
              [
                ['link', 'Vincular a un alumno'],
                ['create', 'Crear alumno'],
                ['skip', 'Omitir'],
              ] as const
            ).map(([action, label]) => (
              <ToggleButton
                key={action}
                pressed={decision.action === action}
                onClick={() => decision.action !== action && onChange(decisionFor(row, action))}
                className="h-9 rounded-full font-medium"
              >
                {label}
              </ToggleButton>
            ))}
          </div>
          {decision.action === 'link' && (
            <Select
              label={`Alumno existente para ${row.fullName}`}
              value={decision.studentId ?? ''}
              onChange={(studentId) => set({ studentId })}
              options={[{ value: '', label: 'Elige un alumno' }, ...linkOptions]}
            />
          )}
          {decision.action === 'create' && (
            <div className="grid gap-3 rounded-sm bg-surface-muted p-3 sm:grid-cols-2">
              <TextField
                label="Nombre y apellidos"
                value={decision.fullName ?? ''}
                onChange={(e) => set({ fullName: e.target.value })}
              />
              <DateField
                label="Fecha de nacimiento"
                value={decision.birthDate ?? ''}
                onChange={(birthDate) => set({ birthDate })}
                fromYear={year - 90}
                toYear={year}
              />
              <TextField
                label="Tutor"
                value={decision.guardianName ?? ''}
                onChange={(e) => set({ guardianName: e.target.value })}
              />
              <TextField
                label="Teléfono del tutor"
                inputMode="tel"
                value={decision.guardianPhone ?? ''}
                onChange={(e) => set({ guardianPhone: e.target.value })}
              />
              <TextField
                label="Email"
                inputMode="email"
                value={decision.email ?? ''}
                onChange={(e) => set({ email: e.target.value })}
              />
              <div className="flex flex-col gap-3 sm:col-span-2">
                {/* Quien viene dos días puede ir a dos grupos de un solo día. */}
                {(decision.groupIds?.length ? decision.groupIds : ['']).map((groupId, index) => (
                  <Select
                    key={index}
                    label={index === 0 ? 'Grupo' : 'Otro grupo'}
                    value={groupId}
                    onChange={(value) =>
                      set({
                        groupIds: (decision.groupIds?.length ? decision.groupIds : ['']).map(
                          (g, i) => (i === index ? value : g),
                        ),
                      })
                    }
                    options={[{ value: '', label: 'Elige un grupo' }, ...groups]}
                  />
                ))}
                <Button
                  variant="ghost"
                  className="self-start"
                  onClick={() => set({ groupIds: [...(decision.groupIds ?? ['']), ''] })}
                >
                  <Plus aria-hidden size={16} />
                  Añadir otro grupo
                </Button>
              </div>
            </div>
          )}
          {decision.action !== 'skip' && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="md"
                disabled={issue !== null}
                busy={busy}
                busyLabel="Importando…"
                onClick={onAccept}
                aria-label={`Aceptar fila ${row.fullName}`}
              >
                Aceptar fila
              </Button>
              {issue && <p className="text-[13px] font-medium text-danger-fg">{issue}</p>}
            </div>
          )}
        </>
      )}
    </li>
  );
}

export function ImportPage() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [duplicate, setDuplicate] = useState<DuplicateWarning | null>(null);
  const [busyLine, setBusyLine] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const fileId = useId();
  const groups = useGroups();
  const students = useStudents('active', '');
  const refresh = useRefreshClubData();

  const list = rows ?? [];
  const decision = (row: PreviewRow) => decisions[row.line] ?? initialDecision(row);
  const pending = list.filter(
    (r) => outcomes[r.line]?.status !== 'done' && decision(r).action !== 'skip',
  );
  const ready = pending.filter((r) => problem(decision(r)) === null);
  const doneCount = list.filter((r) => outcomes[r.line]?.status === 'done').length;
  const skipped = list.filter((r) => decision(r).action === 'skip').length;
  const groupOptions = (groups.data ?? []).map((g) => ({
    value: g.id,
    label: `${g.name} · ${g.slotLabel}`,
  }));
  const studentOptions = (students.data?.items ?? []).map((s) => ({
    value: s.id,
    label: s.fullName,
  }));

  function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((contents) => setText(contents));
  }

  async function preview() {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const previewRows = await previewImport(text);
      setRows(previewRows);
      setDecisions(Object.fromEntries(previewRows.map((r) => [r.line, initialDecision(r)])));
      setOutcomes({});
    } catch (failure) {
      setPreviewError(apiErrorMessage(failure));
    } finally {
      setPreviewing(false);
    }
  }

  function candidatesOf(row: PreviewRow, ids: string): Candidate[] {
    const known = [
      ...row.suggestions,
      ...(students.data?.items ?? []).map((s) => ({ id: s.id, fullName: s.fullName })),
    ];
    return ids
      .split(',')
      .map((id) => id.trim())
      .map((id) => known.find((c) => c.id === id) ?? { id, fullName: 'otro alumno' });
  }

  /** Importa una fila; un posible duplicado abre el aviso en vez de marcar error. */
  async function accept(row: PreviewRow, override: Partial<Decision> = {}): Promise<boolean> {
    const chosen = { ...decision(row), ...override };
    // Los huecos de «Otro grupo» sin elegir no se envían.
    const current = chosen.groupIds
      ? { ...chosen, groupIds: chosen.groupIds.filter(Boolean) }
      : chosen;
    setDecisions((d) => ({ ...d, [row.line]: chosen }));
    setBusyLine(row.line);
    try {
      const result = await importRow(text, current);
      setOutcomes((o) => ({ ...o, [row.line]: { status: 'done', result } }));
      void refresh();
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'possible_duplicate') {
        const ids =
          typeof failure.details.candidates === 'string' ? failure.details.candidates : '';
        setDuplicate({
          line: row.line,
          message: failure.message,
          candidates: candidatesOf(row, ids),
        });
      } else {
        setOutcomes((o) => ({
          ...o,
          [row.line]: { status: 'failed', message: apiErrorMessage(failure) },
        }));
      }
      return false;
    } finally {
      setBusyLine(null);
    }
  }

  /** Acepta en orden todas las filas revisadas; las que avisan de duplicado se dejan para confirmar a mano. */
  async function acceptAll() {
    for (const row of ready) {
      if (decision(row).action === 'create' && row.suggestions.length > 0) continue;
      await accept(row);
    }
  }

  const duplicateRow = duplicate ? list.find((r) => r.line === duplicate.line) : undefined;

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <SectionHeader
        eyebrow="Desde la hoja de cálculo del club"
        title="Importar alumnos y cobros"
      />
      <Link
        to="/panel/alumnos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink-strong"
      >
        <ArrowLeft aria-hidden size={16} />
        Volver a Alumnos
      </Link>

      {rows === null ? (
        <Card className="flex flex-col gap-4 p-6">
          <p className="text-sm text-ink-soft">
            Exporta la hoja como CSV (Archivo → Descargar → CSV) o copia las celdas, con la fila de
            cabecera, y pégalas aquí. Se usan las columnas de nombre, Cuota Anual, Chándal y polo,
            Federativa, los meses de septiembre a junio, fecha de nacimiento, madre o padre,
            teléfono y email.
          </p>
          {previewError && <Alert>{previewError}</Alert>}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Celdas pegadas o contenido del CSV
            <textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                ',Fotos,,Cuota Anual,Chandal y polo,Federativa,Septiembre,Octubre,…\nNombre Apellidos,,,50,,,20,…'
              }
              className="rounded-sm border border-line-strong bg-surface p-3 font-mono text-xs leading-relaxed outline-none focus:border-brand"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={fileId}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-sm border border-line-strong px-4 text-sm font-semibold hover:bg-surface-muted"
            >
              <Upload aria-hidden size={18} />
              Elegir archivo CSV
              <input
                id={fileId}
                type="file"
                accept=".csv,.tsv,.txt,text/csv"
                onChange={readFile}
                className="sr-only"
              />
            </label>
            <Button
              disabled={!text.trim()}
              busy={previewing}
              busyLabel="Leyendo…"
              onClick={() => void preview()}
            >
              <FileSpreadsheet aria-hidden size={18} />
              Revisar la hoja
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-wrap items-center gap-4 px-6 py-4">
            <p className="flex-1 text-sm">
              <strong>{list.length} filas</strong> · {doneCount} importadas · {pending.length}{' '}
              pendientes · {skipped} omitidas
            </p>
            <Button variant="secondary" onClick={() => setRows(null)}>
              {pending.length === 0 ? 'Importar otra hoja' : 'Cambiar la hoja'}
            </Button>
            {pending.length > 0 && (
              <Button
                disabled={ready.length === 0 || busyLine !== null}
                onClick={() => void acceptAll()}
              >
                Importar todas las revisadas ({ready.length})
              </Button>
            )}
          </Card>
          {pending.length === 0 && (
            <Alert tone="info">
              Todas las filas están importadas u omitidas. Cada fila es una acción del historial: si
              algo no está bien, se puede deshacer allí una a una.
            </Alert>
          )}
          <p className="text-[13px] text-ink-muted">
            Cada fila se importa por separado al aceptarla: si una falla, las demás no se ven
            afectadas.
          </p>
          <Card>
            <ul aria-label="Filas de la hoja">
              {list.map((row) => (
                <RowCard
                  key={row.line}
                  row={row}
                  decision={decision(row)}
                  outcome={outcomes[row.line]}
                  busy={busyLine === row.line}
                  onChange={(d) => setDecisions({ ...decisions, [row.line]: d })}
                  onAccept={() => void accept(row)}
                  groups={groupOptions}
                  students={studentOptions}
                />
              ))}
            </ul>
          </Card>
        </div>
      )}

      {duplicate && duplicateRow && (
        <Dialog open onClose={() => setDuplicate(null)} labelledBy="duplicate-title">
          <div className="flex flex-col gap-4 p-6">
            <h2
              id="duplicate-title"
              className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
            >
              Posible duplicado
            </h2>
            <p className="text-sm text-ink-soft">{duplicate.message}</p>
            <p className="text-sm">
              Fila {duplicate.line}: <strong>{duplicateRow.fullName}</strong>
            </p>
            <div className="flex flex-col gap-2">
              {duplicate.candidates.map((c) => (
                <Button
                  key={c.id}
                  variant="secondary"
                  onClick={() => {
                    setDuplicate(null);
                    void accept(duplicateRow, { action: 'link', studentId: c.id });
                  }}
                >
                  Es la misma persona: vincular a {c.fullName}
                </Button>
              ))}
              <Button
                onClick={() => {
                  setDuplicate(null);
                  void accept(duplicateRow, { confirmDuplicate: true });
                }}
              >
                Es otra persona: crear igualmente
              </Button>
              <Button variant="ghost" onClick={() => setDuplicate(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </main>
  );
}
