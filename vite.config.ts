/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Baseline security headers for the dev/preview servers. Production hosting
// must set equivalent headers (plus HSTS) at the edge / reverse proxy.
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Resolve from the working directory (same root Vite/Vitest use) so Windows drive-letter casing stays consistent.
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  server: { port: 5173, headers: securityHeaders },
  preview: {
    port: 4173,
    headers: {
      ...securityHeaders,
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
