import { MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';

import { useGroupAttendance } from '@/features/attendance/hooks';
import {
  addGroupComment,
  type NewClassComment,
  removeComment,
  rewriteComment,
} from '@/features/class-comments/api';
import { useCommentChange, useGroupComments } from '@/features/class-comments/hooks';
import { formatDate } from '@/features/students/format';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Select } from '@/shared/ui/Select';
import { useToast } from '@/shared/ui/Toast';

import { CommentForm, CommentList } from '../attendance/ClassComments';

const ALL_STUDENTS = '';
const WHOLE_CLASS = '';

/**
 * Comentarios de un grupo en un mes, en su propia tarjeta debajo de la asistencia: primero los de la clase y después los de los alumnos, con
 * un selector por los alumnos de la tabla (los del grupo y los que vinieron en asistencia especial). Administración
 * añade, cambia y quita cualquiera.
 */
export function GroupClassComments({
  groupId,
  month,
  className = '',
}: {
  groupId: string;
  month: string;
  /** Relleno de la tarjeta, como el de la tarjeta de asistencia de encima. */
  className?: string;
}) {
  const attendance = useGroupAttendance(groupId, month);
  const comments = useGroupComments(groupId, month);
  const toast = useToast();
  const add = useCommentChange((comment: NewClassComment & { date: string }) =>
    addGroupComment(groupId, comment),
  );
  const rewrite = useCommentChange(({ id, text }: { id: string; text: string }) =>
    rewriteComment(id, text),
  );
  const remove = useCommentChange(removeComment);
  const [studentFilter, setStudentFilter] = useState(ALL_STUDENTS);
  const [adding, setAdding] = useState(false);
  if (!attendance.data || !comments.data) return null;

  const students = attendance.data.students;
  const classDays = attendance.data.days
    .filter((d) => d.status !== 'holiday')
    .map((d) => d.date)
    .reverse();
  const general = comments.data.filter((c) => c.studentId === null);
  const aboutStudents = comments.data.filter(
    (c) =>
      c.studentId !== null && (studentFilter === ALL_STUDENTS || c.studentId === studentFilter),
  );
  const filteredName = students.find((s) => s.id === studentFilter)?.name;
  const actions = {
    canEdit: () => true,
    onRewrite: (id: string, text: string) =>
      rewrite.mutateAsync({ id, text }).then(() => toast('Comentario cambiado')),
    onRemove: (id: string) => remove.mutateAsync(id).then(() => toast('Comentario quitado')),
  };

  return (
    <Card className={className}>
      <section aria-label="Comentarios" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            Comentarios
          </h3>
          {classDays.length > 0 && !adding && (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <MessageSquarePlus aria-hidden size={16} />
              Añadir comentario
            </Button>
          )}
        </div>
        {adding && (
          <NewCommentForm
            days={classDays}
            students={students}
            onSave={(comment) =>
              add.mutateAsync(comment).then(() => {
                toast('Comentario guardado');
                setAdding(false);
              })
            }
            onCancel={() => setAdding(false)}
          />
        )}
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-ink-strong">De la clase</h4>
          {general.length === 0 ? (
            <p className="text-sm text-ink-muted">Sin comentarios de la clase este mes.</p>
          ) : (
            <CommentList
              label="Comentarios de la clase"
              comments={general}
              show={{ date: true }}
              {...actions}
            />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-ink-strong">De los alumnos</h4>
          <div className="max-w-sm">
            <Select
              label="Alumno"
              options={[
                { value: ALL_STUDENTS, label: 'Todos los alumnos' },
                ...students.map((s) => ({ value: s.id, label: s.name })),
              ]}
              value={studentFilter}
              onChange={setStudentFilter}
            />
          </div>
          {aboutStudents.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {filteredName
                ? `${filteredName} no tiene comentarios este mes.`
                : 'Sin comentarios de alumnos este mes.'}
            </p>
          ) : (
            <CommentList
              label="Comentarios de los alumnos"
              comments={aboutStudents}
              show={{ date: true, student: studentFilter === ALL_STUDENTS }}
              {...actions}
            />
          )}
        </div>
      </section>
    </Card>
  );
}

function NewCommentForm({
  days,
  students,
  onSave,
  onCancel,
}: {
  days: string[];
  students: { id: string; name: string }[];
  onSave: (comment: NewClassComment & { date: string }) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(days[0] ?? '');
  const [about, setAbout] = useState(WHOLE_CLASS);
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-line p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Día de la clase"
          options={days.map((d) => ({ value: d, label: formatDate(d) }))}
          value={date}
          onChange={setDate}
        />
        <Select
          label="Sobre"
          options={[
            { value: WHOLE_CLASS, label: 'Toda la clase' },
            ...students.map((s) => ({ value: s.id, label: s.name })),
          ]}
          value={about}
          onChange={setAbout}
        />
      </div>
      <CommentForm
        label="Comentario"
        onSave={(text) => onSave({ date, studentId: about === WHOLE_CLASS ? null : about, text })}
        onCancel={onCancel}
      />
    </div>
  );
}
