import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { ApiError } from '@/shared/api/client';

import type { ClassGroup, Classroom, GroupPayload, Level, Weekday } from './api';
import { defaultGroupName } from './defaultName';
import { useSaveGroup } from './hooks';
import { toMinutes, weeklyHours, WEEKDAYS } from './schedule';

type Field = 'teacherId' | 'days' | 'end';
type FieldErrors = Partial<Record<Field, string>>;

function initialValues(group: ClassGroup | null, defaultTeacherId: string): GroupPayload {
  if (group) {
    const { level, days, start, end, classroom, capacity } = group;
    // Un grupo con el nombre por defecto se edita con el campo vacío: el nombre sigue a sus datos.
    const name = group.customName ? group.name : '';
    return { name, level, teacherId: group.teacher.id, days, start, end, classroom, capacity };
  }
  return {
    name: '',
    level: 'beginner',
    teacherId: defaultTeacherId,
    days: [],
    start: '17:00',
    end: '18:00',
    classroom: 'alfil',
    capacity: 10,
  };
}

export function useGroupForm(
  group: ClassGroup | null,
  defaultTeacherId: string,
  onSaved: (name: string) => void,
) {
  const [draft, setDraft] = useState<GroupPayload>(() => initialValues(group, defaultTeacherId));
  // Los profesores pueden cargar después de abrir el diálogo: sin elección explícita, se usa el primero activo.
  const values: GroupPayload = { ...draft, teacherId: draft.teacherId || defaultTeacherId };
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const save = useSaveGroup();

  const set = <K extends keyof GroupPayload>(key: K, value: GroupPayload[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const order = (days: Weekday[]) =>
    WEEKDAYS.map((day) => day.id).filter((id) => days.includes(id));

  function toggleDay(day: Weekday) {
    set(
      'days',
      order(
        values.days.includes(day) ? values.days.filter((d) => d !== day) : [...values.days, day],
      ),
    );
  }

  function stepCapacity(delta: number) {
    set('capacity', Math.min(30, Math.max(1, values.capacity + delta)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {
      ...(values.teacherId === '' && { teacherId: 'Elige un profesor.' }),
      ...(values.days.length === 0 && { days: 'Elige al menos un día.' }),
      ...(toMinutes(values.end) <= toMinutes(values.start) && {
        end: 'La hora de fin debe ser posterior a la de inicio.',
      }),
    };
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    save.reset();
    save.mutate(group ? { payload: values, id: group.id } : { payload: values }, {
      onSuccess: () => onSaved(values.name.trim() || defaultGroupName(values)),
    });
  }

  const apiError = save.error instanceof ApiError ? save.error : null;
  const conflict = apiError?.code === 'classroom_conflict' ? apiError.message : null;

  return {
    values,
    /** Nombre que tendrá el grupo si el campo se deja vacío. */
    defaultName: defaultGroupName(values),
    setName: (name: string) => set('name', name),
    setLevel: (level: Level) => set('level', level),
    setTeacher: (teacherId: string) => set('teacherId', teacherId),
    setStart: (start: string) => set('start', start),
    setEnd: (end: string) => set('end', end),
    setClassroom: (classroom: Classroom) => set('classroom', classroom),
    toggleDay,
    stepCapacity,
    weeklyHours: weeklyHours(values.days.length, values.start, values.end),
    fieldErrors,
    conflict,
    errorMessage: save.isError && !conflict ? apiErrorMessage(save.error) : null,
    isSubmitting: save.isPending,
    submit,
  };
}
