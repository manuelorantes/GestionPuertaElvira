import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import type { PendingStudent } from '@/features/students/api';
import { usePendingData } from '@/features/students/hooks';
import { MISSING_LABELS, missingSentence } from '@/features/students/pending';
import { Avatar } from '@/shared/ui/Avatar';
import { Card } from '@/shared/ui/Card';
import { SectionHeader } from '@/shared/ui/SectionHeader';

/** Alumnos activos a los que falta algún dato esperado, agrupados por lo que falta. */
export function PendingDataPage() {
  const pending = usePendingData();
  const navigate = useNavigate();
  const items = pending.data?.items ?? [];
  const sections = MISSING_LABELS.map((m) => ({
    ...m,
    students: items.filter((s) => s.missing.includes(m.key)),
  })).filter((section) => section.students.length > 0);

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <Link
        to="/panel/alumnos"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand"
      >
        <ArrowLeft aria-hidden size={16} />
        Alumnos
      </Link>
      <SectionHeader
        eyebrow={
          pending.isPending
            ? 'Alumnos'
            : `${items.length} ${items.length === 1 ? 'alumno' : 'alumnos'} con datos por completar`
        }
        title="Datos pendientes"
      />
      {pending.isPending && <p className="text-ink-muted">Cargando…</p>}
      {!pending.isPending && items.length === 0 && (
        <Card className="p-8 text-center text-ink-muted">
          Todos los alumnos activos tienen sus datos completos.
        </Card>
      )}
      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <Card key={section.key}>
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">
              {section.plural} · {section.students.length}
            </h2>
            <ul aria-label={section.plural}>
              {section.students.map((student: PendingStudent) => (
                <li key={student.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => void navigate(`/panel/alumnos/${student.id}`)}
                    className="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left hover:bg-surface-muted"
                  >
                    <Avatar name={student.fullName} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{student.fullName}</span>
                      <span className="block text-[13px] text-ink-muted">
                        {missingSentence(student.missing)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </main>
  );
}
