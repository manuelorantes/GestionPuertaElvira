import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { useCanManageClub } from '@/features/auth/useCanManageClub';
import type { ClassGroup } from '@/features/classes/api';
import { useGroups, useTeachers } from '@/features/classes/hooks';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Tabs } from '@/shared/ui/Tabs';
import { useToast } from '@/shared/ui/Toast';

import { AttendanceTab } from './AttendanceTab';
import { ClassGroupDialog } from './ClassGroupDialog';
import { ClassGroupPanel } from './ClassGroupPanel';
import { GroupsTable } from './GroupsTable';
import { WeeklySchedule } from './WeeklySchedule';

const TABS = [
  { id: 'horario', label: 'Horario semanal' },
  { id: 'grupos', label: 'Grupos' },
  { id: 'asistencia', label: 'Asistencia' },
];

type DialogState = { group: ClassGroup | null } | null;

export function ClassesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === searchParams.get('pestana'))
    ? (searchParams.get('pestana') as string)
    : 'horario';
  const [dialog, setDialog] = useState<DialogState>(null);
  // ?grupo=<id> abre ese grupo (p. ej. desde el historial).
  const [openGroupId, setOpenGroupId] = useState<string | null>(() => searchParams.get('grupo'));
  const groups = useGroups();
  const canManage = useCanManageClub();
  // La lista de profesores (con sus tarifas) solo hace falta para crear o editar grupos.
  const teachers = useTeachers(canManage);
  const toast = useToast();
  const groupList = groups.data ?? [];

  function renderTab() {
    if (groups.isPending) return <p className="text-ink-muted">Cargando grupos…</p>;
    if (groupList.length === 0)
      return (
        <p className="text-ink-muted">
          {canManage
            ? 'Todavía no hay grupos. Crea el primero con «Nuevo grupo».'
            : 'Todavía no hay grupos.'}
        </p>
      );
    const edit = canManage ? (group: ClassGroup) => setDialog({ group }) : undefined;
    const open = (group: ClassGroup) => setOpenGroupId(group.id);
    if (tab === 'asistencia') return <AttendanceTab groups={groupList} />;
    return tab === 'grupos' ? (
      <GroupsTable groups={groupList} onEdit={edit} onOpen={open} />
    ) : (
      <WeeklySchedule groups={groupList} onSelect={open} />
    );
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <SectionHeader
        eyebrow={`Lunes a viernes · 3 aulas · ${groupList.length} grupos`}
        title="Clases"
        {...(canManage && {
          action: {
            label: 'Nuevo grupo',
            icon: <Plus aria-hidden size={18} />,
            onClick: () => setDialog({ group: null }),
          },
        })}
      />
      <Tabs
        label="Vistas de clases"
        tabs={TABS}
        value={tab}
        onChange={(id) => setSearchParams({ pestana: id })}
      >
        {renderTab()}
      </Tabs>
      {openGroupId && (
        <ClassGroupPanel
          groupId={openGroupId}
          onClose={() => setOpenGroupId(null)}
          onEdit={
            canManage
              ? (group) => {
                  setOpenGroupId(null);
                  setDialog({ group });
                }
              : undefined
          }
        />
      )}
      {dialog && (
        <ClassGroupDialog
          group={dialog.group}
          teachers={teachers.data}
          onClose={() => setDialog(null)}
          onSaved={(name) => {
            setDialog(null);
            toast(dialog.group ? 'Grupo actualizado' : `Grupo «${name}» creado`);
          }}
        />
      )}
    </main>
  );
}
