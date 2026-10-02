import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';

import { ToastProvider } from '@/shared/ui/Toast';

import { AppRoutes } from './AppRoutes';
import { createQueryClient } from './queryClient';

const queryClient = createQueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
