import { Plus, X } from 'lucide-react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { useGroups } from '@/features/classes/hooks';
import { registerStudent, updateStudent, type StudentDetail } from '@/features/students/api';
import { missingSentence } from '@/features/students/pending';
import { useStudentMutation, useStudents } from '@/features/students/hooks';
import {
  toPayload,
  toRegistration,
  useStudentForm,
  type StudentFormValues,
} from '@/features/students/useStudentForm';
import { useOverCapacityConfirm } from '@/features/students/useOverCapacityConfirm';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { Switch } from '@/shared/ui/Switch';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

interface StudentDialogProps {
  detail: StudentDetail | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}

const CURRENT_YEAR = new Date().getFullYear();

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function StudentDialog({ detail, onClose, onSaved }: StudentDialogProps) {
  const groups = useGroups();
  const students = useStudents('active', '');
  const toast = useToast();
  const overCapacity = useOverCapacityConfirm();
  const register = useStudentMutation(
    ({ values, confirm }: { values: StudentFormValues; confirm: boolean }) =>
      registerStudent(toRegistration(values), confirm),
  );
  const update = useStudentMutation((values: StudentFormValues) =>
    updateStudent(detail?.id ?? '', toPayload(values)),
  );
  const groupOptions = (groups.data ?? []).map((g) => ({
    value: g.id,
    label: `${g.name} · ${g.slotLabel} · ${g.occupied}/${g.capacity}`,
  }));

  const form = useStudentForm(detail, groupOptions[0]?.value ?? '', async (values) => {
    if (detail) {
      await update.mutateAsync(values);
      toast('Cambios guardados');
      onSaved(detail.id);
      return;
    }
    await overCapacity.run(async (confirm) => {
      const id = await register.mutateAsync({ values, confirm });
      toast(`${values.fullName.trim()} dado de alta`);
      onSaved(id);
    });
  });
  const { values, set, fieldErrors } = form;
  const title = form.isEdit ? 'Editar alumno' : 'Nuevo alumno';

  return (
    <>
      <Dialog open onClose={onClose} labelledBy="student-dialog-title" size="wide">
        <form noValidate onSubmit={(event) => void form.submit(event)}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-6 py-5">
            <h2
              id="student-dialog-title"
              className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex size-10 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
            >
              <X aria-hidden size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-6 p-6">
            {form.errorMessage && <Alert>{form.errorMessage}</Alert>}
            <p className="text-[13px] text-ink-muted">
              Solo el nombre es obligatorio. Lo que falte quedará anotado en «Datos pendientes»
              {form.pending.length > 0 ? ` (${missingSentence(form.pending).toLowerCase()})` : ''}.
            </p>
            <Section title="Datos del alumno">
              <TextField
                label="Nombre y apellidos"
                placeholder="p. ej. Lucía Fernández Ortiz"
                value={values.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                error={fieldErrors.fullName}
              />
              <DateField
                label="Fecha de nacimiento"
                value={values.birthDate}
                onChange={(iso) => set('birthDate', iso)}
                fromYear={CURRENT_YEAR - 100}
                toYear={CURRENT_YEAR}
                error={fieldErrors.birthDate}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="DNI o NIE (opcional)"
                  placeholder="12345678Z"
                  value={values.nationalId}
                  onChange={(e) => set('nationalId', e.target.value)}
                  error={fieldErrors.nationalId}
                />
                <TextField
                  label="Email de contacto (opcional)"
                  type="email"
                  value={values.contactEmail}
                  onChange={(e) => set('contactEmail', e.target.value)}
                  error={fieldErrors.contactEmail}
                />
              </div>
            </Section>
            <Section title="Familia y contacto">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Tutor 1"
                  placeholder="Nombre y apellidos"
                  value={values.guardian1Name}
                  onChange={(e) => set('guardian1Name', e.target.value)}
                  error={fieldErrors.guardian1Name}
                />
                <TextField
                  label="Teléfono tutor 1"
                  type="tel"
                  value={values.guardian1Phone}
                  onChange={(e) => set('guardian1Phone', e.target.value)}
                  error={fieldErrors.guardian1Phone}
                />
                <TextField
                  label="Tutor 2 (opcional)"
                  placeholder="Nombre y apellidos"
                  value={values.guardian2Name}
                  onChange={(e) => set('guardian2Name', e.target.value)}
                />
                <TextField
                  label="Teléfono tutor 2"
                  type="tel"
                  value={values.guardian2Phone}
                  onChange={(e) => set('guardian2Phone', e.target.value)}
                />
              </div>
              <TextField
                label="Teléfono del alumno"
                type="tel"
                value={values.ownPhone}
                onChange={(e) => set('ownPhone', e.target.value)}
                error={fieldErrors.ownPhone}
              />
              {!form.isEdit && (
                <Select
                  label="Hermano en el club (opcional)"
                  options={[
                    { value: '', label: 'Sin hermanos en el club' },
                    ...(students.data?.items ?? []).map((s) => ({
                      value: s.id,
                      label: s.fullName,
                    })),
                  ]}
                  value={values.siblingId}
                  onChange={(value) => set('siblingId', value)}
                />
              )}
            </Section>
            <Section title="Club">
              {!form.isEdit && (
                <div className="flex flex-col gap-3">
                  {values.groupIds.map((groupId, index) => (
                    <Select
                      key={index}
                      label={index === 0 ? 'Grupo' : 'Otro grupo'}
                      options={[{ value: '', label: 'Elige un grupo' }, ...groupOptions]}
                      value={groupId}
                      onChange={(value) =>
                        set(
                          'groupIds',
                          values.groupIds.map((g, i) => (i === index ? value : g)),
                        )
                      }
                      error={index === 0 ? fieldErrors.groupIds : undefined}
                    />
                  ))}
                  {values.groupIds.length === 0 && (
                    <Select
                      label="Grupo"
                      options={[{ value: '', label: 'Elige un grupo' }, ...groupOptions]}
                      value=""
                      onChange={(value) => set('groupIds', [value])}
                      error={fieldErrors.groupIds}
                    />
                  )}
                  <Button
                    variant="ghost"
                    className="self-start"
                    onClick={() => set('groupIds', [...values.groupIds, ''])}
                  >
                    <Plus aria-hidden size={16} />
                    Añadir otro grupo
                  </Button>
                  {values.groupIds.filter(Boolean).length === 0 && (
                    <p className="text-[13px] text-ink-muted">
                      Sin grupo, se dará de alta como socio sin clases: se le pedirá la cuota de
                      socio y se podrá inscribir más adelante.
                    </p>
                  )}
                </div>
              )}
              <Switch
                label="Federado"
                checked={values.federated}
                onChange={(checked) => set('federated', checked)}
              />
              {values.federated && (
                <TextField
                  label="Nº de licencia federativa"
                  placeholder="AND-00000"
                  value={values.federationLicence}
                  onChange={(e) => set('federationLicence', e.target.value)}
                  error={fieldErrors.federationLicence}
                />
              )}
              <div>
                <Switch
                  label="Autorización de imagen"
                  checked={values.imageConsent}
                  onChange={(checked) => set('imageConsent', checked)}
                />
                <p className="mt-1 text-[13px] text-ink-muted">
                  Permite usar fotos del alumno en redes y cartelería del club.
                </p>
              </div>
            </Section>
          </div>
          <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" busy={form.isSubmitting} busyLabel="Guardando…">
              {form.isEdit ? 'Guardar cambios' : 'Dar de alta'}
            </Button>
          </div>
        </form>
      </Dialog>
      {overCapacity.message && (
        <ConfirmDialog
          title="Grupo completo"
          message={overCapacity.message}
          confirmLabel="Inscribir igualmente"
          onCancel={overCapacity.cancel}
          onConfirm={() =>
            overCapacity.confirm().catch((error: unknown) => toast(apiErrorMessage(error)))
          }
        />
      )}
    </>
  );
}
