import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { todayIso } from '@/features/students/format';
import { useDebouncedValue } from '@/shared/useDebouncedValue';

import * as api from './api';
import { useAccount, useBillingMutation } from './hooks';

export type Concept = 'month' | 'three' | 'six' | 'nine' | 'membership';

export const CONCEPTS: { id: Concept; label: string }[] = [
  { id: 'month', label: 'Mes' },
  { id: 'three', label: '3 meses' },
  { id: 'six', label: '6 meses' },
  { id: 'nine', label: '9 meses' },
  { id: 'membership', label: 'Cuota de socio' },
];

type SpecialMode = 'percent' | 'amount';

export interface SpecialState {
  enabled: boolean;
  mode: SpecialMode;
  value: string;
  concept: string;
}

/** Estado del diálogo de cobro: pide la cotización al cambiar algo (meses, puntos, descuento especial). */
export function usePaymentForm(initialStudentId?: string, initialKind?: api.ChargeKind) {
  const [studentId, setStudentId] = useState(initialStudentId ?? '');
  const [chosenConcept, setConcept] = useState<Concept | null>(
    initialKind === 'membership' ? 'membership' : null,
  );
  const [method, setMethod] = useState<api.PaymentMethod>('cash');
  const [date, setDate] = useState(todayIso());
  const [prorate, setProrate] = useState(false);
  const [special, setSpecial] = useState<SpecialState>({
    enabled: false,
    mode: 'percent',
    value: '',
    concept: '',
  });
  const [redeemPoints, setRedeemPoints] = useState(false);
  const account = useAccount(studentId);
  const concept = chosenConcept ?? 'month';
  const remaining = account.data?.remainingMonths ?? null;
  const months = { month: 1, three: 3, six: 6, nine: 9, membership: 1 }[concept];
  const specialValue = Number(special.value.replace(',', '.'));
  const specialDiscount =
    special.enabled && specialValue > 0 && special.concept.trim()
      ? {
          percent: special.mode === 'percent' ? Math.round(specialValue) : null,
          amountCents: special.mode === 'amount' ? Math.round(specialValue * 100) : null,
          concept: special.concept.trim(),
        }
      : null;
  // Los puntos se canjean de 5 en 5: con menos de 5 no hay descuento.
  const canRedeem = (account.data?.points ?? 0) >= 5 && concept !== 'membership';
  const points = canRedeem && redeemPoints ? 5 : 0;

  const request: api.PaymentRequest = {
    studentId,
    kind: concept === 'membership' ? 'membership' : 'monthly',
    months,
    method,
    date,
    prorate: prorate && concept === 'month',
    specialDiscount,
    redeemPoints: points,
  };
  // Se espera a una pausa en la escritura comparando el texto de la petición (un objeto nuevo en cada render no se asentaría nunca).
  const requestKey = JSON.stringify(request);
  const debouncedKey = useDebouncedValue(requestKey, 250);
  const debounced = useMemo(() => JSON.parse(debouncedKey) as api.PaymentRequest, [debouncedKey]);
  const ready = Boolean(debounced.studentId) && Boolean(debounced.date) && debounced.months > 0;
  const quote = useQuery({
    queryKey: ['quote', debouncedKey],
    queryFn: () => api.quotePayment(debounced),
    enabled: ready,
    retry: false,
    // Una cotización vale para ese momento: tras un cobro, la misma petición cubre otros meses.
    staleTime: 0,
    gcTime: 0,
  });
  const save = useBillingMutation(api.registerPayment);
  const stale = requestKey !== debouncedKey;

  return {
    studentId,
    setStudentId: (id: string) => {
      setStudentId(id);
      if (chosenConcept !== 'membership') setConcept(null);
    },
    concept,
    setConcept,
    /** Conceptos que no caben en lo que queda por cobrar (se muestran desactivados). */
    unavailable: (id: Concept) =>
      remaining !== null &&
      id !== 'membership' &&
      ({ month: 1, three: 3, six: 6, nine: 9 } as const)[id] > remaining,
    method,
    setMethod,
    date,
    setDate,
    prorate,
    setProrate,
    special,
    setSpecial,
    /** Si el alumno tiene al menos 5 puntos (y el cobro es de cuotas) puede canjearlos. */
    canRedeem,
    redeemPoints: points > 0,
    setRedeemPoints,
    account: account.data,
    quote: quote.data,
    quoting: quote.isFetching || stale,
    quoteError: quote.isError ? apiErrorMessage(quote.error) : null,
    canSave: Boolean(quote.data) && !quote.isError && !stale && !quote.isFetching,
    saving: save.isPending,
    saveError: save.isError ? apiErrorMessage(save.error) : null,
    submit: () => save.mutateAsync(request),
  };
}
