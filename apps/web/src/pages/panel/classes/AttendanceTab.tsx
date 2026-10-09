import { useState } from 'react';

import { currentMonth } from '@/features/billing/money';
import { SeasonMonths } from '@/features/billing/SeasonMonths';
import type { ClassGroup } from '@/features/classes/api';
import { Card } from '@/shared/ui/Card';
import { Select } from '@/shared/ui/Select';

import { GroupAttendanceTable } from './GroupAttendanceTable';
import { GroupClassComments } from './GroupClassComments';

/** Asistencia a clase: un grupo y un mes, con quién vino a cada clase y los comentarios de las clases. */
export function AttendanceTab({ groups }: { groups: ClassGroup[] }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [month, setMonth] = useState(currentMonth());
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="w-full max-w-sm">
          <Select
            label="Grupo"
            options={groups.map((g) => ({ value: g.id, label: g.name }))}
            value={groupId}
            onChange={setGroupId}
          />
        </div>
        <SeasonMonths month={month} selected={month} label="Mes" onChange={setMonth} />
      </div>
      <Card className="p-5">
        {groupId && (
          <>
            <GroupAttendanceTable groupId={groupId} month={month} />
            <GroupClassComments groupId={groupId} month={month} />
          </>
        )}
      </Card>
    </div>
  );
}
