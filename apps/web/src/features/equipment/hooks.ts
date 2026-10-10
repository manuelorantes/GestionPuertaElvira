import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as api from './api';

export function useProducts() {
  return useQuery({ queryKey: ['equipment', 'products'], queryFn: api.fetchProducts });
}

export function useOrders(filter: api.OrderFilter) {
  return useQuery({
    queryKey: ['equipment', 'orders', filter],
    placeholderData: keepPreviousData,
    queryFn: () => api.fetchOrders(filter),
  });
}

export function usePurchases() {
  return useQuery({ queryKey: ['equipment', 'purchases'], queryFn: api.fetchPurchases });
}

export function useStock() {
  return useQuery({ queryKey: ['equipment', 'stock'], queryFn: api.fetchStock });
}

export function useMargins() {
  return useQuery({ queryKey: ['equipment', 'margins'], queryFn: api.fetchMargins });
}
