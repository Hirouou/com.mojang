import { combatSustainmentSupply } from '../modules/combat-sustainment.js';
import { applyAuthoritativeSectorControl } from '../modules/strategic-capture-state.js';
import { territorySnapshot } from '../modules/territory-development.js';
import { getFrontGeometry } from '../modules/war-simulation-core.js';

const teams = ['ally', 'enemy'];
const sign = team => team === 'ally' ? 1 : -1;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = value => Number.isFinite(value) ? value : 0;
const fieldReady = node => node && !node.contested && node.structures?.some(type => ['outpost', 'depot', 'garage'].includes(type));

/** Connect the dedicated simulation to its existing strategic stock and control. */
export function createServerFrontline({ battlefield, theatre }) {
  const contexts = new Map(), supplyCaps = new Map(), previousTanks = new Map();
  let contextTick = -1;

  function migrate() {
    battlefield.warSimulation ||= {};
    for (const key of ['clock', 'accumulator', 'strategicTicks', 'detailedFronts']) battlefield.warSimulation[key] ??= 0;
    battlefield.warSimulation.impacts ||= [];
    for (const sector of battlefield.sectors || []) {
      // Older dedicated checkpoints used a name the combat core never read.
      sector.strategicSectorId ||= sector.strategicId;
      if (!sector.war) continue;
      sector.serverFrontline ||= {
        captures: finite(sector.war.captures),
        positionOffset: finite(sector.war.positionOffset),
      };
    }
  }

  function contextForNode(id, team) {
    const node = theatre.territory.get(id), endpoint = theatre.logistics.getNode(id);
    if (!fieldReady(node) || node.owner !== team || !endpoint?.alive || endpoint.team !== team) return null;
    return {
      strategicLogistics: theatre.logistics,
      territory: territorySnapshot(node),
      to: id,
      claimAsset(type, count = 1) {
        const amount = Number(count);
        if (!['troops', 'tanks', 'trucks'].includes(type) || !Number.isSafeInteger(amount) || amount < 1) return false;
        if (node.owner !== team || node.contested || !endpoint.alive || endpoint.team !== team || (endpoint.assets?.[type] || 0) < amount) return false;
        endpoint.assets[type] -= amount;
        if (node.assets) node.assets[type] = endpoint.assets[type];
        return true;
      },
    };
  }

  function selectContext(sector, team) {
    const center = getFrontGeometry(sector).center;
    // A front cannot draw reserves from a friendly pocket ahead of its own line.
    // Both factions use the same rearward geometry and physical stock gates.
    const candidates = [...theatre.records.values()]
      .filter(({ sector: candidate }) => sign(team) * (candidate.x - center.x) <= -320 && distance(candidate, center) <= 24_000)
      .map(({ sector: candidate }) => ({ point: candidate, context: contextForNode(candidate.id, team) }))
      .filter(candidate => candidate.context)
      .sort((a, b) => distance(a.point, center) - distance(b.point, center) || String(a.point.id).localeCompare(String(b.point.id)));
    let fallback = null;
    for (const candidate of candidates) {
      const supply = combatSustainmentSupply({ ...candidate.context, team });
      if (!fallback || supply > fallback.supply) fallback = { ...candidate, supply };
      // Empty new outposts must not hide a supplied staging depot behind them.
      if (supply >= .3) return { context: candidate.context, supply };
    }
    return fallback ? { context: fallback.context, supply: fallback.supply } : null;
  }

  function beforeTick() {
    migrate();
    const tick = Math.floor(finite(battlefield.warSimulation.clock));
    if (tick !== contextTick) {
      contexts.clear(); supplyCaps.clear();
      for (const sector of battlefield.sectors || []) {
        if (!sector.war || !sector.strategicSectorId) continue;
        for (const team of teams) {
          const key = `${sector.strategicSectorId}:${team}`, selection = selectContext(sector, team);
          contexts.set(key, selection?.context || null);
          supplyCaps.set(key, selection?.supply || .08);
        }
      }
      contextTick = tick;
    }
    // Persistence and structuredClone must see data only; this runtime seam is
    // reattached after restart, never written into a strategic checkpoint.
    Object.defineProperty(battlefield.warSimulation, 'combatReserveContext', {
      configurable: true, writable: true, enumerable: false,
      value: ({ sectorId, team }) => contexts.get(`${sectorId}:${team}`) || null,
    });
    previousTanks.clear();
    for (const sector of battlefield.sectors || []) {
      if (!sector.war || !sector.strategicSectorId) continue;
      for (const team of teams) {
        const cap = supplyCaps.get(`${sector.strategicSectorId}:${team}`) || .08;
        for (const base of sector.war.bases || []) if (base.alive && base.team === team) base.supply = Math.min(finite(base.supply), cap);
      }
      for (const tank of sector.war.vehicles || []) previousTanks.set(tank.id, tank.alive !== false);
    }
  }

  function controlsBand(front, point) {
    // Adjacent tactical fronts own separate latitude bands. A single captured
    // trench cannot flip an entire hex or a distant front's strategic sectors.
    const ordered = (battlefield.sectors || []).filter(sector => sector.war)
      .sort((a, b) => Math.abs(a.y - point.y) - Math.abs(b.y - point.y) || String(a.id).localeCompare(String(b.id)));
    return ordered[0] === front && Math.abs(front.y - point.y) <= 7_500;
  }

  function afterTick() {
    const captures = [];
    for (const sector of battlefield.sectors || []) {
      const war = sector.war, previous = sector.serverFrontline;
      if (!war || !previous || !sector.strategicSectorId) continue;
      for (const tank of war.vehicles || []) {
        if (tank.alive === false || previousTanks.get(tank.id) !== false) continue;
        const context = contexts.get(`${sector.strategicSectorId}:${tank.team}`);
        if (!context?.claimAsset('tanks', 1)) {
          tank.alive = false; tank.hp = 0; tank.flash = 0; tank.replacementIn = 5;
        }
      }
      const offset = finite(war.positionOffset), count = finite(war.captures);
      const shift = offset - previous.positionOffset;
      if (count > previous.captures && Math.abs(shift) >= 1) {
        const team = shift > 0 ? 'ally' : 'enemy', direction = sign(team);
        const from = sector.x + previous.positionOffset - direction * 320;
        const to = sector.x + offset - direction * 320;
        for (const record of theatre.records.values()) {
          const point = record.sector;
          if (!controlsBand(sector, point) || direction * (point.x - from) <= 0 || direction * (to - point.x) < 0) continue;
          const node = theatre.territory.get(point.id);
          if (!node || (node.owner === team && !node.contested && point.owner === team)) continue;
          const previousOwner = point.owner;
          const result = applyAuthoritativeSectorControl({
            record, territoryNode: node, logistics: theatre.logistics, owner: team,
            revision: Math.max(0, finite(node.controlRevision)) + 1,
          });
          if (result.ok && result.changed) captures.push({
            type: 'territory-captured', sectorId: point.id, frontId: sector.id, team,
            previousOwner, owner: team, x: point.x, y: point.y, revision: result.revision,
            cutRoutes: [...result.cutRoutes], displacedAssets: result.displacedAssets,
          });
        }
        contextTick = -1;
      }
      previous.positionOffset = offset;
      previous.captures = count;
    }
    return captures;
  }

  migrate();
  return { beforeTick, afterTick };
}
