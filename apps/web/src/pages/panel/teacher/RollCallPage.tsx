import { ArrowLeft, MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  addRollCallComment,
  type ClassComment,
  type NewClassComment,
  removeOwnComment,
  rewriteOwnComment,
} from '@/features/class-comments/api';
import { useCommentChange, useRollCallComments } from '@/features/class-comments/hooks';
import type { RollCall, RosterStudent } from '@/features/teacher-space/api';
import { dayLabel } from '@/features/teacher-space/dates';
import { useRollCall, useSaveRollCall } from '@/features/teacher-space/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';

import { CommentForm, CommentList } from '../attendance/ClassComments';
import { RollCallHeading, RollCallStudents, SpecialAttendance } from '../attendance/RollCallSheet';
import { useRollCallMarks } from '../attendance/useRollCallMarks';

/**
 * Pasar lista de una clase: nadie marcado al abrirla; se marca a quien ha venido y se guarda (el resto, falta). Abajo, la
 * asistencia especial: alumnos de otras clases que han venido. Una lista pasada se cambia confirmándolo. Los comentarios
 * (de cada alumno y de la clase) son opcionales y se guardan al momento, aparte de la lista.
 */
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
          key={[
            ...rollCall.data.list.map((s) => `${s.id}${s.present}`),
            ...rollCall.data.guests.map((g) => g.id),
          ].join()}
          data={rollCall.data}
        />
      )}
    </main>
  );
}

/** Los comentarios de la clase de ese día: verlos, escribir uno nuevo y cambiar los propios, al momento. */
function useClassComments(groupId: string, date: string) {
  const comments = useRollCallComments(groupId, date);
  const toast = useToast();
  const add = useCommentChange((comment: NewClassComment) =>
    addRollCallComment(groupId, date, comment),
  );
  const rewrite = useCommentChange(({ id, text }: { id: string; text: string }) =>
    rewriteOwnComment(id, text),
  );
  const remove = useCommentChange(removeOwnComment);
  return {
    about: (studentId: string | null) =>
      (comments.data ?? []).filter((c) => c.studentId === studentId),
    add: (comment: NewClassComment) =>
      add.mutateAsync(comment).then(() => toast('Comentario guardado')),
    rewrite: (id: string, text: string) =>
      rewrite.mutateAsync({ id, text }).then(() => toast('Comentario cambiado')),
    remove: (id: string) => remove.mutateAsync(id).then(() => toast('Comentario quitado')),
  };
}

const CLASS_COMMENT = 'class';

function CommentButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Comentar sobre ${name}`}
      title="Añadir comentario"
      onClick={onClick}
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-muted"
    >
      <MessageSquarePlus aria-hidden size={18} />
    </button>
  );
}

interface CommentsAboutProps {
  label: string;
  formLabel: string;
  comments: ClassComment[];
  writing: boolean;
  onSave: (text: string) => Promise<unknown>;
  onCancel: () => void;
  onRewrite: (id: string, text: string) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}

/** Los comentarios sobre un alumno (o la clase) y, si se está escribiendo uno, su formulario. */
function CommentsAbout({ label, formLabel, comments, writing, ...actions }: CommentsAboutProps) {
  if (comments.length === 0 && !writing) return null;
  return (
    <div className="flex flex-col gap-2">
      {comments.length > 0 && (
        <CommentList
          label={label}
          comments={comments}
          canEdit={(c) => c.editable === true}
          onRewrite={actions.onRewrite}
          onRemove={actions.onRemove}
        />
      )}
      {writing && (
        <CommentForm label={formLabel} onSave={actions.onSave} onCancel={actions.onCancel} />
      )}
    </div>
  );
}

function RollCallForm({ data }: { data: RollCall }) {
  const marks = useRollCallMarks(data);
  const [confirming, setConfirming] = useState(false);
  const save = useSaveRollCall(data.groupId ?? '', data.date);
  const navigate = useNavigate();
  const toast = useToast();
  const editable = data.period !== 'upcoming';
  const past = data.period === 'past';
  const savedGuests = new Set(data.guests.map((g) => g.id));
  const comments = useClassComments(data.groupId ?? '', data.date);
  /** A quién se está comentando: un alumno, la clase (CLASS_COMMENT) o nadie. */
  const [writingFor, setWritingFor] = useState<string | null>(null);
  const commentsAbout = (studentId: string | null, name: string) => (
    <CommentsAbout
      label={studentId === null ? 'Comentarios de la clase' : `Comentarios sobre ${name}`}
      formLabel={studentId === null ? 'Comentario de la clase' : `Comentario sobre ${name}`}
      comments={comments.about(studentId)}
      writing={writingFor === (studentId ?? CLASS_COMMENT)}
      onSave={(text) => comments.add({ studentId, text }).then(() => setWritingFor(null))}
      onCancel={() => setWritingFor(null)}
      onRewrite={comments.rewrite}
      onRemove={comments.remove}
    />
  );
  const commentButton = (student: RosterStudent) => (
    <CommentButton name={student.name} onClick={() => setWritingFor(student.id)} />
  );

  function submit() {
    void save.mutateAsync({ ...marks.changes(), past }).then(
      () => {
        toast('Lista guardada');
        void navigate('/panel');
      },
      () => setConfirming(false),
    );
  }

  return (
    <>
      <RollCallHeading data={data} />
      {data.period === 'upcoming' && (
        <Alert>La lista se puede pasar desde 15 minutos antes de que empiece la clase.</Alert>
      )}
      {past && (
        <Alert tone="info">
          Es una clase pasada: puedes cambiar su lista, pero al guardar te pediremos que lo
          confirmes.
        </Alert>
      )}
      {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
      <RollCallStudents
        data={data}
        marks={marks}
        editable={editable}
        actions={(student) => editable && commentButton(student)}
        details={(student) => commentsAbout(student.id, student.name)}
      />
      <SpecialAttendance
        data={data}
        marks={marks}
        editable={editable}
        actions={(guest) => editable && savedGuests.has(guest.id) && commentButton(guest)}
        details={(guest) => commentsAbout(guest.id, guest.name)}
      />
      <Card className="flex flex-col gap-3 p-4">
        <div>
          <h2 className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            Comentarios de la clase
          </h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            Opcional: lo que habéis dado o cualquier cosa de la clase. Los comentarios se guardan al
            momento.
          </p>
        </div>
        {commentsAbout(null, '')}
        {editable && writingFor !== CLASS_COMMENT && (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => setWritingFor(CLASS_COMMENT)}
          >
            <MessageSquarePlus aria-hidden size={16} />
            Añadir comentario
          </Button>
        )}
      </Card>
      {editable && (
        <div className="sticky bottom-0 -mx-4 bg-paper px-4 py-3 md:static md:mx-0 md:p-0">
          <Button
            className="w-full"
            onClick={() => (past ? setConfirming(true) : submit())}
            busy={save.isPending && !confirming}
            busyLabel="Guardando…"
          >
            Guardar lista
          </Button>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title="Cambiar una lista pasada"
          message={`¿Seguro que quieres cambiar la asistencia de una clase pasada (${dayLabel(data.date).toLowerCase()})?`}
          confirmLabel="Sí, cambiarla"
          busy={save.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={submit}
        />
      )}
    </>
  );
}
