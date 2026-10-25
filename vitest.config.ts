import { defineConfig } from 'vitest/config';

// Deux projets :
// - unit : logique sans navigateur (données, moteur de modèles), IndexedDB simulée par fake-indexeddb ;
// - webkit : ce qui touche au canvas, aux images et aux PDF, exécuté dans WebKit (moteur de Safari).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/**/*.browser.spec.ts'],
          environment: 'node',
          setupFiles: ['fake-indexeddb/auto'],
        },
      },
      {
        // dépendances pré-optimisées : évite un rechargement de page en plein test
        optimizeDeps: { include: ['pdf-lib', 'pdfjs-dist'] },
        test: {
          name: 'webkit',
          include: ['src/**/*.browser.spec.ts'],
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'webkit' }],
          },
        },
      },
    ],
  },
});
