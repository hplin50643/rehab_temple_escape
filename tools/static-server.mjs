import http from 'node:http';
import { access, readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const base = '/rehab_temple_escape/';
const host = '127.0.0.1';
const port = 4174;
const url = 'http://' + host + ':' + port + base;
const launch = process.argv.includes('--open');
const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml',
};
function openBrowser() {
  if (process.platform === 'win32') {
    const browser = spawn('explorer.exe', [url], { detached:true, windowsHide:true, stdio:'ignore' });
    browser.on('error', () => console.log('Open ' + url + ' in Chrome or Edge.'));
    browser.unref();
  }
}
try { await access(path.join(root,'index.html')); }
catch { console.error('Build missing. Run pnpm install --frozen-lockfile and pnpm build.'); process.exit(1); }

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, url).pathname);
    if (pathname === '/' || pathname === base.slice(0,-1)) {
      response.writeHead(302, {Location:base}); response.end(); return;
    }
    if (!pathname.startsWith(base)) throw new Error('Unknown route');
    const file = path.resolve(root, pathname.slice(base.length) || 'index.html');
    const rel = path.relative(root,file);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !(await stat(file)).isFile()) throw new Error('Unknown file');
    const bytes = await readFile(file);
    response.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Relic-Run':'1'});
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
});
server.on('error', async error => {
  if (error.code === 'EADDRINUSE' && launch) {
    try {
      const existing = await fetch(url, {signal:AbortSignal.timeout(2500)});
      if (existing.ok && (await existing.text()).includes('<title>遺跡疾行 · Relic Run</title>')) {
        console.log(url); openBrowser(); return;
      }
    } catch { /* Report the port conflict below. */ }
  }
  console.error(error.message); process.exitCode = 1;
});
server.listen(port, host, () => { console.log('Relic Run: ' + url); if (launch) openBrowser(); });
