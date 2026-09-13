import { buildCapitalLayout, capitalRoadSpeedMultiplier, roadTravelSpeed } from './capital-city-layout.js';

const layoutCache = new Map();
const playerTeam = () => globalThis.window?.ironRainEntry?.faction === 'axis' ? 'enemy' : 'ally';

function reserveContextForRoad(strategic, sectorId) {
  const preferred = playerTeam();
  return strategic.combatReserveContext?.(sectorId, preferred)
    || strategic.combatReserveContext?.(sectorId, preferred === 'ally' ? 'enemy' : 'ally')
    || null;
}

function capitalLayoutFor(position, strategic = globalThis.window?.ironRainStrategicMap) {
  const located = strategic?.locate?.(position);
  if (!located?.sector) return null;
  const context = reserveContextForRoad(strategic, located.sector.id);
  const logistics = context?.strategicLogistics;
  if (!logistics) return null;

  const bearings = logistics.roadBearings?.(located.sector.id) || [];
  const structures = context?.territory?.structures || located.sector.structures || [];
  const signature = `${located.sector.id}|${bearings.map(value => Number(value).toFixed(5)).join(',')}|${structures.join(',')}`;
  const cached = layoutCache.get(located.sector.id);
  if (cached?.signature === signature) return { layout: cached.layout, logistics, located };

  const layout = buildCapitalLayout({
    id: located.sector.id,
    x: located.sector.x,
    y: located.sector.y,
    roadBearings: bearings,
    structures,
  });
  layoutCache.set(located.sector.id, { signature, layout });
  return { layout, logistics, located };
}

export function roadSpeedMultiplier(position, strategic = globalThis.window?.ironRainStrategicMap) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return 1;
  const road = capitalLayoutFor(position, strategic);
  if (!road) return 1;
  const strategicMultiplier = road.logistics.roadSpeedMultiplier?.(position) || 1;
  const cityMultiplier = capitalRoadSpeedMultiplier(road.layout, position);
  return Math.max(1, strategicMultiplier, cityMultiplier);
}

export function mamuteTravelSpeed(baseSpeed, position, strategic = globalThis.window?.ironRainStrategicMap) {
  return roadTravelSpeed(baseSpeed, roadSpeedMultiplier(position, strategic));
}

export function localCapitalScene(position, strategic = globalThis.window?.ironRainStrategicMap) {
  const road = capitalLayoutFor(position, strategic);
  if (!road) return null;
  return Object.freeze({
    sectorId: road.located.sector.id,
    layout: road.layout,
    roadMultiplier: roadSpeedMultiplier(position, strategic),
  });
}

export function clearRoadMobilityCache() {
  layoutCache.clear();
}
