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
  const host = createCrewStationAuthority();
  host.claim('engine', 'alpha');
  const snapshot = host.snapshot();
  const guest = createCrewStationAuthority();
  assert.equal(guest.apply(snapshot), true);
  assert.equal(guest.ownerOf('engine'), 'alpha');
  assert.equal(guest.apply({ revision: snapshot.revision - 1, claims: [] }), false);
  assert.equal(guest.ownerOf('engine'), 'alpha');
});
