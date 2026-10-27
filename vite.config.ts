import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.PAGES_BASE_PATH || '/',
  plugins: [react()],
  // Pre-scan dynamically imported GPU fixtures so dependency optimization cannot
  // reload the page in the middle of a pixel comparison.
  optimizeDeps: process.env.SENSOR_LAYOUT_E2E
    ? { entries: ['index.html', 'e2e/**/*.ts', '!e2e/**/*.spec.ts'] }
    : undefined,
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { include: ['src/**/*.test.ts'] },
});
