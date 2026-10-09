import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

/**
 * Cabecera de columna que ordena la tabla al pincharla (la forma de ordenar de toda la aplicación): la flecha indica
 * la columna activa y el sentido; pinchar la activa invierte el orden.
 */
export function SortHeader({
  label,
  name,
  active,
  descending,
  onSort,
}: {
  label: string;
  /** Para «Ordenar por …» (lectores de pantalla y la ayuda al pasar el ratón). */
  name: string;
  active: boolean;
  descending: boolean;
  onSort: () => void;
}) {
  const Icon = !active ? ArrowUpDown : descending ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onSort}
      aria-label={`Ordenar por ${name}`}
      aria-pressed={active}
      title={`Ordenar por ${name}`}
      className={`inline-flex cursor-pointer items-center gap-1 text-left uppercase hover:text-ink ${active ? 'text-ink' : ''}`}
    >
      {label}
      <Icon aria-hidden size={13} className={`shrink-0 ${active ? '' : 'opacity-50'}`} />
    </button>
  );
}
