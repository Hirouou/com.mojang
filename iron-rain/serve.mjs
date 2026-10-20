import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };
const apiPaths = new Set(['/health', '/identity', '/poll', '/command', '/leave']);

/** One local process, one saved war, and one browser address. */
export async function startLocalGame({ port = 4173, host = '127.0.0.1', dbPath = path.join(root, 'server/data/local-war.sqlite') } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Iron Rain precisa do Node.js 24 ou mais recente. Instale o Node.js LTS e tente novamente.');
  // Import after the version check so older Node versions receive useful guidance.
  const { startWarServer } = await import('./server/http.mjs');
  let authority = null, closing = null;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const requested = decodeURIComponent(url.pathname);
      if (requested === '/war-api' || requested.startsWith('/war-api/')) {
        const route = requested.slice('/war-api'.length);
        if (!apiPaths.has(route)) { res.writeHead(404); res.end(); return; }
        if (!authority?.server.listening) { res.writeHead(503, { 'Cache-Control': 'no-store' }); res.end('{"ok":false,"reason":"local-war-starting"}'); return; }
        const upstream = http.request({ hostname: '127.0.0.1', port: authority.server.address().port, path: route + url.search, method: req.method,
          headers: Object.fromEntries(['authorization', 'content-type', 'origin', 'accept-encoding'].filter(key => req.headers[key]).map(key => [key, req.headers[key]])) }, response => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        });
        upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Cache-Control': 'no-store' }); res.end('{"ok":false,"reason":"local-war-unavailable"}'); });
        req.on('aborted', () => upstream.destroy());
        req.pipe(upstream);
        return;
      }
      // The save, credentials and backend source are never static game assets.
      if (requested.replaceAll('\\', '/').split('/').some(segment => segment.toLowerCase() === 'server' || segment.startsWith('.'))) { res.writeHead(403); res.end(); return; }
      const filename = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
      if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      const body = await readFile(filename);
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'text/plain', 'Cache-Control':'no-cache' });
      res.end(body);
    } catch (error) { res.writeHead(error instanceof URIError ? 400 : 404); res.end('Arquivo não encontrado'); }
  });
  const close = () => closing ||= (async () => {
    // Stop accepting browser requests before saving and closing the authority.
    await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
    if (authority) await authority.close();
  })();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(); });
    });
    const actualPort = server.address().port;
    const hosts = new Set(['localhost', '127.0.0.1', '[::1]', host.includes(':') ? `[${host}]` : host]);
    authority = startWarServer({ port: 0, host: '127.0.0.1', dbPath, origins: [...hosts].map(name => `http://${name}:${actualPort}`) });
    await new Promise((resolve, reject) => {
      const ready = () => { authority.server.off('error', failed); resolve(); };
      const failed = error => { authority.server.off('listening', ready); reject(error); };
      authority.server.once('listening', ready); authority.server.once('error', failed);
    });
    authority.server.once('close', () => { if (!closing) void close(); });
    const address = host === '0.0.0.0' || host === '::' ? 'localhost' : host.includes(':') ? `[${host}]` : host;
    return { server, authority, world: authority.world, url: `http://${address}:${actualPort}`, dbPath, close };
  } catch (error) {
    await close();
    if (error.code === 'EADDRINUSE') throw new Error(`A porta ${port} já está em uso. Feche a outra janela do Iron Rain ou escolha outra porta com PORT.`, { cause: error });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const running = await startLocalGame({ port: Number(process.env.PORT || 4173), host: process.env.HOST || '127.0.0.1',
      ...(process.env.WAR_DB ? { dbPath: process.env.WAR_DB } : {}) });
    const browserURL = process.env.HOST ? running.url : `http://localhost:${running.server.address().port}`;
    console.log(`IRON RAIN local disponível em ${browserURL}/`);
    console.log('A guerra é salva neste computador. Use Ctrl+C para salvar e fechar.');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { running.close().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); }); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
