import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/services/apiError';

const shouldRetry = (count: number, error: unknown) => {
  // Never retry client errors (401/403/404/409/422); retry transient failures twice.
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return count < 2;
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isApiError(error) && (error.status === 401 || error.status === 403 || error.status === 404)) return; // handled by pages / guards
      if (query.state.data !== undefined) toast.error('Could not refresh data', { description: isApiError(error) ? error.message : undefined });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _v, _c, mutation) => {
      if (mutation.options.onError) return; // mutation handles its own feedback
      toast.error(isApiError(error) ? error.message : 'The action could not be completed.', {
        description: isApiError(error) && error.details?.length ? error.details.slice(0, 3).join(' · ') : undefined,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
