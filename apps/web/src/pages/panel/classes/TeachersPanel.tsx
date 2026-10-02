import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import type { Teacher } from '@/features/classes/api';
import { useCreateTeacher, useUpdateTeacher } from '@/features/classes/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Switch } from '@/shared/ui/Switch';
import { TextField } from '@/shared/ui/TextField';

function NewTeacherForm() {
  const [name, setName] = useState('');
  const create = useCreateTeacher();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === '') return;
    create.mutate(name.trim(), { onSuccess: () => setName('') });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-end"
    >
      <TextField
        label="Nombre y apellidos"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Button type="submit" busy={create.isPending} busyLabel="Añadiendo…" className="shrink-0">
        Añadir profesor
      </Button>
      {create.isError && <Alert>{apiErrorMessage(create.error)}</Alert>}
    </form>
  );
}

function TeacherRow({ teacher }: { teacher: Teacher }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(teacher.fullName);
  const [active, setActive] = useState(teacher.active);
  const update = useUpdateTeacher();

  function save(event: FormEvent) {
    event.preventDefault();
    update.mutate(
      { id: teacher.id, fullName: name, active },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (editing) {
    return (
      <li className="border-b border-line p-4 last:border-b-0">
        <form onSubmit={save} className="flex flex-col gap-3">
          {update.isError && <Alert>{apiErrorMessage(update.error)}</Alert>}
          <TextField
            label="Nombre y apellidos"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Switch label="Activo" checked={active} onChange={setActive} />
          <div className="flex gap-2">
            <Button type="submit" busy={update.isPending} busyLabel="Guardando…">
              Guardar
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span className="flex-1 font-medium">{teacher.fullName}</span>
      <span className="text-sm text-ink-muted">
        {teacher.groupCount} {teacher.groupCount === 1 ? 'grupo' : 'grupos'}
      </span>
      <Badge tone={teacher.active ? 'success' : 'neutral'}>
        {teacher.active ? 'Activo' : 'Inactivo'}
      </Badge>
      <button
        type="button"
        aria-label={`Editar ${teacher.fullName}`}
        onClick={() => setEditing(true)}
        className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
      >
        <Pencil aria-hidden size={16} />
      </button>
    </li>
  );
}

export function TeachersPanel({ teachers }: { teachers: Teacher[] }) {
  return (
    <Card>
      <NewTeacherForm />
      {teachers.length === 0 ? (
        <p className="p-4 text-sm text-ink-muted">Todavía no hay profesores.</p>
      ) : (
        <ul aria-label="Profesores">
          {teachers.map((teacher) => (
            <TeacherRow key={teacher.id} teacher={teacher} />
          ))}
        </ul>
      )}
    </Card>
  );
}
