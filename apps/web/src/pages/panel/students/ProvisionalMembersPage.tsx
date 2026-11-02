import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { formatDate } from '@/features/students/format';
import { useProvisionalMembers } from '@/features/students/hooks';
import { Avatar } from '@/shared/ui/Avatar';
import { Card } from '@/shared/ui/Card';
import { SectionHeader } from '@/shared/ui/SectionHeader';

/** Socios provisionales: han pagado la cuota de socio, pero falta su hoja de inscripción. */
export function ProvisionalMembersPage() {
  const provisional = useProvisionalMembers();
  const navigate = useNavigate();
  const items = provisional.data ?? [];

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
          provisional.isPending
            ? 'Alumnos'
            : `${items.length} ${items.length === 1 ? 'socio provisional' : 'socios provisionales'}`
        }
        title="Socios provisionales"
      />
      <p className="mb-4 text-sm text-ink-muted">
        Han pagado la cuota de socio, pero falta su hoja de inscripción. Ábrelos para completar sus
        datos y pasarlos a socio.
      </p>
      {provisional.isPending && <p className="text-ink-muted">Cargando…</p>}
      {!provisional.isPending && items.length === 0 && (
        <Card className="p-8 text-center text-ink-muted">No hay socios provisionales.</Card>
      )}
      {items.length > 0 && (
        <Card>
          <ul aria-label="Socios provisionales">
            {items.map((student) => (
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
                      Alta el {formatDate(student.joinedOn)}
                    </span>
                  </span>
                  <ChevronRight aria-hidden size={18} className="text-ink-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
