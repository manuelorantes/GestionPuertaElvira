import { ArrowLeft } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';

import type { StaffRollCall } from '@/features/attendance/api';
import { useSaveStaffRollCall, useStaffRollCall } from '@/features/attendance/hooks';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { useSession } from '@/features/auth/useSession';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';

import { RollCallHeading, RollCallStudents, SpecialAttendance } from './RollCallSheet';
import { useRollCallMarks } from './useRollCallMarks';

/** La ficha de la clase en Clases, en el mes de ese día (su asistencia y sus comentarios). */
const classSheet = (groupId: string, date: string) =>
  `/panel/clases?grupo=${groupId}&mes=${date.slice(0, 7)}`;

/**
 * Superadministración pasa la lista de cualquier clase, cualquier día en que se dio (sin plazo ni confirmación), en
 * nombre de quien la dio; al guardarla, la clase se apunta en las horas del profesor si no lo estaba.
 */
export function StaffRollCallPage() {
  const { groupId = '', date = '' } = useParams();
  const role = useSession().data?.role;
  const rollCall = useStaffRollCall(groupId, date);
  if (role && role !== 'superadministrator') return <Navigate to="/panel" replace />;
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
      <Link
        to={classSheet(groupId, date)}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft no-underline hover:text-ink"
      >
        <ArrowLeft aria-hidden size={16} />
        Ver la clase
      </Link>
      {rollCall.isPending ? (
        <p className="text-ink-muted">Cargando la lista…</p>
      ) : rollCall.isError ? (
        <Alert>{apiErrorMessage(rollCall.error)}</Alert>
      ) : (
        <StaffRollCallForm data={rollCall.data} />
      )}
    </main>
  );
}

function StaffRollCallForm({ data }: { data: StaffRollCall }) {
  const marks = useRollCallMarks(data);
  const save = useSaveStaffRollCall(data.groupId, data.date);
  const navigate = useNavigate();
  const toast = useToast();
  const editable = data.period !== 'upcoming';

  function submit() {
    save.mutate(marks.changes(), {
      onSuccess: () => {
        toast('Lista guardada');
        void navigate(classSheet(data.groupId, data.date));
      },
    });
  }

  return (
    <>
      <RollCallHeading data={data}>
        <p className="mt-1 text-sm text-ink-muted">
          {data.substitution ? 'Sustitución de' : 'Clase de'} {data.teacher.name}
        </p>
      </RollCallHeading>
      {data.period === 'upcoming' ? (
        <Alert>La lista se puede pasar desde 15 minutos antes de que empiece la clase.</Alert>
      ) : (
        data.rollCall !== 'taken' && (
          <Alert tone="info">
            Al guardar la lista, la clase se apunta en las horas de {data.teacher.name} si no lo
            estaba (salvo que la liquidación de ese mes ya esté pagada).
          </Alert>
        )
      )}
      {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
      <RollCallStudents data={data} marks={marks} editable={editable} />
      <SpecialAttendance data={data} marks={marks} editable={editable} />
      {editable && (
        <div className="sticky bottom-0 -mx-4 bg-paper px-4 py-3 md:static md:mx-0 md:p-0">
          <Button className="w-full" onClick={submit} busy={save.isPending} busyLabel="Guardando…">
            Guardar lista
          </Button>
        </div>
      )}
    </>
  );
}
