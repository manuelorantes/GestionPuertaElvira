import { ArrowLeft, Check } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { classroomLabel } from '@/features/classes/classrooms';
import type { RollCall } from '@/features/teacher-space/api';
import { dayLabel } from '@/features/teacher-space/dates';
import { useRollCall, useSaveRollCall } from '@/features/teacher-space/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { useToast } from '@/shared/ui/Toast';

/** Pasar lista de una clase: nadie marcado al abrirla; se marca a quien ha venido y se guarda (el resto, falta). */
export function RollCallPage() {
  const { groupId = '', date = '' } = useParams();
  const rollCall = useRollCall(groupId, date);
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
      <Link
        to="/panel"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft no-underline hover:text-ink"
      >
        <ArrowLeft aria-hidden size={16} />
        Mis clases
      </Link>
      {rollCall.isPending ? (
        <p className="text-ink-muted">Cargando la lista…</p>
      ) : rollCall.isError ? (
        <Alert>{apiErrorMessage(rollCall.error)}</Alert>
      ) : (
        <RollCallForm
          key={rollCall.data.list.map((s) => `${s.id}${s.present}`).join()}
          data={rollCall.data}
        />
      )}
    </main>
  );
}

function RollCallForm({ data }: { data: RollCall }) {
  const [absent, setAbsent] = useState(
    () => new Set(data.list.filter((s) => !s.present).map((s) => s.id)),
  );
  const save = useSaveRollCall(data.groupId ?? '', data.date);
  const navigate = useNavigate();
  const toast = useToast();
  const editable = data.rollCall === 'open' || data.rollCall === 'taken';
  const present = data.list.length - absent.size;

  function toggle(id: string) {
    setAbsent((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    void save.mutateAsync([...absent]).then(
      () => {
        toast('Lista guardada');
        void navigate('/panel');
      },
      () => undefined,
    );
  }

  return (
    <>
      <div>
        <p className="text-sm text-ink-muted">
          {dayLabel(data.date)} · {data.start}–{data.end}
          {data.classroom ? ` · ${classroomLabel(data.classroom)}` : ''}
        </p>
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[0.04em] text-ink-strong uppercase">
          {data.label}
        </h1>
      </div>
      {data.rollCall === 'upcoming' && (
        <Alert>La lista se puede pasar desde 15 minutos antes de que empiece la clase.</Alert>
      )}
      {data.rollCall === 'missed' && (
        <Alert>El plazo para pasar esta lista acabó al final del día siguiente a la clase.</Alert>
      )}
      {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
      <Card className="overflow-hidden">
        <p className="border-b border-line px-4 py-3 text-sm text-ink-muted">
          {present} de {data.list.length} {data.list.length === 1 ? 'alumno' : 'alumnos'} · marca a
          quien ha venido
        </p>
        {data.list.length === 0 ? (
          <p className="px-4 py-6 text-center text-ink-muted">No hay alumnos ese día.</p>
        ) : (
          <ul aria-label="Alumnos">
            {data.list.map((student) => {
              const here = !absent.has(student.id);
              return (
                <li key={student.id} className="border-b border-line-soft last:border-b-0">
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4">
                    <input
                      type="checkbox"
                      checked={here}
                      disabled={!editable}
                      onChange={() => toggle(student.id)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={`flex size-7 shrink-0 items-center justify-center rounded-sm border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 ${
                        here ? 'border-brand bg-brand text-surface-raised' : 'border-line-strong'
                      }`}
                    >
                      {here && <Check size={18} strokeWidth={3} />}
                    </span>
                    <span className={`flex-1 ${here ? '' : 'text-ink-muted line-through'}`}>
                      {student.name}
                    </span>
                    {!here && <span className="text-[13px] text-ink-muted">No vino</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
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
