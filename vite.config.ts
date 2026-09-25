/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { serviceWorkerPlugin } from './pwa/serviceWorkerPlugin.ts';
import { cspPlugin } from './security/cspPlugin.ts';

export default defineConfig({
  base: '/LiqueAmp/',
  plugins: [react(), serviceWorkerPlugin(), cspPlugin()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // React + router (~60% of the code) change far less often than the
          // app: a stable chunk means an update re-downloads only the app.
          groups: [{ name: 'react', test: /node_modules[\/](react|react-dom|react-router|scheduler)[\/]/ }],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
