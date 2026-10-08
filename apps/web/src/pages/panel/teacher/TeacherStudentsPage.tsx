import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { classroomLabel } from '@/features/classes/classrooms';
import { WEEKDAYS } from '@/features/classes/schedule';
import { useTeacherStudents } from '@/features/teacher-space/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';

const daysLabel = (days: string[]) =>
  days.map((d) => WEEKDAYS.find((w) => w.id === d)?.short ?? d).join(', ');

/** Los alumnos de cada una de sus clases, con los días que vienen (sin datos de contacto). */
export function TeacherStudentsPage() {
  const groups = useTeacherStudents();
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-display text-[28px] font-bold tracking-[0.04em] text-ink-strong uppercase">
        Mis alumnos
      </h1>
      {groups.isPending ? (
        <p className="text-ink-muted">Cargando alumnos…</p>
      ) : groups.isError ? (
        <Alert>{apiErrorMessage(groups.error)}</Alert>
      ) : groups.data.length === 0 ? (
        <p className="py-6 text-center text-ink-muted">No tienes clases asignadas.</p>
      ) : (
        groups.data.map((group) => (
          <Card key={group.groupId} className="overflow-hidden">
            <section aria-label={group.name}>
              <div className="border-b border-line px-4 py-3">
                <h2 className="font-semibold">{group.name}</h2>
                <p className="text-sm text-ink-muted">
                  {daysLabel(group.days)} · {group.start}–{group.end} ·{' '}
                  {classroomLabel(group.classroom)} · {group.students.length}{' '}
                  {group.students.length === 1 ? 'alumno' : 'alumnos'}
                </p>
              </div>
              {group.students.length === 0 ? (
                <p className="px-4 py-4 text-sm text-ink-muted">Sin alumnos.</p>
              ) : (
                <ul>
                  {group.students.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5 text-sm last:border-b-0"
                    >
                      <span>{s.name}</span>
                      {s.days.join() !== group.days.join() && (
                        <span className="text-[13px] text-ink-muted">Solo {daysLabel(s.days)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Card>
        ))
      )}
    </main>
  );
}
