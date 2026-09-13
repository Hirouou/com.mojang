import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewStationAuthority } from '../modules/crew-station-authority.js';

test('one player owns a physical station at a time', () => {
  const stations = createCrewStationAuthority();
  assert.equal(stations.claim('aim', 'alpha').ok, true);
  const denied = stations.claim('aim', 'bravo');
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'occupied');
  assert.equal(denied.owner, 'alpha');
  assert.equal(stations.canUse('aim', 'alpha'), true);
  assert.equal(stations.canUse('aim', 'bravo'), false);
});

test('disconnect releases every station owned by that crew member', () => {
  const stations = createCrewStationAuthority();
  stations.claim('drive', 'alpha');
  stations.claim('radio', 'alpha');
  stations.claim('load', 'bravo');
  assert.equal(stations.releaseAll('alpha'), 2);
  assert.equal(stations.ownerOf('drive'), null);
  assert.equal(stations.ownerOf('radio'), null);
  assert.equal(stations.ownerOf('load'), 'bravo');
});

test('authoritative snapshots do not roll backwards', () => {
  const server = createCrewStationAuthority();
  server.claim('engine', 'alpha');
  const snapshot = server.snapshot();
  const client = createCrewStationAuthority();
  assert.equal(client.apply(snapshot), true);
  assert.equal(client.ownerOf('engine'), 'alpha');
  assert.equal(client.apply({ revision: snapshot.revision - 1, claims: [] }), false);
  assert.equal(client.ownerOf('engine'), 'alpha');
});

test('same revision is idempotent but cannot replace station ownership', () => {
  const server = createCrewStationAuthority();
  server.claim('drive', 'alpha');
  const snapshot = server.snapshot();
  const client = createCrewStationAuthority();

  assert.equal(client.apply(snapshot), true);
  assert.equal(client.apply(snapshot), true);
  assert.equal(client.ownerOf('drive'), 'alpha');

  assert.equal(client.apply({
    revision: snapshot.revision,
    claims: [{ station: 'drive', owner: 'bravo' }],
  }), false);
  assert.equal(client.ownerOf('drive'), 'alpha');
});
