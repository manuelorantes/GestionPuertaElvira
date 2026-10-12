import { QueryCache, QueryClient, MutationCache } from '@tanstack/react-query';

import { fetchSession, type SessionUser } from '@/features/auth/api';
import { resetPanelView } from '@/features/auth/panelView';
import { ApiError } from '@/shared/api/client';

export const SESSION_QUERY_KEY = ['session'] as const;

/**
 * Un 401 en cualquier petición significa que la sesión ya no vale: se vacía la caché y el guardián de rutas
 * devuelve a la portada. Un 403 por falta de rol puede significar que en otra pestaña se cambió de cuenta
 * (suplantación u otro inicio de sesión): se vuelve a leer la sesión y, si es otra, se pasa a ella.
 */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: false },
      mutations: { retry: false },
    },
    queryCache: new QueryCache({ onError: (error) => handleSessionLoss(client, error) }),
    mutationCache: new MutationCache({ onError: (error) => handleSessionLoss(client, error) }),
  });

  return client;
}

function handleSessionLoss(client: QueryClient, error: unknown) {
  if (!(error instanceof ApiError)) return;
  if (error.status === 401 && error.code !== 'invalid_credentials') {
    client.clear();
    client.setQueryData(SESSION_QUERY_KEY, null);
  }
  if (error.status === 403 && error.code === 'forbidden') void switchIfAccountChanged(client);
}

async function switchIfAccountChanged(client: QueryClient): Promise<void> {
  const known = client.getQueryData<SessionUser | null>(SESSION_QUERY_KEY) ?? null;
  const current = await fetchSession().catch(() => known);
  if (current === null || current.id === known?.id) return;
  resetPanelView();
  // Lo cargado era de la otra cuenta. La sesión se cambia la última: al verla, los guardianes de rutas recolocan.
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0] });
  client.setQueryData(SESSION_QUERY_KEY, current);
}
