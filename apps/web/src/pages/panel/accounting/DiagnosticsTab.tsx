import { Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  acceptFinding,
  dismissFinding,
  type Finding,
  type FindingStatus,
  type Severity,
} from '@/features/diagnostics/api';
import { useDiagnostics, useFindingDecision, useRunDiagnosis } from '@/features/diagnostics/hooks';
import { TeacherLink } from '@/pages/panel/payroll/TeacherLink';
import { StudentLink } from '@/pages/panel/students/StudentLink';
import { ApiError } from '@/shared/api/client';
import { madridDateTime } from '@/shared/dateTime';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';
import { ToggleButton } from '@/shared/ui/ToggleButton';

const STATUSES: { id: FindingStatus; label: string }[] = [
  { id: 'open', label: 'Abiertos' },
  { id: 'accepted', label: 'Aceptados' },
  { id: 'dismissed', label: 'Descartados' },
  { id: 'resolved', label: 'Resueltos solos' },
];

const SEVERITIES: { id: Severity; label: string; tone: 'danger' | 'warning' | 'neutral' }[] = [
  { id: 'money', label: 'Dinero', tone: 'danger' },
  { id: 'club', label: 'Datos del club', tone: 'warning' },
  { id: 'form', label: 'Forma', tone: 'neutral' },
];

const SECTION_TITLE = 'text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase';

/** Pestaña «Diagnóstico»: lo que no cuadra en los datos del club, explicado y con su solución. */
export function DiagnosticsTab() {
  const [status, setStatus] = useState<FindingStatus>('open');
  const diagnostics = useDiagnostics(status);
  const run = useRunDiagnosis();
  const toast = useToast();

  function diagnose() {
    void run.mutateAsync().then(
      (result) =>
        toast(
          result.newCount === 0
            ? 'Diagnóstico terminado: nada nuevo'
            : `Diagnóstico terminado: ${result.newCount} ${result.newCount === 1 ? 'hallazgo nuevo' : 'hallazgos nuevos'}`,
        ),
      () => undefined,
    );
  }

  const data = diagnostics.data;
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h3 className={SECTION_TITLE}>Último diagnóstico</h3>
            {data?.run ? (
              <p className="text-sm text-ink-soft">
                {madridDateTime(data.run.finishedAt)} · {data.run.launchedBy} ·{' '}
                <strong className="text-ink">
                  {data.run.openCount}{' '}
                  {data.run.openCount === 1 ? 'hallazgo abierto' : 'hallazgos abiertos'}
                </strong>
                {data.run.newCount > 0 && ` · ${data.run.newCount} nuevos`}
                {data.run.resolvedCount > 0 && ` · ${data.run.resolvedCount} resueltos solos`}
              </p>
            ) : (
              <p className="text-sm text-ink-soft">
                Todavía no se ha diagnosticado. Cada noche se ejecuta solo; también puedes lanzarlo
                ahora.
              </p>
            )}
          </div>
          <Button onClick={diagnose} busy={run.isPending} busyLabel="Diagnosticando…">
            <Stethoscope aria-hidden size={18} />
            Diagnosticar
          </Button>
        </div>
        {run.isError && <Alert>{apiErrorMessage(run.error)}</Alert>}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Estado de los hallazgos">
          {STATUSES.map((s) => (
            <ToggleButton key={s.id} pressed={status === s.id} onClick={() => setStatus(s.id)}>
              {s.label}
            </ToggleButton>
          ))}
        </div>
      </Card>
      {!data ? (
        <Card className="p-6 text-sm text-ink-muted">
          {diagnostics.isError ? 'No se ha podido cargar el diagnóstico.' : 'Cargando…'}
        </Card>
      ) : data.items.length === 0 ? (
        <Card className="p-6 text-sm text-ink-muted">
          {status === 'open' ? 'No hay nada que no cuadre.' : 'No hay hallazgos en este estado.'}
        </Card>
      ) : (
        SEVERITIES.map((severity) => (
          <SeverityGroup
            key={severity.id}
            severity={severity}
            findings={data.items.filter((f) => f.severity === severity.id)}
          />
        ))
      )}
    </div>
  );
}

function SeverityGroup({
  severity,
  findings,
}: {
  severity: (typeof SEVERITIES)[number];
  findings: Finding[];
}) {
  if (findings.length === 0) return null;
  const rules = [...new Set(findings.map((f) => f.ruleTitle))];
  return (
    <section aria-labelledby={`severity-${severity.id}`} className="flex flex-col gap-4">
      <h3 id={`severity-${severity.id}`} className="flex items-center gap-2">
        <Badge tone={severity.tone}>{severity.label}</Badge>
        <span className="text-sm text-ink-soft">
          {findings.length} {findings.length === 1 ? 'hallazgo' : 'hallazgos'}
        </span>
      </h3>
      {rules.map((rule) => (
        <div key={rule} className="flex flex-col gap-2">
          <h4 className={SECTION_TITLE}>{rule}</h4>
          <ul className="flex flex-col gap-2">
            {findings
              .filter((f) => f.ruleTitle === rule)
              .map((finding) => (
                <li key={finding.id}>
                  <FindingCard finding={finding} />
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** La entidad del hallazgo, con enlace a su ficha cuando la tiene. */
function EntityLabel({ finding }: { finding: Finding }) {
  const { kind, id, label } = finding.entity;
  const className = 'font-semibold text-ink-strong';
  if (kind === 'student')
    return (
      <StudentLink id={id} className={className}>
        {label}
      </StudentLink>
    );
  if (kind === 'teacher') return <TeacherLink id={id} name={label} />;
  if (kind === 'entry' || kind === 'invoice')
    return (
      <Link
        to={`/panel/contabilidad?pestana=${kind === 'entry' ? 'movimientos' : 'facturas'}`}
        className={`${className} decoration-1 underline-offset-2 hover:underline`}
      >
        {label}
      </Link>
    );
  return <span className={className}>{label}</span>;
}

function FindingCard({ finding }: { finding: Finding }) {
  const [confirming, setConfirming] = useState<'accept' | 'dismiss' | null>(null);
  const accept = useFindingDecision(acceptFinding);
  const dismiss = useFindingDecision(dismissFinding);
  const toast = useToast();
  const outdated =
    accept.error instanceof ApiError && accept.error.code === 'finding_outdated'
      ? 'Los datos han cambiado desde el diagnóstico. Vuelve a diagnosticar y revisa el hallazgo.'
      : null;

  function decide(kind: 'accept' | 'dismiss') {
    const mutation = kind === 'accept' ? accept : dismiss;
    void mutation.mutateAsync(finding.id).then(
      () => {
        setConfirming(null);
        toast(kind === 'accept' ? 'Arreglo aplicado' : 'Hallazgo descartado');
      },
      () => setConfirming(null),
    );
  }

  const closed = finding.status !== 'open';
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <EntityLabel finding={finding} />
        <span className="text-xs text-ink-muted">
          {closed && finding.closedAt
            ? `${statusLabel(finding.status)} ${madridDateTime(finding.closedAt)}${finding.closedBy ? ` · ${finding.closedBy}` : ''}`
            : `Detectado ${madridDateTime(finding.detectedAt)}`}
        </span>
      </div>
      <p className="text-sm text-ink">{finding.explanation}</p>
      <p className="text-sm text-ink-soft">
        <span className="font-semibold text-ink">Propuesta:</span> {finding.proposal}
      </p>
      {outdated && <Alert tone="warning">{outdated}</Alert>}
      {!outdated && accept.isError && <Alert>{apiErrorMessage(accept.error)}</Alert>}
      {dismiss.isError && <Alert>{apiErrorMessage(dismiss.error)}</Alert>}
      {!closed && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="md" onClick={() => setConfirming('dismiss')}>
            Descartar
          </Button>
          {finding.hasFix && (
            <Button size="md" onClick={() => setConfirming('accept')}>
              Aceptar
            </Button>
          )}
        </div>
      )}
      {confirming === 'accept' && (
        <ConfirmDialog
          title="Aplicar el arreglo"
          message={`${finding.proposal} El cambio queda en el historial a tu nombre.`}
          confirmLabel="Aceptar y aplicar"
          busy={accept.isPending}
          onConfirm={() => decide('accept')}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'dismiss' && (
        <ConfirmDialog
          title="Descartar el hallazgo"
          message="No volverá a salir mientras los datos de este caso sigan igual. Si cambian, se considera un caso nuevo."
          confirmLabel="Descartar"
          busy={dismiss.isPending}
          onConfirm={() => decide('dismiss')}
          onCancel={() => setConfirming(null)}
        />
      )}
    </Card>
  );
}

function statusLabel(status: FindingStatus): string {
  if (status === 'accepted') return 'Aceptado';
  if (status === 'dismissed') return 'Descartado';
  if (status === 'resolved') return 'Resuelto solo';
  return 'Abierto';
}
