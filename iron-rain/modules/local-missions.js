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

/** A local fire request cannot ask a Mamute to shoot beyond its physical range. */
export function missionInWeaponRange(mission, position, maxRange) {
  if (!mission || !position || !Number.isFinite(maxRange) || maxRange <= 0) return false;
  return dist(position, mission) <= maxRange;
}
