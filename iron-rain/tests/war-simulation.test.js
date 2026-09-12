import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSector, updateWar, applyWarImpact, smokeBlocksLine, trenchPath, trenchSlot, WAR_LIMITS, PLAYER_THREAT_LIMITS, phaseLabels, getFrontGeometry, assessRoute, checkRouteAmbush, selectPlayerThreat } from '../modules/war-simulation.js';

function makeSector(index, x = 10000 + index * 10000, y = 20000) {
  return initializeSector({ id: index, name: `FRONT-${index}`, x, y, known: false, units: [{ old: true }], allyStrength: 65, enemyStrength: 72, assets: [
    { id: `${index}-BAT`, type: 'BATERIA', x: x + 650, y: y + 260, hp: 260, maxHp: 260, alive: true, known: false },
    { id: `${index}-DEP`, type: 'DEPÓSITO', x: x + 820, y: y - 260, hp: 220, maxHp: 220, alive: true, known: false }
  ] }, index);
}
function makeState(sectors = [makeSector(0)]) {
  return { time: 0, robot: { x: 0, y: 0, armor: 100 }, cam: { x: 0, y: 0 }, sectors, smokes: [], tracers: [], shell: null, intel: null,
    warSimulation: { clock: 0, accumulator: 0, impacts: [], strategicTicks: 0, detailedFronts: 0, events: [], support: [], serial: 0 } };
}
function advance(state, seconds) {
  for (let i = 0; i < seconds * 10; i++) { state.time += .1; updateWar(state, .1); }
}

test('fronts advance strategically while all soldiers remain dematerialized', () => {
  const state = makeState(Array.from({ length: 7 }, (_, i) => makeSector(i)));
  const before = state.sectors.map(sec => ({ strength: sec.allyStrength, progress: sec.progress, ammo: sec.war.ally.ammo }));
  advance(state, 90);
  state.sectors.forEach((sec, i) => {
    assert.equal(sec.units.length, 0);
    assert.ok(sec.war.ticks >= 89);
    assert.notEqual(sec.progress, before[i].progress);
    assert.notEqual(sec.war.ally.ammo, before[i].ammo);
    assert.ok(sec.war.ally.reinforcements > 0);
    assert.ok(sec.war.ally.cycles >= 5);
    assert.ok(sec.allyStrength > 0 && sec.enemyStrength > 0);
  });
});

test('detail is lazy, bounded to three fronts, and follows camera/Mamute/recon/impact', () => {
  const state = makeState(Array.from({ length: 6 }, (_, i) => makeSector(i)));
  state.cam = { ...state.sectors[0] };
  state.robot = { ...state.sectors[1], armor: 100 };
  state.intel = { sourcePos: state.sectors[2], target: state.sectors[3] };
  applyWarImpact(state, state.sectors[4].x, state.sectors[4].y, 'HE');
  updateWar(state, .016);
  assert.equal(state.sectors.filter(sec => sec.war.detailed).length, WAR_LIMITS.maxDetailedFronts);
  assert.equal(state.sectors.reduce((sum, sec) => sum + sec.units.length, 0), 51);
  assert.equal(state.sectors[0].units.length, 17);
  state.cam = { x: 70000, y: 1000 };
  state.robot = { ...state.cam, armor: 100 };
  state.intel = null;
  advance(state, 5);
  assert.equal(state.sectors.reduce((sum, sec) => sum + sec.units.length, 0), 0);
});

test('materialization and camera travel preserve persistent casualties and intelligence', () => {
  const sec = makeSector(0), state = makeState([sec]);
  applyWarImpact(state, sec.x - 320, sec.y, 'FRAG');
  const strength = sec.allyStrength, casualties = sec.war.ally.casualties;
  for (let i = 0; i < 20; i++) {
    state.cam = i % 2 ? { x: 0, y: 0 } : { x: sec.x, y: sec.y };
    state.warSimulation.impacts = [];
    updateWar(state, .001);
  }
  assert.equal(sec.allyStrength, strength);
  assert.equal(sec.war.ally.casualties, casualties);
  assert.equal(sec.known, false);
  assert.ok(sec.assets.every(asset => asset.known === false));
});

test('blast casualties select the nearest materialized trench slots', () => {
  const sec = makeSector(0), state = makeState([sec]);
  state.cam = { x: sec.x, y: sec.y };
  updateWar(state, .01);
  const target = trenchSlot(sec, 'enemy', 2);
  const impact = applyWarImpact(state, target.x, target.y, 'FRAG');
  assert.equal(impact.enemyCasualties, 2);
  const down = sec.units.filter(unit => unit.team === 'enemy' && unit.inactive).map(unit => unit.slot);
  assert.ok(down.includes(2));
  assert.ok(down.includes(3));
  assert.equal(sec.war.enemy.activeSlots, 5);
  state.cam = { x: 0, y: 0 }; updateWar(state, .01);
  state.cam = { x: sec.x, y: sec.y }; updateWar(state, .01);
  assert.deepEqual(sec.units.filter(unit => unit.team === 'enemy' && unit.inactive).map(unit => unit.slot), down);
});

test('aggregate casualties disable representative soldiers and empty fronts cannot fire', () => {
  const sec = makeSector(0), state = makeState([sec]);
  state.cam = { x: sec.x, y: sec.y };
  updateWar(state, .01);
  assert.equal(sec.units.filter(unit => unit.team === 'ally' && !unit.inactive).length, 6);
  assert.equal(sec.units.filter(unit => unit.team === 'enemy' && !unit.inactive).length, 7);
  // An exhausted enemy front has no valid tactical targets, even with allied soldiers present.
  sec.enemyStrength = 0;
  advance(state, 6);
  assert.ok(sec.units.filter(unit => unit.team === 'enemy').every(unit => unit.inactive && unit.downed && unit.pop === 0));
  assert.equal(state.tracers.length, 0);
  sec.allyStrength = 0;
  advance(state, 2);
  assert.ok(sec.units.every(unit => unit.inactive));
  assert.equal(state.tracers.length, 0);
});

test('downed slots persist through rematerialization and only reinforcement restores them', () => {
  const sec = makeSector(0), state = makeState([sec]);
  state.cam = { x: sec.x, y: sec.y };
  for (let i = 0; i < 8; i++) applyWarImpact(state, sec.x - 320, sec.y, 'FRAG');
  updateWar(state, .01);
  assert.equal(sec.allyStrength, 0);
  assert.equal(sec.war.ally.activeSlots, 0);
  state.warSimulation.impacts = [];
  state.cam = { x: 0, y: 0 }; updateWar(state, .01);
  state.cam = { x: sec.x, y: sec.y }; updateWar(state, .01);
  assert.ok(sec.units.filter(unit => unit.team === 'ally').every(unit => unit.inactive));
  sec.war.ally.reinforcementsIn = 2;
  updateWar(state, 1);
  assert.equal(sec.war.ally.activeSlots, 0);
  updateWar(state, 1);
  assert.equal(sec.war.ally.activeSlots, 0, 'a destroyed platoon cannot reappear immediately');
  sec.war.ally.fallbackUntil = sec.war.ticks;
  sec.war.ally.reinforcementsIn = 1;
  updateWar(state, 1);
  assert.ok(sec.allyStrength > 0);
  assert.equal(sec.war.ally.activeSlots, 1);
  assert.equal(sec.units.filter(unit => unit.team === 'ally' && !unit.inactive).length, 1);
});

test('zigzag slots stay on the renderer trench path', () => {
  const sec = makeSector(0);
  for (const team of ['ally', 'enemy']) {
    const path = trenchPath(sec.x + (team === 'ally' ? -320 : 320), sec.y, team);
    for (let slot = 0; slot < (team === 'ally' ? 8 : 9); slot++) {
      const point = trenchSlot(sec, team, slot);
      const onSegment = path.slice(1).some((end, i) => {
        const start = path[i];
        return Math.abs(Math.hypot(point.x - start.x, point.y - start.y) + Math.hypot(point.x - end.x, point.y - end.y) - Math.hypot(start.x - end.x, start.y - end.y)) < 1e-8;
      });
      assert.ok(onSegment);
    }
  }
});

test('squads alternate cover, suppression, supported bounds, regrouping and retreat', () => {
  const sec = makeSector(0), state = makeState([sec]);
  state.cam = { x: sec.x, y: sec.y };
  const observed = new Set();
  for (let i = 0; i < 160; i++) {
    updateWar(state, 1);
    observed.add(sec.war.ally.phase);
    observed.add(sec.war.enemy.phase);
    assert.ok(Math.abs(sec.war.ally.advance) <= WAR_LIMITS.captureBound);
    assert.ok(Math.abs(sec.war.enemy.advance) <= WAR_LIMITS.captureBound);
    assert.ok(state.tracers.length <= WAR_LIMITS.maxTracers);
  }
  for (const phase of ['hold', 'suppress', 'assault', 'consolidate']) assert.ok(observed.has(phase), `${phase} should be observed`);
  sec.war.ally.phase = 'assault'; sec.war.ally.morale = .1; sec.war.ally.phaseTime = 0;
  updateWar(state, 1);
  assert.equal(sec.war.ally.phase, 'retreat');
  sec.war.ally.phaseTime = 0;
  updateWar(state, 1);
  assert.equal(sec.war.ally.phase, 'regroup');
  sec.war.ally.morale = .9; sec.war.ally.ammo = .8; sec.war.ally.suppression = 0;
  sec.war.ally.phase = 'suppress'; sec.war.ally.phaseTime = 0;
  state.smokes = [{ x: sec.x, y: sec.y, r: 300, life: 30 }];
  updateWar(state, 1);
  assert.equal(sec.war.ally.phase, 'wait_support');
  assert.ok(Object.hasOwn(phaseLabels, sec.war.ally.phase));
});

test('smoke blocks crossing fire and reduces strategic support without damage', () => {
  const clear = makeState(), smoke = makeState();
  for (const state of [clear, smoke]) state.cam = { x: state.sectors[0].x, y: state.sectors[0].y };
  const sec = smoke.sectors[0], ownStrength = sec.allyStrength;
  const effect = applyWarImpact(smoke, sec.x, sec.y, 'SMOKE');
  assert.equal(sec.allyStrength, ownStrength);
  assert.equal(effect.friendlyHits, 0);
  assert.ok(effect.smoke.r >= 250);
  advance(clear, 2); advance(smoke, 2);
  assert.ok(smoke.sectors[0].war.enemy.support < clear.sectors[0].war.enemy.support * .3);
  assert.ok(smoke.sectors[0].war.enemy.fire < clear.sectors[0].war.enemy.fire * .1);
  assert.equal(smoke.tracers.length, 0);
  assert.equal(smokeBlocksLine(smoke.smokes, { x: sec.x - 400, y: sec.y }, { x: sec.x + 400, y: sec.y }), true);
  assert.equal(smokeBlocksLine([{ x: 0, y: 0, r: 4, life: 0 }], { x: -5, y: 0 }, { x: 5, y: 0 }), false);
});

test('HE destroys structures, FRAG has a wider infantry role, and friendly fire does not stop war', () => {
  const he = makeState(), frag = makeState();
  const target = he.sectors[0].assets[0];
  const hit = applyWarImpact(he, target.x, target.y, 'HE');
  applyWarImpact(frag, target.x, target.y, 'FRAG');
  assert.equal(hit.destroyed.length, 1);
  assert.equal(target.alive, false);
  assert.ok(frag.sectors[0].assets[0].hp > 180);
  const nearbyHE = makeState(), nearbyFrag = makeState();
  const sec = nearbyHE.sectors[0];
  applyWarImpact(nearbyHE, sec.x - 550, sec.y, 'HE');
  const friendly = applyWarImpact(nearbyFrag, sec.x - 550, sec.y, 'FRAG');
  assert.ok(nearbyFrag.sectors[0].allyStrength < nearbyHE.sectors[0].allyStrength);
  assert.ok(friendly.friendlyHits > 0);
  nearbyFrag.robot = { x: sec.x - 550, y: sec.y, armor: 100 };
  const armorHit = applyWarImpact(nearbyFrag, nearbyFrag.robot.x, nearbyFrag.robot.y, 'HE');
  assert.equal(nearbyFrag.robot.armor, 58);
  assert.equal(armorHit.robotDamage, 42);
  advance(nearbyFrag, 5);
  assert.equal(nearbyFrag.warSimulation.strategicTicks, 5);
  assert.notEqual(nearbyFrag.paused, true);
  assert.equal(nearbyFrag.gameOver, undefined);
});

for (const team of ['ally', 'enemy']) {
  test(`${team} occupies a cleared opposing trench, keeps territory, and builds a forward base`, () => {
    const sec = makeSector(0), state = makeState([sec]);
    const foe = team === 'ally' ? 'enemy' : 'ally', sign = team === 'ally' ? 1 : -1;
    sec[`${team}Strength`] = 78;
    sec[`${foe}Strength`] = 0;
    sec.war[team].morale = .85;
    state.cam = { x: sec.x, y: sec.y };
    updateWar(state, .01);
    const before = sec.units.find(unit => unit.team === team && !unit.inactive).x;
    advance(state, 8);
    assert.equal(sec.war[team].phase, 'assault');
    assert.ok((sec.units.find(unit => unit.team === team && !unit.inactive).x - before) * sign > 90, 'visible soldiers advance within eight seconds');
    assert.equal(sec[`${foe}Strength`], 0, 'eliminated defenders do not respawn during exploitation');
    advance(state, 28);
    assert.equal(sec.war.positionOffset, sign * WAR_LIMITS.captureBound);
    assert.equal(sec.war[team].securedBounds, 1);
    assert.equal(sec.war[team].phase, 'consolidate');
    assert.ok(sec.war.bases.some(base => base.team === team && base.level === 0), 'engineers build a forward camp');
    assert.ok(state.warSimulation.events.some(event => event.type === 'capture' && event.team === team));
    assert.equal(sec.x, 10000, 'objective/report coordinate origin remains stable');
    assert.equal(getFrontGeometry(sec)[`${team}Trench`].x, sec.x + sign * 320, 'old opposing trench becomes the occupied friendly line');
    const captured = sec.war.positionOffset;
    advance(state, 6);
    assert.equal(sec.war.positionOffset, captured, 'consolidation retains the captured ground');
  });
}

test('weak forces do not exploit a gap until they can organize an assault', () => {
  const sec = makeSector(0), state = makeState([sec]);
  sec.allyStrength = 9; sec.enemyStrength = 0;
  for (const team of ['ally', 'enemy']) sec.war[team].reinforcementsIn = 10000;
  advance(state, 90);
  assert.equal(sec.war.positionOffset, 0);
  assert.notEqual(sec.war.ally.phase, 'assault');
  assert.equal(sec.war.ally.securedBounds, 0);
});

test('supplied engineering expands both teams bases while abandoned bases stop building', () => {
  const sec = makeSector(0), state = makeState([sec]);
  advance(state, 60);
  for (const team of ['ally', 'enemy']) assert.ok(sec.war.bases.some(base => base.team === team && base.level >= 2));
  const allyBase = sec.war.bases.find(base => base.team === 'ally');
  sec.allyStrength = 0; sec.war.ally.reinforcementsIn = 10000;
  const built = allyBase.buildProgress;
  advance(state, 10);
  assert.equal(allyBase.buildProgress, built);
  assert.ok(state.warSimulation.events.some(event => event.type === 'construction'));
});

test('mortars, tanks, bombers and falling bombs fight for both teams with bounded detail', () => {
  const sec = makeSector(0), state = makeState([sec]);
  const seen = new Set();
  for (let i = 0; i < 1150; i++) {
    updateWar(state, .1);
    for (const item of state.warSimulation.support) seen.add(`${item.team}:${item.type}`);
    assert.ok(state.warSimulation.support.length <= WAR_LIMITS.maxSupport);
  }
  for (const team of ['ally', 'enemy']) {
    for (const type of ['mortar', 'tank-shell', 'bomber', 'bomb']) assert.ok(seen.has(`${team}:${type}`), `${team} ${type} deployed`);
  }
  assert.equal(sec.units.length, 0, 'support warfare does not materialize distant infantry');
  assert.ok(sec.war.vehicles.some(tank => tank.hp < tank.maxHp || !tank.alive), 'armour exchanges cause persistent damage');
  assert.ok(state.warSimulation.events.length <= WAR_LIMITS.maxEvents);
});

test('moving infantry takes blast damage at its actual position instead of a ghost trench slot', () => {
  const sec = makeSector(0), state = makeState([sec]);
  state.cam = { x: sec.x, y: sec.y };
  updateWar(state, .01);
  const enemies = sec.units.filter(unit => unit.team === 'enemy' && !unit.inactive);
  for (const unit of enemies) unit.x += 1100;
  const target = enemies[2];
  const result = applyWarImpact(state, target.x, target.y, 'FRAG');
  assert.ok(result.enemyCasualties > 0);
  assert.ok(target.inactive, 'the soldier under the detonation is the casualty');
});

test('route safety follows captured ground and infiltration requires a live defensive gap', () => {
  const sec = makeSector(0), state = makeState([sec]);
  state.robot = { x: sec.x - 600, y: sec.y, armor: 100 };
  const behind = assessRoute(state, state.robot, { x: sec.x - 400, y: sec.y });
  assert.equal(behind.safe, true);
  assert.equal(behind.partisanRisk, 0);
  const contested = assessRoute(state, state.robot, { x: sec.x + 250, y: sec.y });
  assert.equal(contested.safe, false);
  sec.war.positionOffset = 640;
  assert.equal(assessRoute(state, state.robot, { x: sec.x + 250, y: sec.y }).safe, true);
  sec.allyStrength = 5;
  const breach = assessRoute(state, state.robot, { x: state.robot.x + 200, y: sec.y });
  assert.ok(breach.gaps.length > 0 && breach.partisanRisk > 0);
  let ambush = null;
  for (let t = 1; t <= 100 && !ambush; t++) { state.warSimulation.clock = t * 4; ambush = checkRouteAmbush(state, breach, 4); }
  assert.ok(ambush && state.robot.armor < 100);
  sec.allyStrength = 70;
  const armor = state.robot.armor;
  state.warSimulation.clock += 100;
  assert.equal(checkRouteAmbush(state, breach, 4), null, 'stale reports cannot spawn enemies behind a restored defense');
  assert.equal(state.robot.armor, armor);
});

test('an exposed Mamute is prioritised by nearby enemy weapons in march mode', () => {
  const sec = makeSector(0), state = makeState([sec]);
  state.mode = 'march';
  state.robot = { x: sec.x + 340, y: sec.y, armor: 100 };
  state.cam = { x: sec.x, y: sec.y };
  state.warSimulation.playerThreatCooldown = 0;
  const threat = selectPlayerThreat(state);
  assert.ok(threat, 'a nearby enemy weapon should acquire the Mamute');
  assert.ok(threat.profile.range <= PLAYER_THREAT_LIMITS[threat.kind].range);
  updateWar(state, .1);
  assert.ok(state.robot.armor < 100, 'enemy fire must damage the player armour');
  assert.ok(state.warSimulation.playerHits.length > 0, 'the hit is exposed to the renderer/audio layer');
  assert.ok(state.tracers.some(tracer => tracer.team === 'enemy' && tracer.x2 === state.robot.x));
  assert.ok(state.warSimulation.events.some(event => event.type === 'player_fire'));
});

test('direct fire is masked behind the allied trench while indirect fire can still bracket the vehicle', () => {
  const sec = makeSector(0), state = makeState([sec]);
  state.mode = 'march';
  state.robot = { x: sec.x - 600, y: sec.y, armor: 100 };
  const covered = selectPlayerThreat(state);
  assert.ok(covered && ['mortar', 'battery'].includes(covered.kind), `expected indirect fire, got ${covered?.kind}`);
  state.robot.x = sec.x + 500;
  const exposed = selectPlayerThreat(state);
  assert.ok(exposed && ['hmg', 'tank', 'mortar', 'battery'].includes(exposed.kind));
});
