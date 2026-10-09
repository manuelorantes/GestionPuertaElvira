import type { ReactNode } from 'react';

import { useStudentAttendance } from '@/features/attendance/hooks';
import { formatDate } from '@/features/students/format';
import { AsteriskNote } from '@/shared/ui/AsteriskNote';
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
      ) : data.classes === 0 && data.specials.length === 0 ? (
        <p className="text-sm text-ink-muted">Aún no hay listas pasadas de sus clases.</p>
      ) : data.classes === 0 ? (
        <Specials items={data.specials} />
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
          <Specials items={data.specials} />
        </>
      )}
    </Card>
  );
}

/** Clases de otros grupos a las que vino (asistencia especial): aparte, porque no son las suyas. */
function Specials({ items }: { items: { date: string; label: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-sm font-medium">
        Asistencia especial
        <AsteriskNote label="Qué es la asistencia especial">
          Clases de otros grupos a las que vino (a recuperar, por ejemplo). No cuentan en su
          porcentaje.
        </AsteriskNote>
      </p>
      <ul aria-label="Asistencia especial" className="mt-1 text-[13px] text-ink-muted">
        {items.map((a) => (
          <li key={`${a.date}-${a.label}`}>
            Vino el {formatDate(a.date)} · {a.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
