import { setTerritoryControl, territorySnapshot } from './territory-development.js';

const validOwner = owner => owner === 'ally' || owner === 'enemy' ? owner : null;
const freezeStock = stock => Object.freeze({
  materials: Math.max(0, Number(stock?.materials) || 0),
  ammo: Math.max(0, Number(stock?.ammo) || 0),
  fuel: Math.max(0, Number(stock?.fuel) || 0),
});
const validRevision = revision => Number.isSafeInteger(revision) && revision >= 0;

/**
 * Apply a sector-control result that has already been accepted by shared/server
 * authority. This function never decides whether a capture is legal; it only
 * reconciles the live strategic projections so sector ownership, territory
 * development and logistics cannot drift into three different truths.
 *
 * Any ownership transition cuts incident supply routes. The authoritative
 * world/backend may reopen/rebuild routes after it publishes the new topology,
 * but the client must not keep an old faction route alive through a captured
 * endpoint in the meantime.
 *
 * A claimed capital can remain contested while reconstruction is in progress.
 * In that state the territorial claimant is remembered, but the visual sector
 * stays DISPUTED and the logistics endpoint has no active team. This prevents a
 * neutralized/rebuilding capital from supplying reserves or accepting normal
 * faction logistics before shared authority marks it operational. Reactivation
 * also does not magically reopen routes cut during neutralization.
 *
 * `revision` is optional for the current local/legacy seam. Once an authority
 * starts publishing revisions for a sector, that projection becomes revisioned:
 * older events and unversioned replays fail closed instead of rolling territory
 * and logistics back after a delayed network delivery.
 */
export function applyAuthoritativeSectorControl({
  record,
  territoryNode,
  logistics,
  owner,
  contested = false,
  revision,
} = {}) {
  const sector = record?.sector;
  const id = String(sector?.id ?? '');
  const team = validOwner(owner);
  const nextContested = Boolean(contested || !team);
  const endpoint = id && logistics?.getNode?.(id);

  if (!id || !territoryNode || String(territoryNode.id) !== id || !endpoint || String(endpoint.id) !== id) {
    return Object.freeze({ ok: false, changed: false, reason: 'projection-mismatch' });
  }

  const hasRevision = revision !== undefined && revision !== null;
  if (hasRevision && !validRevision(revision)) {
    return Object.freeze({ ok: false, changed: false, reason: 'invalid-revision' });
  }
  const currentRevision = validRevision(territoryNode.controlRevision) ? territoryNode.controlRevision : null;
  if (currentRevision !== null && !hasRevision) {
    return Object.freeze({ ok: false, changed: false, reason: 'revision-required', revision: currentRevision });
  }

  const visualOwner = nextContested ? 'contested' : team || 'neutral';
  const endpointTeam = nextContested ? null : team;
  const changed = sector.owner !== visualOwner
    || territoryNode.owner !== team
    || Boolean(territoryNode.contested) !== nextContested
    || endpoint.team !== endpointTeam;

  if (currentRevision !== null && revision < currentRevision) {
    return Object.freeze({ ok: false, changed: false, reason: 'stale-revision', revision: currentRevision });
  }
  if (currentRevision !== null && revision === currentRevision && changed) {
    return Object.freeze({ ok: false, changed: false, reason: 'revision-conflict', revision: currentRevision });
  }

  if (!changed) {
    if (hasRevision) territoryNode.controlRevision = revision;
    return Object.freeze({
      ok: true,
      changed: false,
      reason: 'already-current',
      id,
      owner: team,
      contested: nextContested,
      ...(hasRevision ? { revision } : {}),
      cutRoutes: Object.freeze([]),
      territory: territorySnapshot(territoryNode),
    });
  }

  sector.owner = visualOwner;
  sector.controlProgress = team && !nextContested ? 1 : 0;
  setTerritoryControl(territoryNode, team, { contested: nextContested, dt: 0 });
  endpoint.team = endpointTeam;
  if (hasRevision) territoryNode.controlRevision = revision;

  const cutRoutes = [];
  for (const route of logistics.snapshot?.().routes || []) {
    if (!route.open || (route.from !== id && route.to !== id)) continue;
    if (logistics.setRouteOpen?.(route.id, false, 1)) cutRoutes.push(route.id);
  }

  return Object.freeze({
    ok: true,
    changed: true,
    reason: nextContested ? (team ? `rebuilding:${team}` : 'neutralized') : `captured:${team}`,
    id,
    owner: team,
    contested: nextContested,
    ...(hasRevision ? { revision } : {}),
    cutRoutes: Object.freeze(cutRoutes),
    sector: Object.freeze({ id, owner: sector.owner, controlProgress: sector.controlProgress }),
    territory: territorySnapshot(territoryNode),
    logistics: Object.freeze({
      id: endpoint.id,
      team: endpoint.team,
      alive: Boolean(endpoint.alive),
      kind: endpoint.kind,
      stock: freezeStock(endpoint.stock),
    }),
  });
}