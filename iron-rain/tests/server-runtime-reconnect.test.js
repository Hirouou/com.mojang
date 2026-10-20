import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createServerCrewRuntime } from '../modules/server-crew-runtime.js';

const savedIdentity = { token: 'saved-token', playerId: 'pilot' };
const snapshot = (revision = 1, playerId = 'pilot') => ({ ok: true, authority: 'server', revision, sequence: revision,
  eventHead: revision, peers: [{ id: playerId, seat: 0 }], events: [], faction: 'allies',
  mamute: { id: 'mamute', code: 'TEST', stations: {} } });
const reply = value => ({ ok: true, json: async () => value });
const unauthorized = () => ({ ok: false, status: 401 });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function harness(t, handler, initial = savedIdentity) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let saved = initial ? JSON.stringify(initial) : null;
  const requests = [], writes = [], statuses = [];
  const runtime = createServerCrewRuntime({ endpoint: 'http://localhost:8787',
    storage: { getItem: () => saved, setItem: (key, value) => { saved = value; writes.push(JSON.parse(value)); }, removeItem: () => { saved = null; } },
    fetcher: async (url, init) => {
      const request = { path: new URL(url).pathname, body: JSON.parse(init.body), token: init.headers.Authorization };
      requests.push(request);
      if (request.path === '/leave') return reply({ ok: true });
      return handler(request);
    }, onStatus: value => statuses.push(value),
  });
  t.after(() => runtime.disconnect());
  return { runtime, requests, writes, statuses, saved: () => saved,
    async tick(ms) { t.mock.timers.tick(ms); await nextTurn(); },
  };
}

test('a server started after the client reconnects automatically with the saved identity', async t => {
  let online = false;
  const h = harness(t, () => { if (!online) throw new Error('fetch failed'); return reply(snapshot()); });
  assert.equal((await h.runtime.connect()).ok, false);
  assert.equal(h.runtime.status().localId, 'pilot');
  assert.deepEqual(JSON.parse(h.saved()), savedIdentity);
  online = true;
  await h.tick(499); assert.equal(h.requests.length, 1);
  await h.tick(1);
  assert.equal(h.runtime.status().connected, true);
  assert.equal(h.runtime.status().lastEvent, 'server-reconnected');
  assert.deepEqual(h.requests.map(r => r.path), ['/poll', '/poll']);
  assert.ok(h.requests.every(r => r.token === 'Bearer saved-token'));
  assert.equal(h.writes.length, 0);
});

test('initial identity failure also retries, with capped backoff and no overlapping requests', async t => {
  let online = false;
  const h = harness(t, request => {
    if (!online) throw new Error('connection refused');
    return reply(request.path === '/identity' ? { ok: true, token: 'new-token', playerId: 'new-pilot' } : snapshot(1, 'new-pilot'));
  }, null);
  assert.equal((await h.runtime.connect()).ok, false);
  for (const delay of [500, 1000, 2000, 4000, 5000, 5000]) {
    const before = h.requests.length;
    await h.tick(delay - 1); assert.equal(h.requests.length, before);
    await h.tick(1); assert.equal(h.requests.length, before + 1);
  }
  online = true; await h.tick(5000);
  assert.equal(h.runtime.status().connected, true);
  assert.equal(h.writes.length, 1);
  assert.equal(h.runtime.status().localId, 'new-pilot');
});

test('concurrent manual connects share identity registration and the first poll', async t => {
  const identity = deferred(), poll = deferred();
  const h = harness(t, request => request.path === '/identity' ? identity.promise : poll.promise, null);
  const first = h.runtime.connect(), second = h.runtime.connect();
  assert.equal(first, second);
  assert.deepEqual(h.requests.map(r => r.path), ['/identity']);
  identity.resolve(reply({ ok: true, token: 'new-token', playerId: 'new-pilot' })); await nextTurn();
  assert.equal(h.runtime.connect(), first);
  await h.tick(10000);
  assert.deepEqual(h.requests.map(r => r.path), ['/identity', '/poll']);
  poll.resolve(reply(snapshot(1, 'new-pilot')));
  assert.equal((await first).ok, true);
  await h.tick(200);
  assert.equal(h.requests.length, 3, 'one healthy polling loop starts');
});

test('only an actual unauthorized response replaces identity and resets old server revisions', async t => {
  let expired = false;
  const h = harness(t, request => {
    if (request.path === '/identity') return reply({ ok: true, token: 'renewed-token', playerId: 'renewed-pilot' });
    if (request.token === 'Bearer saved-token') return expired ? unauthorized() : reply(snapshot(100));
    assert.equal(request.body.after, undefined, 'fresh identity must not send the old event cursor');
    assert.equal(request.body.strategicSince, undefined);
    return reply(snapshot(1, 'renewed-pilot'));
  });
  await h.runtime.connect(); expired = true; await h.tick(200);
  assert.equal(h.runtime.status().connected, false);
  assert.equal(h.runtime.status().lastEvent, 'server-identity-expired');
  assert.equal(h.runtime.snapshot(), null);
  await h.tick(500);
  assert.equal(h.runtime.status().connected, true);
  assert.equal(h.runtime.status().lastEvent, 'server-identity-renewed');
  assert.equal(h.runtime.status().localId, 'renewed-pilot');
  assert.equal(h.runtime.snapshot().revision, 1);
  assert.deepEqual(h.writes, [{ token: 'renewed-token', playerId: 'renewed-pilot' }]);
});

test('disconnect during registration discards the response without persisting or polling', async t => {
  const identity = deferred();
  const h = harness(t, () => identity.promise, null);
  const pending = h.runtime.connect(); h.runtime.disconnect();
  identity.resolve(reply({ ok: true, token: 'late-token', playerId: 'late-pilot' }));
  assert.equal((await pending).reason, 'disconnected');
  await h.tick(10000);
  assert.equal(h.runtime.status().connected, false);
  assert.equal(h.runtime.snapshot(), null);
  assert.equal(h.writes.length, 0);
  assert.deepEqual(h.requests.map(r => r.path), ['/identity']);
});

test('a late poll from a disconnected session cannot overwrite a newly connected session', async t => {
  const oldPoll = deferred(); let polls = 0;
  const h = harness(t, () => ++polls === 1 ? oldPoll.promise : reply(snapshot(2)));
  const oldConnection = h.runtime.connect(); h.runtime.disconnect();
  assert.equal((await h.runtime.connect()).ok, true);
  oldPoll.resolve(reply(snapshot(100))); await oldConnection;
  assert.equal(h.runtime.snapshot().revision, 2);
  await h.tick(200);
  assert.equal(polls, 3, 'the old connection must not create an extra timer');
});

test('a disconnected in-flight command is neither retried nor applied after reconnecting', async t => {
  const command = deferred(); let commandCount = 0, delivered = 0;
  const h = harness(t, request => {
    if (request.path === '/command') { commandCount++; return command.promise; }
    return reply(snapshot(1));
  });
  h.runtime.subscribeCommands(() => delivered++);
  await h.runtime.connect();
  const fired = h.runtime.command('fire'); h.runtime.disconnect();
  await h.runtime.connect(); command.reject(new Error('response lost'));
  assert.equal((await fired).reason, 'disconnected');
  assert.equal(commandCount, 1);
  assert.equal(delivered, 0);
  assert.equal(h.runtime.status().connected, true);
});

test('unauthorized command clears queued actions and renews identity without replaying fire', async t => {
  const command = deferred(); let commandCount = 0;
  const h = harness(t, request => {
    if (request.path === '/identity') return reply({ ok: true, token: 'renewed-token', playerId: 'renewed-pilot' });
    if (request.path === '/command') { commandCount++; return command.promise; }
    return reply(snapshot(1, request.token === 'Bearer saved-token' ? 'pilot' : 'renewed-pilot'));
  });
  await h.runtime.connect();
  const first = h.runtime.command('fire'), queued = h.runtime.command('fire');
  command.resolve(unauthorized());
  assert.equal((await first).ok, false); assert.equal((await queued).ok, false);
  await h.tick(500);
  assert.equal(h.runtime.status().connected, true);
  assert.equal(h.runtime.status().localId, 'renewed-pilot');
  assert.equal(commandCount, 1, 'no discrete action crosses the identity change');
});

test('a temporary HTTP error keeps the existing Mamute, identity and event cursor', async t => {
  let failed = false;
  const h = harness(t, request => {
    assert.equal(request.path, '/poll');
    return failed ? { ok: false, status: 503 } : reply(snapshot(20));
  });
  await h.runtime.connect(); failed = true; await h.tick(200);
  assert.equal(h.runtime.status().connected, false);
  assert.equal(h.runtime.status().mamuteId, 'mamute');
  assert.equal(h.runtime.snapshot().revision, 20);
  assert.deepEqual(JSON.parse(h.saved()), savedIdentity);
  failed = false; await h.tick(500);
  assert.equal(h.runtime.status().connected, true);
  assert.equal(h.requests.at(-1).body.after, 20);
  assert.equal(h.writes.length, 0);
});

test('an exhausted command retry is not replayed when automatic polling reconnects', async t => {
  const sent = [];
  const h = harness(t, request => {
    if (request.path !== '/command') return reply(snapshot());
    sent.push(request.body); throw new Error('response lost');
  });
  await h.runtime.connect();
  const fired = h.runtime.command('fire'), queued = h.runtime.command('reload');
  assert.equal((await fired).ok, false); assert.equal((await queued).ok, false);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].id, sent[1].id);
  assert.equal(sent[0].sequence, sent[1].sequence);
  await h.tick(500);
  assert.equal(h.runtime.status().connected, true);
  assert.equal(sent.length, 2);
});

test('a successful late command response cannot publish snapshots or effects after disconnect', async t => {
  const command = deferred(); let delivered = 0;
  const h = harness(t, request => request.path === '/command' ? command.promise : reply(snapshot()));
  h.runtime.subscribeCommands(() => delivered++);
  h.runtime.subscribeEffects(() => delivered++);
  await h.runtime.connect();
  const fired = h.runtime.command('fire'); h.runtime.disconnect();
  const late = snapshot(100); late.events = [{ id: 100, type: 'fire', payload: {} }];
  command.resolve(reply({ ok: true, snapshot: late }));
  assert.equal((await fired).reason, 'disconnected');
  await h.tick(10000);
  assert.equal(h.runtime.status().connected, false);
  assert.equal(h.runtime.snapshot().revision, 1);
  assert.equal(delivered, 0);
});
