const dist = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));

/**
 * Field crews should mostly receive work near the front they are supporting.
 * High-command missions may travel farther only when explicitly delivered by
 * radio; the player still chooses where to deploy from the world map.
 */
export function localMissionFeed({
  playerPosition,
  missions = [],
  localRadius = 11_000,
  radioHexIds = [],
  currentHexId = null,
} = {}) {
  if (!playerPosition) return Object.freeze([]);
  const radio = new Set(radioHexIds || []);
  const radius = Math.max(500, Number(localRadius) || 11_000);
  return Object.freeze((missions || []).filter(mission => {
    if (!mission || !Number.isFinite(mission.x) || !Number.isFinite(mission.y)) return false;
    const nearby = dist(playerPosition, mission) <= radius;
    if (nearby) return true;
    const commandRadio = mission.scope === 'command' && mission.hexId && radio.has(mission.hexId);
    const sameRegion = currentHexId && mission.hexId === currentHexId;
    return Boolean(commandRadio || sameRegion);
  }).sort((a, b) => {
    const priority = Number(b.priority || 0) - Number(a.priority || 0);
    return priority || dist(playerPosition, a) - dist(playerPosition, b);
  }).map(mission => Object.freeze({ ...mission, distance: dist(playerPosition, mission) })));
}

/**
 * Nearby strategic convoys are candidates for tactical materialization. Friendly
 * traffic can be materialized from the canonical logistics snapshot; hostile
 * traffic requires an explicit earned observation id so this seam cannot turn
 * the distant simulation into an omniscient local sensor.
 */
export function localConvoyMaterializationFeed({
  playerPosition,
  playerTeam = 'ally',
  convoys = [],
  observedEnemyIds = [],
  localRadius = 4_500,
} = {}) {
  if (!playerPosition || !['ally', 'enemy'].includes(playerTeam)) return Object.freeze([]);
  const observed = new Set(observedEnemyIds || []);
  const radius = Math.max(250, Number(localRadius) || 4_500);
  return Object.freeze((convoys || []).filter(convoy => {
    if (!convoy?.id || !convoy.position) return false;
    if (!['moving', 'blocked'].includes(convoy.status)) return false;
    if (!Number.isFinite(convoy.position.x) || !Number.isFinite(convoy.position.y)) return false;
    if (dist(playerPosition, convoy.position) > radius) return false;
    return convoy.team === playerTeam || observed.has(convoy.id);
  }).sort((a, b) => dist(playerPosition, a.position) - dist(playerPosition, b.position)).map(convoy => Object.freeze({
    ...convoy,
    position: Object.freeze({ ...convoy.position }),
    distance: dist(playerPosition, convoy.position),
  })));
}

/** A local fire request cannot ask a Mamute to shoot beyond its physical range. */
export function missionInWeaponRange(mission, position, maxRange) {
  if (!mission || !position || !Number.isFinite(maxRange) || maxRange <= 0) return false;
  return dist(position, mission) <= maxRange;
}
