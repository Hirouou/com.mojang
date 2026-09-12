import { createTerritoryNode, setTerritoryControl } from './territory-development.js';

const REGION_CONTROLS = new Set(['ally', 'enemy', 'contested']);

/**
 * Converts strategic region ownership into territory-development control without
 * inventing a second ownership model. Mixed/frontline regions pause development
 * while preserving the last owner until the continuous control line resolves the
 * region for one side.
 */
export function syncTerritoryNodeToRegion(node, region, { dt = 0 } = {}) {
  if (!node || !region || !REGION_CONTROLS.has(region.control)) return null;
  if (region.control === 'contested') {
    setTerritoryControl(node, node.owner, { contested: true, dt: 0 });
    return node;
  }
  setTerritoryControl(node, region.control, { contested: false, dt });
  return node;
}

/** Create one mutable development node per immutable strategic region. */
export function createRegionTerritoryNodes(regions) {
  const nodes = [];
  for (const region of Array.isArray(regions) ? regions : []) {
    if (!region?.id || !REGION_CONTROLS.has(region.control)) continue;
    const owner = region.control === 'contested' ? null : region.control;
    const node = createTerritoryNode({ id: region.id, owner });
    syncTerritoryNodeToRegion(node, region);
    nodes.push(node);
  }
  return nodes;
}
