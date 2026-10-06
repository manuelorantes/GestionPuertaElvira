import { Pencil, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { classroomLabel } from '@/features/classes/classrooms';
import type { ClassGroup } from '@/features/classes/api';
import { useGroup } from '@/features/classes/hooks';
import { LEVELS, WEEKLY_PLAN_LABEL } from '@/features/classes/levels';
import { addGroup } from '@/features/students/api';
import { useStudentMutation, useStudents } from '@/features/students/hooks';
import { useOverCapacityConfirm } from '@/features/students/useOverCapacityConfirm';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { OccupancyBar } from '@/shared/ui/OccupancyBar';
import { OccupancyByDay } from './OccupancyByDay';
import { Select } from '@/shared/ui/Select';
import { SidePanel } from '@/shared/ui/SidePanel';
import { useToast } from '@/shared/ui/Toast';

interface ClassGroupPanelProps {
  groupId: string;
  onClose: () => void;
  onEdit: (group: ClassGroup) => void;
}

export function ClassGroupPanel({ groupId, onClose, onEdit }: ClassGroupPanelProps) {
  const group = useGroup(groupId);
  const candidates = useStudents('active', '');
  const navigate = useNavigate();
  const toast = useToast();
  const overCapacity = useOverCapacityConfirm();
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const enrol = useStudentMutation(({ id, confirm }: { id: string; confirm: boolean }) =>
    addGroup(id, groupId, confirm),
  );

  if (!group.data) {
    return (
      <SidePanel labelledBy="group-loading" onClose={onClose}>
        <p id="group-loading" className="p-6 text-ink-muted">
          Cargando grupo…
        </p>
      </SidePanel>
    );
  }

  const g = group.data;
  const enrolled = new Set(g.students.map((s) => s.id));
  const options = (candidates.data?.items ?? [])
    .filter((s) => !enrolled.has(s.id))
    .map((s) => ({ value: s.id, label: s.fullName }));
  const name = options.find((o) => o.value === studentId)?.label ?? '';

  async function submit() {
    if (!studentId) return;
    setError(null);
    try {
      const ok = await overCapacity.run((confirm) => enrol.mutateAsync({ id: studentId, confirm }));
      if (ok) {
        toast(`${name} inscrito en ${g.name}`);
        setStudentId('');
      }
    } catch (failure) {
      setError(apiErrorMessage(failure));
    }
  }

  return (
    <SidePanel labelledBy="group-name" onClose={onClose}>
      <div className="border-b border-line-soft bg-surface-raised p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`mt-2 size-3.5 shrink-0 rounded-[4px] border ${LEVELS[g.level].className}`}
          />
          <div className="min-w-0 flex-1">
            <h2
              id="group-name"
              className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
            >
              {g.name}
            </h2>
            <p className="text-sm text-ink-muted">
              {g.slotLabel} · {classroomLabel(g.classroom)}
            </p>
            <p className="text-sm text-ink-muted">
              {g.teacher.fullName} · {WEEKLY_PLAN_LABEL[g.weeklyPlan]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-10 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
          >
            <X aria-hidden size={18} />
          </button>
        </div>
        <div className="mt-4">
          <OccupancyBar occupied={g.occupied} capacity={g.capacity} />
          <OccupancyByDay group={g} />
        </div>
        <Button variant="secondary" className="mt-4" onClick={() => onEdit(g)}>
          <Pencil aria-hidden size={16} />
          Editar grupo
        </Button>
      </div>
      <div className="flex flex-col gap-4 p-6">
        {error && <Alert>{error}</Alert>}
        <Card className="p-4">
          <h3 className="mb-2 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            Alumnos inscritos
          </h3>
          {g.students.length === 0 && (
            <p className="text-sm text-ink-muted">Todavía no hay alumnos en este grupo.</p>
          )}
          <ul className="divide-y divide-line">
            {g.students.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{s.fullName}</span>{' '}
                  <span className="text-[13px] text-ink-muted">
                    · {s.age === null ? 'edad sin indicar' : `${s.age} años`}
                  </span>
                  {s.attendanceLabel && (
                    <span className="block text-[13px] font-medium text-warning-fg">
                      Horario especial: {s.attendanceLabel}
                    </span>
                  )}
                </span>
                <Button variant="ghost" onClick={() => void navigate(`/panel/alumnos/${s.id}`)}>
                  Ver ficha
                </Button>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <Select
            label="Inscribir alumno"
            options={[{ value: '', label: 'Elige un alumno…' }, ...options]}
            value={studentId}
            onChange={setStudentId}
          />
          <Button
            onClick={() => void submit()}
            disabled={!studentId}
            busy={enrol.isPending}
            busyLabel="Inscribiendo…"
            className="shrink-0"
          >
            Inscribir
          </Button>
        </Card>
      </div>
      {overCapacity.message && (
        <ConfirmDialog
          title="Grupo completo"
          message={overCapacity.message}
          confirmLabel="Inscribir igualmente"
          onCancel={overCapacity.cancel}
          onConfirm={() =>
            overCapacity.confirm().then(
              () => toast(`${name} inscrito en ${g.name}`),
              (failure: unknown) => setError(apiErrorMessage(failure)),
            )
          }
        />
      )}
    </SidePanel>
  );
}
