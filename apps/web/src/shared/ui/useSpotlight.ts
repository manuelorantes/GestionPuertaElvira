import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

const SPOTLIGHT_MS = 3000;

/** Fondo algo más oscuro para la fila a la que apunta un enlace. */
export const SPOTLIGHT_CLASS = 'bg-surface-muted transition-colors duration-700';

/**
 * La fila a la que apunta un enlace (`?movimiento=…`, `?factura=…`): al pintarse se desplaza hasta ella y
 * se resalta tres segundos; después el parámetro desaparece de la dirección y la fila vuelve a su color.
 */
export function useSpotlight(param: string): {
  id: string | null;
  attach: (row: HTMLElement | null) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const id = searchParams.get(param);
  const timer = useRef<number | null>(null);

  const attach = useCallback(
    (row: HTMLElement | null) => {
      if (row === null || timer.current !== null) return;
      row.scrollIntoView({ block: 'center' });
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setSearchParams(
          (current) => {
            const next = new URLSearchParams(current);
            next.delete(param);
            return next;
          },
          { replace: true },
        );
      }, SPOTLIGHT_MS);
    },
    [param, setSearchParams],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return { id, attach };
}
