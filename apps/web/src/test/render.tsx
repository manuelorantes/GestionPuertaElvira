import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { AppRoutes } from '@/app/AppRoutes';
import { createQueryClient } from '@/app/queryClient';

/** Monta la aplicación completa en una ruta concreta. */
export function renderApp(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export function mockFetchResponse(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(status, body));
}

type Reply = [status: number, body?: unknown, headers?: Record<string, string>];

/**
 * Simula la API por "MÉTODO ruta". Un valor puede ser una respuesta o una lista que se consume en orden
 * (la última se repite). Las rutas no declaradas responden 404.
 */
export function mockApi(routes: Record<string, Reply | Reply[]>) {
  const queues = new Map(
    Object.entries(routes).map(([key, reply]) => [
      key,
      Array.isArray(reply[0]) ? [...(reply as Reply[])] : [reply as Reply],
    ]),
  );

  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    const queue = queues.get(key);
    const reply = (queue && queue.length > 1 ? queue.shift() : queue?.[0]) ?? [
      404,
      { error: { code: 'not_found', message: 'x' } },
    ];

    return jsonResponse(reply[0], reply[1], reply[2]);
  });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export const ADMIN = {
  id: 'u1',
  fullName: 'Lucía Moreno Gil',
  email: 'junta@club.es',
  role: 'administrator',
  mustChangePassword: false,
} as const;

export const NO_SESSION: Reply = [
  401,
  { error: { code: 'unauthorized', message: 'Necesitas iniciar sesión.' } },
];
