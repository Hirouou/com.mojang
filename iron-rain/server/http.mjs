import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzip } from 'node:zlib';
import { openWarStore } from './store.mjs';
import { createWarAuthority } from './world.mjs';

export function startWarServer({ port = 8787, host = '127.0.0.1', dbPath = 'server/data/war.sqlite', origins = ['http://localhost:4173', 'http://127.0.0.1:4173', 'https://hirouou.github.io'], now = Date.now } = {}) {
  const store = openWarStore(dbPath), world = createWarAuthority({ store, now });
  const allowed = new Set(origins), rates = new Map();
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && !allowed.has(origin)) { res.writeHead(403); res.end('{"ok":false,"reason":"origin-denied"}'); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin, Accept-Encoding'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const send = (value, status = 200) => {
      const json = JSON.stringify(value);
      if (json.length > 2048 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        gzip(json, { level: 1 }, (error, compressed) => {
          if (res.destroyed) return;
          if (!error) res.setHeader('Content-Encoding', 'gzip');
          res.writeHead(status); res.end(error ? json : compressed);
        });
      } else { res.writeHead(status); res.end(json); }
    };
    const address = req.socket.remoteAddress, bucket = rates.get(address) || { start: now(), count: 0 };
    if (now() - bucket.start > 1000) { bucket.start = now(); bucket.count = 0; }
    rates.set(address, bucket);
    if (++bucket.count > 100) { send({ ok: false, reason: 'rate-limit' }, 429); return; }
    try {
      const url = new URL(req.url, 'http://server');
      if (url.pathname === '/health') { send({ ok: true, authority: 'server', theatreId: world.state.theatreId, time: world.state.time }); return; }
      if (req.method !== 'POST') { send({ ok: false, reason: 'not-found' }, 404); return; }
      let raw = '';
      for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 16384) { send({ ok: false, reason: 'body-too-large' }, 413); return; } }
      const body = raw ? JSON.parse(raw) : {};
      if (url.pathname === '/identity') { send(world.register()); return; }
      const player = world.authenticate(req.headers.authorization?.replace(/^Bearer /, ''));
      if (!player) { send({ ok: false, reason: 'unauthorized' }, 401); return; }
      if (url.pathname === '/poll') {
        const result = world.heartbeat(player, body.pose, body.exteriorPose);
        send(result.ok ? world.snapshot(player, body.after, body.strategicSince) : result); return;
      }
      if (url.pathname === '/command') {
        const presence = world.heartbeat(player, body.pose, body.exteriorPose);
        if (!presence.ok) { send(presence); return; }
        const result = world.command(player, body);
        send({ ...result, snapshot: world.snapshot(player, body.after, body.strategicSince) }); return;
      }
      if (url.pathname === '/leave') { world.disconnect(player); send({ ok: true }); return; }
      send({ ok: false, reason: 'not-found' }, 404);
    } catch (error) { console.error('War request failed:', error.message); send({ ok: false, reason: 'invalid-request' }, 400); }
  });
  // This clock is owned by the process and runs with zero connected clients.
  const clock = setInterval(() => { try { world.advance(); } catch (error) { console.error('War tick failed:', error); server.close(); clearInterval(clock); } }, 100);
  clock.unref();
  server.listen(port, host);
  const close = async () => { clearInterval(clock); world.save(); await new Promise(resolve => server.close(resolve)); store.close(); };
  return { server, world, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const running = startWarServer({ port: Number(process.env.PORT || 8787), host: process.env.HOST || '127.0.0.1', dbPath: process.env.WAR_DB || 'server/data/war.sqlite',
    origins: (process.env.ALLOWED_ORIGINS || 'http://localhost:4173,http://127.0.0.1:4173,https://hirouou.github.io').split(',') });
  running.server.on('listening', () => console.log(`Iron Rain authority listening on ${JSON.stringify(running.server.address())}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => running.close().then(() => process.exit(0)));
}
