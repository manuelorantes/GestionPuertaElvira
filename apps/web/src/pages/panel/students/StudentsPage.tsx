import { ClipboardList, FileSpreadsheet, Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet, useNavigate, useSearchParams } from 'react-router';

import { useCanManageClub } from '@/features/auth/useCanManageClub';
import { useSession } from '@/features/auth/useSession';
import type { StudentFilter } from '@/features/students/api';
import { usePendingData, useStudents } from '@/features/students/hooks';
import { sortFrom, sortParam, sortStudents, toggleSort } from '@/features/students/sorting';
import { useDebouncedValue } from '@/shared/useDebouncedValue';
import { Card } from '@/shared/ui/Card';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { ToggleButton } from '@/shared/ui/ToggleButton';

import { StudentDialog } from './StudentDialog';
import { StudentsList } from './StudentsList';

// «Activos» incluye a la familia directa y a los socios sin clases (la etiqueta «Familia directa» sigue en cada fila).
const ACTIVE = { param: 'activos', filter: 'active' as StudentFilter, label: 'Activos' };
const FILTERS: { param: string; filter: StudentFilter; label: string }[] = [
  ACTIVE,
  { param: 'socios', filter: 'no_classes', label: 'Socios sin clases' },
  { param: 'baja', filter: 'withdrawn', label: 'De baja' },
];

export function StudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const current = FILTERS.find((f) => f.param === searchParams.get('filtro')) ?? ACTIVE;
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search, 250);
  const [creating, setCreating] = useState(false);
  const students = useStudents(current.filter, debouncedSearch);
  const canManage = useCanManageClub();
  const pendingCount = usePendingData(canManage).data?.items.length ?? 0;
  const canImport = useSession().data?.role === 'superadministrator';
  const items = students.data?.items ?? [];
  const total = students.data?.total ?? 0;
  const activeCount = current.filter === 'active' && !debouncedSearch ? items.length : null;
  const query = searchParams.toString();
  const sort = sortFrom(searchParams.get('orden'));

  function updateParams(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setSearchParams(next, { replace: true });
  }

  function renderList() {
    if (students.isPending) return <p className="p-4 text-ink-muted">Cargando alumnos…</p>;
    if (items.length === 0) {
      return (
        <p className="px-5 py-12 text-center text-ink-muted">
          {total === 0
            ? 'Todavía no hay alumnos. Da de alta el primero.'
            : 'No hay alumnos que coincidan con la búsqueda.'}
        </p>
      );
    }
    return (
      <StudentsList
        students={sortStudents(items, sort)}
        sort={sort}
        onSort={(key) => updateParams({ orden: sortParam(toggleSort(sort, key)) })}
        onOpen={(id) => void navigate(`/panel/alumnos/${id}${query ? `?${query}` : ''}`)}
      />
    );
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <SectionHeader
        eyebrow={activeCount === null ? 'Alumnos del club' : `${activeCount} alumnos activos`}
        title="Alumnos"
        {...(canManage && {
          action: {
            label: 'Nuevo alumno',
            icon: <UserPlus aria-hidden size={18} />,
            onClick: () => setCreating(true),
          },
        })}
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <label className="flex h-11 w-full shrink-0 items-center gap-2 rounded-sm border border-line-strong bg-surface px-3 focus-within:border-brand lg:w-auto lg:flex-1">
            <Search aria-hidden size={18} className="text-ink-muted" />
            <input
              type="search"
              role="searchbox"
              aria-label="Buscar alumnos"
              placeholder="Buscar por nombre o nº de socio"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                updateParams({ q: event.target.value });
              }}
              className="h-full flex-1 bg-transparent outline-none"
            />
          </label>
          <div role="group" aria-label="Filtros" className="flex gap-2 overflow-x-auto">
            {FILTERS.map((f) => (
              <ToggleButton
                key={f.param}
                tone="ink"
                pressed={f.param === current.param}
                onClick={() => updateParams({ filtro: f.param === 'activos' ? '' : f.param })}
                className="shrink-0 rounded-full font-medium"
              >
                {f.label}
              </ToggleButton>
            ))}
          </div>
          <p className="shrink-0 text-sm text-ink-muted">
            {items.length} de {total} mostrados
          </p>
          {canManage && (
            <Link
              to="/panel/alumnos/pendientes"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-[13px] font-semibold hover:bg-surface-muted"
            >
              <ClipboardList aria-hidden size={16} />
              Datos pendientes{pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Link>
          )}
          {canImport && (
            <Link
              to="/panel/importar"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-[13px] font-semibold hover:bg-surface-muted"
            >
              <FileSpreadsheet aria-hidden size={16} />
              Importar hoja
            </Link>
          )}
        </div>
        {renderList()}
      </Card>
      {creating && (
        <StudentDialog
          detail={null}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            void navigate(`/panel/alumnos/${id}`);
          }}
        />
      )}
      <Outlet />
    </main>
  );
}
