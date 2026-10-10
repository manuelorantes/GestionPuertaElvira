import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { monthLabel } from '@/features/billing/money';
import { type FridayGrid, markFriday } from '@/features/points/api';
import { useFridays } from '@/features/points/hooks';
import { todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { StudentLink } from '@/pages/panel/students/StudentLink';

const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Asistencia de los viernes (nada que ver con las clases): todos los alumnos de alta, socios con o sin clase; cada
 * viernes que vienen es un punto de ese mes. Marcar y desmarcar se ve al momento.
 */
export function FridaysTab({ month }: { month: string }) {
  const grid = useFridays(month);
  const [search, setSearch] = useState('');
  const [onlyPresent, setOnlyPresent] = useState(false);
  const queryClient = useQueryClient();
  const refresh = useRefreshClubData();
  const key = ['points-fridays', month];
  const toggle = useMutation({
    mutationFn: (input: { date: string; student: string; present: boolean }) =>
      markFriday(input.date, input.student, input.present),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FridayGrid>(key);
      queryClient.setQueryData<FridayGrid>(key, (old) =>
        old
          ? {
              ...old,
              students: old.students.map((s) =>
                s.id !== input.student
                  ? s
                  : {
                      ...s,
                      present: input.present
                        ? [...s.present, input.date]
                        : s.present.filter((d) => d !== input.date),
                    },
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: refresh,
  });

  if (grid.isPending) return <p className="text-ink-muted">Cargando viernes…</p>;
  if (grid.isError) return <Alert>{apiErrorMessage(grid.error)}</Alert>;
  const today = todayIso();
  const { fridays } = grid.data;
  const students = grid.data.students.filter(
    (s) =>
      normalise(s.name).includes(normalise(search.trim())) &&
      (!onlyPresent || s.present.length > 0),
  );
  const count = (date: string) => grid.data.students.filter((s) => s.present.includes(date)).length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4">
        <input
          type="search"
          aria-label="Buscar alumno"
          placeholder="Buscar alumno"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full max-w-72 rounded-sm border border-line-strong bg-surface px-3 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyPresent}
            onChange={(e) => setOnlyPresent(e.target.checked)}
          />
          Solo los que vinieron
        </label>
      </div>
      {toggle.isError && (
        <div className="px-5 pt-4">
          <Alert>{apiErrorMessage(toggle.error)}</Alert>
        </div>
      )}
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="sr-only">Viernes de {monthLabel(month).toLowerCase()}</caption>
          <thead className="sticky top-0 z-10 border-b border-line bg-surface text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">
                Alumno
              </th>
              {fridays.map((f) => (
                <th
                  key={f.date}
                  scope="col"
                  className="px-3 py-3 text-center font-semibold"
                  title={f.holiday ?? undefined}
                >
                  {dayMonth(f.date)}
                  <span className="block text-[11px] font-normal tracking-normal normal-case">
                    {f.holiday ? 'Festivo' : `${count(f.date)} vinieron`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b border-line-soft last:border-b-0">
                <th scope="row" className="px-5 py-2 font-medium">
                  <StudentLink id={s.id}>{s.name}</StudentLink>
                  {s.memberNumber !== null && (
                    <span className="ml-2 text-[12px] font-normal text-ink-muted">
                      nº {s.memberNumber}
                    </span>
                  )}
                </th>
                {fridays.map((f) => {
                  const present = s.present.includes(f.date);
                  return (
                    <td key={f.date} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${s.name} vino el viernes ${dayMonth(f.date)}`}
                        checked={present}
                        disabled={f.holiday !== null || f.date > today}
                        onChange={() =>
                          toggle.mutate({ date: f.date, student: s.id, present: !present })
                        }
                        className="size-5 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-[13px] text-ink-muted">
        Cada viernes que viene un alumno es 1 punto de ese mes. Es independiente de las clases: no
        tiene nada que ver con pasar lista. Los viernes que aún no han llegado y los festivos no se
        pueden marcar.
      </p>
    </Card>
  );
}
