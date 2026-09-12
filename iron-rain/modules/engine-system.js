import { maintenanceFeedback } from './maintenance-feedback.js';
import './maintenance-overlay.js';

/** Mamute engine damage and local, interruptible crew maintenance. */
export const ENGINE_EXTINGUISH_SECONDS = 3;
export const ENGINE_REPAIR_SECONDS = 6;
const FIRE_DAMAGE_PER_SECOND = 1.2;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value)));

function publishMaintenance(engine) {
  const detail = maintenanceFeedback(engine);
  try {
    if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
      globalThis.dispatchEvent(new globalThis.CustomEvent('iron-rain:maintenance-feedback', { detail }));
    }
  } catch { /* Presentation feedback must never affect engine simulation. */ }
  return detail;
}

export function createEngine() {
  return { health: 100, fire: 0, hasExtinguisher: false, repairProgress: 0, repairing: false, action: null };
}

function normalize(engine) {
  if (!engine || typeof engine !== 'object') return null;
  engine.health = clamp(engine.health, 0, 100);
  engine.fire = clamp(engine.fire, 0, 1);
  engine.hasExtinguisher = Boolean(engine.hasExtinguisher);
  const type = engine.action?.type;
  if (type !== 'repair' && type !== 'extinguish') engine.action = null;
  if (engine.action) {
    engine.action.duration = type === 'repair' ? ENGINE_REPAIR_SECONDS : ENGINE_EXTINGUISH_SECONDS;
    engine.action.elapsed = clamp(engine.action.elapsed, 0, engine.action.duration);
  }
  engine.repairing = type === 'repair';
  engine.repairProgress = engine.repairing ? engine.action.elapsed / ENGINE_REPAIR_SECONDS : 0;
  return engine;
}

function stop(engine) {
  engine.action = null; engine.repairing = false; engine.repairProgress = 0;
}

export function engineCanDrive(engine) {
  return Boolean(engine && finite(engine.health) >= 20 && finite(engine.fire) <= 0);
}

/** damage is the positive armor loss from a hit, not cumulative lost armor. */
export function damageEngine(engine, damage) {
  if (!normalize(engine)) return { applied: 0, ignited: false, disabled: true };
  const done = result => { publishMaintenance(engine); return result; };
  const amount = clamp(damage, 0, 100);
  if (!amount) return done({ applied: 0, ignited: false, disabled: !engineCanDrive(engine) });
  const wasBurning = engine.fire > 0;
  const before = engine.health;
  engine.health = Math.max(0, engine.health - amount * 1.35);
  // An isolated scratch cannot ignite a healthy engine. A severe hit or damage
  // to an already failing engine can rupture fuel or coolant lines.
  if (amount >= 18 || engine.health < 45) engine.fire = Math.max(engine.fire, clamp(.3 + amount / 70, .35, 1));
  if (engine.action?.type === 'repair') stop(engine);
  return done({ applied: before - engine.health, ignited: !wasBurning && engine.fire > 0, disabled: !engineCanDrive(engine) });
}

export function serviceEngine(engine, type) {
  if (!normalize(engine)) return { kind: 'unavailable', message: 'Motor indisponível.' };
  const done = result => { publishMaintenance(engine); return result; };
  if (type === 'extinguisher') {
    const alreadyEquipped = engine.hasExtinguisher;
    engine.hasExtinguisher = true;
    return done({ kind: 'equipped', message: alreadyEquipped ? 'Extintor já equipado. Aproxime-se do motor.' : 'Extintor equipado. Leve-o até o motor em chamas.' });
  }
  if (type !== 'engine') return done({ kind: 'unavailable', message: 'Aproxime-se do motor para fazer a manutenção.' });
  if (engine.fire > 0 && !engine.hasExtinguisher) {
    stop(engine);
    return done({ kind: 'needs-extinguisher', message: 'Incêndio no motor. Pegue o extintor antes de reparar.' });
  }
  if (engine.action) return done({ kind: 'busy', message: engine.action.type === 'extinguish' ? 'Combatendo o incêndio. Permaneça junto ao motor.' : 'Reparando o motor. Permaneça junto ao motor.' });
  const actionType = engine.fire > 0 ? 'extinguish' : engine.health < 100 ? 'repair' : null;
  if (!actionType) return done({ kind: 'ready', message: 'Motor em ordem. O Mamute pode avançar.' });
  engine.action = { type: actionType, elapsed: 0, duration: actionType === 'repair' ? ENGINE_REPAIR_SECONDS : ENGINE_EXTINGUISH_SECONDS };
  engine.repairing = actionType === 'repair'; engine.repairProgress = 0;
  return done({ kind: 'started', action: actionType, message: actionType === 'extinguish' ? 'Extintor acionado. Mantenha-se junto ao motor por 3 segundos.' : 'Reparo iniciado. Mantenha-se junto ao motor por 6 segundos.' });
}

export function updateEngine(engine, dt, { nearEngine = false } = {}) {
  if (!normalize(engine)) return null;
  const done = result => { publishMaintenance(engine); return result; };
  const elapsed = clamp(dt, 0, 60);
  if (!elapsed) return done(null);
  const action = engine.action;
  if (action && (!nearEngine || (action.type === 'repair' && engine.fire > 0) || (action.type === 'extinguish' && !engine.hasExtinguisher))) {
    stop(engine);
    if (engine.fire > 0) engine.health = Math.max(0, engine.health - FIRE_DAMAGE_PER_SECOND * engine.fire * elapsed);
    return done({ kind: 'interrupted', message: engine.fire > 0 && action.type === 'repair' ? 'Reparo interrompido. Apague o incêndio primeiro.' : 'Manutenção interrompida. Volte ao motor para continuar.' });
  }
  // When a large update finishes extinguishing, burn only until completion.
  const burnTime = action?.type === 'extinguish' ? Math.min(elapsed, action.duration - action.elapsed) : elapsed;
  if (engine.fire > 0) engine.health = Math.max(0, engine.health - FIRE_DAMAGE_PER_SECOND * engine.fire * burnTime);
  if (!action) return done(null);
  action.elapsed = Math.min(action.duration, action.elapsed + elapsed);
  engine.repairProgress = action.type === 'repair' ? action.elapsed / action.duration : 0;
  if (action.elapsed < action.duration) return done(null);
  if (action.type === 'extinguish') {
    engine.fire = 0; stop(engine);
    return done({ kind: 'extinguished', message: 'Incêndio controlado. Interaja com o motor para reparar os danos.', canDrive: engineCanDrive(engine) });
  }
  engine.health = 100; stop(engine);
  return done({ kind: 'repaired', message: 'Motor reparado. Tração do Mamute restabelecida.', canDrive: true });
}

export function engineStatus(engine) {
  if (!engine) return 'MOTOR INDISPONÍVEL';
  if (engine.action?.type === 'extinguish') return `EXTINTOR · ${Math.round(clamp(engine.action.elapsed / ENGINE_EXTINGUISH_SECONDS, 0, 1) * 100)}%`;
  if (engine.fire > 0) return 'INCÊNDIO · TRAÇÃO BLOQUEADA';
  if (engine.action?.type === 'repair') return `REPARANDO · ${Math.round(clamp(engine.repairProgress, 0, 1) * 100)}%`;
  return `${engineCanDrive(engine) ? 'MOTOR OPERACIONAL' : 'MOTOR AVARIADO'} · ${Math.round(clamp(engine.health, 0, 100))}%`;
}
