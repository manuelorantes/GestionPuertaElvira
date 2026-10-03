import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { todayIso } from '@/features/students/format';
import { useDebouncedValue } from '@/shared/useDebouncedValue';

import * as api from './api';
import { useAccount, useBillingMutation } from './hooks';

export type Concept = 'month' | 'three' | 'six' | 'rest' | 'membership';

export const CONCEPTS: { id: Concept; label: string }[] = [
  { id: 'month', label: 'Mes' },
  { id: 'three', label: '3 meses' },
  { id: 'six', label: '6 meses' },
  { id: 'rest', label: 'Resto de temporada' },
  { id: 'membership', label: 'Cuota de socio' },
];

function conceptFor(account: api.Account | undefined): Concept {
  if (account?.preferredPlan === 'three_months') return 'three';
  if (account?.preferredPlan === 'six_months') return 'six';
  if (account?.preferredPlan === 'rest_of_season') return 'rest';
  return 'month';
}

/** Estado del diálogo de cobro: propone el concepto según la ficha y pide la cotización al cambiar algo. */
export function usePaymentForm(initialStudentId?: string, initialKind?: api.ChargeKind) {
  const [studentId, setStudentId] = useState(initialStudentId ?? '');
  const [chosenConcept, setConcept] = useState<Concept | null>(
    initialKind === 'membership' ? 'membership' : null,
  );
  const [method, setMethod] = useState<api.PaymentMethod>('cash');
  const [date, setDate] = useState(todayIso());
  const [prorate, setProrate] = useState(false);
  const [special, setSpecial] = useState({ enabled: false, percent: '', concept: '' });
  const account = useAccount(studentId);
  const concept = chosenConcept ?? conceptFor(account.data);
  const remaining = account.data?.remainingMonths ?? null;
  const months = { month: 1, three: 3, six: 6, rest: remaining ?? 0, membership: 1 }[concept];
  const percent = Number(special.percent);

  const request: api.PaymentRequest = {
    studentId,
    kind: concept === 'membership' ? 'membership' : 'monthly',
    months,
    method,
    date,
    prorate: prorate && concept === 'month',
    specialDiscount:
      special.enabled && percent > 0 && special.concept.trim()
        ? { percent, concept: special.concept.trim() }
        : null,
  };
  // Se espera a una pausa en la escritura comparando el texto de la petición (un objeto nuevo en cada render no se asentaría nunca).
  const requestKey = JSON.stringify(request);
  const debouncedKey = useDebouncedValue(requestKey, 250);
  const debounced = useMemo(() => JSON.parse(debouncedKey) as api.PaymentRequest, [debouncedKey]);
  const ready =
    Boolean(debounced.studentId) &&
    Boolean(debounced.date) &&
    debounced.months > 0 &&
    (concept !== 'rest' || remaining !== null);
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
      ({ month: 1, three: 3, six: 6, rest: 1 } as const)[id] > remaining,
    method,
    setMethod,
    date,
    setDate,
    prorate,
    setProrate,
    special,
    setSpecial,
    quote: quote.data,
    quoting: quote.isFetching || stale,
    quoteError: quote.isError ? apiErrorMessage(quote.error) : null,
    canSave: Boolean(quote.data) && !quote.isError && !stale && !quote.isFetching,
    saving: save.isPending,
    saveError: save.isError ? apiErrorMessage(save.error) : null,
    submit: () => save.mutateAsync(request),
  };
}
