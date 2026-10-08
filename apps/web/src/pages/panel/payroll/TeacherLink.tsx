import { Link } from 'react-router';

/** Nombre de un profesor que lleva a su ficha. */
export function TeacherLink({ id, name }: { id: string; name: string }) {
  return (
    <Link
      to={`/panel/profesores/${id}`}
      className="font-medium text-ink-strong underline-offset-4 hover:text-brand hover:underline"
    >
      {name}
    </Link>
  );
}
