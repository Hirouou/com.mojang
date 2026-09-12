const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));

const WEAPON_WEIGHT = Object.freeze({ rifle: .35, hmg: .55, mortar: .85, tank: 1, battery: 1, bomber: 1 });

/**
 * Presentation-only response for a hit on the Mamute while crew are inside.
 * Damage rules remain in the war/engine simulation. The renderer/audio layer
 * consumes this to make an outside impact physically felt through the hull.
 */
export function hullImpactFeedback({ damage = 0, kind = 'hit', inside = true } = {}) {
  const normalizedDamage = clamp(Number(damage) / 20, 0, 1);
  const weapon = WEAPON_WEIGHT[kind] ?? .7;
  const intensity = clamp(.22 + normalizedDamage * .58 + weapon * .2, 0, 1);
  return Object.freeze({
    active: Boolean(inside),
    intensity: inside ? intensity : 0,
    duration: inside ? .28 + intensity * .48 : 0,
    cameraShake: inside ? .008 + intensity * .038 : 0,
    hullFlash: inside ? .08 + intensity * .22 : 0,
    dustKick: inside ? .15 + intensity * .85 : 0,
    lampFlicker: inside ? .12 + intensity * .5 : 0,
    metalRattle: inside ? .35 + intensity * .65 : 0,
    lowThump: inside ? .45 + intensity * .55 : 0,
    sharpCrack: inside ? .2 + weapon * .5 : 0,
    label: intensity > .8 ? 'IMPACTO PESADO NO CASCO' : intensity > .5 ? 'CASCO ATINGIDO' : 'IMPACTO EXTERNO',
  });
}

export function createHullImpactQueue({ max = 8 } = {}) {
  const limit = Math.max(1, Math.min(24, Math.floor(Number(max) || 8)));
  const impacts = [];
  let serial = 0;

  function push(hit, now = 0) {
    const feedback = hullImpactFeedback(hit);
    if (!feedback.active) return null;
    const entry = { id: ++serial, at: Number(now) || 0, age: 0, ...feedback };
    impacts.push(entry);
    if (impacts.length > limit) impacts.splice(0, impacts.length - limit);
    return Object.freeze({ ...entry });
  }

  function update(dt) {
    const elapsed = clamp(dt, 0, .25);
    for (const impact of impacts) impact.age += elapsed;
    while (impacts.length && impacts[0].age >= impacts[0].duration) impacts.shift();
    return snapshot();
  }

  function snapshot() {
    return Object.freeze(impacts.map(impact => Object.freeze({ ...impact, progress: clamp(impact.age / Math.max(.001, impact.duration), 0, 1) })));
  }

  return Object.freeze({ push, update, snapshot, clear() { impacts.length = 0; } });
}
