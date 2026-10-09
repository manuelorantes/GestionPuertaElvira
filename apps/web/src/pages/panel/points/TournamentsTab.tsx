import { Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  deleteTournament,
  markTournamentPhoto,
  saveTournament,
  type Tournament,
} from '@/features/points/api';
import { usePointsMutation, useTournament, useTournaments } from '@/features/points/hooks';
import { formatDate, todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');

/** Torneos de la temporada: quien manda una foto con la equipación oficial gana sus puntos (en el mes del torneo). */
export function TournamentsTab({ month }: { month: string }) {
  const tournaments = useTournaments(month);
  const [editing, setEditing] = useState<Tournament | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Tournament | null>(null);
  const remove = usePointsMutation((id: string) => deleteTournament(id));
  const toast = useToast();

  if (tournaments.isPending) return <p className="text-ink-muted">Cargando torneos…</p>;
  if (tournaments.isError) return <Alert>{apiErrorMessage(tournaments.error)}</Alert>;
  const items = tournaments.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus aria-hidden size={16} />
          Nuevo torneo
        </Button>
      </div>
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <p className="px-5 py-8 text-center text-ink-muted">Aún no hay torneos esta temporada.</p>
        ) : (
          <ul aria-label="Torneos">
            {items.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft px-5 py-3 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => setOpen(t.id)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <span className="block font-semibold">{t.name}</span>
                  <span className="block text-[13px] text-ink-muted">
                    {formatDate(t.date)} · {t.pointsPerPhoto}{' '}
                    {t.pointsPerPhoto === 1 ? 'punto' : 'puntos'} por foto · {t.photos}{' '}
                    {t.photos === 1 ? 'foto' : 'fotos'}
                  </span>
                </button>
                <Button variant="secondary" onClick={() => setOpen(t.id)}>
                  Marcar fotos
                </Button>
                <Button variant="ghost" onClick={() => setEditing(t)}>
                  Editar
                </Button>
                {t.photos === 0 && (
                  <button
                    type="button"
                    aria-label={`Borrar ${t.name}`}
                    onClick={() => setRemoving(t)}
                    className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                  >
                    <Trash2 aria-hidden size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-[13px] text-ink-muted">
        Cada alumno que manda una foto con la equipación oficial en el torneo gana sus puntos, que
        cuentan en el mes del torneo.
      </p>
      {editing && (
        <TournamentDialog
          tournament={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {open && <PhotosDialog id={open} onClose={() => setOpen(null)} />}
      {removing && (
        <ConfirmDialog
          title="Borrar torneo"
          message={`Se borrará ${removing.name}.`}
          confirmLabel="Borrar"
          busy={remove.isPending}
          error={remove.isError ? apiErrorMessage(remove.error) : null}
          onCancel={() => {
            remove.reset();
            setRemoving(null);
          }}
          onConfirm={() =>
            remove.mutate(removing.id, {
              onSuccess: () => {
                setRemoving(null);
                toast('Torneo borrado');
              },
            })
          }
        />
      )}
    </div>
  );
}

function TournamentDialog({
  tournament,
  onClose,
}: {
  tournament: Tournament | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(tournament?.name ?? '');
  const [date, setDate] = useState(tournament?.date ?? todayIso());
  const [points, setPoints] = useState(String(tournament?.pointsPerPhoto ?? 1));
  const save = usePointsMutation(() =>
    saveTournament({ name: name.trim(), date, pointsPerPhoto: Number(points) }, tournament?.id),
  );
  const toast = useToast();
  const valid = name.trim() !== '' && date !== '' && /^\d+$/.test(points);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    void save.mutateAsync(undefined).then(
      () => {
        toast(tournament ? 'Torneo guardado' : 'Torneo creado');
        onClose();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="tournament-title">
      <form noValidate onSubmit={submit}>
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2
            id="tournament-title"
            className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
          >
            {tournament ? 'Editar torneo' : 'Nuevo torneo'}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
          >
            <X aria-hidden size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
          <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <DateField
            label="Fecha"
            value={date}
            onChange={setDate}
            fromYear={Number(todayIso().slice(0, 4)) - 1}
            toYear={Number(todayIso().slice(0, 4)) + 1}
          />
          <TextField
            label="Puntos por foto"
            help="De 1 a 20"
            inputMode="numeric"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!valid} busy={save.isPending} busyLabel="Guardando…">
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PhotosDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const tournament = useTournament(id);
  const [search, setSearch] = useState('');
  const mark = usePointsMutation((input: { student: string; sent: boolean }) =>
    markTournamentPhoto(id, input.student, input.sent),
  );
  const data = tournament.data;
  const students = (data?.students ?? []).filter((s) =>
    normalise(s.name).includes(normalise(search.trim())),
  );
  return (
    <Dialog open onClose={onClose} labelledBy="photos-title" size="wide">
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <h2
          id="photos-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          {data ? `Fotos · ${data.name}` : 'Fotos'}
        </h2>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
        >
          <X aria-hidden size={18} />
        </button>
      </div>
      <div className="flex flex-col gap-3 px-6 py-4">
        {mark.isError && <Alert>{apiErrorMessage(mark.error)}</Alert>}
        <input
          type="search"
          aria-label="Buscar alumno"
          placeholder="Buscar alumno"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm"
        />
        {tournament.isPending ? (
          <p className="text-ink-muted">Cargando…</p>
        ) : (
          <ul aria-label="Alumnos" className="max-h-[50vh] overflow-y-auto text-sm">
            {students.map((s) => (
              <li key={s.id} className="border-b border-line-soft last:border-b-0">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={s.sent}
                    disabled={mark.isPending}
                    onChange={() => mark.mutate({ student: s.id, sent: !s.sent })}
                    className="size-5"
                  />
                  <span className="flex-1">{s.name}</span>
                  {s.sent && (
                    <span className="text-[12px] text-success-fg">
                      +{data?.pointsPerPhoto ?? 1}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
