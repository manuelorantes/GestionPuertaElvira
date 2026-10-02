import { useMutation, useQueryClient } from '@tanstack/react-query';

import { SESSION_QUERY_KEY } from '@/app/queryClient';

import { changePassword } from './api';

export function useChangePassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => changePassword(currentPassword, newPassword),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
  });
}
