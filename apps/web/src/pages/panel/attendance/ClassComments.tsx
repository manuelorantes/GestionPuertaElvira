import { Pencil, Trash2 } from 'lucide-react';
import { Fragment, useId, useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import type { ClassComment } from '@/features/class-comments/api';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { StudentLink } from '@/pages/panel/students/StudentLink';

const MAX_LENGTH = 1000;

interface CommentFormProps {
  label: string;
  initial?: string;
  onSave: (text: string) => Promise<unknown>;
  onCancel: () => void;
}

/** Un comentario (hasta 1000 caracteres) que se guarda al momento; si falla, se queda abierto con el error. */
export function CommentForm({ label, initial = '', onSave, onCancel }: CommentFormProps) {
  const id = useId();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim() === '') return;
    setBusy(true);
    setError(null);
    onSave(text.trim()).catch((failure: unknown) => {
      setError(apiErrorMessage(failure));
      setBusy(false);
    });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2">
      {error && <Alert>{error}</Alert>}
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        maxLength={MAX_LENGTH}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={text.trim() === ''} busy={busy} busyLabel="Guardando…">
          Guardar comentario
        </Button>
      </div>
    </form>
  );
}

interface CommentListProps {
  label: string;
  comments: ClassComment[];
  /** Qué se ve de cada uno además del texto y su autor. */
  show?: { date?: boolean; student?: boolean; group?: boolean };
  canEdit: (comment: ClassComment) => boolean;
  onRewrite: (id: string, text: string) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}

/** Comentarios con su día, su alumno o su clase (según dónde se vean) y quién los escribió; los propios se cambian. */
export function CommentList({
  label,
  comments,
  show = {},
  canEdit,
  onRewrite,
  onRemove,
}: CommentListProps) {
  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-line-soft">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          show={show}
          editable={canEdit(comment)}
          onRewrite={onRewrite}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}

function CommentItem({
  comment,
  show,
  editable,
  onRewrite,
  onRemove,
}: {
  comment: ClassComment;
  show: NonNullable<CommentListProps['show']>;
  editable: boolean;
  onRewrite: CommentListProps['onRewrite'];
  onRemove: CommentListProps['onRemove'];
}) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const student =
    comment.studentId === null ? (
      'Toda la clase'
    ) : (
      <StudentLink id={comment.studentId}>{comment.studentName}</StudentLink>
    );
  const meta = [
    show.date ? formatDate(comment.date) : null,
    show.group ? comment.groupName : null,
    show.student ? student : null,
    comment.author,
  ].filter((part) => part !== null && part !== '');

  function remove() {
    setBusy(true);
    onRemove(comment.id).catch((failure: unknown) => {
      setError(apiErrorMessage(failure));
      setBusy(false);
    });
  }

  if (editing)
    return (
      <li className="py-2.5">
        <CommentForm
          label="Comentario"
          initial={comment.text}
          onSave={(text) => onRewrite(comment.id, text).then(() => setEditing(false))}
          onCancel={() => setEditing(false)}
        />
      </li>
    );

  return (
    <li className="flex items-start gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm whitespace-pre-line text-ink">{comment.text}</p>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          {meta.map((part, index) => (
            <Fragment key={index}>
              {index > 0 && ' · '}
              {part}
            </Fragment>
          ))}
        </p>
      </div>
      {editable && (
        <span className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label="Editar comentario"
            onClick={() => setEditing(true)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-muted"
          >
            <Pencil aria-hidden size={15} />
          </button>
          <button
            type="button"
            aria-label="Quitar comentario"
            onClick={() => setRemoving(true)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-muted"
          >
            <Trash2 aria-hidden size={15} />
          </button>
        </span>
      )}
      {removing && (
        <ConfirmDialog
          title="Quitar comentario"
          message={`¿Seguro que quieres quitar el comentario «${comment.text}»?`}
          confirmLabel="Sí, quitarlo"
          busy={busy}
          error={error}
          onCancel={() => setRemoving(false)}
          onConfirm={remove}
        />
      )}
    </li>
  );
}
