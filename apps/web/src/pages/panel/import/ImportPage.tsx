import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, FileSpreadsheet, Upload } from 'lucide-react';
import { useId, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { formatCents, monthName } from '@/features/billing/money';
import { useGroups } from '@/features/classes/hooks';
import {
  applyImport,
  previewImport,
  type Decision,
  type ImportResult,
  type PreviewRow,
} from '@/features/import/api';
import { useStudents } from '@/features/students/hooks';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { DateField } from '@/shared/ui/DateField';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { ToggleButton } from '@/shared/ui/ToggleButton';

/** Decisión inicial: vincular si hay coincidencia exacta; si no, proponer el alta. */
function initialDecision(row: PreviewRow): Decision {
  return decisionFor(row, row.match ? 'link' : 'create');
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
    groupIds: [],
    fullName: row.fullName,
    birthDate: row.birthDate ?? '',
    guardianName: row.guardianName ?? '',
    guardianPhone: row.guardianPhone ?? '',
    email: row.email ?? '',
  };
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

/** Un alumno nuevo no se puede crear sin grupo, ni un menor sin teléfono del tutor. */
function problem(decision: Decision): string | null {
  if (decision.action !== 'create') return null;
  if ((decision.groupIds ?? []).length === 0) return 'Elige un grupo para crear el alumno.';
  if (!decision.birthDate) return 'Falta la fecha de nacimiento.';
  const age = new Date().getFullYear() - Number(decision.birthDate.slice(0, 4));
  if (age < 18 && (!decision.guardianName || !decision.guardianPhone))
    return 'Un menor necesita un tutor con teléfono.';
  return null;
}

interface RowCardProps {
  row: PreviewRow;
  decision: Decision;
  onChange: (decision: Decision) => void;
  groups: { value: string; label: string }[];
  students: { value: string; label: string }[];
}

function RowCard({ row, decision, onChange, groups, students }: RowCardProps) {
  const set = (changes: Partial<Decision>) => onChange({ ...decision, ...changes });
  const year = new Date().getFullYear();
  const linkOptions = [
    ...row.suggestions.map((s) => ({ value: s.id, label: `${s.fullName} (parecido)` })),
    ...students.filter((s) => !row.suggestions.some((c) => c.id === s.value)),
  ];
  const issue = problem(decision);

  return (
    <li className="flex flex-col gap-3 border-t border-line-soft p-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-ink-muted">Fila {row.line}</span>
        <span className="font-semibold">{row.fullName}</span>
        {row.match ? (
          <Badge tone="success">Encontrado: {row.match.fullName}</Badge>
        ) : row.suggestions.length > 0 ? (
          <Badge tone="warning">Parecido a {row.suggestions[0]?.fullName}</Badge>
        ) : (
          <Badge>Nuevo</Badge>
        )}
        <span className="text-[13px] text-ink-muted">{summary(row)}</span>
      </div>
      {row.warnings.map((w) => (
        <Alert key={w} tone="info">
          {w}
        </Alert>
      ))}
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
          <Select
            label="Grupo"
            value={decision.groupIds?.[0] ?? ''}
            onChange={(groupId) => set({ groupIds: groupId ? [groupId] : [] })}
            options={[{ value: '', label: 'Elige un grupo' }, ...groups]}
          />
          {issue && <p className="text-[13px] font-medium text-danger-fg sm:col-span-2">{issue}</p>}
        </div>
      )}
    </li>
  );
}

export function ImportPage() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileId = useId();
  const groups = useGroups();
  const students = useStudents('active', '');
  const refresh = useRefreshClubData();
  const preview = useMutation({
    mutationFn: previewImport,
    onSuccess: (previewRows) => {
      setRows(previewRows);
      setDecisions(Object.fromEntries(previewRows.map((r) => [r.line, initialDecision(r)])));
    },
  });
  const apply = useMutation({
    mutationFn: (rowsToApply: Decision[]) => applyImport(text, rowsToApply),
    onSuccess: refresh,
  });

  function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((contents) => setText(contents));
  }

  const list = rows ?? [];
  const pendingIssues = list.filter(
    (r) =>
      problem(decisions[r.line] ?? initialDecision(r)) !== null ||
      (decisions[r.line]?.action === 'link' && !decisions[r.line]?.studentId),
  );
  const counts = {
    link: list.filter((r) => decisions[r.line]?.action === 'link').length,
    create: list.filter((r) => decisions[r.line]?.action === 'create').length,
    skip: list.filter((r) => decisions[r.line]?.action === 'skip').length,
  };
  const groupOptions = (groups.data ?? []).map((g) => ({
    value: g.id,
    label: `${g.name} · ${g.slotLabel}`,
  }));
  const studentOptions = (students.data?.items ?? []).map((s) => ({
    value: s.id,
    label: s.fullName,
  }));

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

      {result ? (
        <Card className="flex flex-col gap-4 p-6">
          <h2 className="font-display text-xl font-semibold tracking-[0.04em] uppercase">
            Importación hecha
          </h2>
          <ul className="list-disc pl-5 text-sm">
            <li>
              {result.created} alumnos creados y {result.linked} vinculados ({result.skipped} filas
              omitidas)
            </li>
            <li>{result.payments} cobros registrados</li>
            <li>{result.members} socios</li>
            <li>{result.entries} ingresos en Contabilidad</li>
          </ul>
          <p className="text-[13px] text-ink-muted">
            Si algo no está bien, en Historial puedes deshacer la importación entera.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setResult(null);
                setRows(null);
                setText('');
              }}
            >
              Importar otra hoja
            </Button>
            <Link
              to="/panel/alumnos"
              className="inline-flex h-11 items-center rounded-sm border border-line-strong px-4 text-sm font-semibold hover:bg-surface-muted"
            >
              Ver alumnos
            </Link>
          </div>
        </Card>
      ) : rows === null ? (
        <Card className="flex flex-col gap-4 p-6">
          <p className="text-sm text-ink-soft">
            Exporta la hoja como CSV (Archivo → Descargar → CSV) o copia las celdas, con la fila de
            cabecera, y pégalas aquí. Se usan las columnas de nombre, Cuota Anual, Chándal y polo,
            Federativa, los meses de septiembre a junio, fecha de nacimiento, madre o padre,
            teléfono y email.
          </p>
          {preview.isError && <Alert>{apiErrorMessage(preview.error)}</Alert>}
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
              busy={preview.isPending}
              busyLabel="Leyendo…"
              onClick={() => preview.mutate(text)}
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
              <strong>{list.length} filas</strong> · {counts.link} a vincular · {counts.create} a
              crear · {counts.skip} omitidas
            </p>
            <Button variant="secondary" onClick={() => setRows(null)}>
              Cambiar la hoja
            </Button>
            <Button
              disabled={pendingIssues.length > 0 || list.length === counts.skip}
              onClick={() => setConfirming(true)}
            >
              Importar {list.length - counts.skip} filas
            </Button>
          </Card>
          {apply.isError && <Alert>{apiErrorMessage(apply.error)}</Alert>}
          {pendingIssues.length > 0 && (
            <Alert tone="info">
              Revisa {pendingIssues.length} {pendingIssues.length === 1 ? 'fila' : 'filas'} antes de
              importar: {pendingIssues.map((r) => r.fullName).join(', ')}.
            </Alert>
          )}
          <Card>
            <ul aria-label="Filas de la hoja">
              {list.map((row) => (
                <RowCard
                  key={row.line}
                  row={row}
                  decision={decisions[row.line] ?? initialDecision(row)}
                  onChange={(d) => setDecisions({ ...decisions, [row.line]: d })}
                  groups={groupOptions}
                  students={studentOptions}
                />
              ))}
            </ul>
          </Card>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title={`¿Importar ${list.length - counts.skip} filas?`}
          message={`Se crearán ${counts.create} alumnos, se vincularán ${counts.link} y se registrarán sus cobros, cuotas de socio e ingresos. Todo o nada, y quedará en el historial como una sola acción que se puede deshacer.`}
          confirmLabel="Importar"
          busy={apply.isPending}
          error={apply.isError ? apiErrorMessage(apply.error) : null}
          onCancel={() => {
            apply.reset();
            setConfirming(false);
          }}
          onConfirm={() =>
            void apply.mutateAsync(list.map((r) => decisions[r.line] ?? initialDecision(r))).then(
              (done) => {
                setConfirming(false);
                setResult(done);
              },
              () => undefined,
            )
          }
        />
      )}
    </main>
  );
}
