import { Minus, Plus, X } from 'lucide-react';

import type { ClassGroup, Teacher } from '@/features/classes/api';
import { CLASSROOMS, classroomLabel } from '@/features/classes/classrooms';
import { LEVEL_OPTIONS } from '@/features/classes/levels';
import { formatHours, halfHours, WEEKDAYS } from '@/features/classes/schedule';
import { useGroupForm } from '@/features/classes/useGroupForm';
import type { Level } from '@/features/classes/api';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { ToggleButton } from '@/shared/ui/ToggleButton';

const START_OPTIONS = halfHours('16:00', '20:30').map((time) => ({ value: time, label: time }));
const END_OPTIONS = halfHours('16:30', '21:00').map((time) => ({ value: time, label: time }));

interface ClassGroupDialogProps {
  group: ClassGroup | null;
  teachers: Teacher[] | undefined;
  onClose: () => void;
  onSaved: (name: string) => void;
}

/** Espera a tener los profesores para que el formulario arranque con un profesor por defecto. */
export function ClassGroupDialog({ teachers, ...props }: ClassGroupDialogProps) {
  if (!teachers) {
    return (
      <Dialog open onClose={props.onClose} labelledBy="group-dialog-loading">
        <p id="group-dialog-loading" className="p-6 text-ink-muted">
          Cargando profesores…
        </p>
      </Dialog>
    );
  }
  return <GroupForm teachers={teachers} {...props} />;
}

function GroupForm({
  group,
  teachers,
  onClose,
  onSaved,
}: Omit<ClassGroupDialogProps, 'teachers'> & { teachers: Teacher[] }) {
  const activeTeachers = teachers.filter(
    (teacher) => teacher.active || teacher.id === group?.teacher.id,
  );
  const form = useGroupForm(group, activeTeachers[0]?.id ?? '', onSaved);
  const title = group ? 'Editar grupo' : 'Nuevo grupo';

  return (
    <Dialog open onClose={onClose} labelledBy="group-dialog-title" size="wide">
      <form noValidate onSubmit={form.submit}>
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2
            id="group-dialog-title"
            className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-10 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
          >
            <X aria-hidden size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 p-6">
          {form.errorMessage && <Alert>{form.errorMessage}</Alert>}
          <TextField
            label="Nombre del grupo"
            placeholder={form.defaultName}
            help="Opcional. Sin nombre, el grupo se llama por su día, hora, nivel y aula."
            value={form.values.name}
            onChange={(event) => form.setName(event.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Nivel"
              options={LEVEL_OPTIONS}
              value={form.values.level}
              onChange={(value) => form.setLevel(value as Level)}
            />
            {activeTeachers.length > 0 ? (
              <Select
                label="Profesor"
                options={activeTeachers.map((teacher) => ({
                  value: teacher.id,
                  label: teacher.fullName,
                }))}
                value={form.values.teacherId}
                onChange={form.setTeacher}
                error={form.fieldErrors.teacherId}
              />
            ) : (
              <Alert tone="info">Añade antes un profesor en Profesores → Equipo.</Alert>
            )}
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Días</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <ToggleButton
                  key={day.id}
                  pressed={form.values.days.includes(day.id)}
                  onClick={() => form.toggleDay(day.id)}
                >
                  {day.short}
                </ToggleButton>
              ))}
            </div>
            {form.fieldErrors.days && (
              <p className="text-xs font-medium text-danger-fg">{form.fieldErrors.days}</p>
            )}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Empieza"
              options={START_OPTIONS}
              value={form.values.start}
              onChange={form.setStart}
            />
            <Select
              label="Termina"
              options={END_OPTIONS}
              value={form.values.end}
              onChange={form.setEnd}
              error={form.fieldErrors.end}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Aula</legend>
              <div className="flex gap-2">
                {CLASSROOMS.map((classroom) => (
                  <ToggleButton
                    key={classroom}
                    tone="ink"
                    pressed={form.values.classroom === classroom}
                    onClick={() => form.setClassroom(classroom)}
                  >
                    {classroomLabel(classroom)}
                  </ToggleButton>
                ))}
              </div>
            </fieldset>
            <div>
              <p className="mb-1.5 text-sm font-medium">Plazas</p>
              <div className="flex h-11 items-center rounded-sm border border-line-strong">
                <button
                  type="button"
                  aria-label="Quitar plaza"
                  disabled={form.values.capacity <= 1}
                  onClick={() => form.stepCapacity(-1)}
                  className="flex size-11 cursor-pointer items-center justify-center disabled:opacity-40"
                >
                  <Minus aria-hidden size={18} />
                </button>
                <span className="flex-1 text-center tabular-nums">
                  {form.values.capacity} plazas
                </span>
                <button
                  type="button"
                  aria-label="Añadir plaza"
                  disabled={form.values.capacity >= 30}
                  onClick={() => form.stepCapacity(1)}
                  className="flex size-11 cursor-pointer items-center justify-center disabled:opacity-40"
                >
                  <Plus aria-hidden size={18} />
                </button>
              </div>
            </div>
          </div>
          <p className="text-[13px] text-ink-muted">
            {formatHours(form.weeklyHours)}. La cuota se asigna según las horas semanales.
          </p>
          {form.conflict && <Alert>{form.conflict} Cambia el aula o el horario.</Alert>}
        </div>
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={form.isSubmitting} busyLabel="Guardando…">
            {group ? 'Guardar cambios' : 'Crear grupo'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
