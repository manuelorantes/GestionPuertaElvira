import {
  ArrowRightLeft,
  CalendarDays,
  ChevronRight,
  Clock,
  Pencil,
  Plus,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { useCanManageClub } from '@/features/auth/useCanManageClub';
import { REJOIN_ACTION } from '@/features/students/links';
import { classroomLabel } from '@/features/classes/classrooms';
import { useGroups } from '@/features/classes/hooks';
import { cancelCharge } from '@/features/billing/api';
import * as api from '@/features/students/api';
import { missingSentence } from '@/features/students/pending';
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

import { StudentAttendanceCard } from './StudentAttendanceCard';
import { StudentCommentsCard } from './StudentCommentsCard';
import { StudentBillingCard } from './StudentBillingCard';
import { StudentMaterialCard } from './StudentMaterialCard';
import { EnrolmentDialog } from './EnrolmentDialog';
import { PickerDialog } from './PickerDialog';
import { StudentDialog } from './StudentDialog';
import { DateDialog } from './DateDialog';
import { RejoinDialog } from './RejoinDialog';
import { WithdrawDialog } from './WithdrawDialog';
import { StudentLink } from './StudentLink';

type Action =
  | { kind: 'edit' }
  | { kind: 'withdraw' }
  | { kind: 'rejoin' }
  | { kind: 'addGroup' }
  | { kind: 'attendance'; groupId: string }
  | { kind: 'since'; groupId: string; groupName: string; since: string }
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
  const canManage = useCanManageClub();
  const groups = useGroups();
  const others = useStudents('active', '');
  const toast = useToast();
  const overCapacity = useOverCapacityConfirm();
  // Desde el aviso de «Nuevo alumno» se llega con «Dar de alta de nuevo» ya abierto.
  const [action, setAction] = useState<Action | null>(() =>
    searchParams.get('accion') === REJOIN_ACTION ? { kind: 'rejoin' } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const mutate = useStudentMutation(async (work: () => Promise<unknown>) => {
    await work();
  });
  const close = () => {
    const back = new URLSearchParams(searchParams);
    back.delete('accion');
    void navigate(`/panel/alumnos${back.size ? `?${back}` : ''}`);
  };

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
  /** Se ha dado de alta más de una vez: sus fechas son las últimas y se ve el historial. */
  const rejoined = s.membership.length > 1;
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
              <span className="font-semibold text-ink">Socio nº {s.memberNumber}</span>
              {' · '}
              {s.age === null ? 'Edad sin indicar' : `${s.age} años`}
              {s.groups[0] ? ` · ${s.groups[0].name}` : ' · Socio sin clases'}
            </p>
            {s.missingData.length > 0 && (
              <p className="mt-1 text-[13px] font-medium text-warning-fg">
                {missingSentence(s.missingData)}
              </p>
            )}
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
        {canManage && (
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
            {isWithdrawn && (
              <Button variant="secondary" onClick={() => setAction({ kind: 'rejoin' })}>
                <UserPlus aria-hidden size={16} />
                Dar de alta de nuevo
              </Button>
            )}
          </div>
        )}
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
                  {g.attendanceLabel && (
                    <p className="text-[13px] font-medium text-warning-fg">
                      Horario especial: {g.attendanceLabel}
                    </p>
                  )}
                  <p className="text-[13px] text-ink-muted">
                    {classroomLabel(g.classroom)} · {g.teacherName}
                  </p>
                  <p className="text-[13px] text-ink-muted">
                    En el grupo desde {formatDate(g.since)}
                  </p>
                </div>
                {!isWithdrawn && canManage && (
                  <>
                    <button
                      type="button"
                      aria-label={`Desde cuándo está en ${g.name}`}
                      title="Desde cuándo está en el grupo"
                      onClick={() =>
                        setAction({
                          kind: 'since',
                          groupId: g.id,
                          groupName: g.name,
                          since: g.since,
                        })
                      }
                      className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                    >
                      <CalendarDays aria-hidden size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Horario en ${g.name}`}
                      title="Horario especial"
                      onClick={() => setAction({ kind: 'attendance', groupId: g.id })}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                    >
                      <Clock aria-hidden size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Mover de ${g.name}`}
                      title="Mover a otro grupo"
                      onClick={() => setAction({ kind: 'move', groupId: g.id, groupName: g.name })}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                    >
                      <ArrowRightLeft aria-hidden size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar de ${g.name}`}
                      title="Quitar del grupo"
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
          {!isWithdrawn && canManage && (
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
          <Row label={rejoined ? 'Última alta en el club' : 'Alta en el club'}>
            {formatDate(s.joinedOn)}
          </Row>
          <Row label={rejoined ? 'Última baja en el club' : 'Baja'}>
            {formatDate(s.withdrawnOn)}
          </Row>
          {rejoined && (
            <div className="mt-2 border-t border-line-soft pt-2">
              <p className="text-sm font-medium">Altas y bajas</p>
              <ul aria-label="Altas y bajas" className="mt-1 text-[13px] text-ink-muted">
                {[...s.membership].reverse().map((p) => (
                  <li key={p.joinedOn}>
                    {p.withdrawnOn
                      ? `Del ${formatDate(p.joinedOn)} al ${formatDate(p.withdrawnOn)}`
                      : `Desde el ${formatDate(p.joinedOn)}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card className="p-4">
          <CardTitle>Contacto</CardTitle>
          {s.guardians.length === 0 && !s.ownPhone && (
            <p className="py-1.5 text-sm text-ink-muted">Sin teléfonos de contacto.</p>
          )}
          {s.guardians.map((g) => (
            <Row key={g.name} label={g.name}>
              {g.phone ? <a href={telHref(g.phone)}>{g.phone}</a> : 'Sin teléfono'}
            </Row>
          ))}
          {s.ownPhone && (
            <Row label="Teléfono del alumno">
              <a href={telHref(s.ownPhone)}>{s.ownPhone}</a>
            </Row>
          )}
        </Card>
        <Card className="p-4">
          <CardTitle>Familia directa en el club</CardTitle>
          {s.siblings.length === 0 && (
            <p className="py-1.5 text-sm text-ink-muted">No tiene familia directa en el club.</p>
          )}
          {s.siblings.map((sibling) => (
            <div key={sibling.id} className="flex items-center gap-2 py-1.5 text-sm">
              <StudentLink id={sibling.id} className="flex-1 font-medium">
                {sibling.fullName}
              </StudentLink>
              <button
                type="button"
                onClick={() => void navigate(`/panel/alumnos/${sibling.id}`)}
                className="flex cursor-pointer items-center text-brand"
              >
                Abrir
                <ChevronRight aria-hidden size={16} />
              </button>
              {canManage && (
                <button
                  type="button"
                  aria-label={`Quitar de la familia directa a ${sibling.fullName}`}
                  onClick={() =>
                    void mutate
                      .mutateAsync(() => api.unlinkSibling(s.id, sibling.id))
                      .then(
                        () => done('Familiar desvinculado'),
                        (failure: unknown) => setError(apiErrorMessage(failure)),
                      )
                  }
                  className="flex size-8 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                >
                  <X aria-hidden size={14} />
                </button>
              )}
            </div>
          ))}
          {canManage && (
            <Button variant="ghost" className="mt-2" onClick={() => setAction({ kind: 'sibling' })}>
              <Plus aria-hidden size={16} />
              Añadir familia directa
            </Button>
          )}
        </Card>
        <StudentBillingCard studentId={s.id} title={(text) => <CardTitle>{text}</CardTitle>} />
        <StudentMaterialCard studentId={s.id} title={(text) => <CardTitle>{text}</CardTitle>} />
        <StudentAttendanceCard studentId={s.id} title={(text) => <CardTitle>{text}</CardTitle>} />
        <StudentCommentsCard studentId={s.id} title={(text) => <CardTitle>{text}</CardTitle>} />
      </div>

      {action?.kind === 'edit' && (
        <StudentDialog detail={s} onClose={() => setAction(null)} onSaved={() => setAction(null)} />
      )}
      {action?.kind === 'withdraw' && (
        <WithdrawDialog
          studentId={s.id}
          name={s.fullName.split(' ')[0] ?? s.fullName}
          onClose={() => setAction(null)}
          onWithdraw={(date, cancelChargeIds) =>
            mutate
              .mutateAsync(async () => {
                await api.withdrawStudent(s.id, date);
                for (const id of cancelChargeIds) await cancelCharge(id);
              })
              .then(() =>
                done(
                  cancelChargeIds.length > 0
                    ? `Baja registrada y ${cancelChargeIds.length} ${cancelChargeIds.length === 1 ? 'cuota cancelada' : 'cuotas canceladas'}`
                    : 'Baja registrada',
                ),
              )
          }
        />
      )}
      {action?.kind === 'rejoin' && isWithdrawn && (
        <RejoinDialog
          name={s.fullName.split(' ')[0] ?? s.fullName}
          groups={groups.data ?? []}
          onClose={() => setAction(null)}
          onRejoin={(date, groupIds) =>
            enrolWithConfirm(
              (confirm) => api.rejoinStudent(s.id, date, groupIds, confirm),
              'Alta registrada',
            )
          }
        />
      )}
      {action?.kind === 'addGroup' && (
        <EnrolmentDialog
          title="Añadir grupo"
          confirmLabel="Añadir"
          startLabel="Desde"
          groups={(groups.data ?? []).filter((g) => !s.groups.some((mine) => mine.id === g.id))}
          onClose={() => setAction(null)}
          onConfirm={(groupId, attendance, from) =>
            enrolWithConfirm(
              (confirm) => api.addGroup(s.id, groupId, confirm, attendance, from),
              'Grupo añadido',
            )
          }
        />
      )}
      {action?.kind === 'since' && (
        <DateDialog
          title={`Desde cuándo está en ${action.groupName}`}
          label="En el grupo desde"
          initial={action.since}
          help="Por ejemplo, si venía antes de que se le inscribiera. Cuenta para sus listas y sus cuotas."
          confirmLabel="Guardar"
          onClose={() => setAction(null)}
          onConfirm={(from) =>
            mutate
              .mutateAsync(() => api.changeEnrolmentStart(s.id, action.groupId, from))
              .then(() => done('Fecha guardada'))
          }
        />
      )}
      {action?.kind === 'attendance' && (
        <EnrolmentDialog
          title="Horario en el grupo"
          confirmLabel="Guardar"
          groups={groups.data ?? []}
          fixedGroup={(groups.data ?? []).find((g) => g.id === action.groupId)}
          current={s.groups.find((g) => g.id === action.groupId)?.attendance ?? null}
          onClose={() => setAction(null)}
          onConfirm={(groupId, attendance) =>
            enrolWithConfirm(
              (confirm) => api.changeAttendance(s.id, groupId, attendance, confirm),
              'Horario guardado',
            )
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
          title="Añadir familia directa"
          label="Alumno"
          options={(others.data?.items ?? [])
            .filter((o) => o.id !== s.id && !s.siblings.some((sib) => sib.id === o.id))
            .map((o) => ({ value: o.id, label: o.fullName }))}
          confirmLabel="Vincular"
          onClose={() => setAction(null)}
          onPick={(siblingId) =>
            mutate
              .mutateAsync(() => api.linkSibling(s.id, siblingId))
              .then(() => done('Familiar vinculado'))
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
