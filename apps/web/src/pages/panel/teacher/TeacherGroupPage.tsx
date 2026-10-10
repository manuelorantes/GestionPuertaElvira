import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { currentMonth, monthLabel, shiftMonth } from '@/features/billing/money';
import type { ClassComment } from '@/features/class-comments/api';
import type { TeacherGroup } from '@/features/teacher-space/api';
import {
  attendancePercent,
  daysLabel,
  groupLine,
  seasonFirstMonth,
} from '@/features/teacher-space/groups';
import {
  useTeacherGroupAttendance,
  useTeacherGroupComments,
  useTeacherGroups,
} from '@/features/teacher-space/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { MonthNav } from '@/shared/ui/MonthNav';
import { Select } from '@/shared/ui/Select';

import { CommentList } from '../attendance/ClassComments';
import { GroupAttendanceGrid } from '../classes/GroupAttendanceTable';
import { StudentLink } from '@/pages/panel/students/StudentLink';

const SECTION_TITLE = 'text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase';

/**
 * Un grupo de «Mis grupos»: los comentarios de sus últimas clases (para tenerlos en cuenta en la siguiente), sus alumnos
 * con su asistencia de la temporada y la asistencia del grupo mes a mes. Todo de solo lectura.
 */
export function TeacherGroupPage() {
  const { groupId = '' } = useParams();
  const groups = useTeacherGroups();
  const group = groups.data?.find((g) => g.groupId === groupId);
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
      <Link
        to="/panel/mis-grupos"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft no-underline hover:text-ink"
      >
        <ArrowLeft aria-hidden size={16} />
        Mis grupos
      </Link>
      {groups.isPending ? (
        <p className="text-ink-muted">Cargando grupo…</p>
      ) : groups.isError ? (
        <Alert>{apiErrorMessage(groups.error)}</Alert>
      ) : !group ? (
        <Alert>Ese grupo no es tuyo.</Alert>
      ) : (
        <>
          <header className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[28px] font-bold tracking-[0.04em] text-ink-strong uppercase">
                {group.name}
              </h1>
              {group.substitution && <Badge>Sustitución</Badge>}
            </div>
            <p className="text-sm text-ink-muted">{groupLine(group)}</p>
          </header>
          <GroupComments group={group} />
          <GroupStudents group={group} />
          <GroupMonthAttendance groupId={group.groupId} />
        </>
      )}
    </main>
  );
}

const ALL_STUDENTS = '';
const READ_ONLY = {
  canEdit: () => false,
  onRewrite: () => Promise.resolve(),
  onRemove: () => Promise.resolve(),
};

/** Los comentarios de las clases, de los más recientes a los más antiguos, de 4 en 4 semanas. */
function GroupComments({ group }: { group: TeacherGroup }) {
  const comments = useTeacherGroupComments(group.groupId);
  const [studentFilter, setStudentFilter] = useState(ALL_STUDENTS);
  const loaded: ClassComment[] = comments.data?.pages.flatMap((p) => p.items) ?? [];
  const general = loaded.filter((c) => c.studentId === null);
  const aboutStudents = loaded.filter(
    (c) =>
      c.studentId !== null && (studentFilter === ALL_STUDENTS || c.studentId === studentFilter),
  );
  // Los del grupo y los que vinieron en asistencia especial y tienen comentarios.
  const students = new Map(group.students.map((s) => [s.id, s.name]));
  for (const c of loaded) {
    if (c.studentId !== null && !students.has(c.studentId))
      students.set(c.studentId, c.studentName ?? '');
  }
  const filteredName = students.get(studentFilter);

  return (
    <Card className="p-4">
      <section aria-label="Comentarios" className="flex flex-col gap-4">
        <h2 className={SECTION_TITLE}>Comentarios</h2>
        {comments.isPending ? (
          <p className="text-sm text-ink-muted">Cargando comentarios…</p>
        ) : comments.isError ? (
          <Alert>{apiErrorMessage(comments.error)}</Alert>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-ink-strong">De la clase</h3>
              {general.length === 0 ? (
                <p className="text-sm text-ink-muted">Sin comentarios de la clase.</p>
              ) : (
                <CommentList
                  label="Comentarios de la clase"
                  comments={general}
                  show={{ date: true }}
                  {...READ_ONLY}
                />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink-strong">De los alumnos</h3>
              <div className="max-w-sm">
                <Select
                  label="Alumno"
                  options={[
                    { value: ALL_STUDENTS, label: 'Todos los alumnos' },
                    ...[...students].map(([value, label]) => ({ value, label })),
                  ]}
                  value={studentFilter}
                  onChange={setStudentFilter}
                />
              </div>
              {aboutStudents.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  {filteredName
                    ? `${filteredName} no tiene comentarios.`
                    : 'Sin comentarios de alumnos.'}
                </p>
              ) : (
                <CommentList
                  label="Comentarios de los alumnos"
                  comments={aboutStudents}
                  show={{ date: true, student: studentFilter === ALL_STUDENTS }}
                  {...READ_ONLY}
                />
              )}
            </div>
            {comments.hasNextPage ? (
              <div>
                <Button
                  variant="secondary"
                  onClick={() => void comments.fetchNextPage()}
                  busy={comments.isFetchingNextPage}
                  busyLabel="Cargando…"
                >
                  Ver más
                </Button>
              </div>
            ) : (
              <p className="text-[13px] text-ink-muted">Ya se ven todos los de la temporada.</p>
            )}
          </>
        )}
      </section>
    </Card>
  );
}

/** Los alumnos del grupo, los días que vienen si no son todos y su asistencia de la temporada. */
function GroupStudents({ group }: { group: TeacherGroup }) {
  return (
    <Card className="overflow-hidden">
      <section aria-label="Alumnos">
        <h2 className={`border-b border-line px-4 py-3 ${SECTION_TITLE}`}>Alumnos</h2>
        {group.students.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-muted">Sin alumnos.</p>
        ) : (
          <ul>
            {group.students.map((s) => {
              const percent = attendancePercent(s);
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span className="min-w-0">
                    <StudentLink id={s.id} className="block">
                      {s.name}
                    </StudentLink>
                    {s.days.join() !== group.days.join() && (
                      <span className="block text-[13px] text-ink-muted">
                        Solo {daysLabel(s.days)}
                      </span>
                    )}
                  </span>
                  <span
                    aria-label={
                      percent === null
                        ? `${s.name}: sin clases con lista`
                        : `${s.name}: vino a ${s.attended} de ${s.classes} clases`
                    }
                    className={`shrink-0 tabular-nums ${
                      percent !== null && percent < 75
                        ? 'font-semibold text-danger-fg'
                        : 'text-ink-soft'
                    }`}
                  >
                    {percent === null ? '—' : `${percent} %`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t border-line px-4 py-2 text-[13px] text-ink-muted">
          Asistencia de la temporada, solo de las clases con lista; por debajo del 75 % sale en
          rojo.
        </p>
      </section>
    </Card>
  );
}

/** La asistencia del grupo mes a mes, desde septiembre hasta el mes en curso. */
function GroupMonthAttendance({ groupId }: { groupId: string }) {
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const attendance = useTeacherGroupAttendance(groupId, month);
  return (
    <Card className="p-4">
      <section aria-label="Asistencia">
        <h2 className={`mb-2 ${SECTION_TITLE}`}>Asistencia</h2>
        <div className="mb-3">
          <MonthNav
            label={monthLabel(month)}
            onPrevious={
              month > seasonFirstMonth(thisMonth)
                ? () => setMonth(shiftMonth(month, -1))
                : undefined
            }
            onNext={month < thisMonth ? () => setMonth(shiftMonth(month, 1)) : undefined}
          />
        </div>
        <GroupAttendanceGrid attendance={attendance} month={month} />
      </section>
    </Card>
  );
}
