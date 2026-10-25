import { defineConfig } from 'vitest/config';

// Tests unitaires de la logique sans Angular (données, moteur de modèles).
// IndexedDB est simulée par fake-indexeddb.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'public/**/*.spec.ts'],
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
});
