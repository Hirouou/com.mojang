export const THEATRE_FACTIONS = Object.freeze(['ALIADOS', 'EIXO']);
export const MAMUTE_DEPLOYMENT_STATES = Object.freeze(['moving', 'deployed', 'resupplying', 'disabled']);

const text = value => typeof value === 'string' ? value.trim() : '';
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

/**
 * Canonical strategic Mamute snapshot. This belongs to the shared theatre model,
 * not to a crew host/session, so leaving a crew never implies deleting the war.
 */
export function theatreMamuteRecord(input = {}) {
  const id = text(input.id || input.vehicleId || input.sessionId);
  const faction = text(input.faction).toUpperCase();
  const regionId = text(input.regionId);
  const sectorId = text(input.sectorId);
  const deployment = text(input.deployment || input.deploymentState || 'moving').toLowerCase();
  const ammunitionRef = text(input.ammunitionRef || input.ammoRef);
  const x = finite(input.x);
  const y = finite(input.y);
  const crewCountRaw = finite(input.crewCount);

  if (!id || !THEATRE_FACTIONS.includes(faction)) return null;
  if (!regionId || !sectorId || x === null || y === null) return null;
  if (!MAMUTE_DEPLOYMENT_STATES.includes(deployment) || !ammunitionRef) return null;
  if (crewCountRaw === null) return null;
  const crewCount = Math.floor(crewCountRaw);
  if (crewCount < 0 || crewCount > 3) return null;

  return Object.freeze({
    id,
    faction,
    regionId,
    sectorId,
    x,
    y,
    crewCount,
    deployment,
    ammunitionRef,
  });
}

/** Builds one immutable roster for both factions in the same theatre. */
export function createTheatreMamuteRoster(records = []) {
  const roster = [];
  const seen = new Set();
  for (const source of Array.isArray(records) ? records : []) {
    const record = theatreMamuteRecord(source);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    roster.push(record);
  }
  return Object.freeze(roster);
}

/** Player-facing discovery helper; it never grants session/station authority. */
export function eligibleMamutesForFaction(roster, faction) {
  const wanted = text(faction).toUpperCase();
  if (!THEATRE_FACTIONS.includes(wanted)) return Object.freeze([]);
  return Object.freeze((Array.isArray(roster) ? roster : [])
    .filter(record => record?.faction === wanted && record.crewCount < 3 && record.deployment !== 'disabled'));
}

export function mamutesInSector(roster, sectorId) {
  const wanted = text(sectorId);
  if (!wanted) return Object.freeze([]);
  return Object.freeze((Array.isArray(roster) ? roster : []).filter(record => record?.sectorId === wanted));
}
