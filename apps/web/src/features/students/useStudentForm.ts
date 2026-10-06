import { useState, type FormEvent } from 'react';

import { ApiError } from '@/shared/api/client';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';

import type { MissingDatum, Registration, StudentDetail, StudentPayload } from './api';
import { ageOn } from './format';

/** Espejo de la regla de la API: qué quedará pendiente con los datos del formulario. */
function missingDataFor(values: StudentFormValues): MissingDatum[] {
  const age = ageOn(values.birthDate);
  const guardians = [
    { name: values.guardian1Name.trim(), phone: values.guardian1Phone.trim() },
    { name: values.guardian2Name.trim(), phone: values.guardian2Phone.trim() },
  ].filter((g) => g.name !== '');
  const missing: MissingDatum[] = [];
  if (!values.birthDate) missing.push('birth_date');
  if (age === null || age < 18) {
    if (guardians.length === 0) missing.push('guardian');
    else if (guardians.every((g) => g.phone === '')) missing.push('guardian_phone');
  } else if (values.ownPhone.trim() === '') {
    missing.push('phone');
  }
  if (values.contactEmail.trim() === '') missing.push('email');
  return missing;
}

export interface StudentFormValues {
  fullName: string;
  birthDate: string;
  nationalId: string;
  contactEmail: string;
  guardian1Name: string;
  guardian1Phone: string;
  guardian2Name: string;
  guardian2Phone: string;
  ownPhone: string;
  federated: boolean;
  federationLicence: string;
  imageConsent: boolean;
  siblingId: string;
}

type Field = keyof StudentFormValues;
type FieldErrors = Partial<Record<Field, string>>;

const API_FIELD: Record<string, Field> = {
  fullName: 'fullName',
  birthDate: 'birthDate',
  nationalId: 'nationalId',
  contactEmail: 'contactEmail',
  guardians: 'guardian1Name',
  ownPhone: 'ownPhone',
  federationLicence: 'federationLicence',
  phone: 'guardian1Phone',
};

function fromDetail(detail: StudentDetail | null): StudentFormValues {
  const [g1, g2] = detail?.guardians ?? [];
  return {
    fullName: detail?.fullName ?? '',
    birthDate: detail?.birthDate ?? '',
    nationalId: detail?.nationalId ?? '',
    contactEmail: detail?.contactEmail ?? '',
    guardian1Name: g1?.name ?? '',
    guardian1Phone: g1?.phone ?? '',
    guardian2Name: g2?.name ?? '',
    guardian2Phone: g2?.phone ?? '',
    ownPhone: detail?.ownPhone ?? '',
    federated: Boolean(detail?.federationLicence),
    federationLicence: detail?.federationLicence ?? '',
    imageConsent: detail?.imageConsent ?? true,
    siblingId: '',
  };
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

export function toPayload(values: StudentFormValues): StudentPayload {
  // Un tutor sin teléfono vale (quedará en Datos pendientes); un teléfono sin nombre no es un tutor.
  const guardians = [
    { name: values.guardian1Name.trim(), phone: orNull(values.guardian1Phone) },
    { name: values.guardian2Name.trim(), phone: orNull(values.guardian2Phone) },
  ].filter((guardian) => guardian.name !== '');
  return {
    fullName: values.fullName.trim(),
    birthDate: orNull(values.birthDate),
    nationalId: orNull(values.nationalId),
    contactEmail: orNull(values.contactEmail),
    guardians,
    ownPhone: orNull(values.ownPhone),
    federationLicence: values.federated ? orNull(values.federationLicence) : null,
    imageConsent: values.imageConsent,
  };
}

/**
 * Estado y reglas del formulario de alumno (espejo de las reglas de la API).
 */
export function useStudentForm(
  detail: StudentDetail | null,
  submitToApi: (values: StudentFormValues) => Promise<unknown>,
) {
  const isEdit = detail !== null;
  const [values, setValues] = useState(() => fromDetail(detail));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const age = ageOn(values.birthDate);
  const isMinor = age !== null && age < 18;
  // Solo el nombre es obligatorio: lo demás se reclama en Datos pendientes (mismas reglas que la API).
  const pending = missingDataFor(values);

  const set = <K extends Field>(key: K, value: StudentFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function validate(): FieldErrors {
    return {
      ...(values.fullName.trim() === '' && { fullName: 'Escribe el nombre y apellidos.' }),
      ...(values.federated &&
        values.federationLicence.trim() === '' && {
          federationLicence: 'Indica el número de licencia.',
        }),
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setErrorMessage(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await submitToApi(values);
    } catch (error) {
      const field = error instanceof ApiError && error.field ? API_FIELD[error.field] : undefined;
      if (field) setFieldErrors({ [field]: error instanceof Error ? error.message : '' });
      else setErrorMessage(apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return {
    values,
    set,
    isEdit,
    isMinor,
    /** Datos esperados que faltan con lo escrito hasta ahora. */
    pending,
    fieldErrors,
    errorMessage,
    isSubmitting,
    submit,
  };
}

export function toRegistration(
  values: StudentFormValues,
  enrolments: Registration['enrolments'],
): Registration {
  return {
    ...toPayload(values),
    enrolments,
    siblingIds: values.siblingId ? [values.siblingId] : [],
  };
}
