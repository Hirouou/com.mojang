const SHELLS = Object.freeze(['HE', 'SMOKE', 'FRAG']);
const cleanAmount = value => Math.max(0, Math.floor(Number(value) || 0));
const cleanShell = value => SHELLS.includes(String(value)) ? String(value) : null;
const dist = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));

export function createSupplyPoint({ id, team, x = 0, y = 0, shells = {}, fuel = 0, materials = 0, radio = true } = {}) {
  return {
    id: String(id ?? ''), team: team === 'ally' || team === 'enemy' ? team : null,
    x: Number(x) || 0, y: Number(y) || 0,
    shells: Object.fromEntries(SHELLS.map(type => [type, cleanAmount(shells[type])])),
    fuel: Math.max(0, Number(fuel) || 0), materials: Math.max(0, Number(materials) || 0),
    radio: Boolean(radio), alive: true,
  };
}

export function createMamuteInventory({ capacity = { HE: 24, SMOKE: 12, FRAG: 12 }, shells = { HE: 18, SMOKE: 8, FRAG: 8 } } = {}) {
  const cap = Object.fromEntries(SHELLS.map(type => [type, Math.max(0, cleanAmount(capacity[type]))]));
  const stock = Object.fromEntries(SHELLS.map(type => [type, Math.min(cap[type], cleanAmount(shells[type]))]));
  return { capacity: cap, shells: stock };
}

export function canFireShell(inventory, type) {
  const shell = cleanShell(type);
  return Boolean(shell && (inventory?.shells?.[shell] || 0) > 0);
}

export function consumeShell(inventory, type, amount = 1) {
  const shell = cleanShell(type), qty = Math.max(1, cleanAmount(amount));
  if (!shell || !inventory?.shells || inventory.shells[shell] < qty) return false;
  inventory.shells[shell] -= qty;
  return true;
}

/**
 * The Mamute only replenishes from a friendly physical supply point in service
 * range. Empty bases stay empty until logistics actually deliver shells there.
 */
export function resupplyMamute(inventory, point, { team, position, serviceRange = 85 } = {}) {
  if (!inventory || !point?.alive || !point.team || point.team !== team || !position || dist(position, point) > Math.max(1, Number(serviceRange) || 85)) {
    return Object.freeze({ ok: false, reason: 'no-friendly-supply-point', transferred: Object.freeze({}) });
  }
  const transferred = {};
  let total = 0;
  for (const shell of SHELLS) {
    const capacity = cleanAmount(inventory.capacity?.[shell]);
    const onboard = cleanAmount(inventory.shells?.[shell]);
    const available = cleanAmount(point.shells?.[shell]);
    const move = Math.min(Math.max(0, capacity - onboard), available);
    inventory.shells[shell] = onboard + move;
    point.shells[shell] = available - move;
    transferred[shell] = move; total += move;
  }
  return Object.freeze({ ok: total > 0, reason: total > 0 ? 'resupplied' : 'supply-point-empty-or-full', transferred: Object.freeze(transferred) });
}

export function supplyPointNeeds(point, target = { HE: 80, SMOKE: 30, FRAG: 40 }) {
  if (!point?.alive) return null;
  const shells = Object.fromEntries(SHELLS.map(type => [type, Math.max(0, cleanAmount(target[type]) - cleanAmount(point.shells?.[type]))]));
  const total = SHELLS.reduce((sum, type) => sum + shells[type], 0);
  return Object.freeze({ pointId: point.id, team: point.team, shells: Object.freeze(shells), urgent: total >= 70, total });
}

export function deliverShellCargo(point, cargo, team) {
  if (!point?.alive || point.team !== team) return false;
  for (const shell of SHELLS) point.shells[shell] = cleanAmount(point.shells[shell]) + cleanAmount(cargo?.[shell]);
  return true;
}

export const MAMUTE_SHELL_TYPES = SHELLS;
