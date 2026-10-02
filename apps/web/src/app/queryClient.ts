import { QueryCache, QueryClient, MutationCache } from '@tanstack/react-query';

import { ApiError } from '@/shared/api/client';

export const SESSION_QUERY_KEY = ['session'] as const;

/**
 * Un 401 en cualquier petición significa que la sesión ya no vale: se vacía la caché
 * y el guardián de rutas devuelve a la portada.
 */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: false },
      mutations: { retry: false },
    },
    queryCache: new QueryCache({ onError: (error) => handleUnauthorized(client, error) }),
    mutationCache: new MutationCache({ onError: (error) => handleUnauthorized(client, error) }),
  });

  return client;
}

function handleUnauthorized(client: QueryClient, error: unknown) {
  if (error instanceof ApiError && error.status === 401 && error.code !== 'invalid_credentials') {
    client.clear();
    client.setQueryData(SESSION_QUERY_KEY, null);
  }
}
