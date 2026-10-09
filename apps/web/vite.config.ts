import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: {
    // Se sirve detrás de nginx en http://localhost:8080 (mismo origen que /api).
    allowedHosts: ['localhost', 'nginx'],
    hmr: { clientPort: Number(process.env.APP_PORT ?? 8080) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Con cobertura y toda la suite a la vez, los tests de formularios largos pasan de los 5 s por defecto.
    testTimeout: 15_000,
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
      thresholds: { lines: 75, statements: 75, functions: 75, branches: 75 },
    },
  },
});
