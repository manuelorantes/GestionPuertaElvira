import { ArrowRightLeft, ChevronRight, Pencil, Plus, UserMinus, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { classroomLabel } from '@/features/classes/classrooms';
import { useGroups } from '@/features/classes/hooks';
import * as api from '@/features/students/api';
import { formatDate, telHref } from '@/features/students/format';
import { useStudent, useStudentMutation, useStudents } from '@/features/students/hooks';
import { useOverCapacityConfirm } from '@/features/students/useOverCapacityConfirm';
import { Alert } from '@/shared/ui/Alert';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { SidePanel } from '@/shared/ui/SidePanel';
import { useToast } from '@/shared/ui/Toast';

import { StudentBillingCard } from './StudentBillingCard';
import { PickerDialog } from './PickerDialog';
import { StudentDialog } from './StudentDialog';
import { WithdrawDialog } from './WithdrawDialog';

type Action =
  | { kind: 'edit' }
  | { kind: 'withdraw' }
  | { kind: 'addGroup' }
  | { kind: 'move'; groupId: string; groupName: string }
  | { kind: 'sibling' };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
      {children}
    </h3>
  );
}

export function StudentPanel() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const student = useStudent(id);
  const groups = useGroups();
  const others = useStudents('active', '');
  const toast = useToast();
  const overCapacity = useOverCapacityConfirm();
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutate = useStudentMutation(async (work: () => Promise<unknown>) => {
    await work();
  });
  const close = () => void navigate(`/panel/alumnos${searchParams.size ? `?${searchParams}` : ''}`);

  if (!student.data) {
    return (
      <SidePanel labelledBy="student-loading" onClose={close}>
        <p id="student-loading" className="p-6 text-ink-muted">
          {student.isError ? 'No se ha encontrado el alumno.' : 'Cargando ficha…'}
        </p>
      </SidePanel>
    );
  }

  const s = student.data;
  const isWithdrawn = s.status === 'withdrawn';
  const done = (message: string) => {
    setAction(null);
    setError(null);
    toast(message);
  };
  const groupOptions = (exclude: string[]) =>
    (groups.data ?? [])
      .filter((g) => !exclude.includes(g.id))
      .map((g) => ({
        value: g.id,
        label: `${g.name} · ${g.slotLabel} · ${g.occupied}/${g.capacity}`,
      }));
  const enrolWithConfirm = async (
    attempt: (confirm: boolean) => Promise<unknown>,
    message: string,
  ) => {
    const ok = await overCapacity.run((confirm) => mutate.mutateAsync(() => attempt(confirm)));
    if (ok) done(message);
    else setAction(null);
  };

  async function removeGroup(groupId: string, groupName: string) {
    try {
      await mutate.mutateAsync(() => api.removeGroup(s.id, groupId));
      done(`Quitado de ${groupName}`);
    } catch (failure) {
      setError(apiErrorMessage(failure));
    }
  }

  return (
    <SidePanel labelledBy="student-name" onClose={close}>
      <div className="border-b border-line-soft bg-surface-raised p-6">
        <div className="flex items-start gap-4">
          <Avatar name={s.fullName} size={56} />
          <div className="min-w-0 flex-1">
            <h2
              id="student-name"
              className="font-display text-2xl leading-tight font-bold tracking-[0.04em] uppercase"
            >
              {s.fullName}
            </h2>
            <p className="text-sm text-ink-muted">
              {s.age} años{s.groups[0] ? ` · ${s.groups[0].name}` : ''}
            </p>
            <div className="mt-2">
              <Badge tone={isWithdrawn ? 'neutral' : s.withdrawnOn ? 'warning' : 'success'}>
                {isWithdrawn
                  ? 'De baja'
                  : s.withdrawnOn
                    ? `Baja el ${formatDate(s.withdrawnOn)}`
                    : 'Activo'}
              </Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="flex size-10 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
          >
            <X aria-hidden size={18} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setAction({ kind: 'edit' })}>
            <Pencil aria-hidden size={16} />
            Editar
          </Button>
          {!s.withdrawnOn && (
            <Button variant="secondary" onClick={() => setAction({ kind: 'withdraw' })}>
              <UserMinus aria-hidden size={16} />
              Dar de baja
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4 p-6">
        {error && <Alert>{error}</Alert>}
        <Card className="p-4">
          <CardTitle>Grupos</CardTitle>
          {s.groups.length === 0 && <p className="text-sm text-ink-muted">Sin grupos activos.</p>}
          <ul className="flex flex-col divide-y divide-line">
            {s.groups.map((g) => (
              <li key={g.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{g.name}</p>
                  <p className="text-[13px] text-ink-muted">{g.slotLabel}</p>
                  <p className="text-[13px] text-ink-muted">
                    {classroomLabel(g.classroom)} · {g.teacherName}
                  </p>
                </div>
                {!isWithdrawn && (
                  <>
                    <button
                      type="button"
                      aria-label={`Mover de ${g.name}`}
                      onClick={() => setAction({ kind: 'move', groupId: g.id, groupName: g.name })}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                    >
                      <ArrowRightLeft aria-hidden size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar de ${g.name}`}
                      onClick={() => void removeGroup(g.id, g.name)}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                    >
                      <X aria-hidden size={16} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {!isWithdrawn && (
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => setAction({ kind: 'addGroup' })}
            >
              <Plus aria-hidden size={16} />
              Añadir grupo
            </Button>
          )}
        </Card>
        <Card className="p-4">
          <CardTitle>Datos personales</CardTitle>
          <Row label="Fecha de nacimiento">{formatDate(s.birthDate)}</Row>
          <Row label="DNI">{s.nationalId ?? '—'}</Row>
          <Row label="Email">{s.contactEmail ?? '—'}</Row>
          <Row label="Federado">{s.federationLicence ? `Sí · ${s.federationLicence}` : 'No'}</Row>
          <Row label="Autorización de imagen">{s.imageConsent ? 'Sí' : 'No'}</Row>
          <Row label="Alta en el club">{formatDate(s.joinedOn)}</Row>
          <Row label="Baja">{formatDate(s.withdrawnOn)}</Row>
        </Card>
        <Card className="p-4">
          <CardTitle>Familia y contacto</CardTitle>
          {s.guardians.map((g) => (
            <Row key={g.name} label={g.name}>
              <a href={telHref(g.phone)}>{g.phone}</a>
            </Row>
          ))}
          {s.ownPhone && (
            <Row label="Teléfono del alumno">
              <a href={telHref(s.ownPhone)}>{s.ownPhone}</a>
            </Row>
          )}
          {s.siblings.map((sibling) => (
            <div key={sibling.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="flex-1">
                Hermano/a en el club: <strong>{sibling.fullName}</strong>
              </span>
              <button
                type="button"
                onClick={() => void navigate(`/panel/alumnos/${sibling.id}`)}
                className="flex cursor-pointer items-center text-brand"
              >
                Abrir
                <ChevronRight aria-hidden size={16} />
              </button>
              <button
                type="button"
                aria-label={`Quitar hermano ${sibling.fullName}`}
                onClick={() =>
                  void mutate
                    .mutateAsync(() => api.unlinkSibling(s.id, sibling.id))
                    .then(
                      () => done('Hermanos desvinculados'),
                      (failure: unknown) => setError(apiErrorMessage(failure)),
                    )
                }
                className="flex size-8 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
              >
                <X aria-hidden size={14} />
              </button>
            </div>
          ))}
          <Button variant="ghost" className="mt-2" onClick={() => setAction({ kind: 'sibling' })}>
            <Plus aria-hidden size={16} />
            Añadir hermano
          </Button>
        </Card>
        <StudentBillingCard studentId={s.id} title={(text) => <CardTitle>{text}</CardTitle>} />
      </div>

      {action?.kind === 'edit' && (
        <StudentDialog detail={s} onClose={() => setAction(null)} onSaved={() => setAction(null)} />
      )}
      {action?.kind === 'withdraw' && (
        <WithdrawDialog
          name={s.fullName.split(' ')[0] ?? s.fullName}
          onClose={() => setAction(null)}
          onWithdraw={(date) =>
            mutate
              .mutateAsync(() => api.withdrawStudent(s.id, date))
              .then(() => done('Baja registrada'))
          }
        />
      )}
      {action?.kind === 'addGroup' && (
        <PickerDialog
          title="Añadir grupo"
          label="Grupo"
          options={groupOptions(s.groups.map((g) => g.id))}
          confirmLabel="Añadir"
          onClose={() => setAction(null)}
          onPick={(groupId) =>
            enrolWithConfirm((confirm) => api.addGroup(s.id, groupId, confirm), 'Grupo añadido')
          }
        />
      )}
      {action?.kind === 'move' && (
        <PickerDialog
          title={`Mover de ${action.groupName}`}
          label="Grupo"
          options={groupOptions(s.groups.map((g) => g.id))}
          confirmLabel="Mover"
          onClose={() => setAction(null)}
          onPick={(groupId) =>
            enrolWithConfirm(
              (confirm) => api.moveGroup(s.id, action.groupId, groupId, confirm),
              'Alumno movido de grupo',
            )
          }
        />
      )}
      {action?.kind === 'sibling' && (
        <PickerDialog
          title="Añadir hermano"
          label="Alumno"
          options={(others.data?.items ?? [])
            .filter((o) => o.id !== s.id && !s.siblings.some((sib) => sib.id === o.id))
            .map((o) => ({ value: o.id, label: o.fullName }))}
          confirmLabel="Vincular"
          onClose={() => setAction(null)}
          onPick={(siblingId) =>
            mutate
              .mutateAsync(() => api.linkSibling(s.id, siblingId))
              .then(() => done('Hermanos vinculados'))
          }
        />
      )}
      {overCapacity.message && (
        <ConfirmDialog
          title="Grupo completo"
          message={overCapacity.message}
          confirmLabel="Inscribir igualmente"
          onCancel={overCapacity.cancel}
          onConfirm={() =>
            overCapacity.confirm().then(
              () => done('Inscripción guardada'),
              (failure: unknown) => setError(apiErrorMessage(failure)),
            )
          }
        />
      )}
    </SidePanel>
  );
}
