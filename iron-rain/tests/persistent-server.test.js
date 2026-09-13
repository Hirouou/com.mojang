import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWarAuthority } from '../server/world.mjs';
import { openWarStore } from '../server/store.mjs';
import { startWarServer } from '../server/http.mjs';
import { elevationsForRange } from '../modules/ballistics.js';

function fixture(path = ':memory:') {
  let wall = 1000000;
  const store = openWarStore(path), world = createWarAuthority({ store, now: () => wall });
  const player = () => { const identity = world.register(); const p=world.authenticate(identity.token); world.heartbeat(p); return { identity, p }; };
  const command = (p, type, payload) => world.command(p, { id: randomUUID(), sequence: (p.sequence || 0)+1, type, payload });
  const create = (p, faction) => {
    const hex = world.theatre.hexes.find(h => h.sectors.every(s => s.owner === (faction === 'axis' ? 'enemy' : 'ally')));
    assert.equal(command(p, 'create', { faction, spawnId: hex.id }).ok, true);
    return world.state.mamutes[p.mamuteId];
  };
  const advance = seconds => { for (let t = 0; t < seconds; t += .1) { wall += 100; world.advance(); } };
  return { store, world, player, command, create, advance, wall: () => wall };
}

test('server owns crew capacity, faction, exclusive stations and expiry without deleting Mamutes', () => {
  const f = fixture();
  try {
    const a = f.player(), b = f.player(), c = f.player(), d = f.player();
    const m = f.create(a.p, 'allies');
    for (const crew of [b, c]) assert.equal(f.command(crew.p, 'join', { code: m.code, faction: 'allies' }).ok, true);
    assert.equal(f.command(d.p, 'join', { code: m.code, faction: 'allies' }).reason, 'crew-full');
    assert.equal(f.command(d.p, 'join', { code: m.code, faction: 'axis' }).reason, 'faction-mismatch');
    for (const crew of [a, b]) f.world.heartbeat(crew.p, { x: 0, z: 0, yaw: 0, pitch: 0 });
    assert.equal(f.command(a.p, 'claim', { station: 'aim' }).ok, true);
    assert.equal(f.command(b.p, 'claim', { station: 'aim' }).reason, 'station-owned-by-other');
    f.world.disconnect(a.p);
    assert.equal(f.command(b.p, 'claim', { station: 'aim' }).ok, true);
    f.advance(9);
    assert.equal(m.stations.aim, undefined);
    assert.ok(f.world.state.mamutes[m.id]);
    assert.ok(f.world.state.time >= 9);
    assert.equal(f.world.authenticate(a.identity.token).mamuteId, m.id);
  } finally { f.store.close(); }
});

test('opposing Mamutes share one durable war; replayed fire consumes ammo and damages target once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'iron-rain-server-'));
  const f = fixture(join(directory, 'war.sqlite'));
  try {
    const a = f.player(), b = f.player(), m = f.create(a.p, 'allies'), target = f.create(b.p, 'axis');
    assert.notEqual(m.robot.x, target.robot.x);
    f.world.heartbeat(a.p, { x: 0, z: 0, yaw: 0, pitch: 0 });
    assert.equal(f.command(a.p, 'claim', { station: 'aim' }).ok, true);
    const distance = Math.hypot(target.robot.x-m.robot.x, target.robot.y-m.robot.y);
    while (m.charge < 7) f.command(a.p, 'change-charge', { delta: 1 });
    const bearing = (Math.atan2(target.robot.x-m.robot.x, -(target.robot.y-m.robot.y))*180/Math.PI+360)%360;
    const elevation = elevationsForRange(7, distance)[0]; assert.ok(elevation);
    while (Math.abs(m.bearing-bearing) > .0001 || Math.abs(m.elev-elevation) > .0001) {
      f.command(a.p, 'aim-delta', { bearing: Math.max(-12, Math.min(12, bearing-m.bearing)), elevation: Math.max(-8, Math.min(8, elevation-m.elev)) });
    }
    const req = { id: randomUUID(), sequence: a.p.sequence+1, type: 'fire' };
    const result = f.world.command(a.p, req); assert.equal(result.ok, true);
    assert.deepEqual(f.world.command(a.p, req), result);
    assert.equal(m.ammo.HE, 17);
    f.advance(10);
    assert.ok(target.robot.armor < 80, `damage expected, armor=${target.robot.armor}`);
    assert.equal(f.world.state.events.filter(e => e.type === 'explosion').length, 1);
    const armor = target.robot.armor;
    f.world.command(a.p, req); assert.equal(target.robot.armor, armor);
    assert.equal(f.world.snapshot(a.p).theatreId, f.world.snapshot(b.p).theatreId);
    f.world.disconnect(a.p); f.world.disconnect(b.p); f.world.save(); f.store.close();
    const reopened = openWarStore(join(directory, 'war.sqlite'));
    try {
      const resumed = createWarAuthority({ store: reopened, now: () => f.wall()+1000 });
      assert.equal(resumed.authenticate(a.identity.token).mamuteId, m.id);
      assert.equal(resumed.state.mamutes[target.id].robot.armor, armor);
      resumed.advance();
      assert.ok(resumed.state.mamutes[target.id].robot.armor <= armor, 'fire continues while all browsers are absent');
      assert.equal(resumed.state.mamutes[m.id].ammo.HE, 17);
      assert.ok(resumed.state.time > 10);
    } finally { reopened.close(); }
  } finally { try { f.store.close(); } catch {} rmSync(directory, { recursive: true, force: true }); }
});

test('shared extinguisher can be returned; broken engine blocks traction without removing driver', () => {
  const f = fixture();
  try {
    const a=f.player(), b=f.player(), m=f.create(a.p,'allies');
    f.command(b.p,'join',{ code:m.code, faction:'allies' });
    f.world.heartbeat(a.p,{x:-.6,z:-2,yaw:0,pitch:0});
    assert.equal(f.command(a.p,'claim',{station:'drive'}).ok,true);
    f.world.damage(m,25); const x=m.robot.x;
    f.command(a.p,'drive-vector',{x:1,y:0}); f.advance(.3);
    assert.equal(m.robot.x,x); assert.equal(m.stations.drive,a.p.id);
    f.world.heartbeat(b.p,{x:-1.45,z:1.8,yaw:0,pitch:0});
    assert.equal(f.command(b.p,'extinguisher').ok,true); assert.equal(m.extinguisherOwner,b.p.id);
    assert.equal(f.command(b.p,'extinguisher').ok,true); assert.equal(m.extinguisherOwner,null);
    f.command(b.p,'extinguisher'); f.world.heartbeat(b.p,{x:0,z:6.6,yaw:0,pitch:0});
    assert.equal(f.command(b.p,'engine-service').ok,true); f.advance(3.1);
    assert.equal(m.engine.fire,0); assert.equal(m.stations.drive,a.p.id);
  } finally { f.store.close(); }
});

test('HTTP clients authenticate and cannot forge another player or publish damage', async () => {
  const s=startWarServer({port:0,dbPath:':memory:'});
  await new Promise(resolve=>s.server.once('listening',resolve));
  try {
    const base=`http://127.0.0.1:${s.server.address().port}`;
    const post=async(path,data,token)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)});
    assert.equal((await post('/poll',{})).status,401);
    const identity=await (await post('/identity',{})).json();
    const snapshot=await (await post('/poll',{},identity.token)).json();
    assert.equal(snapshot.authority,'server');
    const forged=await(await post('/command',{id:'forged',sequence:1,type:'damage',payload:{amount:100}},identity.token)).json();
    assert.equal(forged.ok,false);
    assert.equal(JSON.stringify(snapshot).includes('tokenHash'),false);
  } finally { await s.close(); }
});
