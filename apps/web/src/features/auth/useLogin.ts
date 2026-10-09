import { useMutation, useQueryClient } from '@tanstack/react-query';

import { SESSION_QUERY_KEY } from '@/app/queryClient';

import { login } from './api';
import { resetPanelView } from './panelView';

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      login(email, password),
    onSuccess: (user) => {
      resetPanelView();
      queryClient.setQueryData(SESSION_QUERY_KEY, user);
    },
  });
}
