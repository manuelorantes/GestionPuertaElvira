import type { ReactNode } from 'react';

import { useCanManageClub } from '@/features/auth/useCanManageClub';
import { removeComment, rewriteComment } from '@/features/class-comments/api';
import { useCommentChange, useStudentComments } from '@/features/class-comments/hooks';
import { Card } from '@/shared/ui/Card';
import { useToast } from '@/shared/ui/Toast';

import { CommentList } from '../attendance/ClassComments';

/** Comentarios que han dejado sobre el alumno en sus clases: día, clase, comentario y quién lo escribió. */
export function StudentCommentsCard({
  studentId,
  title,
}: {
  studentId: string;
  title: (text: string) => ReactNode;
}) {
  const comments = useStudentComments(studentId);
  const toast = useToast();
  const rewrite = useCommentChange(({ id, text }: { id: string; text: string }) =>
    rewriteComment(id, text),
  );
  const remove = useCommentChange(removeComment);
  const canManage = useCanManageClub();
  return (
    <Card className="p-4">
      {title('Comentarios de las clases')}
      {!comments.data ? (
        <p className="text-sm text-ink-muted">{comments.isError ? '—' : 'Cargando…'}</p>
      ) : comments.data.length === 0 ? (
        <p className="text-sm text-ink-muted">Nadie ha comentado nada de sus clases.</p>
      ) : (
        <CommentList
          label="Comentarios de las clases"
          comments={comments.data}
          show={{ date: true, group: true }}
          canEdit={() => canManage}
          onRewrite={(id, text) =>
            rewrite.mutateAsync({ id, text }).then(() => toast('Comentario cambiado'))
          }
          onRemove={(id) => remove.mutateAsync(id).then(() => toast('Comentario quitado'))}
        />
      )}
    </Card>
  );
}
