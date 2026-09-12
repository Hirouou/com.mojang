const validTeam = team => team === 'ally' || team === 'enemy';
const finiteStock = value => Math.max(0, Number.isFinite(value) ? value : 0);

/**
 * Simulation-safe view of the local territory logistics available to one
 * combat formation. This adapter never invents stock, reinforcements or route
 * state: callers must pass the territory snapshot and current route status
 * earned by the world/logistics simulation.
 */
export function combatLogisticsState(territory, { team, routeOpen = true } = {}) {
  const ownerMatches = validTeam(team) && territory?.owner === team;
  const secured = Boolean(ownerMatches && !territory?.contested);
  const connected = Boolean(secured && routeOpen);
  const structures = new Set(Array.isArray(territory?.structures) ? territory.structures : []);
  const stock = Object.freeze({
    ammo: finiteStock(territory?.stock?.ammo),
    materials: finiteStock(territory?.stock?.materials),
    fuel: finiteStock(territory?.stock?.fuel),
  });
  const hasFieldNode = structures.has('outpost') || structures.has('depot') || structures.has('garage');

  return Object.freeze({
    team: validTeam(team) ? team : null,
    territoryId: String(territory?.id ?? ''),
    secured,
    connected,
    stock,
    hasOutpost: structures.has('outpost'),
    hasDepot: structures.has('depot'),
    hasGarage: structures.has('garage'),
    canResupplyAmmo: Boolean(connected && hasFieldNode && stock.ammo > 0),
    canReceiveReinforcements: Boolean(connected && hasFieldNode),
  });
}
