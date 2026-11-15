#!/usr/bin/env node
/*
 * Zero-dependency static server for local development and screenshots.
 *
 *   npm run serve            -> http://localhost:4173/
 *   npm run serve -- 5000    -> custom port
 *
 * Wallpaper Engine itself loads index.html from disk (file://), so the page
 * must not rely on ES modules, fetch() or absolute paths. This server exists
 * only so a real browser can be used for inspection, console checks and
 * preview captures.
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const portArg = Number(process.argv[2] || process.env.PORT || 4173);
const port = Number.isFinite(portArg) ? portArg : 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

createServer((request, response) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }

  let filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root + sep) && filePath !== root) {
    response.writeHead(403).end('forbidden');
    return;
  }

  try {
    if (statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
    statSync(filePath);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`serving ${root}`);
  console.log(`http://localhost:${port}/            plain wallpaper`);
  console.log(`http://localhost:${port}/?dev=1      developer panel`);
  console.log(`http://localhost:${port}/?demo=1     curated preview frame`);
});
