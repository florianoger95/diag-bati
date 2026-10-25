// Sert le build de production comme GitHub Pages (fichiers statiques + repli 404.html → index.html).
// Usage : node scripts/serve-dist.mjs [port] [basePath]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] ?? 4300);
const base = (process.argv[3] ?? '/').replace(/\/?$/, '/');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'diag-bati', 'browser');

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

async function file(path) {
  try {
    const s = await stat(path);
    return s.isFile() ? readFile(path) : null;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(base)) {
    res.writeHead(404).end();
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname.slice(base.length))).replace(/^([.][.][/\\])+/, '');
  const target = join(root, rel === '.' || rel === '' || rel.endsWith('/') || rel.endsWith('\\') ? join(rel, 'index.html') : rel);
  let body = await file(target);
  let type = types[extname(target)] ?? 'application/octet-stream';
  let status = 200;
  if (!body) {
    // comportement GitHub Pages : 404.html (copie d'index.html) pour les routes de l'app
    body = await file(join(root, '404.html')) ?? await file(join(root, 'index.html'));
    type = types['.html'];
    status = 404;
  }
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}).listen(port, () => console.log(`Diag bâti : http://localhost:${port}${base}`));
