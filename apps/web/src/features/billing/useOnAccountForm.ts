import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { todayIso } from '@/features/students/format';
import { useDebouncedValue } from '@/shared/useDebouncedValue';

import * as api from './api';
import { useBillingMutation } from './hooks';
import { centsFromText } from './money';

/**
 * Estado de «Añadir dinero a cuenta»: importe, forma de pago, fecha y alumnos; con ellos pide el reparto (sin guardar)
 * y, al confirmar, apunta un pago a cuenta para cada alumno.
 */
export function useOnAccountForm() {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<api.PaymentMethod>('cash');
  const [date, setDate] = useState(todayIso());
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const amountCents = centsFromText(amount);
  const request: api.OnAccountRequest = {
    studentIds,
    amountCents: amountCents ?? 0,
    method,
    date,
  };
  const requestKey = JSON.stringify({ ...request, method: 'cash' });
  const debouncedKey = useDebouncedValue(requestKey, 250);
  const debounced = useMemo(() => JSON.parse(debouncedKey) as api.OnAccountRequest, [debouncedKey]);
  const ready =
    debounced.studentIds.length > 0 && debounced.amountCents > 0 && Boolean(debounced.date);
  const quote = useQuery({
    queryKey: ['on-account-quote', debouncedKey],
    queryFn: () => api.quoteOnAccount(debounced),
    enabled: ready,
    retry: false,
    // El reparto depende de lo que deben en ese momento.
    staleTime: 0,
    gcTime: 0,
  });
  const save = useBillingMutation(api.addOnAccount);
  const stale = requestKey !== debouncedKey;

  return {
    amount,
    setAmount: (value: string) => setAmount(value.replace(/[^\d.,]/g, '')),
    /** Escrito pero no es un importe válido. */
    amountInvalid: amount.trim() !== '' && (amountCents === null || amountCents <= 0),
    amountCents: amountCents ?? 0,
    method,
    setMethod,
    date,
    setDate,
    studentIds,
    addStudent: (id: string) => {
      if (id && !studentIds.includes(id)) setStudentIds([...studentIds, id]);
    },
    removeStudent: (id: string) => setStudentIds(studentIds.filter((s) => s !== id)),
    shares: ready ? quote.data : undefined,
    quoting: quote.isFetching || stale,
    quoteError: quote.isError ? apiErrorMessage(quote.error) : null,
    canSave: ready && Boolean(quote.data) && !quote.isError && !stale && !quote.isFetching,
    saving: save.isPending,
    saveError: save.isError ? apiErrorMessage(save.error) : null,
    submit: () => save.mutateAsync(request),
  };
}
