import { ImagePlus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { currentMonth, monthLabel } from '@/features/billing/money';
import { addPhoto, deletePhoto, photoUrl, type TournamentPhoto } from '@/features/points/api';
import { usePhotos, usePointsMutation, useStudentPoints } from '@/features/points/hooks';
import { resizePhoto } from '@/features/points/resizePhoto';
import { formatDate, todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Combobox } from '@/shared/ui/Combobox';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

/**
 * Fotos con la equipación oficial en los torneos: la galería del mes y «Añadir foto» (se busca al alumno y se adjunta
 * la foto). Cada foto es un punto en el mes de la foto.
 */
export function PhotosTab({ month }: { month: string }) {
  const photos = usePhotos(month);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TournamentPhoto | null>(null);
  const remove = usePointsMutation((id: string) => deletePhoto(id));
  const toast = useToast();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Cada foto con la equipación oficial en un torneo es 1 punto en el mes de la foto.
        </p>
        <Button onClick={() => setAdding(true)}>
          <ImagePlus aria-hidden size={16} />
          Añadir foto
        </Button>
      </div>
      {photos.isPending ? (
        <p className="text-ink-muted">Cargando fotos…</p>
      ) : photos.isError ? (
        <Alert>{apiErrorMessage(photos.error)}</Alert>
      ) : photos.data.length === 0 ? (
        <Card className="px-5 py-10 text-center text-ink-muted">
          No hay fotos en {monthLabel(month).toLowerCase()}.
        </Card>
      ) : (
        <ul
          aria-label={`Fotos de ${monthLabel(month).toLowerCase()}`}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {photos.data.map((photo) => (
            <li key={photo.id}>
              <Card className="overflow-hidden">
                <a href={photoUrl(photo.id)} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={photoUrl(photo.id)}
                    alt={`${photo.studentName}${photo.note ? ` en ${photo.note}` : ''}`}
                    loading="lazy"
                    className="aspect-square w-full bg-surface-muted object-cover"
                  />
                </a>
                <div className="flex items-start gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-semibold">{photo.studentName}</p>
                    <p className="truncate text-[13px] text-ink-muted">
                      {formatDate(photo.date)}
                      {photo.note ? ` · ${photo.note}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Quitar la foto de ${photo.studentName} del ${formatDate(photo.date)}`}
                    onClick={() => setRemoving(photo)}
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-muted"
                  >
                    <Trash2 aria-hidden size={15} />
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {adding && <AddPhotoDialog onClose={() => setAdding(false)} />}
      {removing && (
        <ConfirmDialog
          title="Quitar la foto"
          message={`Se quitará la foto de ${removing.studentName} y su punto de ${monthLabel(removing.date.slice(0, 7)).toLowerCase()}.`}
          confirmLabel="Quitar foto"
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
                toast('Foto quitada');
              },
            })
          }
        />
      )}
    </div>
  );
}

function AddPhotoDialog({ onClose }: { onClose: () => void }) {
  const students = useStudentPoints(currentMonth());
  const [student, setStudent] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const save = usePointsMutation(async () =>
    addPhoto({
      studentId: student,
      date,
      note: note.trim(),
      file: await resizePhoto(file as File),
    }),
  );
  const toast = useToast();
  const year = Number(todayIso().slice(0, 4));
  const ready = student !== '' && date !== '' && file !== null;

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    void save.mutateAsync(undefined).then(
      () => {
        toast('Foto añadida');
        onClose();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="add-photo-title">
      <form noValidate onSubmit={submit}>
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2
            id="add-photo-title"
            className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
          >
            Añadir foto
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
          <Combobox
            label="Alumno"
            placeholder="Escribe para buscar al alumno…"
            options={(students.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            value={student}
            onChange={setStudent}
          />
          <DateField
            label="Fecha de la foto"
            value={date}
            onChange={setDate}
            fromYear={year - 1}
            toYear={year}
          />
          <TextField
            label="Torneo"
            help="Opcional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Foto
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>
          {preview && (
            <img
              src={preview}
              alt="Vista previa de la foto"
              className="max-h-56 w-full rounded-sm object-contain"
            />
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!ready} busy={save.isPending} busyLabel="Subiendo…">
            Añadir foto
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
