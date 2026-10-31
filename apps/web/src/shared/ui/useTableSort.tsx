import { useState } from 'react';

import { type ColumnFilter, ColumnMenu } from './ColumnMenu';
import { SortHeader } from './SortHeader';

/** Lo que se compara de cada fila: texto, número, fecha ISO o nada (lo vacío va primero de menor a mayor). */
type SortValue = string | number | null | undefined;

export interface SortColumn<T> {
  /** Texto de la cabecera. */
  label: string;
  /** Para «Ordenar por …» (lectores de pantalla y la ayuda al pasar el ratón). */
  name: string;
  value: (item: T) => SortValue;
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function compareValues(a: SortValue, b: SortValue): number {
  if (a == null || b == null) return Number(a != null) - Number(b != null);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/** Lo que convierte una cabecera en menú: el filtro y, si no bastan las de por defecto, otras formas de ordenar. */
interface HeaderMenu<K extends string> {
  filter: ColumnFilter;
  /** Por defecto, de la A a la Z y de la Z a la A por la propia columna. */
  sorts?: { label: string; sort: { key: K; descending: boolean } }[];
}

/**
 * Ordenación de una tabla desde sus cabeceras (la forma de ordenar de toda la aplicación): `header(key)` pinta la
 * cabecera de una columna y `apply(items)` devuelve las filas en el orden elegido. Pinchar la columna activa invierte
 * el orden; otra columna empieza de menor a mayor (o de la A a la Z). A igualdad, decide la columna por defecto y,
 * si sigue el empate, el orden de llegada. `setSort` permite elegir el orden desde fuera de las cabeceras (un menú),
 * incluso por una columna sin cabecera. Una columna que además filtra pasa `menu` a `header` y su cabecera es un
 * `ColumnMenu` (ordenar y mostrar solo algunos valores); filtrar las filas sigue siendo cosa de quien lo usa.
 */
export function useTableSort<T, K extends string>(
  columns: Record<K, SortColumn<T>>,
  initial: { key: NoInfer<K>; descending?: boolean },
) {
  const [sort, setSort] = useState<{ key: K; descending: boolean }>({
    key: initial.key,
    descending: initial.descending ?? false,
  });

  const header = (key: K, menu?: HeaderMenu<K>) => {
    if (menu) {
      const sorts = menu.sorts ?? [
        { label: 'De la A a la Z', sort: { key, descending: false } },
        { label: 'De la Z a la A', sort: { key, descending: true } },
      ];
      return (
        <ColumnMenu
          label={columns[key].label}
          name={columns[key].name}
          sorted={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : null}
          sorts={sorts.map((choice) => ({
            label: choice.label,
            checked: choice.sort.key === sort.key && choice.sort.descending === sort.descending,
            onSelect: () => setSort(choice.sort),
          }))}
          filter={menu.filter}
        />
      );
    }
    return (
      <SortHeader
        label={columns[key].label}
        name={columns[key].name}
        active={sort.key === key}
        descending={sort.descending}
        onSort={() =>
          setSort((current) => ({
            key,
            descending: current.key === key ? !current.descending : false,
          }))
        }
      />
    );
  };

  const apply = (items: readonly T[]): T[] => {
    const value = columns[sort.key].value;
    const tie = columns[initial.key].value;
    const direction = sort.descending ? -1 : 1;
    // El sentido se aplica a la comparación (no se invierte la lista): los empates conservan el orden de llegada.
    return [...items].sort(
      (a, b) => direction * (compareValues(value(a), value(b)) || compareValues(tie(a), tie(b))),
    );
  };

  return { sort, setSort, header, apply };
}
