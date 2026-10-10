import { StudentLink } from '@/pages/panel/students/StudentLink';

const SEPARATOR = ' · ';

/** El concepto de un movimiento; si es el cobro de un alumno, su nombre (lo último) lleva a su ficha. */
export function MovementConcept({
  concept,
  studentId,
}: {
  concept: string;
  studentId: string | null;
}) {
  const at = concept.lastIndexOf(SEPARATOR);
  if (studentId === null || at < 0) return <>{concept}</>;
  return (
    <>
      {concept.slice(0, at + SEPARATOR.length)}
      <StudentLink id={studentId}>{concept.slice(at + SEPARATOR.length)}</StudentLink>
    </>
  );
}
