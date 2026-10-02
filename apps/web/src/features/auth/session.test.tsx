import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { createQueryClient } from '@/app/queryClient';
import { mockFetchResponse } from '@/test/render';

import { apiErrorMessage } from './apiErrorMessage';
import { passwordRules } from './passwordRules';
import { useSession } from './useSession';
import { ApiError } from '@/shared/api/client';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

const USER = {
  id: '1',
  fullName: 'Lucía Moreno Gil',
  email: 'junta@club.es',
  role: 'administrator',
  mustChangePassword: false,
};

describe('useSession', () => {
  it('should return the user when there is a session', async () => {
    mockFetchResponse(200, { user: USER });

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(USER));
  });

  it('should return null instead of failing when there is no session', async () => {
    mockFetchResponse(401, {
      error: { code: 'unauthorized', message: 'Necesitas iniciar sesión.' },
    });

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('passwordRules', () => {
  it('should report which rules a candidate password satisfies', () => {
    expect(passwordRules('corta', 'junta@club.es')).toEqual([
      { id: 'length', label: 'Al menos 12 caracteres', met: false },
      { id: 'notEmail', label: 'Distinta de tu email', met: true },
    ]);
    expect(passwordRules('Junta@Club.es', 'junta@club.es').every((rule) => rule.met)).toBe(false);
    expect(passwordRules('alfil-y-caballo', 'junta@club.es').every((rule) => rule.met)).toBe(true);
  });
});

describe('apiErrorMessage', () => {
  it('should translate API errors into messages for people', () => {
    expect(
      apiErrorMessage(new ApiError(401, 'invalid_credentials', 'Email o contraseña incorrectos.')),
    ).toBe('Email o contraseña incorrectos.');
    expect(apiErrorMessage(new ApiError(429, 'too_many_requests', 'x', 61))).toBe(
      'Demasiados intentos. Prueba de nuevo en 2 minutos.',
    );
    expect(apiErrorMessage(new ApiError(429, 'too_many_requests', 'x', 30))).toBe(
      'Demasiados intentos. Prueba de nuevo en 1 minuto.',
    );
    expect(apiErrorMessage(new ApiError(500, 'internal_error', 'x'))).toBe(
      'No se ha podido conectar. Inténtalo de nuevo.',
    );
    expect(apiErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'No se ha podido conectar. Inténtalo de nuevo.',
    );
  });
});
