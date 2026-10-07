import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchUsers } from './api';

const USERS_KEY = ['users'] as const;

export function useUsers() {
  return useQuery({ queryKey: USERS_KEY, queryFn: fetchUsers });
}

/** Acción sobre una cuenta: al terminar se recarga la lista (sin esperar a que acabe). */
export function useUserMutation<TInput, TResult>(action: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
