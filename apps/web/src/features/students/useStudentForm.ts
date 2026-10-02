import { useState, type FormEvent } from 'react';

import { ApiError } from '@/shared/api/client';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';

import type { Registration, StudentDetail, StudentPayload } from './api';
import { ageOn } from './format';

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
  groupIds: string[];
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
  groupIds: 'groupIds',
};

function fromDetail(detail: StudentDetail | null, defaultGroupId: string): StudentFormValues {
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
    groupIds: defaultGroupId ? [defaultGroupId] : [],
    siblingId: '',
  };
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

export function toPayload(values: StudentFormValues): StudentPayload {
  const guardians = [
    { name: values.guardian1Name.trim(), phone: values.guardian1Phone.trim() },
    { name: values.guardian2Name.trim(), phone: values.guardian2Phone.trim() },
  ].filter((guardian) => guardian.name !== '' || guardian.phone !== '');
  return {
    fullName: values.fullName.trim(),
    birthDate: values.birthDate,
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
  defaultGroupId: string,
  submitToApi: (values: StudentFormValues) => Promise<unknown>,
) {
  const isEdit = detail !== null;
  const [values, setValues] = useState(() => fromDetail(detail, defaultGroupId));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const age = ageOn(values.birthDate);
  const isMinor = age !== null && age < 18;
  const hasGuardian = values.guardian1Name.trim() !== '' && values.guardian1Phone.trim() !== '';
  const needsOwnPhone = age !== null && !isMinor && !hasGuardian;

  const set = <K extends Field>(key: K, value: StudentFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function validate(): FieldErrors {
    return {
      ...(values.fullName.trim() === '' && { fullName: 'Escribe el nombre y apellidos.' }),
      ...(values.birthDate === '' && { birthDate: 'Indica la fecha de nacimiento.' }),
      ...(isMinor &&
        !hasGuardian && {
          guardian1Name: 'Un alumno menor necesita al menos un tutor con teléfono.',
        }),
      ...(needsOwnPhone &&
        values.ownPhone.trim() === '' && {
          ownPhone: 'Sin tutor, el alumno necesita su propio teléfono.',
        }),
      ...(values.federated &&
        values.federationLicence.trim() === '' && {
          federationLicence: 'Indica el número de licencia.',
        }),
      ...(!isEdit &&
        values.groupIds.filter(Boolean).length === 0 && { groupIds: 'Elige al menos un grupo.' }),
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
    needsOwnPhone,
    fieldErrors,
    errorMessage,
    isSubmitting,
    submit,
  };
}

export function toRegistration(values: StudentFormValues): Registration {
  return {
    ...toPayload(values),
    groupIds: values.groupIds.filter(Boolean),
    siblingIds: values.siblingId ? [values.siblingId] : [],
  };
}
