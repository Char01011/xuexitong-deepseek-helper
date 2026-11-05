import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const directory = existsSync(resolve(root, 'guide-site/dist/index.html')) ? resolve(root, 'guide-site/dist') : resolve(root, 'docs');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8' };
const server = createServer((req, res) => {
    try {
        let path = resolve(directory, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
        if (path !== directory && !path.startsWith(directory + sep)) throw new Error('Outside root');
        if (existsSync(path) && statSync(path).isDirectory()) path = resolve(path, 'index.html');
        if (!existsSync(path)) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(readFileSync(path));
    } catch { res.writeHead(400); res.end('Bad request'); }
});
server.listen(Number(process.argv[2] ?? 4175), '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${server.address().port}`));
