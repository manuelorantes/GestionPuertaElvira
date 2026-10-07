import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { SESSION_QUERY_KEY } from '@/app/queryClient';

import { impersonate, type SessionUser, stopImpersonation } from './api';

/**
 * Cambia de cuenta (entrar como otra o volver a la propia): se descarta todo lo cargado, porque era de la otra
 * cuenta, y se vuelve al resumen.
 */
function useSwitchAccount<TInput>(action: (input: TInput) => Promise<SessionUser>) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: action,
    onSuccess: (user) => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, user);
      void navigate('/panel', { replace: true });
    },
  });
}

export function useStartImpersonation() {
  return useSwitchAccount(impersonate);
}

export function useStopImpersonation() {
  return useSwitchAccount<undefined>(() => stopImpersonation());
}
