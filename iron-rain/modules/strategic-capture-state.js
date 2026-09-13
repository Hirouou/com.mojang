import { setTerritoryControl, territorySnapshot } from './territory-development.js';
import { LOGISTICS_ASSET_KEYS } from './strategic-logistics.js';

const validOwner = owner => owner === 'ally' || owner === 'enemy' ? owner : null;
const freezeStock = stock => Object.freeze({
  materials: Math.max(0, Number(stock?.materials) || 0),
  ammo: Math.max(0, Number(stock?.ammo) || 0),
  fuel: Math.max(0, Number(stock?.fuel) || 0),
});
const freezeAssets = assets => {
  const out = {
    trucks: Math.max(0, Math.floor(Number(assets?.trucks) || 0)),
    tanks: Math.max(0, Math.floor(Number(assets?.tanks) || 0)),
    troops: Math.max(0, Math.floor(Number(assets?.troops) || 0)),
  };
  for (const key of LOGISTICS_ASSET_KEYS) {
    if (key === 'trucks' || key === 'tanks' || key === 'troops') continue;
    if (Object.prototype.hasOwnProperty.call(assets || {}, key)) out[key] = Math.max(0, Math.floor(Number(assets?.[key]) || 0));
  }
  return Object.freeze(out);
};
const validRevision = revision => Number.isSafeInteger(revision) && revision >= 0;

/**
 * Apply a sector-control result that has already been accepted by shared/server
 * authority. This function never decides whether a capture is legal; it only
 * reconciles the live strategic projections so sector ownership, territory
 * development and logistics cannot drift into three different truths.
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
  const previousOwner = validOwner(territoryNode?.owner);
  const nextContested = Boolean(contested || !team);
  const endpoint = id && logistics?.getNode?.(id);

  if (!id || !territoryNode || String(territoryNode.id) !== id || !endpoint || String(endpoint.id) !== id) {
    return Object.freeze({ ok: false, changed: false, reason: 'projection-mismatch' });
  }

  const hasRevision = revision !== undefined && revision !== null;
  if (hasRevision && !validRevision(revision)) return Object.freeze({ ok: false, changed: false, reason: 'invalid-revision' });
  const currentRevision = validRevision(territoryNode.controlRevision) ? territoryNode.controlRevision : null;
  if (currentRevision !== null && !hasRevision) return Object.freeze({ ok: false, changed: false, reason: 'revision-required', revision: currentRevision });

  const visualOwner = nextContested ? 'contested' : team || 'neutral';
  const endpointTeam = nextContested ? null : team;
  const expectedProgress = team && !nextContested ? 1 : 0;
  const changed = sector.owner !== visualOwner
    || Number(sector.controlProgress) !== expectedProgress
    || territoryNode.owner !== team
    || Boolean(territoryNode.contested) !== nextContested
    || endpoint.team !== endpointTeam;

  if (currentRevision !== null && revision < currentRevision) return Object.freeze({ ok: false, changed: false, reason: 'stale-revision', revision: currentRevision });
  if (currentRevision !== null && revision === currentRevision && changed) return Object.freeze({ ok: false, changed: false, reason: 'revision-conflict', revision: currentRevision });

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

  const ownerChanged = Boolean(previousOwner && previousOwner !== team);
  const displacedAssets = ownerChanged ? freezeAssets(endpoint.assets) : freezeAssets();

  sector.owner = visualOwner;
  sector.controlProgress = expectedProgress;
  setTerritoryControl(territoryNode, team, { contested: nextContested, dt: 0 });
  endpoint.team = endpointTeam;
  if (ownerChanged) {
    for (const key of LOGISTICS_ASSET_KEYS) {
      if (endpoint.assets && Object.prototype.hasOwnProperty.call(endpoint.assets, key)) endpoint.assets[key] = 0;
      if (territoryNode.assets && Object.prototype.hasOwnProperty.call(territoryNode.assets, key)) territoryNode.assets[key] = 0;
    }
  }
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
    displacedAssets,
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
