// Public client configuration. VITE_* values are embedded in the browser bundle —
// never place secrets here.
export const config = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api',
  useMocks: (import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false',
  maxUploadBytes: 10 * 1024 * 1024,
  maxRowsPerSheet: 20_000,
  maxColumnsPerSheet: 200,
  maxSheets: 20,
} as const;
