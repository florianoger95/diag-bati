// Build de production pour GitHub Pages.
// Le site est servi sous /<nom-du-dépôt>/ : base-href adapté, 404.html pour les liens directs, pas de Jekyll.
// Usage : node scripts/build-pages.mjs [nom-du-dépôt]   (défaut : $GITHUB_REPOSITORY ou "diag-bati")
import { execSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2] ?? process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'diag-bati';
const baseHref = `/${repo}/`;
const out = join('dist', 'diag-bati', 'browser');

execSync(`npx ng build --base-href ${baseHref}`, { stdio: 'inherit' });
copyFileSync(join(out, 'index.html'), join(out, '404.html'));
writeFileSync(join(out, '.nojekyll'), '');
console.log(`Build GitHub Pages prêt dans ${out} (base ${baseHref}).`);
