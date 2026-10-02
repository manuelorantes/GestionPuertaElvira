import { useState } from 'react';

import { ApiError } from '@/shared/api/client';

type Attempt = (confirmOverCapacity: boolean) => Promise<unknown>;

/**
 * Ejecuta una inscripción; si la API responde group_full, guarda el intento y pide confirmación
 * para repetirlo con confirmOverCapacity = true.
 */
export function useOverCapacityConfirm() {
  const [pending, setPending] = useState<{ attempt: Attempt; message: string } | null>(null);

  async function run(attempt: Attempt): Promise<boolean> {
    try {
      await attempt(false);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'group_full') {
        setPending({ attempt, message: `${error.message} ¿Inscribir igualmente?` });
        return false;
      }
      throw error;
    }
  }

  async function confirm(): Promise<void> {
    if (!pending) return;
    const { attempt } = pending;
    setPending(null);
    await attempt(true);
  }

  return { run, confirm, cancel: () => setPending(null), message: pending?.message ?? null };
}
