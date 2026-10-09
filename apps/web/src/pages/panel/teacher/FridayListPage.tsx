import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { type FridayList, markFriday } from '@/features/teacher-space/api';
import { dayLabel } from '@/features/teacher-space/dates';
import { useFridayList } from '@/features/teacher-space/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { Combobox } from '@/shared/ui/Combobox';

/**
 * Lista de los viernes del encargado: salen propuestos (sin marcar) los que vinieron algún viernes de este mes o del
 * anterior, y con el buscador se añade a cualquier otro. Cada marca se guarda al momento y es la asistencia (y el punto)
 * de los viernes de Puntos.
 */
export function FridayListPage() {
  const { dutyId = '', date = '' } = useParams();
  const list = useFridayList(dutyId, date);
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
      <Link
        to="/panel"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft no-underline hover:text-ink"
      >
        <ArrowLeft aria-hidden size={16} />
        Mis clases
      </Link>
      {list.isPending ? (
        <p className="text-ink-muted">Cargando la lista…</p>
      ) : list.isError ? (
        <Alert>{apiErrorMessage(list.error)}</Alert>
      ) : (
        <FridayAttendance data={list.data} dutyId={dutyId} date={date} />
      )}
    </main>
  );
}

function FridayAttendance({
  data,
  dutyId,
  date,
}: {
  data: FridayList;
  dutyId: string;
  date: string;
}) {
  const queryClient = useQueryClient();
  const key = ['teacher-friday-list', dutyId, date];
  const [picked, setPicked] = useState('');
  const editable = data.rollCall === 'open' || data.rollCall === 'taken';
  const toggle = useMutation({
    mutationFn: (input: { id: string; name: string; present: boolean }) =>
      markFriday(dutyId, date, input.id, input.present),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FridayList>(key);
      queryClient.setQueryData<FridayList>(key, (old) => {
        if (!old) return old;
        const inList = old.list.some((s) => s.id === input.id);
        return {
          ...old,
          list: inList
            ? old.list.map((s) => (s.id === input.id ? { ...s, present: input.present } : s))
            : [...old.list, { id: input.id, name: input.name, present: input.present }],
        };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['teacher-classes'] }),
  });
  const inList = new Set(data.list.map((s) => s.id));
  const present = data.list.filter((s) => s.present).length;

  return (
    <>
      <div>
        <p className="text-sm text-ink-muted">
          {dayLabel(data.date)} · {data.start}–{data.end}
        </p>
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[0.04em] text-ink-strong uppercase">
          {data.label}
        </h1>
      </div>
      {data.rollCall === 'upcoming' && (
        <Alert>La lista se puede pasar desde 15 minutos antes de que empiece la actividad.</Alert>
      )}
      {data.rollCall === 'missed' && (
        <Alert>El plazo para pasar esta lista acabó al final del día siguiente.</Alert>
      )}
      {toggle.isError && <Alert>{apiErrorMessage(toggle.error)}</Alert>}
      {editable && (
        <Combobox
          label="Añadir alumno"
          placeholder="Escribe para buscar…"
          options={data.everyone
            .filter((s) => !inList.has(s.id))
            .map((s) => ({ value: s.id, label: s.name }))}
          value={picked}
          onChange={(id) => {
            const student = data.everyone.find((s) => s.id === id);
            if (!student) return;
            toggle.mutate({ id: student.id, name: student.name, present: true });
            setPicked('');
          }}
        />
      )}
      <Card className="overflow-hidden">
        <p className="border-b border-line px-4 py-3 text-sm text-ink-muted">
          {present} {present === 1 ? 'ha venido' : 'han venido'} · marca a quien viene; se guarda al
          momento
        </p>
        {data.list.length === 0 ? (
          <p className="px-4 py-6 text-center text-ink-muted">
            Nadie vino los últimos viernes: búscalos arriba para añadirlos.
          </p>
        ) : (
          <ul aria-label="Alumnos">
            {data.list.map((student) => (
              <li key={student.id} className="border-b border-line-soft last:border-b-0">
                <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4">
                  <input
                    type="checkbox"
                    checked={student.present}
                    disabled={!editable}
                    onChange={() =>
                      toggle.mutate({
                        id: student.id,
                        name: student.name,
                        present: !student.present,
                      })
                    }
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={`flex size-7 shrink-0 items-center justify-center rounded-sm border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 ${
                      student.present
                        ? 'border-brand bg-brand text-surface-raised'
                        : 'border-line-strong'
                    }`}
                  >
                    {student.present && <Check size={18} strokeWidth={3} />}
                  </span>
                  <span className="flex-1">{student.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-[13px] text-ink-muted">
        Cada viernes que viene un alumno es 1 punto de ese mes. Tus horas de la actividad cuentan si
        marcas al menos a una persona.
      </p>
    </>
  );
}
