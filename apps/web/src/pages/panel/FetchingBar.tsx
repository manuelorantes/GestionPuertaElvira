import { useIsFetching } from '@tanstack/react-query';

import { SESSION_QUERY_KEY } from '@/app/queryClient';

/**
 * Barra fina arriba mientras se cargan o actualizan datos del club (no la sesión): lo que se ve puede ser lo de
 * antes (otro mes, o lo guardado en caché) hasta que llega lo nuevo.
 */
export function FetchingBar() {
  const fetching = useIsFetching({
    predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0],
  });
  if (fetching === 0) return null;
  return (
    <div
      role="progressbar"
      aria-label="Actualizando datos"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-brand-soft"
    >
      <div className="h-full w-1/3 animate-[fetching_1.1s_ease-in-out_infinite] bg-brand" />
    </div>
  );
}
