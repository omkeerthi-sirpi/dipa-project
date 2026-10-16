import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster, toast } from 'sonner';
import { qk } from '@/hooks/queries';
import { queryClient } from '@/lib/queryClient';
import { router } from '@/routes/router';
import { onUnauthorized } from '@/services/apiClient';
import './index.css';

function SessionWatcher() {
  // Any 401 from the API clears cached data; the route guard then redirects to login.
  useEffect(
    () =>
      onUnauthorized(() => {
        if (queryClient.getQueryData(qk.session) === null) return;
        queryClient.clear();
        queryClient.setQueryData(qk.session, null);
        toast.warning('Your session has ended. Please sign in again.');
      }),
    [],
  );
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionWatcher />
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors closeButton toastOptions={{ className: 'text-sm' }} />
    </QueryClientProvider>
  </StrictMode>,
);
