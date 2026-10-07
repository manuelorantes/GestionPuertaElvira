import type { StudentSummary } from './api';

export type SortKey = 'number' | 'name';
export interface StudentSort {
  key: SortKey;
  descending: boolean;
}

const PARAM: Record<SortKey, string> = { number: 'numero', name: 'nombre' };

/** ?orden=numero | -numero | nombre | -nombre (por defecto, por nombre de la A a la Z). */
export function sortFrom(value: string | null): StudentSort {
  const descending = value?.startsWith('-') ?? false;
  const key = (Object.keys(PARAM) as SortKey[]).find((k) => PARAM[k] === value?.replace(/^-/, ''));
  return { key: key ?? 'name', descending: key ? descending : false };
}

export function sortParam(sort: StudentSort): string {
  return sort.key === 'name' && !sort.descending
    ? ''
    : `${sort.descending ? '-' : ''}${PARAM[sort.key]}`;
}

/** Pulsar la columna por la que ya se ordena invierte el orden; otra columna empieza de menor a mayor. */
export function toggleSort(current: StudentSort, key: SortKey): StudentSort {
  return { key, descending: current.key === key ? !current.descending : false };
}

const collator = new Intl.Collator('es', { sensitivity: 'base' });

export function sortStudents(students: StudentSummary[], sort: StudentSort): StudentSummary[] {
  const sorted = [...students].sort((a, b) =>
    sort.key === 'number'
      ? a.memberNumber - b.memberNumber
      : collator.compare(a.fullName, b.fullName),
  );
  return sort.descending ? sorted.reverse() : sorted;
}
