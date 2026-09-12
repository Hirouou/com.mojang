/** Persistent fronts, with tactical soldiers instantiated only where detail is needed. */
export const WAR_LIMITS = Object.freeze({ detailRadius: 2400, maxDetailedFronts: 3, soldiersPerFront: 17, maxTracers: 180, strategicStep: 1 });
export const phaseLabels = Object.freeze({ regroup: 'reagrupando', hold: 'na trincheira', suppress: 'fogo de supressão', wait_support: 'aguardando apoio', assault: 'avanço coberto', retreat: 'recuando', consolidate: 'consolidando' });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const noise = n => { const value = Math.sin(n * 91.217 + 17.71) * 43758.5453; return value - Math.floor(value); };
const teamSign = team => team === 'ally' ? 1 : -1;
const teamSize = team => team === 'ally' ? 8 : 9;
const strengthKey = team => team === 'ally' ? 'allyStrength' : 'enemyStrength';
const representativeCount = (sec, team) => Math.ceil(clamp(sec[strengthKey(team)], 0, 100) / 100 * teamSize(team));
const teams = ['ally', 'enemy'];
const phaseDuration = { regroup: 12, hold: 14, suppress: 12, wait_support: 10, assault: 12, retreat: 9, consolidate: 14 };
const phaseFire = { regroup: .16, hold: .55, suppress: 1, wait_support: .32, assault: .65, retreat: .12, consolidate: .48 };
const phaseExposure = { regroup: .27, hold: .3, suppress: .55, wait_support: .3, assault: 1.6, retreat: .9, consolidate: .48 };

/** Shared with the existing zigzag trench renderer; positions are in metres. */
export function trenchPath(cx, cy, team) {
  const side = team === 'ally' ? -1 : 1;
  return [
    { x: cx + side * 60, y: cy - 250 }, { x: cx - side * 20, y: cy - 175 },
    { x: cx + side * 50, y: cy - 95 }, { x: cx - side * 15, y: cy - 20 },
    { x: cx + side * 45, y: cy + 65 }, { x: cx - side * 25, y: cy + 145 },
    { x: cx + side * 55, y: cy + 235 }
  ];
}

export function trenchSlot(sec, team, slot) {
  const path = trenchPath(sec.x - teamSign(team) * 320, sec.y, team);
  const lengths = path.slice(1).map((p, i) => dist(path[i], p));
  let remaining = lengths.reduce((a, b) => a + b, 0) * (.06 + .88 * slot / (teamSize(team) - 1));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const t = clamp(remaining / lengths[i], 0, 1);
      return { x: path[i].x + (path[i + 1].x - path[i].x) * t, y: path[i].y + (path[i + 1].y - path[i].y) * t };
    }
    remaining -= lengths[i];
  }
  return path[0];
}

export function initializeSector(sec, index = 0) {
  if (sec.war) return sec;
  sec.assets ||= [];
  sec.allyStrength = clamp(sec.allyStrength ?? 65, 0, 100);
  sec.enemyStrength = clamp(sec.enemyStrength ?? 72, 0, 100);
  sec.progress ||= 0;
  sec.status ||= 'stalemate';
  sec.units = [];
  const force = (team, phaseTime) => {
    const activeSlots = representativeCount(sec, team);
    return {
      phase: 'hold', phaseTime, morale: team === 'ally' ? .72 : .75,
      ammo: .8, fortification: .78, suppression: .08, pressure: 0,
      support: .5, advance: 0, reinforcementsIn: 34 + (index * 7 + (team === 'enemy' ? 11 : 0)) % 25,
      casualties: 0, reinforcements: 0, cycles: 0, fire: 0,
      activeSlots, downSlots: Array.from({ length: teamSize(team) }, (_, slot) => slot).filter(slot => slot >= activeSlots)
    };
  };
  sec.war = { index, detailed: false, ticks: 0, ally: force('ally', 7 + index % 5), enemy: force('enemy', 11 + index % 4) };
  return sec;
}

function synchronizeSlots(sec, team, reinforcement = false, impactPoint = null) {
  const force = sec.war[team], total = teamSize(team), survivors = representativeCount(sec, team);
  force.activeSlots = reinforcement ? survivors : Math.min(force.activeSlots ?? survivors, survivors);
  const wantedDown = total - force.activeSlots;
  const down = new Set(Array.isArray(force.downSlots) ? force.downSlots : []);
  for (const slot of down) if (slot < 0 || slot >= total) down.delete(slot);
  if (down.size > wantedDown) {
    // Replacements arrive in a free trench slot. Preserve impact casualties
    // first and restore the highest-index slot when the aggregate recovers.
    for (const slot of [...down].sort((a, b) => b - a)) {
      if (down.size <= wantedDown) break;
      down.delete(slot);
    }
  } else if (down.size < wantedDown) {
    const candidates = Array.from({ length: total }, (_, slot) => slot).filter(slot => !down.has(slot));
    candidates.sort((a, b) => {
      if (impactPoint) {
        const homeA = trenchSlot(sec, team, a), homeB = trenchSlot(sec, team, b);
        homeA.x += teamSign(team) * force.advance; homeB.x += teamSign(team) * force.advance;
        return dist(homeA, impactPoint) - dist(homeB, impactPoint);
      }
      return b - a;
    });
    for (const slot of candidates) {
      if (down.size >= wantedDown) break;
      down.add(slot);
    }
  }
  force.downSlots = [...down].sort((a, b) => a - b);
  for (const unit of sec.units) {
    if (unit.team !== team) continue;
    const wasInactive = unit.inactive;
    unit.inactive = down.has(unit.slot);
    unit.downed = unit.inactive;
    if (unit.inactive) { unit.pop = 0; unit.duck = 1; unit.action = 'downed'; }
    else if (wasInactive) {
      // Replacements arrive at their trench, rather than getting up from a corpse.
      const home = trenchSlot(sec, team, unit.slot);
      unit.x = home.x; unit.y = home.y; unit.cool = 1; unit.duck = .85;
    }
  }
}

function simulation(state) {
  state.warSimulation ||= { clock: 0, accumulator: 0, impacts: [], strategicTicks: 0, detailedFronts: 0 };
  state.smokes ||= [];
  state.tracers ||= [];
  return state.warSimulation;
}

/** Smoke occludes the complete segment, not just soldiers standing in its centre. */
export function smokeBlocksLine(smokes, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  return smokes.some(smoke => {
    if (smoke.life <= 0) return false;
    const t = length2 ? clamp(((smoke.x - a.x) * dx + (smoke.y - a.y) * dy) / length2, 0, 1) : 0;
    return Math.hypot(a.x + dx * t - smoke.x, a.y + dy * t - smoke.y) < smoke.r;
  });
}

function assetSupport(sec, team) {
  const assets = sec.assets.filter(asset => asset.alive && (asset.team || 'enemy') === team);
  const guns = assets.filter(asset => ['HMG', 'MORTEIRO', 'BATERIA'].includes(asset.type)).length;
  const depot = assets.some(asset => asset.type === 'DEPÓSITO');
  // Allied battalion support exists outside these four enemy objective assets.
  return { fire: team === 'ally' ? .54 + guns * .09 : .2 + guns * .17, supply: team === 'ally' ? .7 : depot ? 1 : .28 };
}

function selectPhase(sec, team, force, foe) {
  const strength = sec[strengthKey(team)], enemyStrength = sec[strengthKey(team === 'ally' ? 'enemy' : 'ally')];
  if (strength < 23 || force.morale < .23 || force.suppression > .87) return force.phase === 'retreat' ? 'regroup' : 'retreat';
  if (force.phase === 'retreat' || force.ammo < .2) return 'regroup';
  if (force.phase === 'assault') return strength * force.morale > enemyStrength * foe.morale * .8 ? 'consolidate' : 'retreat';
  if (force.suppression > .65) return 'hold';
  if (force.phase === 'consolidate' || force.phase === 'regroup') return 'hold';
  if (force.phase === 'hold') return 'suppress';
  if (force.phase === 'suppress') {
    const covered = force.support > .38 && foe.suppression > .16 && force.ammo > .32;
    return covered && strength * force.morale > enemyStrength * foe.morale * .8 ? 'assault' : 'wait_support';
  }
  return force.support > .38 ? 'suppress' : 'hold';
}

function strategicStep(state) {
  for (const sec of state.sectors) {
    const war = sec.war;
    war.ticks++;
    const positions = {
      ally: { x: sec.x - 320 + war.ally.advance, y: sec.y },
      enemy: { x: sec.x + 320 - war.enemy.advance, y: sec.y }
    };
    const obscured = smokeBlocksLine(state.smokes, positions.ally, positions.enemy);
    // Supply pressure travels between aggregate fronts, without spawning convoys/NPCs.
    const neighbours = state.sectors.filter(other => other !== sec && dist(sec, other) < 28000);
    const pressure = neighbours.length ? neighbours.reduce((sum, other) => sum + other.progress, 0) / neighbours.length / 100 : 0;
    for (const team of teams) {
      const force = war[team], support = assetSupport(sec, team);
      force.support = clamp(support.fire * (obscured ? .18 : 1) + teamSign(team) * pressure * .1, .03, 1);
      force.fire = sec[strengthKey(team)] / 100 * phaseFire[force.phase] * force.support * (1 - force.suppression * .7) * (force.ammo > .05 ? 1 : .12) * (obscured ? .08 : 1);
    }
    // Compute both sides' fire before applying losses, so neither gets update-order advantage.
    for (const team of teams) {
      const force = war[team], foe = war[team === 'ally' ? 'enemy' : 'ally'], support = assetSupport(sec, team);
      const key = strengthKey(team);
      const loss = foe.fire * .12 * phaseExposure[force.phase] * (1 - force.fortification * .45);
      sec[key] = clamp(sec[key] - loss, 0, 100);
      force.casualties += loss;
      const rest = ['regroup', 'retreat', 'wait_support', 'hold'].includes(force.phase);
      const disengaging = force.phase === 'regroup' || force.phase === 'retreat';
      force.suppression = clamp(force.suppression + foe.fire * .12 * (disengaging ? .25 : 1) - (disengaging ? .05 : rest ? .021 : .009), 0, 1);
      force.pressure = clamp(foe.fire * 1.8 + force.suppression * .55 - force.support * .12, 0, 1);
      force.ammo = clamp(force.ammo - force.fire * .009 + support.supply * (rest ? .0028 : .0008), 0, 1);
      force.morale = clamp(force.morale + (rest ? .0025 : .0005) - loss * .018 - force.suppression * .0015, .05, 1);
      force.fortification = clamp(force.fortification + (force.phase === 'consolidate' ? .008 : rest ? .0015 : -.001), .1, 1);
      force.reinforcementsIn--;
      let reinforced = false;
      if (force.reinforcementsIn <= 0) {
        const amount = Math.min(100 - sec[key], 3 + support.supply * 4);
        sec[key] += amount;
        force.reinforcements += amount;
        force.ammo = clamp(force.ammo + .1 * support.supply, 0, 1);
        force.morale = clamp(force.morale + .035 * support.supply, 0, 1);
        force.reinforcementsIn = 40 + (war.index * 7 + force.cycles * 3) % 21;
        reinforced = amount > 0;
      }
      synchronizeSlots(sec, team, reinforced);
      force.phaseTime--;
      if (force.phaseTime <= 0) {
        force.phase = selectPhase(sec, team, force, foe);
        force.phaseTime = phaseDuration[force.phase] + war.index % 4;
        force.cycles++;
      }
      // Assaults are short covered bounds, never an endless charge across the theatre.
      const desiredAdvance = force.phase === 'assault' ? 155 : force.phase === 'consolidate' ? 110 : force.phase === 'retreat' ? -90 : 0;
      force.advance += clamp(desiredAdvance - force.advance, -18, 14);
    }
    const balance = (sec.allyStrength * war.ally.morale - sec.enemyStrength * war.enemy.morale) * .004;
    const push = (war.ally.phase === 'assault' ? .12 : 0) - (war.enemy.phase === 'assault' ? .12 : 0);
    sec.progress = clamp(sec.progress + balance + push, -100, 100);
    sec.status = Math.abs(sec.progress) < 15 ? 'stalemate' : sec.progress > 0 ? 'allied_push' : 'enemy_push';
  }
}

function materialize(sec) {
  if (sec.war.detailed) return;
  sec.war.detailed = true;
  sec.units = teams.flatMap(team => Array.from({ length: teamSize(team) }, (_, slot) => {
    const home = trenchSlot(sec, team, slot);
    const down = sec.war[team].downSlots?.includes(slot) ?? slot >= sec.war[team].activeSlots;
    return {
      team, role: slot === (team === 'ally' ? 2 : 3) ? 'mg' : slot === 0 ? 'scout' : 'rifle', slot,
      x: home.x + teamSign(team) * sec.war[team].advance, y: home.y,
      cool: .2 + noise(sec.war.index * 23 + slot + (team === 'enemy' ? 11 : 0)) * 2,
      duck: .7, pop: 0, supp: sec.war[team].suppression, action: sec.war[team].phase,
      inactive: down, downed: down
    };
  }));
}

function updateDetailSelection(state) {
  const sim = state.warSimulation;
  sim.impacts = sim.impacts.filter(point => point.until > sim.clock);
  const focus = [];
  if (state.cam) focus.push({ point: state.cam, priority: 0 });
  if (state.robot) focus.push({ point: state.robot, priority: 200 });
  if (state.intel?.sourcePos) focus.push({ point: state.intel.sourcePos, priority: 400 });
  if (state.intel?.target) focus.push({ point: state.intel.target, priority: 500 });
  if (state.shell) focus.push({ point: state.shell, priority: 600 });
  focus.push(...sim.impacts.map(point => ({ point, priority: 700 })));
  const selected = state.sectors.map(sec => ({ sec, score: Math.min(...focus.map(({ point, priority }) => {
    const distance = dist(sec, point);
    return distance < WAR_LIMITS.detailRadius ? distance + priority : Infinity;
  })) })).filter(item => Number.isFinite(item.score)).sort((a, b) => a.score - b.score).slice(0, WAR_LIMITS.maxDetailedFronts).map(item => item.sec);
  for (const sec of state.sectors) {
    if (selected.includes(sec)) materialize(sec);
    else if (sec.war.detailed) { sec.units = []; sec.war.detailed = false; }
  }
  sim.detailedFronts = selected.length;
}

function updateTactical(state, sec, dt) {
  for (const team of teams) synchronizeSlots(sec, team);
  for (const unit of sec.units) {
    if (unit.inactive) continue;
    const force = sec.war[unit.team], home = trenchSlot(sec, unit.team, unit.slot);
    unit.cool -= dt;
    unit.pop = Math.max(0, unit.pop - dt);
    unit.supp = Math.max(force.suppression, unit.supp - dt * .12);
    unit.action = unit.supp > .65 ? 'suppressed' : force.phase;
    const underFire = unit.supp > .65;
    const targetX = home.x + teamSign(unit.team) * (underFire ? Math.min(0, force.advance) : force.advance);
    unit.x += clamp(targetX - unit.x, -22 * dt, 22 * dt);
    unit.y += clamp(home.y - unit.y, -16 * dt, 16 * dt);
    const moving = Math.abs(targetX - unit.x) > 8;
    const rest = ['regroup', 'retreat'].includes(force.phase);
    const rhythm = Math.sin(state.warSimulation.clock * 1.3 + unit.slot * 1.91 + (unit.team === 'enemy' ? .85 : 0));
    unit.duck = underFire ? .97 : moving ? .45 : rhythm > (force.phase === 'suppress' ? -.15 : .45) && !rest ? .12 : .82;
    if (unit.cool > 0 || unit.duck > .4 || force.ammo < .05 || moving) continue;
    const opponents = sec.units.filter(foe => foe.team !== unit.team && !foe.inactive);
    if (!opponents.length) { unit.cool = .5; continue; }
    const foe = opponents[(unit.slot * 3 + Math.floor(state.warSimulation.clock / 4)) % opponents.length];
    if (!foe || smokeBlocksLine(state.smokes, unit, foe)) { unit.cool = .45; continue; }
    unit.pop = .25;
    unit.cool = (unit.role === 'mg' ? .75 : 1.65) + noise(unit.slot + state.warSimulation.clock) * .8;
    foe.supp = clamp(foe.supp + (unit.role === 'mg' ? .2 : .07), 0, 1);
    const bursts = unit.role === 'mg' ? 3 : 1;
    for (let shot = 0; shot < bursts && state.tracers.length < WAR_LIMITS.maxTracers; shot++) {
      const jitter = (noise(unit.slot * 7 + shot + state.warSimulation.clock) - .5) * 24;
      state.tracers.push({ x: unit.x, y: unit.y, x2: foe.x + jitter, y2: foe.y - jitter, life: .16 + shot * .025, max: .25, team: unit.team });
    }
  }
}

/** Caller advances state.time and smoke/effect lifetimes. This function owns tracer lifetimes. */
export function updateWar(state, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || state.paused) return;
  const sim = simulation(state);
  state.sectors.forEach((sec, index) => initializeSector(sec, index));
  sim.clock += dt;
  sim.accumulator += dt;
  while (sim.accumulator + 1e-9 >= WAR_LIMITS.strategicStep) {
    strategicStep(state);
    sim.accumulator = Math.max(0, sim.accumulator - WAR_LIMITS.strategicStep);
    sim.strategicTicks++;
  }
  for (const tracer of state.tracers) tracer.life -= dt;
  state.tracers = state.tracers.filter(tracer => tracer.life > 0).slice(-WAR_LIMITS.maxTracers);
  updateDetailSelection(state);
  for (const sec of state.sectors) if (sec.war.detailed) updateTactical(state, sec, Math.min(dt, .1));
}

export function applyWarImpact(state, x, y, type) {
  const sim = simulation(state);
  const point = { x, y };
  const result = { destroyed: [], friendlyHits: 0, friendlyCasualties: 0, enemyCasualties: 0, affected: [], robotDamage: 0 };
  if (![x, y].every(Number.isFinite)) return result;
  sim.impacts.push({ x, y, until: sim.clock + 4 });
  sim.impacts = sim.impacts.slice(-4);
  if (type === 'SMOKE') {
    result.smoke = { x, y, r: 270, life: 42 };
    state.smokes.push(result.smoke);
    return result;
  }
  const frag = type === 'FRAG';
  const structureRadius = frag ? 145 : 170, infantryRadius = frag ? 330 : 175;
  for (let index = 0; index < state.sectors.length; index++) {
    const sec = initializeSector(state.sectors[index], index);
    for (const asset of sec.assets) {
      if (!asset.alive) continue;
      const distance = dist(asset, point);
      if (distance >= structureRadius) continue;
      const damage = (1 - distance / structureRadius) * (frag ? 55 : 350);
      asset.hp = Math.max(0, asset.hp - damage);
      if (asset.team === 'ally') result.friendlyHits++;
      if (asset.hp === 0) { asset.alive = false; result.destroyed.push({ asset, sector: sec }); }
    }
    for (const team of teams) {
      const force = sec.war[team];
      // The same virtual trench geometry is used whether tactical units exist or not.
      // Creating detail never applies another casualty calculation.
      const exposure = Array.from({ length: teamSize(team) }, (_, slot) => {
        const home = trenchSlot(sec, team, slot);
        home.x += teamSign(team) * force.advance;
        return Math.max(0, 1 - dist(home, point) / infantryRadius);
      }).reduce((a, b) => a + b, 0) / teamSize(team);
      if (exposure <= 0) continue;
      const key = strengthKey(team);
      const loss = Math.min(sec[key], exposure * (frag ? 72 : 42) * (1 - force.fortification * (frag ? .48 : .25)));
      sec[key] -= loss;
      const downBefore = force.downSlots?.length ?? Math.max(0, teamSize(team) - (force.activeSlots ?? representativeCount(sec, team)));
      // Pick the nearest trench slots for this particular blast. Aggregate
      // strength still drives the strategic layer, while the local casualties
      // now match what the operator sees around the impact point.
      synchronizeSlots(sec, team, false, point);
      const newCasualties = Math.max(0, (force.downSlots?.length ?? 0) - downBefore);
      force.casualties += loss;
      const suppression = Math.min(1 - force.suppression, exposure * (frag ? 2.1 : 1.6));
      force.suppression += suppression;
      force.morale = clamp(force.morale - loss * .008, .05, 1);
      force.fortification = clamp(force.fortification - exposure * (frag ? .04 : .24), .1, 1);
      force.phaseTime = Math.min(force.phaseTime, 2);
      if (team === 'ally') result.friendlyHits++;
      if (team === 'ally') result.friendlyCasualties += newCasualties;
      else result.enemyCasualties += newCasualties;
      result.affected.push({ sector: sec, team, loss, suppression });
      for (const unit of sec.units.filter(unit => unit.team === team)) unit.supp = Math.max(unit.supp, force.suppression);
    }
  }
  if (state.robot) {
    const radius = frag ? 210 : 175;
    result.robotDamage = Math.max(0, 1 - dist(state.robot, point) / radius) * (frag ? 9 : 42);
    if (result.robotDamage > 0) {
      state.robot.armor = clamp((state.robot.armor ?? 100) - result.robotDamage, 0, 100);
      result.friendlyHits++;
    }
  }
  return result;
}
