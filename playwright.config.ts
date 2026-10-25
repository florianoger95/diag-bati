import { defineConfig, devices } from '@playwright/test';

// E2E sur WebKit (moteur de Safari), au format iPad Pro, contre le build de production
// (service worker actif). Lancer `npx ng build` avant `npm run e2e`.
// E2E_BASE=/diag-bati/ teste le build GitHub Pages (servi sous un sous-chemin).
const base = process.env['E2E_BASE'] ?? '/';
const url = `http://localhost:4310${base}`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  // sur GitHub, une seconde chance absorbe un ralentissement ponctuel de la machine
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: url,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ipad-webkit', use: { ...devices['iPad Pro 11'], browserName: 'webkit' } },
  ],
  webServer: {
    command: `node scripts/serve-dist.mjs 4310 ${base}`,
    url,
    reuseExistingServer: false,
  },
});
