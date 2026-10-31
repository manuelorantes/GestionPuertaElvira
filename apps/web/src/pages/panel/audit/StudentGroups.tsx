import { Fragment, useId } from 'react';
import { Link } from 'react-router';

import type { AuditGroupStay, AuditStudentGroups } from '@/features/audit/api';
import { targetLink } from '@/features/audit/targets';
import { formatDate } from '@/features/students/format';

/** «(desde 02/11/2026)», «(hasta 20/12/2026)» o nada si el grupo no tiene ni lo uno ni lo otro. */
function period(stay: AuditGroupStay): string {
  const parts = [
    stay.startsOn && `desde ${formatDate(stay.startsOn)}`,
    stay.endsOn && `hasta ${formatDate(stay.endsOn)}`,
  ].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function Groups({ stays }: { stays: AuditGroupStay[] }) {
  if (stays.length === 0) return <span className="text-ink-muted">Sin grupos</span>;
  return stays.map((stay, index) => (
    <Fragment key={stay.groupId}>
      {index > 0 && ', '}
      <Link to={targetLink({ kind: 'group', id: stay.groupId }).to} className="font-medium">
        {stay.groupName}
      </Link>
      {period(stay)}
    </Fragment>
  ));
}

/** Todos los grupos de un alumno antes y después de la acción, para ver en qué clases sigue. */
function StudentGroupsCard({ student }: { student: AuditStudentGroups }) {
  const id = useId();
  return (
    <section
      aria-label={`Grupos de ${student.studentName}`}
      className="rounded-sm border border-line-soft bg-surface p-3"
    >
      <p className="mb-1.5 text-[13px] font-semibold">Grupos de {student.studentName}</p>
      <dl className="grid grid-cols-[minmax(80px,auto)_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt id={`${id}-before`} className="text-ink-muted">
          Antes
        </dt>
        <dd aria-labelledby={`${id}-before`} className="break-words">
          <Groups stays={student.before} />
        </dd>
        <dt id={`${id}-after`} className="text-ink-muted">
          Después
        </dt>
        <dd aria-labelledby={`${id}-after`} className="break-words">
          <Groups stays={student.after} />
        </dd>
      </dl>
    </section>
  );
}

export function StudentGroups({ students }: { students: AuditStudentGroups[] }) {
  return students.map((student) => <StudentGroupsCard key={student.studentId} student={student} />);
}
