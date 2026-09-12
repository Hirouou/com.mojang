import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewSession } from '../modules/crew-session.js';

function fixture(id, clock) {
  const out = [];
  const session = createCrewSession({ localId: id, now: () => clock.value, send: packet => out.push(packet) });
  return { session, out };
}
function deliver(out, target) {
  for (const packet of out.splice(0)) target.receive(packet);
}
function join(host, guest, room) {
  guest.session.join(room); deliver(guest.out, host.session); deliver(host.out, guest.session);
}

test('host serializes station claims so two crew cannot operate the same controls', () => {
  const clock = { value: 1 };
  const host = fixture('host', clock), a = fixture('a', clock), b = fixture('b', clock);
  host.session.host('M47'); host.out.length = 0;
  join(host, a, 'M47');
  join(host, b, 'M47');
  deliver(host.out, a.session); deliver(host.out, b.session);

  const pending = a.session.claimStation('aim');
  assert.equal(pending.pending, true);
  deliver(a.out, host.session);
  const stationPackets = host.out.splice(0);
  stationPackets.forEach(packet => { a.session.receive(packet); b.session.receive(packet); });
  assert.equal(a.session.stationOwner('aim'), 'a');
  assert.equal(b.session.canUseStation('aim'), false);

  b.session.claimStation('aim');
  deliver(b.out, host.session);
  const denial = host.out.find(packet => packet.kind === 'crew-station-deny' && packet.target === 'b');
  assert.equal(denial?.owner, 'a');
  assert.equal(host.session.stationOwner('aim'), 'a');
});

test('station ownership is released when its crew member leaves', () => {
  const clock = { value: 1 };
  const host = fixture('host', clock), guest = fixture('guest', clock);
  host.session.host('M47'); host.out.length = 0;
  join(host, guest, 'M47');
  guest.session.claimStation('drive'); deliver(guest.out, host.session); host.out.length = 0;
  assert.equal(host.session.stationOwner('drive'), 'guest');

  guest.session.leave(); deliver(guest.out, host.session);
  assert.equal(host.session.stationOwner('drive'), null);
  assert.equal(host.session.canUseStation('drive'), true);
});
