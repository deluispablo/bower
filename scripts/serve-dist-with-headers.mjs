// Serves dist/ with public/_headers applied, as Cloudflare static assets would (`vite preview` ignores _headers).
// Usage: node scripts/serve-dist-with-headers.mjs [port]. Single-page fallback to index.html, like the deployed app.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const port = Number(process.argv[2] ?? 5196);
const dist = join(process.cwd(), 'dist');
const rules = [];
for (const line of readFileSync(join(process.cwd(), 'public/_headers'), 'utf8').split('\n')) {
  if (/^\s*#/.test(line) || !line.trim()) continue;
  if (/^\S/.test(line)) rules.push({ glob: line.trim(), set: [], detach: [] });
  else if (line.trim().startsWith('!')) rules.at(-1).detach.push(line.trim().slice(1).trim().toLowerCase());
  else rules.at(-1).set.push([line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()]);
}
const matches = (glob, path) => new RegExp('^' + glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(path);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(dist, normalize(path));
  if (!file.startsWith(dist)) file = join(dist, 'index.html');
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(dist, 'index.html');
  const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
  for (const r of rules) {
    if (!matches(r.glob, path)) continue;
    for (const d of r.detach) for (const k of Object.keys(headers)) if (k.toLowerCase() === d) delete headers[k];
    for (const [k, v] of r.set) headers[k] = v;
  }
  res.writeHead(200, headers);
  res.end(readFileSync(file));
}).listen(port, () => console.log(`dist with headers on http://localhost:${port}`));
