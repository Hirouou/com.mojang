import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWarConnection } from '../modules/server-endpoint.js';

const connection = (address, configuredEndpoint = '') => resolveWarConnection({ location: new URL(address), configuredEndpoint });

test('local entry uses the same computer and port, including IPv6, without a hosted endpoint', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.deepEqual(connection(`http://${host}:4917/`, 'https://old-server.example'), {
      endpoint: `http://${host}:4917/war-api`, mode: 'local',
    });
  }
});

test('local test overrides keep separate browser fixtures working and select the correct entry mode', () => {
  assert.deepEqual(connection('http://localhost:4173/?test=1&server=http://127.0.0.1:8787/'), {
    endpoint: 'http://127.0.0.1:8787', mode: 'local',
  });
  assert.deepEqual(connection('http://localhost:4173/?server=https://future.example'), {
    endpoint: 'https://future.example', mode: 'remote',
  });
  assert.deepEqual(connection('http://localhost:4173/?crewqa&server=http://127.0.0.1:8787'), {
    endpoint: '', mode: 'qa',
  });
});

test('public entry needs explicit configuration and cannot be redirected by its query string', () => {
  const publicPage = 'https://hirouou.github.io/com.mojang/?server=https://untrusted.example';
  assert.deepEqual(connection(publicPage), { endpoint: '', mode: 'unconfigured' });
  assert.deepEqual(connection(publicPage, 'https://war.example/api/'), {
    endpoint: 'https://war.example/api', mode: 'remote',
  });
});

test('invalid or credential-bearing endpoints fail closed', () => {
  for (const endpoint of ['file:///tmp/war', 'javascript:alert(1)', 'https://user:secret@war.example', 'http://[broken']) {
    assert.deepEqual(connection('https://game.example/', endpoint), { endpoint: '', mode: 'unconfigured' });
  }
  assert.deepEqual(connection('http://localhost:4173/?server=ftp://server'), { endpoint: '', mode: 'unconfigured' });
});
