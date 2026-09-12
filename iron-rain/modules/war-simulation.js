import { combatRecoveryPhase } from './combat-recovery.js';

/** Persistent fronts, with tactical soldiers instantiated only where detail is needed. */
export const WAR_LIMITS = Object.freeze({ detailRadius: 2400, maxDetailedFronts: 3, soldiersPerFront: 17, maxTracers: 180, strategicStep: 1, captureBound: 640, maxBasesPerFront: 6, maxSupport: 96, maxEvents: 40, enemyIntelLifetime: 12 });
/**
 * Direct fire is only materialised around the operator.  The strategic layer
 * still handles the rest of the theatre, while a Mamute that leaves cover in
 * march mode becomes a real, attractive target for nearby enemy weapons.
 */
export const PLAYER_THREAT_LIMITS = Object.freeze({
  hmg: { range: 2_100, cadence: 2.6, damage: [3, 7], priority: 1.3 },
  rifle: { range: 1_250, cadence: 2.9, damage: [1.5, 4], priority: .6 },
  tank: { range: 6_500, cadence: 4.8, damage: [7, 13], priority: 1.8 },
  mortar: { range: 9_000, cadence: 6.4, damage: [8, 16], priority: 1.5 },
  battery: { range: 12_000, cadence: 8.2, damage: [10, 19], priority: 1.1 },
  bomber: { range: 7_500, cadence: 11.5, damage: [12, 24], priority: 1.4 }
});
export const phaseLabels = Object.freeze({ regroup: 'reagrupando', hold: 'na trincheira', suppress: 'fogo de supressão', wait_support: 'aguardando apoio', assault: 'avanço coberto', retreat: 'recuando', consolidate: 'consolidando' });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const noise = n => { const value = Math.sin(n * 91.217 + 17.71) * 43758.5453; return value - Math.floor(value); };
const teamSign = team => team === 'ally' ? 1 : -1;
const teamSize = team => team === 'ally' ? 8 : 9;
const strengthKey = team => team === 'ally' ? 'allyStrength' : 'enemyStrength';
const representativeCount = (sec, team) => Math.ceil(clamp(sec[strengthKey(team)], 0, 100) / 100 * teamSize(team));
const teams = ['ally', 'enemy'];
const otherTeam = team => team === 'ally' ? 'enemy' : 'ally';
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

/** Sector identity/objectives stay fixed; only the occupied line moves. */
export function getFrontGeometry(sec) {
  const x = sec.x + (sec.war?.positionOffset || 0), y = sec.y;
  return {
    center: { x, y },
    allyTrench: { x: x - 320, y }, enemyTrench: { x: x + 320, y },
    allyLine: { x: x - 320 + (sec.war?.ally.advance || 0), y },
    enemyLine: { x: x + 320 - (sec.war?.enemy.advance || 0), y }
  };
}

export function trenchSlot(sec, team, slot) {
  const anchor = getFrontGeometry(sec)[`${team}Trench`];
  const path = trenchPath(anchor.x, anchor.y, team);
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
      casualties: 0, reinforcements: 0, cycles: 0, fire: 0, lowMorale: false, lowMoraleEntered: false,
      activeSlots, downSlots: Array.from({ length: teamSize(team) }, (_, slot) => slot).filter(slot => slot >= activeSlots),
      defeated: false, fallbackUntil: 0, securedBounds: 0
    };
  };
  sec.war = { index, detailed: false, ticks: 0, positionOffset: 0, captures: 0, oldTrenches: [], ally: force('ally', 7 + index % 5), enemy: force('enemy', 11 + index % 4) };
  sec.war.bases = teams.map(team => makeBase(sec, team, 0, 1));
  sec.war.vehicles = teams.map(team => ({
    id: `${sec.id}-${team}-tank`, sector: sec.id, team, type: 'tank',
    x: sec.x - teamSign(team) * 620, y: sec.y + 150,
    angle: team === 'ally' ? 0 : Math.PI, hp: 180, maxHp: 180, alive: true, known: team === 'ally', fireCooldown: 12 + index * 2,
    replacementIn: 0, flash: 0
  }));
  sec.war.mortars = teams.map(team => ({
    id: `${sec.id}-${team}-mortar`, sector: sec.id, team,
    x: sec.x - teamSign(team) * 790, y: sec.y - 140,
    type: 'MORTEIRO', hp: 90, maxHp: 90, alive: true, known: team === 'ally', cooldown: 15 + index * 2 + (team === 'enemy' ? 5 : 0), flash: 0
  }));
  return sec;
}

function makeBase(sec, team, serial, level = 0) {
  const center = getFrontGeometry(sec).center;
  return { id: `${sec.id}-${team}-base-${serial}`, sector: sec.id, team, x: center.x - teamSign(team) * 950, y: center.y + (team === 'ally' ? -240 : 240),
    level, buildProgress: 0, supply: level ? .78 : .35, hp: level ? 360 : 150, maxHp: level ? 360 : 150,
    alive: true, known: team === 'ally', type: 'BASE', capturesAtBuild: sec.war?.captures || 0 };
}

function slotPosition(sec, team, slot) {
  const unit = sec.units.find(candidate => candidate.team === team && candidate.slot === slot);
  if (unit && !unit.inactive) return { x: unit.x, y: unit.y };
  const home = trenchSlot(sec, team, slot);
  home.x += teamSign(team) * sec.war[team].advance;
  return home;
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
        const homeA = slotPosition(sec, team, a), homeB = slotPosition(sec, team, b);
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
      unit.x = home.x + teamSign(team) * force.advance; unit.y = home.y; unit.cool = 1; unit.duck = .85;
    }
  }
}

function simulation(state) {
  state.warSimulation ||= { clock: 0, accumulator: 0, impacts: [], strategicTicks: 0, detailedFronts: 0 };
  state.warSimulation.events ||= [];
  state.warSimulation.support ||= [];
  state.warSimulation.playerHits ||= [];
  state.warSimulation.serial ||= 0;
  state.warSimulation.nextBomberAt ??= 28;
  state.warSimulation.nextBomberTeam ||= 'ally';
  state.warSimulation.playerThreatCooldown ??= 2.4;
  const intelCutoff = state.warSimulation.clock - WAR_LIMITS.enemyIntelLifetime;
  // Enemy activity is useful only while it could still be witnessed. Keeping
  // unseen hostile events forever would reveal old actions as fresh intel when
  // the Mamute enters that sector much later; allied reports remain persistent.
  state.warSimulation.events = state.warSimulation.events.filter(event => event.team === 'ally' || !Number.isFinite(event.time) || event.time >= intelCutoff);
  state.smokes ||= [];
  state.tracers ||= [];
  return state.warSimulation;
}

function recordEvent(state, sec, team, type, text) {
  const sim = simulation(state);
  sim.events.push({ id: `war-${++sim.serial}`, time: sim.clock, sector: sec.id, team, type, text });
  sim.events = sim.events.slice(-WAR_LIMITS.maxEvents);
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
  const bases = sec.war.bases.filter(base => base.alive && base.team === team);
  const level = Math.max(0, ...bases.map(base => base.level));
  const supply = bases.length ? Math.max(...bases.map(base => base.supply)) : .12;
  const armor = sec.war.vehicles.some(vehicle => vehicle.alive && vehicle.team === team) ? .1 : 0;
  return { fire: .38 + guns * .075 + level * .035 + armor, supply: clamp(supply + (depot ? .12 : 0), .08, 1) };
}

function selectPhase(sec, team, force, foe, supply) {
  const strength = sec[strengthKey(team)], enemyStrength = sec[strengthKey(team === 'ally' ? 'enemy' : 'ally')];
  const recoveryPhase = combatRecoveryPhase({
    phase: force.phase,
    strength,
    morale: force.morale,
    suppression: force.suppression,
    ammo: force.ammo,
    supply
  });
  if (recoveryPhase) return recoveryPhase;
  if (force.ammo < .2) return 'regroup';
  if (enemyStrength < 12 && force.suppression < .65 && force.phase !== 'consolidate') return 'assault';
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
    const geometry = getFrontGeometry(sec);
    const positions = {
      ally: geometry.allyLine,
      enemy: geometry.enemyLine
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
      force.lowMoraleEntered = force.morale < .23 && !force.lowMorale;
      force.lowMorale = force.morale < .23;
      const broken = sec[key] < 23 || force.morale < .23 || force.suppression > .87;
      // A formation that breaks during a fighting phase must stop pushing now,
      // but an established retreat/regroup cycle gets time to recover instead
      // of snapping from regroup straight back to retreat on the next tick.
      if (broken && !['retreat', 'regroup'].includes(force.phase)) {
        force.phase = 'retreat';
        force.phaseTime = phaseDuration.retreat + war.index % 4;
        force.cycles++;
      }
      // A wiped platoon must reorganize behind the new line. It cannot pop
      // straight back into the trench just cleared by the operator.
      if (sec[key] <= .05 && !force.defeated) {
        sec[key] = 0;
        force.defeated = true;
        force.fallbackUntil = war.ticks + 48;
        force.reinforcementsIn = Math.max(48, force.reinforcementsIn);
        force.phaseTime = 0;
        recordEvent(state, sec, team, 'withdrawal', `${team === 'ally' ? 'Nossa linha' : 'Defesa inimiga'} de ${sec.name} desfeita. Reservas recuam e reorganizam.`);
      }
      force.reinforcementsIn--;
      let reinforced = false;
      if (force.reinforcementsIn <= 0 && war.ticks >= force.fallbackUntil) {
        const amount = Math.min(100 - sec[key], 3 + support.supply * 4);
        sec[key] += amount;
        force.reinforcements += amount;
        force.ammo = clamp(force.ammo + .1 * support.supply, 0, 1);
        force.morale = clamp(force.morale + .035 * support.supply, 0, 1);
        force.reinforcementsIn = 40 + (war.index * 7 + force.cycles * 3) % 21;
        reinforced = amount > 0;
        if (reinforced) force.defeated = false;
      }
      synchronizeSlots(sec, team, reinforced);
      force.phaseTime--;
      if (force.phaseTime <= 0) {
        force.phase = selectPhase(sec, team, force, foe, support.supply);
        force.phaseTime = phaseDuration[force.phase] + war.index % 4;
        force.cycles++;
      }
      const enemyStrength = sec[strengthKey(otherTeam(team))];
      const ownPower = sec[key] * force.morale;
      const enemyPower = enemyStrength * foe.morale;
      const canOccupy = sec[key] >= 23 && force.morale >= .23 && force.suppression < .68 && force.ammo > .18 &&
        (enemyStrength < 12 || ownPower > enemyPower * 1.3);
      // A cleared line is exploited immediately, independent of the old
      // suppress/wait loop. The next 640 m becomes persistent territory, but
      // a withdrawing/reorganizing formation cannot bypass its recovery gate.
      if (enemyStrength < 12 && canOccupy && !['regroup', 'retreat', 'consolidate'].includes(force.phase)) {
        force.phase = 'assault';
        force.phaseTime = Math.max(force.phaseTime, 4);
      }
      const advancing = force.phase === 'assault' && canOccupy;
      const desiredAdvance = advancing ? WAR_LIMITS.captureBound : force.phase === 'assault' ? 155 : force.phase === 'consolidate' ? Math.min(force.advance, 110) : force.phase === 'retreat' ? -90 : 0;
      // Infantries cross in covered bounds. Weak units never advance because
      // their opponent happened to be wounded too.
      force.advance += clamp(desiredAdvance - force.advance, -18, enemyStrength < 12 ? 20 : 16);
      if (advancing) force.phaseTime = Math.max(force.phaseTime, 3);
    }
    for (const team of teams) {
      if (war[team].advance >= WAR_LIMITS.captureBound - .01) { captureBound(state, sec, team); break; }
    }
    updateInfrastructure(state, sec);
    const balance = (sec.allyStrength * war.ally.morale - sec.enemyStrength * war.enemy.morale) * .004;
    const push = (war.ally.phase === 'assault' ? .12 : 0) - (war.enemy.phase === 'assault' ? .12 : 0);
    sec.progress = clamp(sec.progress + balance + push, -100, 100);
    sec.status = Math.abs(sec.progress) < 15 ? 'stalemate' : sec.progress > 0 ? 'allied_push' : 'enemy_push';
  }
}

function captureBound(state, sec, team) {
  const war = sec.war, sign = teamSign(team), force = war[team], foe = war[otherTeam(team)];
  const previous = getFrontGeometry(sec);
  const desired = war.positionOffset + sign * WAR_LIMITS.captureBound;
  const worldWidth = state.world?.w || state.world?.width || 80000;
  const next = clamp(sec.x + desired, 1600, worldWidth - 1600) - sec.x;
  const shift = next - war.positionOffset;
  if (Math.abs(shift) < 1) { force.phase = 'consolidate'; force.phaseTime = 14; force.advance = 0; return; }
  war.oldTrenches.push({ ...previous[`${team}Trench`], team }, { ...previous[`${otherTeam(team)}Trench`], team });
  war.oldTrenches = war.oldTrenches.slice(-6);
  war.positionOffset = next;
  war.captures++;
  force.securedBounds++;
  force.advance -= sign * shift;
  force.phase = 'consolidate'; force.phaseTime = 14;
  force.fortification = Math.max(.25, force.fortification * .7);
  force.morale = clamp(force.morale + .09, 0, 1);
  foe.advance = -90;
  foe.phase = 'retreat'; foe.phaseTime = 10;
  foe.morale = clamp(foe.morale - .05, .05, 1);
  foe.reinforcementsIn = Math.max(foe.reinforcementsIn, 35);
  foe.fallbackUntil = Math.max(foe.fallbackUntil, war.ticks + 35);
  sec.progress = clamp(sec.progress + sign * 24, -100, 100);
  // Wrecks stay at their actual location; retreating survivors and reserves
  // travel to the fallback line instead of being resurrected at the impact.
  const base = makeBase(sec, team, war.captures);
  base.x = getFrontGeometry(sec)[`${team}Trench`].x - sign * 210;
  war.bases.push(base);
  if (war.bases.length > WAR_LIMITS.maxBasesPerFront) {
    const removable = war.bases.findIndex(candidate => candidate !== base && candidate.team === team);
    war.bases.splice(removable >= 0 ? removable : 0, 1);
  }
  recordEvent(state, sec, team, 'capture', `${team === 'ally' ? 'Nossa infantaria ocupou' : 'O inimigo ocupou'} a próxima trincheira de ${sec.name}. Engenharia prepara um posto avançado.`);
}

function updateInfrastructure(state, sec) {
  const war = sec.war;
  for (const base of war.bases) {
    if (!base.alive) continue;
    const force = war[base.team], strength = sec[strengthKey(base.team)];
    const geometry = getFrontGeometry(sec);
    const friendlyGround = teamSign(base.team) * (base.x - geometry.center.x) < -150;
    base.supply = clamp(base.supply + (friendlyGround && strength >= 20 ? .005 : -.012), .04, 1);
    if (!friendlyGround || force.suppression > .7 || strength < 20 || base.level >= 3) continue;
    // A captured level-0 camp takes time to establish. Once supplied, the
    // original level-1 logistics base can expand on the strategic clock even
    // while infantry remains abstracted far from the camera.
    const engineeringRate = base.level === 0 ? .012 * base.supply : .035 * (.45 + base.supply);
    base.buildProgress += engineeringRate * (force.phase === 'consolidate' ? 1.6 : 1);
    if (base.buildProgress >= 1) {
      base.level++;
      base.buildProgress = 0;
      base.maxHp = 240 + base.level * 120;
      base.hp = Math.min(base.maxHp, base.hp + 150);
      recordEvent(state, sec, base.team, 'construction', `${base.team === 'ally' ? 'Nossa engenharia' : 'Engenharia inimiga'} ampliou a base de ${sec.name}: ${['posto', 'acampamento', 'base fortificada', 'complexo logístico'][base.level]}.`);
    }
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
      duck: .7, pop: 0, hitFlash: 0, hitCount: 0, supp: sec.war[team].suppression, action: sec.war[team].phase,
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
    const distance = Math.min(dist(getFrontGeometry(sec).center, point), ...sec.war.bases.map(base => dist(base, point)));
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
    unit.hitFlash = Math.max(0, (unit.hitFlash || 0) - dt);
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
      const hitChance = unit.role === 'mg' ? .052 : .026;
      const hit = noise(state.warSimulation.clock * 1.91 + unit.slot * 7.3 + shot * 17 + (unit.team === 'enemy' ? 31 : 0)) < hitChance;
      state.tracers.push({ x: unit.x, y: unit.y, x2: foe.x + jitter, y2: foe.y - jitter, life: hit ? .28 : .16 + shot * .025, max: hit ? .3 : .25, team: unit.team, hit });
      if (!hit) continue;
      foe.hitFlash = Math.max(foe.hitFlash || 0, .3);
      foe.hitCount = (foe.hitCount || 0) + 1;
      foe.supp = clamp(foe.supp + (unit.role === 'mg' ? .11 : .045), 0, 1);
      // A few confirmed hits can remove one representative soldier. The
      // aggregate strength loss is deliberately small so the front keeps
      // fighting and replacements arrive through the strategic layer.
      if (foe.hitCount >= 3 && noise(state.warSimulation.clock * 2.37 + foe.slot * 5.1 + unit.slot) < .18) {
        const foeForce = sec.war[foe.team], down = new Set(foeForce.downSlots || []);
        if (!down.has(foe.slot)) {
          down.add(foe.slot); foeForce.downSlots = [...down].sort((a, b) => a - b);
          foeForce.activeSlots = Math.max(0, (foeForce.activeSlots ?? representativeCount(sec, foe.team)) - 1);
          foe.inactive = true; foe.downed = true; foe.pop = 0; foe.action = 'downed';
          const key = strengthKey(foe.team), loss = unit.role === 'mg' ? .72 : .42;
          sec[key] = clamp(sec[key] - loss, 0, 100); foeForce.casualties += loss;
          recordEvent(state, sec, foe.team, 'small_arms', `${foe.team === 'ally' ? 'Nossa infantaria' : 'A infantaria inimiga'} perdeu um combatente no fogo cruzado em ${sec.name}.`);
        }
      }
    }
  }
}

function launchSupport(state, sec, team, type, origin, target, duration, scale) {
  const sim = simulation(state);
  if (sim.support.length >= WAR_LIMITS.maxSupport) return;
  sim.support.push({ id: `support-${++sim.serial}`, sector: sec.id, team, type, x: origin.x, y: origin.y, z: 0,
    origin: { x: origin.x, y: origin.y }, target: { x: target.x, y: target.y },
    angle: Math.atan2(target.y - origin.y, target.x - origin.x), life: duration, max: duration, scale, known: team === 'ally' });
}

function updateSupport(state, dt) {
  const sim = simulation(state);
  for (const sec of state.sectors) {
    const war = sec.war, geometry = getFrontGeometry(sec);
    for (const mortar of war.mortars) {
      mortar.flash = Math.max(0, mortar.flash - dt);
      if (!mortar.alive) continue;
      const force = war[mortar.team], foeTeam = otherTeam(mortar.team), target = geometry[`${foeTeam}Line`];
      // Crews displace their support weapon behind the secured trench.
      const home = geometry[`${mortar.team}Trench`];
      mortar.x += clamp(home.x - teamSign(mortar.team) * 460 - mortar.x, -12 * dt, 12 * dt);
      mortar.cooldown -= dt;
      if (mortar.cooldown > 0 || sec[strengthKey(mortar.team)] < 14 || sec[strengthKey(foeTeam)] < 1 || force.ammo < .12) continue;
      const dispersion = (noise(sim.clock + war.index * 17) - .5) * 200;
      launchSupport(state, sec, mortar.team, 'mortar', mortar, { x: target.x + dispersion, y: target.y + dispersion * 1.5 }, 2.6, .13);
      mortar.cooldown = 16 + noise(sim.clock + war.index) * 8;
      mortar.flash = .35;
      force.ammo = Math.max(0, force.ammo - .009);
    }
    for (const tank of war.vehicles) {
      tank.flash = Math.max(0, tank.flash - dt);
      if (!tank.alive) {
        tank.replacementIn = (tank.replacementIn || 90) - dt;
        if (tank.replacementIn > 0 || sec[strengthKey(tank.team)] < 30 || assetSupport(sec, tank.team).supply < .65) continue;
        const base = [...war.bases].reverse().find(candidate => candidate.alive && candidate.team === tank.team);
        if (!base) continue;
        tank.alive = true; tank.hp = tank.maxHp; tank.x = base.x; tank.y = base.y + 160; tank.fireCooldown = 12;
        recordEvent(state, sec, tank.team, 'armor', `Um blindado de reposição alcançou ${sec.name}.`);
      }
      const force = war[tank.team], foeTeam = otherTeam(tank.team);
      const home = geometry[`${tank.team}Line`];
      const targetX = home.x - teamSign(tank.team) * (force.phase === 'assault' ? 65 : 150);
      const move = clamp(targetX - tank.x, -14 * dt, 14 * dt);
      tank.x += move;
      tank.speed = Math.abs(move) / Math.max(dt, .001);
      if (Math.abs(move) > .01) tank.angle = move > 0 ? 0 : Math.PI;
      tank.fireCooldown -= dt;
      const enemyTank = war.vehicles.find(candidate => candidate.team === foeTeam && candidate.alive);
      const target = enemyTank || geometry[`${foeTeam}Line`];
      if (tank.fireCooldown > 0 || sec[strengthKey(tank.team)] < 5 || (sec[strengthKey(foeTeam)] < 1 && !enemyTank) || smokeBlocksLine(state.smokes, tank, target)) continue;
      tank.angle = Math.atan2(target.y - tank.y, target.x - tank.x);
      launchSupport(state, sec, tank.team, 'tank-shell', tank, target, .7, .22);
      tank.fireCooldown = 10 + noise(sim.clock + war.index * 3) * 6;
      tank.flash = .22;
    }
  }
  if (sim.clock >= sim.nextBomberAt && sim.support.length < WAR_LIMITS.maxSupport - 5) {
    const team = sim.nextBomberTeam;
    const candidates = state.sectors.filter(sec => sec[strengthKey(team)] >= 24 && sec[strengthKey(otherTeam(team))] > 5 && assetSupport(sec, team).supply > .45);
    // Nearby fronts are a sensible observable first sortie; later sorties
    // alternate both forces across the theatre without disclosing their goals.
    candidates.sort((a, b) => dist(getFrontGeometry(a).center, state.robot || { x: 0, y: 0 }) - dist(getFrontGeometry(b).center, state.robot || { x: 0, y: 0 }));
    const sec = candidates[Math.floor(sim.strategicTicks / 90) % (candidates.length || 1)];
    if (sec) {
      const target = getFrontGeometry(sec)[`${otherTeam(team)}Line`], sign = teamSign(team);
      sim.support.push({ id: `support-${++sim.serial}`, sector: sec.id, team, type: 'bomber', x: target.x - sign * 2200, y: target.y - 420, z: 600,
        target: { ...target }, origin: { x: target.x - sign * 2200, y: target.y - 420 },
        angle: team === 'ally' ? 0 : Math.PI, life: 12, max: 12, dropped: 0, known: team === 'ally' });
      recordEvent(state, sec, team, 'air_support', `Passagem de bombardeiro ${team === 'ally' ? 'aliado' : 'inimigo'} sobre ${sec.name}.`);
    }
    sim.nextBomberTeam = otherTeam(team);
    sim.nextBomberAt = sim.clock + 38;
  }
  const expired = [];
  for (const item of [...sim.support]) {
    item.life -= dt;
    const t = clamp(1 - item.life / item.max, 0, 1);
    if (item.type === 'bomber') {
      item.x = item.origin.x + teamSign(item.team) * 4400 * t;
      if (t >= .43 + item.dropped * .055 && item.dropped < 3) {
        const sec = state.sectors.find(candidate => candidate.id === item.sector);
        if (sec) {
          // The bombs form one straight stick along the aircraft's run. The
          // offset follows the flight vector, so changing the approach angle
          // changes the whole line instead of scattering each bomb at a
          // different target type.
          const runAngle = Number.isFinite(item.angle) ? item.angle : (teamSign(item.team) > 0 ? 0 : Math.PI);
          const spacing = (item.dropped - 1) * 180;
          const bombTarget = { x: item.target.x + Math.cos(runAngle) * spacing, y: item.target.y + Math.sin(runAngle) * spacing };
          launchSupport(state, sec, item.team, 'bomb', { x: item.x, y: item.y }, bombTarget, 1.45, .27);
        }
        item.dropped++;
      }
    } else {
      item.x = item.origin.x + (item.target.x - item.origin.x) * t;
      item.y = item.origin.y + (item.target.y - item.origin.y) * t;
      item.z = item.type === 'bomb' ? 600 * (1 - t * t) : Math.sin(t * Math.PI) * (item.type === 'mortar' ? 260 : 18);
      if (item.life <= 0) expired.push(item);
    }
  }
  sim.support = sim.support.filter(item => item.life > 0).slice(-WAR_LIMITS.maxSupport);
  for (const item of expired) {
    applyWarImpact(state, item.target.x, item.target.y, 'HE', { scale: item.scale, record: false });
    if (state.effects && (dist(item.target, state.cam || state.robot || { x: 0, y: 0 }) < WAR_LIMITS.detailRadius)) {
      state.effects.push({ x: item.target.x, y: item.target.y, life: .65, start: .65, max: item.type === 'bomb' ? 120 : 65, type: 'blast' });
    }
  }
}

/** Reconnaissance evaluates a corridor; no omniscient automatic path command. */
export function assessRoute(state, from, to) {
  const length = dist(from, to), samples = Math.max(2, Math.min(160, Math.ceil(length / 250)));
  const checkpoints = [], gaps = [];
  let risk = 0;
  const reasons = new Set();
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    const candidates = state.sectors.filter(sec => Math.abs(sec.y - point.y) < 5000).sort((a, b) => Math.abs(a.y - point.y) - Math.abs(b.y - point.y) || dist(getFrontGeometry(a).center, point) - dist(getFrontGeometry(b).center, point));
    const sec = candidates[0];
    let localRisk = .48, status = 'unverified';
    if (sec) {
      const geometry = getFrontGeometry(sec);
      const insideFriendly = point.x < geometry.allyLine.x - 60;
      const held = sec.allyStrength >= 23 && sec.war.ally.morale >= .23;
      if (insideFriendly && held) { localRisk = .08 + sec.war.ally.suppression * .12; status = 'secured'; }
      else if (point.x > geometry.enemyLine.x - 60 && sec.enemyStrength > 8) { localRisk = .9; status = 'enemy'; reasons.add('A rota cruza uma posição inimiga ativa.'); }
      else if (!held) {
        localRisk = .66; status = 'defensive_gap';
        gaps.push({ ...point, sector: sec.id, width: 250 });
        reasons.add('Há uma abertura na defesa; patrulhas precisam verificar o corredor.');
      } else { localRisk = .46; status = 'contested'; reasons.add('Há um trecho entre as linhas ainda sem confirmação de segurança.'); }
    } else reasons.add('Trecho fora da cobertura dos observadores.');
    risk = Math.max(risk, localRisk);
    checkpoints.push({ ...point, status, risk: localRisk, sector: sec?.id });
  }
  if (!reasons.size) reasons.add('Corredor coberto pela infantaria aliada.');
  return { safe: risk < .34, risk, reasons: [...reasons], checkpoints, gaps: gaps.slice(0, 12), partisanRisk: gaps.length ? Math.min(.24, .05 + gaps.length * .008) : 0 };
}

/** Called only while the Mamute moves through a checked corridor. */
export function checkRouteAmbush(state, route, dt = 4) {
  const sim = simulation(state);
  if (!state.robot || !route?.partisanRisk || !route.gaps?.length || sim.clock < (sim.ambushAfter || 0) || dt <= 0) return null;
  const gap = route.gaps.find(point => dist(point, state.robot) < 500);
  if (!gap) return null;
  const sec = state.sectors.find(candidate => candidate.id === gap.sector);
  // Previously measured gaps close when the defense recovers. A route memo
  // must never create partisans behind an intact front.
  if (!sec || sec.allyStrength >= 23 || sec.enemyStrength < 20) return null;
  const chance = 1 - Math.pow(1 - route.partisanRisk, Math.min(dt, 8) / 4);
  if (noise(sim.clock * 2.13 + state.robot.x * .03 + state.robot.y * .07) >= chance) return null;
  const origin = { x: state.robot.x + 180, y: state.robot.y + (noise(sim.clock) > .5 ? -160 : 160) };
  const damage = 5 + noise(sim.clock * 3.5) * 5;
  state.robot.armor = clamp((state.robot.armor ?? 100) - damage, 0, 100);
  sim.ambushAfter = sim.clock + 35;
  for (let i = 0; i < 3 && state.tracers.length < WAR_LIMITS.maxTracers; i++) state.tracers.push({ ...origin, x2: state.robot.x + i * 5, y2: state.robot.y, life: .24, max: .24, team: 'enemy' });
  recordEvent(state, sec, 'enemy', 'ambush', `Fogo de uma patrulha infiltrada na brecha de ${sec.name}. Mamute atingido; recue para a cobertura aliada.`);
  return { damage, origin, sector: sec.id };
}

function threatKindForAsset(asset) {
  const type = String(asset?.type || '').toUpperCase();
  if (type === 'HMG') return 'hmg';
  if (type === 'MORTEIRO' || type === 'MORTAR') return 'mortar';
  if (type === 'BATERIA' || type === 'ARTILLERY') return 'battery';
  return null;
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const t = length2 ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length2, 0, 1) : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

/** The ally trench masks direct fire while the vehicle is behind its cover. */
function behindAllyCover(robot, sector) {
  if (!robot || !sector) return false;
  const line = getFrontGeometry(sector).allyLine;
  return robot.x < line.x - 90 && Math.abs(robot.y - line.y) < 1_200;
}

/**
 * Select the closest useful enemy weapon without revealing the whole theatre.
 * Only weapons close enough to hit the current Mamute are considered; this is
 * why distant fronts stay abstract while an exposed player gets immediate
 * pressure from the local trench, armour and support guns.
 */
export function selectPlayerThreat(state) {
  const robot = state?.robot;
  if (!robot || !Number.isFinite(robot.x) || !Number.isFinite(robot.y)) return null;
  const candidates = [];
  const add = (source, kind, sector) => {
    if (!source || source.alive === false || source.inactive || source.downed || source.team === 'ally') return;
    const profile = PLAYER_THREAT_LIMITS[kind];
    if (!profile || !Number.isFinite(source.x) || !Number.isFinite(source.y)) return;
    const distance = dist(source, robot);
    if (distance > profile.range) return;
    // Direct-fire weapons cannot see through a live smoke screen. Indirect
    // mortars/batteries can still bracket the last reported position.
    if (['hmg', 'rifle', 'tank'].includes(kind) && (smokeBlocksLine(state.smokes || [], source, robot) || behindAllyCover(robot, sector))) return;
    candidates.push({ source, kind, profile, sector, distance, score: distance - profile.priority * 220 });
  };
  for (let index = 0; index < (state.sectors || []).length; index++) {
    const sector = initializeSector(state.sectors[index], index);
    for (const asset of sector.assets || []) add(asset, threatKindForAsset(asset), sector);
    for (const mortar of sector.war?.mortars || []) if (mortar.team === 'enemy') add(mortar, 'mortar', sector);
    for (const tank of sector.war?.vehicles || []) if (tank.team === 'enemy') add(tank, 'tank', sector);
    for (const unit of sector.units || []) {
      if (unit.team !== 'enemy') continue;
      add(unit, unit.role === 'mg' ? 'hmg' : 'rifle', sector);
    }
  }
  // Enemy bombers normally follow a front-line run. They can only acquire the
  // Mamute when it is near that assigned run; an aircraft on another front
  // remains an abstract strategic event.
  for (const bomber of state.warSimulation?.support || []) {
    if (bomber.type !== 'bomber' || bomber.team !== 'enemy' || bomber.life <= 0 || !bomber.target) continue;
    const nearRun = dist(robot, bomber.target) < 900 || pointSegmentDistance(robot, bomber.origin || bomber, bomber.target) < 260;
    if (nearRun) add(bomber, 'bomber', state.sectors.find(sec => sec.id === bomber.sector));
  }
  candidates.sort((a, b) => a.score - b.score || a.distance - b.distance);
  return candidates[0] || null;
}

/**
 * Resolve one bounded local attack against the player. Damage is applied to
 * the same armour value used by the engine-damage system, and a short tracer
 * plus a queued hit lets the renderer/audio layer make the contact readable.
 */
export function playerThreatStep(state, dt = 0) {
  const sim = simulation(state);
  if (state?.mode !== 'march' || !state.robot || (state.robot.armor ?? 100) <= 0) {
    // Keep a small reaction delay when the player returns to the field instead
    // of allowing a shot to fire on the exact transition frame.
    sim.playerThreatCooldown = Math.max(sim.playerThreatCooldown, 1.8);
    return null;
  }
  sim.playerThreatCooldown = Math.max(0, sim.playerThreatCooldown - Math.max(0, dt));
  if (sim.playerThreatCooldown > 0) return null;
  const threat = selectPlayerThreat(state);
  if (!threat) {
    sim.playerThreatCooldown = Math.min(1.5, Math.max(sim.playerThreatCooldown, .35));
    return null;
  }
  const { source, kind, profile, sector, distance } = threat;
  const sample = noise(sim.clock * 2.71 + (source.x || 0) * .013 + (source.y || 0) * .007);
  const damage = profile.damage[0] + sample * (profile.damage[1] - profile.damage[0]);
  state.robot.armor = clamp((state.robot.armor ?? 100) - damage, 0, 100);
  const origin = { x: source.x, y: source.y };
  const tracer = { x: origin.x, y: origin.y, x2: state.robot.x, y2: state.robot.y, life: .3, max: .3, team: 'enemy', threat: kind };
  for (let i = 0; i < (kind === 'hmg' ? 2 : 1); i++) {
    if (state.tracers.length >= WAR_LIMITS.maxTracers) break;
    state.tracers.push(i ? { ...tracer, life: .23, max: .23, x2: state.robot.x + 8 } : tracer);
  }
  if ('flash' in source) source.flash = .28;
  if ('pop' in source) source.pop = .3;
  sim.playerHits.push({ id: `player-hit-${++sim.serial}`, time: sim.clock, sector: sector?.id, kind, damage, distance, origin });
  sim.playerHits = sim.playerHits.slice(-16);
  const labels = { hmg: 'metralhadora', rifle: 'fuzileiros', tank: 'tanque', mortar: 'morteiro', battery: 'bateria' };
  recordEvent(state, sector || { id: 'unknown', name: 'frente desconhecida' }, 'enemy', 'player_fire', `Fogo inimigo (${labels[kind]}) enquadrou o Mamute. Blindagem sofreu ${Math.round(damage)} pontos.`);
  sim.playerThreatCooldown = profile.cadence * (.82 + noise(sim.clock * 1.17 + distance) * .34);
  return { ...sim.playerHits.at(-1), source, sector };
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
  updateSupport(state, dt);
  playerThreatStep(state, dt);
}

export function applyWarImpact(state, x, y, type, options = {}) {
  const sim = simulation(state);
  const point = { x, y };
  const result = { destroyed: [], friendlyHits: 0, friendlyCasualties: 0, enemyCasualties: 0, affected: [], robotDamage: 0 };
  if (![x, y].every(Number.isFinite)) return result;
  if (options.record !== false) {
    sim.impacts.push({ x, y, until: sim.clock + 4 });
    sim.impacts = sim.impacts.slice(-4);
  }
  if (type === 'SMOKE') {
    result.smoke = { x, y, r: 270, life: 42 };
    state.smokes.push(result.smoke);
    return result;
  }
  const frag = type === 'FRAG';
  const scale = clamp(options.scale ?? 1, 0, 1);
  const structureRadius = frag ? 145 : 170, infantryRadius = frag ? 330 : 175;
  for (let index = 0; index < state.sectors.length; index++) {
    const sec = initializeSector(state.sectors[index], index);
    for (const asset of [...sec.assets, ...sec.war.bases, ...sec.war.mortars, ...sec.war.vehicles]) {
      if (!asset.alive) continue;
      const distance = dist(asset, point);
      if (distance >= structureRadius) continue;
      const damage = (1 - distance / structureRadius) * (frag ? 55 : 350) * scale;
      asset.hp = Math.max(0, asset.hp - damage);
      if (asset.team === 'ally') result.friendlyHits++;
      if (asset.hp === 0) { asset.alive = false; result.destroyed.push({ asset, sector: sec }); }
    }
    for (const team of teams) {
      const force = sec.war[team];
      // The same virtual trench geometry is used whether tactical units exist or not.
      // Creating detail never applies another casualty calculation.
      const exposure = Array.from({ length: teamSize(team) }, (_, slot) => {
        const home = slotPosition(sec, team, slot);
        return Math.max(0, 1 - dist(home, point) / infantryRadius);
      }).reduce((a, b) => a + b, 0) / teamSize(team);
      if (exposure <= 0) continue;
      const key = strengthKey(team);
      const loss = Math.min(sec[key], exposure * (frag ? 72 : 42) * (1 - force.fortification * (frag ? .48 : .25)) * scale);
      sec[key] -= loss;
      const downBefore = force.downSlots?.length ?? Math.max(0, teamSize(team) - (force.activeSlots ?? representativeCount(sec, team)));
      // Pick the nearest trench slots for this particular blast. Aggregate
      // strength still drives the strategic layer, while the local casualties
      // now match what the operator sees around the impact point.
      synchronizeSlots(sec, team, false, point);
      const newCasualties = Math.max(0, (force.downSlots?.length ?? 0) - downBefore);
      force.casualties += loss;
      const suppression = Math.min(1 - force.suppression, exposure * (frag ? 2.1 : 1.6) * scale);
      force.suppression += suppression;
      force.morale = clamp(force.morale - loss * .008, .05, 1);
      force.fortification = clamp(force.fortification - exposure * (frag ? .04 : .24) * scale, .1, 1);
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
    result.robotDamage = Math.max(0, 1 - dist(state.robot, point) / radius) * (frag ? 9 : 42) * scale;
    if (result.robotDamage > 0) {
      state.robot.armor = clamp((state.robot.armor ?? 100) - result.robotDamage, 0, 100);
      result.friendlyHits++;
    }
  }
  return result;
}