import type { ReactNode } from 'react';

import { useStudentAttendance } from '@/features/attendance/hooks';
import { formatDate } from '@/features/students/format';
import { Card } from '@/shared/ui/Card';

/** Asistencia del alumno en la temporada (según las listas que pasa el profesorado). */
export function StudentAttendanceCard({
  studentId,
  title,
}: {
  studentId: string;
  title: (text: string) => ReactNode;
}) {
  const attendance = useStudentAttendance(studentId);
  const data = attendance.data;
  return (
    <Card className="p-4">
      {title('Asistencia')}
      {!data ? (
        <p className="text-sm text-ink-muted">{attendance.isError ? '—' : 'Cargando…'}</p>
      ) : data.classes === 0 ? (
        <p className="text-sm text-ink-muted">Aún no hay listas pasadas de sus clases.</p>
      ) : (
        <>
          <p className="text-sm">
            Vino a <strong>{data.attended}</strong> de {data.classes}{' '}
            {data.classes === 1 ? 'clase' : 'clases'} (
            {Math.round((data.attended / data.classes) * 100)} %)
          </p>
          {data.absences.length > 0 && (
            <ul aria-label="Faltas" className="mt-2 text-[13px] text-ink-muted">
              {data.absences.map((a) => (
                <li key={`${a.date}-${a.label}`}>
                  Faltó el {formatDate(a.date)} · {a.label}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
