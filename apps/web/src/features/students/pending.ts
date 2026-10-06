import type { MissingDatum } from './api';

/** Etiquetas de los datos que pueden faltar, en el orden en que se muestran. */
export const MISSING_LABELS: { key: MissingDatum; label: string; plural: string }[] = [
  { key: 'birth_date', label: 'fecha de nacimiento', plural: 'Sin fecha de nacimiento' },
  { key: 'guardian', label: 'tutor', plural: 'Sin tutor' },
  { key: 'guardian_phone', label: 'teléfono del tutor', plural: 'Sin teléfono del tutor' },
  { key: 'phone', label: 'teléfono', plural: 'Sin teléfono' },
  { key: 'email', label: 'email', plural: 'Sin email' },
];

export function missingLabel(key: MissingDatum): string {
  return MISSING_LABELS.find((m) => m.key === key)?.label ?? key;
}

/** «Pendiente: fecha de nacimiento, tutor y email». */
export function missingSentence(missing: MissingDatum[]): string {
  const labels = missing.map(missingLabel);
  if (labels.length === 0) return '';
  const joined =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}`;
  return `Pendiente: ${joined}`;
}
