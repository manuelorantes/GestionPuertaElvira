import { X } from 'lucide-react';
import { useState } from 'react';

import type { ScheduleBlock } from '@/features/classes/api';
import { useGroups } from '@/features/classes/hooks';
import type { Attendance } from '@/features/students/api';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  type Registration,
  registerStudent,
  type StudentDetail,
  updateStudent,
} from '@/features/students/api';
import { missingSentence } from '@/features/students/pending';
import { useStudentMutation, useStudents } from '@/features/students/hooks';
import {
  toPayload,
  toRegistration,
  useStudentForm,
  type StudentFormValues,
} from '@/features/students/useStudentForm';
import { useOverCapacityConfirm } from '@/features/students/useOverCapacityConfirm';
import { useScheduleResolution } from '@/features/students/useScheduleResolution';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { todayIso } from '@/features/students/format';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { Switch } from '@/shared/ui/Switch';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { EnrolmentDialog } from './EnrolmentDialog';
import { ScheduleEditor } from './ScheduleEditor';

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
  const students = useStudents('active', '');
  const toast = useToast();
  const overCapacity = useOverCapacityConfirm();
  // Los grupos salen del horario ya traducido por la API (ver más abajo).
  // Las horas a las que vendrá; la API las traduce a grupos (completos o con horario especial).
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const resolution = useScheduleResolution(detail ? [] : schedule);
  // Horario especial ajustado a mano en el alta (como el reloj de la ficha), por grupo.
  const [overrides, setOverrides] = useState<Record<string, Attendance | null>>({});
  const [editingAttendance, setEditingAttendance] = useState<string | null>(null);
  const groups = useGroups();
  const [joinedOn, setJoinedOn] = useState(todayIso());
  const enrolments: Registration['enrolments'] = (resolution.data?.enrolments ?? []).map((e) => ({
    groupId: e.groupId,
    attendance: e.groupId in overrides ? (overrides[e.groupId] ?? null) : e.attendance,
  }));
  const register = useStudentMutation(
    ({ values, confirm }: { values: StudentFormValues; confirm: boolean }) =>
      registerStudent({ ...toRegistration(values, enrolments), joinedOn }, confirm),
  );
  const update = useStudentMutation((values: StudentFormValues) =>
    updateStudent(detail?.id ?? '', toPayload(values)),
  );

  const form = useStudentForm(detail, async (values) => {
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
  // Con horario, hay que esperar a saber los grupos y que no quede nada sin clase, sin aula o sin resolver.
  const scheduleReady =
    schedule.length === 0 ||
    (resolution.data !== undefined &&
      !resolution.isFetching &&
      resolution.data.uncovered.length === 0 &&
      resolution.data.choices.length === 0 &&
      resolution.data.problems.length === 0 &&
      schedule.every((b) => b.start < b.end));

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
              {!detail && (
                <DateField
                  label="Fecha de alta"
                  value={joinedOn}
                  onChange={setJoinedOn}
                  fromYear={CURRENT_YEAR - 1}
                  toYear={CURRENT_YEAR}
                />
              )}
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
            <Section title="Contacto">
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
            </Section>
            {!form.isEdit && (
              <Section title="Familia directa en el club">
                <Select
                  label="Familia directa en el club (opcional)"
                  options={[
                    { value: '', label: 'Sin familia directa en el club' },
                    ...(students.data?.items ?? []).map((s) => ({
                      value: s.id,
                      label: s.fullName,
                    })),
                  ]}
                  value={values.siblingId}
                  onChange={(value) => set('siblingId', value)}
                />
              </Section>
            )}
            <Section title="Club">
              {!form.isEdit && (
                <ScheduleEditor
                  blocks={schedule}
                  onChange={setSchedule}
                  resolution={resolution.data}
                  loading={resolution.isFetching}
                  overrides={overrides}
                  onEditAttendance={setEditingAttendance}
                />
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
            <Button
              type="submit"
              busy={form.isSubmitting}
              busyLabel="Guardando…"
              disabled={!form.isEdit && !scheduleReady}
            >
              {form.isEdit ? 'Guardar cambios' : 'Dar de alta'}
            </Button>
          </div>
        </form>
      </Dialog>
      {editingAttendance && (
        <EnrolmentDialog
          title="Horario en el grupo"
          confirmLabel="Guardar"
          groups={groups.data ?? []}
          fixedGroup={(groups.data ?? []).find((g) => g.id === editingAttendance)}
          current={enrolments.find((e) => e.groupId === editingAttendance)?.attendance ?? null}
          onClose={() => setEditingAttendance(null)}
          onConfirm={(groupId, attendance) => {
            setOverrides((current) => ({ ...current, [groupId]: attendance }));
            setEditingAttendance(null);
            return Promise.resolve();
          }}
        />
      )}
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
