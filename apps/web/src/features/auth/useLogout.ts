import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { SESSION_QUERY_KEY } from '@/app/queryClient';

import { logout } from './api';

/** Cierra la sesión, vacía todos los datos en memoria y vuelve a la portada. */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      void navigate('/', { replace: true });
    },
  });
}
