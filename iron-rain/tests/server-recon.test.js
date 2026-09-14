import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerRecon } from '../server/recon.mjs';

function fixture() {
  const radio = { id: 'operator', team: 'ally', slot: 0, x: 1000, y: 1000, inactive: false };
  const enemy = { id: 'soldier', team: 'enemy', slot: 1, x: 1500, y: 1000, inactive: false };
  const base = { id: 'base', type: 'BASE', team: 'enemy', x: 1800, y: 1000, alive: true, hp: 100 };
  const sector = { id: 'front', strategicSectorId: 'region-sector', units: [radio, enemy], assets: [], war: { bases: [base], vehicles: [], mortars: [] } };
  const state = { time: 0, mamutes: {}, battlefield: { sectors: [sector], smokes: [] } };
  const theatre = { territory: new Map(), records: new Map(), logistics: { getNode: () => null, snapshot: () => ({ convoys: [] }) } };
  const plane = { id: 'plane', team: 'ally', type: 'recon', x: 1000, y: 1000, hp: 50, alive: true, life: 90 };
  const air = { aircraft: [], reports: [] };
  const service = createServerRecon({ state, theatre, airWar: { snapshot: ({ team }) => ({ aircraft: air.aircraft.filter(p => p.team === team), reports: air.reports.filter(r => r.team === team) }) } });
  const airReport = () => ({ id: 'air-report-1', type: 'recon-contact', team: 'ally', sourceId: 'plane', x: 1000, y: 1000, time: 0,
    observations: [{ targetId: 'enemy-tank', kind: 'tank', x: 1400, y: 1000 }] });
  return { state, theatre, service, radio, enemy, base, sector, plane, air, airReport };
}

test('only a living radio-equipped tactical observer can discover ground contacts', () => {
  const f = fixture(); f.radio.inactive = true; f.service.step(1);
  assert.deepEqual(f.service.snapshot('ally'), { reports: [] });
  f.radio.inactive = false; f.radio.downed = true; f.service.step(1);
  assert.equal(f.service.snapshot('ally').reports.length, 0);
  f.radio.downed = false; f.radio.slot = 1; f.service.step(1);
  assert.equal(f.service.snapshot('ally').reports.length, 0);
  f.radio.slot = 0; f.service.step(1);
  const [report] = f.service.snapshot('ally').reports;
  assert.equal(report.source, 'radio'); assert.equal(report.sectorId, 'region-sector');
  assert.deepEqual(report.contacts.map(contact => contact.id), ['soldier', 'base']);
  assert.equal(f.radio.radio, true);
  assert.equal(f.service.snapshot('enemy').reports.length, 0, 'opponents cannot read this faction report');
});

test('out-of-sight and smoke-obscured enemies are not discovered by map knowledge', () => {
  const f = fixture(); f.enemy.x = 2201; f.base.x = 5000; f.service.step(1);
  assert.equal(f.service.snapshot('ally').reports.length, 0);
  f.enemy.x = 1500; f.state.battlefield.smokes.push({ x: 1250, y: 1000, r: 100, life: 30 });
  f.service.step(8); assert.equal(f.service.snapshot('ally').reports.length, 0);
  f.state.battlefield.smokes = []; f.service.step(8);
  assert.equal(f.service.snapshot('ally').reports[0].contacts.length, 1);
});

test('last-known coordinates are fixed until another actual observation and expire after 45 seconds', () => {
  const f = fixture(); f.service.step(1);
  const report = f.service.snapshot('ally').reports[0];
  f.enemy.x = 1700; f.service.step(4);
  assert.equal(f.service.snapshot('ally').reports[0].contacts[0].x, 1500, 'no live tracking between radio transmissions');
  f.radio.inactive = true; f.service.step(40);
  assert.equal(f.service.snapshot('ally').reports[0].observedAt, report.observedAt);
  f.service.step(1); assert.equal(f.service.snapshot('ally').reports.length, 0);
});

test('air contacts require a surviving real reconnaissance source; old messages do not renew themselves', () => {
  const f = fixture(); f.sector.units = [];
  f.air.aircraft.push(f.plane); f.air.reports.push(f.airReport());
  f.plane.hp = 0; f.plane.alive = false; f.service.step(1);
  assert.equal(f.service.snapshot('ally').reports.length, 0);
  f.plane.hp = 50; f.plane.alive = true; f.service.step(1);
  const [report] = f.service.snapshot('ally').reports;
  assert.equal(report.source, 'plane'); assert.equal(report.contacts[0].type, 'tank');
  f.service.step(44); assert.equal(f.service.snapshot('ally').reports.length, 0, 'the same retained air report cannot refresh its TTL');
});

test('destroying an observer prevents new reports without rewriting already earned coordinates', () => {
  const f = fixture(); f.sector.units = []; f.air.aircraft.push(f.plane); f.air.reports.push(f.airReport());
  f.service.step(1); const original = f.service.snapshot('ally').reports[0];
  f.plane.alive = false; f.plane.life = 0;
  f.air.reports.push({ ...f.airReport(), id: 'air-report-2', time: 2, observations: [{ kind: 'tank', targetId: 'enemy-tank', x: 1700, y: 1000 }] });
  f.service.step(2);
  assert.deepEqual(f.service.snapshot('ally').reports, [original]);
});

test('recon checkpoint contains data only and snapshot mutation cannot change authority', () => {
  const f = fixture(); f.service.step(1);
  const copy = f.service.snapshot('ally'); copy.reports[0].contacts[0].x = -9999;
  assert.equal(f.service.snapshot('ally').reports[0].contacts[0].x, 1500);
  const state = structuredClone(f.state), resumed = createServerRecon({ state, theatre: f.theatre });
  assert.deepEqual(resumed.snapshot('ally'), f.service.snapshot('ally'));
  assert.deepEqual(resumed.snapshot('invalid-team'), { reports: [] });
});
