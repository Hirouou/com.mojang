import { getFrontGeometry } from '../modules/war-simulation-core.js';

export const SERVER_AIR_LIMITS = Object.freeze({ aircraft: 8, batteries: 14, reports: 64, effects: 48, sight: 3200, reconSight: 1800, aaRange: 6000 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const faction = team => team === 'ally' || team === 'enemy';
const other = team => team === 'ally' ? 'enemy' : 'ally';
const costs = Object.freeze({ bomber: { fuel: 18, ammo: 10 }, fighter: { fuel: 12, ammo: 8 }, recon: { fuel: 9, ammo: 0 }, aa: { materials: 75, ammo: 18 } });
const active = plane => plane && plane.life > 0 && plane.alive !== false && (plane.hp ?? 90) > 0;

/** Aircraft, stock debits and observations belong to the dedicated world only. */
export function createServerAirWar({ battlefield, theatre }) {
  battlefield.airWar ||= { version: 1, clock: 0, serial: 0, sortie: 0, nextSortieAt: 2, nextDefenseAt: 1, aircraft: [], effects: [], reports: [] };
  const air = battlefield.airWar;
  if (air.version !== 1) throw new Error('Unsupported air-war checkpoint');
  const batteries = () => (battlefield.sectors || []).flatMap(sector => (sector.assets || []).filter(asset => asset.type === 'AA'));
  const bombers = () => (battlefield.warSimulation?.support || []).filter(item => item.type === 'bomber' && active(item));
  const aircraft = () => [...air.aircraft.filter(active), ...bombers()];
  const pay = (node, cost) => {
    if (!node?.alive || !Object.entries(cost).every(([key, amount]) => (node.stock?.[key] || 0) >= amount)) return false;
    for (const [key, amount] of Object.entries(cost)) node.stock[key] -= amount;
    return true;
  };
  function report(type, team, point, payload = {}) {
    const entry = { id: `air-report-${++air.serial}`, type, team, time: air.clock, expires: air.clock + 90, x: point.x, y: point.y, ...payload };
    air.reports.push(entry); air.reports = air.reports.slice(-SERVER_AIR_LIMITS.reports);
    return entry;
  }
  function effect(type, from, to, team) {
    air.effects.push({ id: `air-effect-${++air.serial}`, type, team, x: from.x, y: from.y, x2: to.x, y2: to.y, z: to.z || 0, life: type === 'air-crash' ? 4 : .7, max: type === 'air-crash' ? 4 : .7 });
    air.effects = air.effects.slice(-SERVER_AIR_LIMITS.effects);
  }
  function sourceFor(team, target, type) {
    return [...theatre.records.values()].map(({ sector }) => ({ point: sector, node: theatre.territory.get(sector.id), endpoint: theatre.logistics.getNode(sector.id) }))
      .filter(({ node, endpoint }) => node?.owner === team && !node.contested && endpoint?.alive && endpoint.team === team &&
        node.structures?.some(structure => ['garage', 'factory'].includes(structure)) && Object.entries(costs[type]).every(([key, amount]) => (endpoint.stock?.[key] || 0) >= amount))
      .sort((a, b) => distance(a.point, target) - distance(b.point, target) || String(a.point.id).localeCompare(String(b.point.id)))[0] || null;
  }
  function damage(plane, amount, source) {
    if (!active(plane)) return;
    plane.hp = Math.max(0, (plane.hp ?? 90) - amount);
    if (plane.hp > 0) return;
    plane.alive = false; plane.life = 0;
    effect('air-crash', plane, plane, source.team);
    report('aircraft-downed', source.team, plane, { aircraftId: plane.id, aircraftType: plane.type, victimTeam: plane.team, sourceId: source.id });
    report('aircraft-lost', plane.team, plane, { aircraftId: plane.id, aircraftType: plane.type });
  }
  function ensureDefenses() {
    const existing = batteries();
    for (const battery of existing) {
      const node = theatre.territory.get(battery.originId), endpoint = theatre.logistics.getNode(battery.originId);
      // This magazine is physically at its supply node; resupply debits the
      // ammunition there and cannot draw from a remote or captured depot.
      if (battery.alive && battery.ammo <= 4 && node?.owner === battery.team && !node.contested && endpoint?.team === battery.team && pay(endpoint, { ammo: 12 })) {
        battery.ammo += 12;
        report('aa-resupplied', battery.team, battery, { sourceId: battery.id });
      }
    }
    if (existing.length >= SERVER_AIR_LIMITS.batteries) return;
    const candidates = [...theatre.records.values()].map(({ sector }) => ({ sector, node: theatre.territory.get(sector.id), endpoint: theatre.logistics.getNode(sector.id) }))
      .filter(({ sector, node, endpoint }) => faction(node?.owner) && !node.contested && endpoint?.alive && endpoint.team === node.owner &&
        node.structures?.some(type => ['outpost', 'depot', 'factory'].includes(type)) && !existing.some(battery => battery.originId === sector.id))
      .map(candidate => ({ ...candidate, front: [...(battlefield.sectors || [])].sort((a, b) => distance(candidate.sector, getFrontGeometry(a).center) - distance(candidate.sector, getFrontGeometry(b).center))[0] }))
      .filter(candidate => candidate.front && distance(candidate.sector, getFrontGeometry(candidate.front).center) < 20_000)
      .sort((a, b) => distance(a.sector, getFrontGeometry(a.front).center) - distance(b.sector, getFrontGeometry(b.front).center));
    for (const { sector, node, endpoint, front } of candidates) {
      if (existing.length >= SERVER_AIR_LIMITS.batteries) break;
      // Guard actual supplied territory. Weapons are never conjured beside an
      // attacking aircraft or moved instantly from the rear to a new trench.
      if (!pay(endpoint, costs.aa)) continue;
      const battery = { id: `aa-${sector.id}`, type: 'AA', team: node.owner, originId: sector.id, x: sector.x, y: sector.y, hp: 120, maxHp: 120, alive: true, ammo: 18, cooldown: 1, flash: 0 };
      front.assets ||= []; front.assets.push(battery); existing.push(battery);
      report('aa-operational', battery.team, battery, { sourceId: battery.id, sectorId: sector.id });
    }
  }
  function launch() {
    if (air.aircraft.filter(active).length >= SERVER_AIR_LIMITS.aircraft || !battlefield.sectors?.length) return;
    const index = air.sortie++, team = index % 2 ? 'enemy' : 'ally';
    const type = Math.floor(index / 2) % 2 ? 'recon' : 'fighter';
    const sector = battlefield.sectors[Math.floor(index / 4) % battlefield.sectors.length];
    const target = getFrontGeometry(sector).center;
    const source = sourceFor(team, target, type);
    if (!source || distance(source.point, target) > 27_000 || !pay(source.endpoint, costs[type])) return;
    const plane = { id: `air-${++air.serial}`, type, team, sector: sector.id, originId: source.point.id,
      x: source.point.x, y: source.point.y, z: type === 'recon' ? 900 : 1200,
      origin: { x: source.point.x, y: source.point.y }, target: { ...target }, angle: 0,
      hp: type === 'fighter' ? 70 : 55, alive: true, age: 0, life: 160, max: 160,
      phase: 'outbound', patrolFor: 65, ammo: type === 'fighter' ? 16 : 0, cooldown: 0, reconAt: 0 };
    air.aircraft.push(plane);
    report('aircraft-launched', team, source.point, { aircraftId: plane.id, aircraftType: type, sectorId: sector.strategicSectorId || sector.strategicId });
  }
  function move(plane, target, dt, speed) {
    const range = distance(plane, target);
    plane.angle = Math.atan2(target.y - plane.y, target.x - plane.x);
    if (range <= .01) return true;
    const ratio = Math.min(1, speed * dt / range);
    plane.x += (target.x - plane.x) * ratio; plane.y += (target.y - plane.y) * ratio;
    return ratio >= 1;
  }
  function observe(plane) {
    const observations = [];
    for (const sector of battlefield.sectors || []) {
      const center = getFrontGeometry(sector).center;
      if (distance(plane, center) <= SERVER_AIR_LIMITS.reconSight) observations.push({ kind: 'front', sectorId: sector.strategicSectorId || sector.strategicId, x: center.x, y: center.y, status: sector.status, enemyStrength: Math.round(sector[plane.team === 'ally' ? 'enemyStrength' : 'allyStrength'] || 0) });
      for (const item of [...(sector.assets || []), ...(sector.war?.vehicles || []), ...(sector.war?.mortars || [])]) {
        if (item.alive === false || item.team !== other(plane.team) || distance(plane, item) > SERVER_AIR_LIMITS.reconSight) continue;
        observations.push({ kind: item.type, targetId: item.id, x: item.x, y: item.y });
      }
    }
    if (observations.length) report('recon-contact', plane.team, plane, { sourceId: plane.id, observations: observations.slice(0, 12) });
  }
  function step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return [];
    const elapsed = Math.min(dt, .25), reportsBefore = air.serial;
    air.clock += elapsed;
    air.effects = air.effects.filter(item => (item.life -= elapsed) > 0);
    air.reports = air.reports.filter(item => item.expires > air.clock).slice(-SERVER_AIR_LIMITS.reports);
    // The core schedules bomber runs. Accepting a sortie reserves actual fuel
    // and bombs exactly once; an unfunded aircraft never gets to drop ordnance.
    for (const bomber of bombers()) {
      if (bomber.airWarFunded) continue;
      const source = sourceFor(bomber.team, bomber.target || bomber, 'bomber');
      if (!source || !pay(source.endpoint, costs.bomber)) { bomber.life = 0; bomber.alive = false; continue; }
      bomber.airWarFunded = true; bomber.originId = source.point.id; bomber.hp ??= 90;
      report('bomber-inbound', bomber.team, bomber, { aircraftId: bomber.id, aircraftType: 'bomber', sectorId: bomber.sector });
    }
    if (air.clock >= air.nextDefenseAt) { ensureDefenses(); air.nextDefenseAt = air.clock + 10; }
    if (air.clock >= air.nextSortieAt) { launch(); air.nextSortieAt = air.clock + 16; }
    for (const battery of batteries()) {
      if (!battery.alive) continue;
      battery.cooldown = Math.max(0, (battery.cooldown || 0) - elapsed);
      battery.flash = Math.max(0, (battery.flash || 0) - elapsed);
      if (battery.cooldown > 0 || battery.ammo <= 0) continue;
      const target = aircraft().filter(plane => plane.team !== battery.team && distance(battery, plane) < SERVER_AIR_LIMITS.aaRange).sort((a, b) => distance(battery, a) - distance(battery, b))[0];
      if (!target) continue;
      battery.ammo--; battery.cooldown = 1.8; battery.flash = .25;
      effect('flak', battery, target, battery.team); damage(target, 24, battery);
      if ((battery.reportAt || 0) <= air.clock) { report('aa-engagement', battery.team, target, { sourceId: battery.id, aircraftId: target.id }); battery.reportAt = air.clock + 8; }
    }
    for (const plane of air.aircraft) {
      if (!active(plane)) continue;
      plane.age += elapsed; plane.life -= elapsed; plane.cooldown = Math.max(0, plane.cooldown - elapsed);
      let destination = plane.target;
      if (plane.phase === 'outbound' && distance(plane, plane.target) < 350) plane.phase = 'patrol';
      if (plane.phase === 'patrol') {
        plane.patrolFor -= elapsed;
        destination = { x: plane.target.x + Math.cos(plane.age * .13) * 1600, y: plane.target.y + Math.sin(plane.age * .13) * 1600 };
        if (plane.patrolFor <= 0 || plane.life < distance(plane, plane.origin) / 460 + 3) plane.phase = 'return';
      }
      if (plane.phase === 'return') destination = plane.origin;
      if (plane.type === 'fighter' && plane.phase !== 'return') {
        const target = aircraft().filter(item => item.team !== plane.team && distance(item, plane) < SERVER_AIR_LIMITS.sight).sort((a, b) => distance(a, plane) - distance(b, plane))[0];
        if (target && plane.ammo > 0) {
          destination = target;
          if (distance(plane, target) < 900 && plane.cooldown <= 0) {
            plane.ammo--; plane.cooldown = 1.2;
            effect('air-tracer', plane, target, plane.team); damage(target, 18, plane);
            if ((plane.reportAt || 0) <= air.clock) { report('dogfight', plane.team, plane, { aircraftId: plane.id, targetId: target.id }); plane.reportAt = air.clock + 8; }
          }
        }
      }
      const arrived = move(plane, destination, elapsed, plane.type === 'fighter' ? 460 : 340);
      if (plane.phase === 'return' && arrived) { plane.life = 0; report('aircraft-returned', plane.team, plane, { aircraftId: plane.id }); }
      if (plane.type === 'recon' && plane.reconAt <= air.clock) { observe(plane); plane.reconAt = air.clock + 8; }
    }
    air.aircraft = air.aircraft.filter(active).slice(-SERVER_AIR_LIMITS.aircraft);
    if (battlefield.warSimulation?.support) battlefield.warSimulation.support = battlefield.warSimulation.support.filter(item => item.type !== 'bomber' || active(item));
    return air.reports.filter(entry => Number(entry.id.split('-').at(-1)) > reportsBefore);
  }
  function snapshot({ team, position } = {}) {
    if (!faction(team)) return { aircraft: [], batteries: [], effects: [], reports: [] };
    const friendly = aircraft().filter(plane => plane.team === team);
    const visible = point => (position && distance(position, point) < SERVER_AIR_LIMITS.sight) || friendly.some(plane => distance(plane, point) < SERVER_AIR_LIMITS.sight);
    return structuredClone({
      aircraft: aircraft().filter(plane => plane.team === team || visible(plane)),
      batteries: batteries().filter(battery => battery.team === team || visible(battery)),
      effects: air.effects.filter(visible),
      reports: air.reports.filter(entry => entry.team === team && entry.expires > air.clock),
    });
  }
  return { step, snapshot };
}
