import { useQueryClient } from '@tanstack/react-query';

import { SESSION_QUERY_KEY } from '@/app/queryClient';

/**
 * Tras cualquier cambio se refrescan todos los datos del club: cobros, profesorado, contabilidad, alumnado,
 * clases y el resumen dependen unos de otros (un cobro es un movimiento, una inscripción cambia la cuota…).
 * La sesión no se toca.
 */
export function useRefreshClubData() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0],
    });
}
