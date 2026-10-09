import { Link } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { classroomLabel } from '@/features/classes/classrooms';
import type { TeacherClass } from '@/features/teacher-space/api';
import { useShiftDone } from '@/features/teacher-space/hooks';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';

const ACTION =
  'flex h-11 shrink-0 cursor-pointer items-center rounded-sm px-3 text-sm font-semibold no-underline';
const PRIMARY = `${ACTION} bg-brand text-surface-raised hover:bg-brand-strong`;
const SECONDARY = `${ACTION} border border-line-strong text-ink hover:bg-surface-muted`;

function subtitle(item: TeacherClass): string {
  if (item.activity === 'fridays') return 'Actividad del club · asistencia de los viernes';
  if (item.activity === 'shift') return 'Actividad del club';
  return `${item.classroom ? classroomLabel(item.classroom) : ''} · ${item.students} ${item.students === 1 ? 'alumno' : 'alumnos'}`;
}

/** Lo que se hace con cada cosa de la agenda: pasar lista (clases y viernes) o confirmar el turno. */
function Action({ item }: { item: TeacherClass }) {
  const done = useShiftDone();
  // Una clase pasada sin lista también se puede pasar (confirmándolo al guardar).
  const pastClass = item.rollCall === 'missed' && item.groupId !== null;
  if (item.rollCall !== 'open' && item.rollCall !== 'taken' && !pastClass) return null;
  if (item.activity === 'shift') {
    if (item.rollCall === 'taken' || item.dutyId === null) return null;
    const dutyId = item.dutyId;
    return (
      <span className="flex flex-col items-end gap-1">
        <button
          type="button"
          className={PRIMARY}
          disabled={done.isPending}
          onClick={() => done.mutate({ dutyId, date: item.date })}
          aria-label={`Turno hecho: ${item.label}`}
        >
          Turno hecho
        </button>
        {done.isError && (
          <span className="text-[12px] text-danger-fg">{apiErrorMessage(done.error)}</span>
        )}
      </span>
    );
  }
  const to =
    item.activity === 'fridays'
      ? `/panel/viernes/${item.dutyId}/${item.date}`
      : `/panel/lista/${item.groupId}/${item.date}`;
  return (
    <Link
      to={to}
      aria-label={`${item.rollCall === 'taken' ? 'Corregir la lista' : 'Pasar lista'} de ${item.label}`}
      className={item.rollCall === 'open' ? PRIMARY : SECONDARY}
    >
      {item.rollCall === 'taken' ? 'Corregir' : 'Pasar lista'}
    </Link>
  );
}

/** Una clase o actividad de la agenda: hora, nombre, aula y alumnos de ese día, y qué hacer con ella. */
export function ClassCard({ item }: { item: TeacherClass }) {
  return (
    <Card className="flex items-start gap-4 px-4 py-3.5">
      <div className="w-14 shrink-0 text-center">
        <p className="font-display text-xl font-bold">{item.start}</p>
        <p className="text-xs text-ink-muted">{item.end}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{item.label}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{subtitle(item)}</p>
        <span className="mt-1.5 flex flex-wrap gap-1.5 empty:hidden">
          {item.substitution && <Badge>Sustitución</Badge>}
          {item.rollCall === 'taken' && (
            <Badge tone="success">
              {item.activity === 'shift' ? 'Turno hecho' : 'Lista pasada'}
            </Badge>
          )}
          {item.rollCall === 'missed' && (
            <Badge tone="warning">
              {item.activity === 'shift' ? 'Sin confirmar' : 'Sin lista'}
            </Badge>
          )}
        </span>
      </div>
      <Action item={item} />
    </Card>
  );
}
