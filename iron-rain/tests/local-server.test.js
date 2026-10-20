import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startLocalGame } from '../serve.mjs';

const post = async (url, route, body = {}, token = '', origin = url) => {
  const response = await fetch(`${url}/war-api${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin,
    ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { response, body: await response.json() };
};

test('one local address serves the game and its real persistent authority, including reconnect after restart', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'iron-rain-local-'));
  let running;
  t.after(async () => { await running?.close(); await rm(directory, { recursive: true, force: true }); });
  const dbPath = path.join(directory, 'war.sqlite');
  running = await startLocalGame({ port: 0, dbPath });
  assert.equal(running.server.address().address, '127.0.0.1');
  assert.equal(running.authority.server.address().address, '127.0.0.1');
  const page = await fetch(running.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('Content-Type'), /text\/html/);
  assert.match(await page.text(), /IRON RAIN|Iron Rain/);
  const health = await fetch(`${running.url}/war-api/health`);
  assert.equal((await health.json()).authority, 'server');
  assert.equal(health.headers.get('Cache-Control'), 'no-store');
  const { body: identity } = await post(running.url, '/identity');
  assert.equal(identity.ok, true);
  const command = { id: randomUUID(), sequence: 1, type: 'create', payload: { faction: 'allies' } };
  const { body: created } = await post(running.url, '/command', command, identity.token);
  assert.equal(created.ok, true);
  const mamuteId = created.snapshot.mamute.id;
  await running.close();
  running = await startLocalGame({ port: 0, dbPath });
  const { body: resumed } = await post(running.url, '/poll', {}, identity.token);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.mamute.id, mamuteId);
  assert.equal(resumed.faction, 'allies');
  // A repeated command remains idempotent through the local proxy and restart.
  const { body: repeated } = await post(running.url, '/command', command, identity.token);
  assert.equal(repeated.ok, true);
  assert.equal(Object.keys(running.authority.world.state.mamutes).length, 1);
});

test('local files and API deny access to server data and foreign origins', async t => {
  const running = await startLocalGame({ port: 0, dbPath: ':memory:' });
  t.after(() => running.close());
  for (const route of ['/server/data/local-war.sqlite', '/server/http.mjs', '/server', '/%73erver/store.mjs', '/.gitignore']) {
    assert.equal((await fetch(running.url + route)).status, 403, route);
  }
  assert.equal((await fetch(`${running.url}/war-api/server/data/local-war.sqlite`)).status, 404);
  const denied = await post(running.url, '/identity', {}, '', 'https://example.com');
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.reason, 'origin-denied');
  assert.equal((await fetch(`${running.url}/war-api/poll`)).status, 404);
  assert.equal((await post(running.url, '/poll')).response.status, 401);
});

test('occupied frontend port fails with guidance and closing frees the port', async t => {
  const running = await startLocalGame({ port: 0, dbPath: ':memory:' });
  t.after(() => running.close());
  const port = running.server.address().port;
  await assert.rejects(startLocalGame({ port, dbPath: ':memory:' }), /porta .*já está em uso/);
  await running.close();
  const restarted = await startLocalGame({ port, dbPath: ':memory:' });
  await restarted.close();
});
