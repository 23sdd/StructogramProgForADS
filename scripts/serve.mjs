import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const allowed = new Set(['index.html', 'Structogram.html', 'app.bundle.js', 'styles.css', 'assets/favicon.svg', 'src/app.js', 'src/parser.js', 'src/renderer.js', 'src/examples.js']);
const port = Number(process.env.PORT || 4173);
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!allowed.has(relative)) { response.writeHead(404).end('Not found'); return; }
    const data = await readFile(path.join(root, relative));
    response.writeHead(200, { 'Content-Type': types[path.extname(relative)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(data);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Structogram is ready: http://localhost:${port}`));
