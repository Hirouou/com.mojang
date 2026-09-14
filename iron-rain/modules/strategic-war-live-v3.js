import { createStrategicHexMap, hexControl, neighboringHexIds } from './strategic-hex-map.js';
import { createTerritoryNode, receiveTerritoryDelivery, startTerritoryProject, startVehicleProduction, stepTerritoryDevelopment, territorySnapshot, DEVELOPMENT_PROJECTS } from './territory-development.js';
import { chooseTerritoryProject, chooseVehicleProduction, projectSupplyRequest, territoryOperationalEffects } from './territory-ai.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from './strategic-logistics.js';
import { strategicFrontPath } from './strategic-front-pressure.js';
import { applyAuthoritativeSectorControl } from './strategic-capture-state.js';
import { createPersistentWarClock } from './persistent-war-clock.js';
import { THEATRE_SIZE, lineSnapshot } from './theatre-control.js';
import { createConvoyPresentation } from './tactical-hex-interest.js';
import { earnedReconContacts, drawEarnedRecon, reconSourceLabel, reconContactLabel } from './war-recon-view.js';

const COLOR = Object.freeze({
  ally: '#4caef5',
  enemy: '#56b874',
  contested: '#c7a65e',
  neutral: '#858a83',
  ink: '#d8dfd3',
  dim: '#8e998b',
  paper: '#101712',
});
const STRUCTURE = Object.freeze({ outpost:'POSTO', depot:'DEPÓSITO', mortar:'MORTEIRO', bunker:'BUNKER', garage:'GARAGEM', factory:'FÁBRICA', armorWorks:'BLINDADOS' });
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const playerTeam = () => window.ironRainEntry?.faction === 'axis' ? 'enemy' : 'ally';
const ownerLabel = owner => owner === 'ally' ? 'ALIADOS' : owner === 'enemy' ? 'EIXO' : owner === 'contested' ? 'DISPUTADO' : 'NEUTRO';
const frontDistance = sector => Math.abs(sector.x - THEATRE_SIZE.w * .5);

export function knownSupplyRouteThreat({ team, destination, sources = [], logistics, snapshot } = {}) {
  if (!['ally', 'enemy'].includes(team) || !destination || !logistics || !snapshot) return 0;
  const routeIntel = new Map((snapshot.routes || []).filter(route => route.team === team).map(route => [route.id, route]));
  let best = null;
  for (const id of sources) {
    const source = logistics.getNode(id);
    if (!source || source.team !== team) continue;
    if (source.id === destination) return 0;
    const path = logistics.route(team, source.id, destination);
    if (!path) continue;
    const length = path.reduce((sum, leg) => sum + leg.distance, 0);
    const threat = path.reduce((highest, leg) => Math.max(highest, Number(routeIntel.get(leg.routeId)?.knownThreat) || 0), 0);
    if (!best || length < best.length) best = { length, threat };
  }
  return clamp(best?.threat || 0, 0, 1);
}

export function releaseTerminalConvoyFlight(inFlight, event) {
  if (!(inFlight instanceof Map) || !event?.convoyId || !['convoy-arrived', 'convoy-destroyed'].includes(event.type)) return false;
  let released = false;
  for (const [key, convoyId] of inFlight) {
    if (convoyId !== event.convoyId) continue;
    inFlight.delete(key);
    released = true;
  }
  return released;
}

export function makeTheatre(saved = null) {
  if (saved && saved.version !== 1) throw new Error('Unsupported strategic checkpoint; refusing to reset the war');
  const hexes = saved ? structuredClone(saved.hexes) : createStrategicHexMap().map(hex => ({ ...hex, sectors: hex.sectors.map(sector => ({ ...sector, structures: [] })) }));
  const records = new Map();
  for (const hex of hexes) for (const sector of hex.sectors) records.set(sector.id, { hex, sector });

  const territory = new Map();
  const logisticNodes = [];
  for (const { sector } of records.values()) {
    const owner = ['ally', 'enemy'].includes(sector.owner) ? sector.owner : null;
    const fd = frontDistance(sector), deepRear = fd > 21_500, rear = fd > 15_500, mid = fd > 8_500;
    const initialAssets = deepRear ? { trucks: 3, tanks: 1, troops: 72 } : rear ? { trucks: 1, troops: 14 } : {};
    const node = createTerritoryNode({ id: sector.id, owner, assets: initialAssets });
    node.contested = !owner;
    node.securedFor = node.contested ? 0 : deepRear ? 1_260 : rear ? 650 : mid ? 260 : 90;
    if (owner && mid) node.structures.push('outpost');
    if (owner && rear) node.structures.push('depot');
    if (owner && deepRear) node.structures.push('garage', 'factory', 'armorWorks');
    territory.set(sector.id, node);
    logisticNodes.push(createLogisticsNode({
      id: sector.id,
      team: owner,
      x: sector.x,
      y: sector.y,
      kind: rear ? 'depot' : mid ? 'outpost' : 'front',
      stock: deepRear ? { materials: 920, ammo: 310, fuel: 300 } : rear ? { materials: 110, ammo: 45, fuel: 55 } : {},
      assets: initialAssets,
    }));
  }

  const routes = [], seen = new Set();
  for (const hex of hexes) {
    const neighborIds = new Set(neighboringHexIds(hex, hexes));
    const pool = hexes.filter(candidate => candidate.id === hex.id || neighborIds.has(candidate.id)).flatMap(candidate => candidate.sectors);
    for (const sector of hex.sectors) {
      if (!['ally', 'enemy'].includes(sector.owner)) continue;
      const near = pool
        .filter(other => other.id !== sector.id && other.owner === sector.owner && distance(sector, other) < 7_600)
        .sort((a, b) => distance(sector, a) - distance(sector, b))
        .slice(0, 2);
      for (const other of near) {
        const key = [sector.id, other.id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        routes.push(createSupplyRoute({ id: `RT-${routes.length + 1}`, team: sector.owner, from: sector.id, to: other.id, distance: Math.round(distance(sector, other)) }));
      }
    }
  }

  if (saved) {
    territory.clear();
    for (const [id, node] of saved.territory) territory.set(id, structuredClone(node));
  }
  const logistics = createStrategicLogistics({ nodes: logisticNodes, routes, restore: saved?.logistics });
  const sources = logisticNodes.filter(node => node.kind === 'depot').map(node => node.id);
  const inFlight = new Map(saved?.inFlight || []);
  let economyRouteInfo = () => null;

  function routeIndex(current) {
    // One topology per economy tick, one shortest-path tree per source. Stocks
    // remain live below; only graph connectivity and earned route intel are
    // shared by the hundreds of development/supply queries in this tick.
    const graphs = new Map(), trees = new Map();
    const nodes = new Map(current.nodes.map(node => [node.id, node]));
    for (const route of current.routes) {
      const a = nodes.get(route.from), b = nodes.get(route.to);
      if (!route.open || !route.team || !a?.alive || !b?.alive || a.team !== route.team || b.team !== route.team) continue;
      if (!graphs.has(route.team)) graphs.set(route.team, new Map());
      const graph = graphs.get(route.team);
      if (!graph.has(route.from)) graph.set(route.from, []);
      if (!graph.has(route.to)) graph.set(route.to, []);
      graph.get(route.from).push({ id: route.to, route });
      graph.get(route.to).push({ id: route.from, route });
    }
    return (team, from, to) => {
      if (from === to) return { length: 0, threat: 0 };
      const key = `${team}:${from}`;
      if (!trees.has(key)) {
        const graph = graphs.get(team), tree = new Map(), best = new Map([[from, 0]]);
        const frontier = [{ id: from, cost: 0, length: 0, threat: 0 }];
        while (frontier.length) {
          frontier.sort((a, b) => a.cost - b.cost);
          const item = frontier.shift();
          if (tree.has(item.id)) continue;
          tree.set(item.id, { length: item.length, threat: item.threat });
          for (const edge of graph?.get(item.id) || []) {
            const threat = Number(edge.route.knownThreat) || 0;
            const cost = item.cost + edge.route.distance * (1 + threat);
            if ((best.get(edge.id) ?? Infinity) <= cost) continue;
            best.set(edge.id, cost);
            frontier.push({ id: edge.id, cost, length: item.length + edge.route.distance, threat: Math.max(item.threat, threat) });
          }
        }
        trees.set(key, tree);
      }
      return trees.get(key).get(to) || null;
    };
  }

  function supplyRouteThreat(team, destination) {
    let best = null;
    for (const id of sources) {
      const source = logistics.getNode(id);
      if (!source || source.team !== team) continue;
      if (id === destination) return 0;
      const path = economyRouteInfo(team, id, destination);
      if (path && (!best || path.length < best.length)) best = path;
    }
    return clamp(best?.threat || 0, 0, 1);
  }

  function rememberFlight(key, sent) {
    if (sent?.ok && sent.status !== 'arrived' && sent.convoyId) inFlight.set(key, sent.convoyId);
  }

  function wanted(node) {
    if (!node?.owner || node.contested || node.activeProject) return null;
    const missing = type => !node.structures.includes(type);
    const ready = type => node.securedFor >= DEVELOPMENT_PROJECTS[type].secureFor;
    if (missing('outpost') && ready('outpost')) return 'outpost';
    if (missing('depot') && ready('depot') && node.structures.includes('outpost')) return 'depot';
    if (missing('bunker') && ready('bunker') && node.structures.includes('outpost')) return 'bunker';
    if (missing('mortar') && ready('mortar') && node.structures.includes('outpost')) return 'mortar';
    if (missing('garage') && ready('garage') && node.structures.includes('depot')) return 'garage';
    if (missing('factory') && ready('factory') && node.structures.includes('depot') && node.structures.includes('garage')) return 'factory';
    if (missing('armorWorks') && ready('armorWorks') && node.structures.includes('garage') && node.structures.includes('factory')) return 'armorWorks';
    return null;
  }

  function sourceFor(team, destination, cargo = {}, assets = {}) {
    let best = null;
    for (const id of sources) {
      const source = logistics.getNode(id);
      if (!source || source.team !== team || source.id === destination) continue;
      if (!['materials', 'ammo', 'fuel'].every(key => (source.stock[key] || 0) >= (cargo[key] || 0))) continue;
      if (!['trucks', 'tanks', 'troops'].every(key => (source.assets?.[key] || 0) >= (assets[key] || 0))) continue;
      const path = economyRouteInfo(team, id, destination);
      if (!path) continue;
      const length = path.length;
      if (!best || length < best.length) best = { id, length };
    }
    return best?.id || null;
  }

  function nearestDepot(team, from) {
    let best = null;
    for (const id of sources) {
      if (id === from) continue;
      const source = logistics.getNode(id);
      if (!source || source.team !== team) continue;
      const path = economyRouteInfo(team, from, id);
      if (!path) continue;
      const length = path.length;
      if (!best || length < best.length) best = { id, length };
    }
    return best?.id || null;
  }

  function syncTerritoryAssets(node, endpoint) {
    if (!node?.assets || !endpoint?.assets) return;
    node.assets.trucks = endpoint.assets.trucks || 0;
    node.assets.tanks = endpoint.assets.tanks || 0;
    node.assets.troops = endpoint.assets.troops || 0;
  }

  function stageProducedVehicle(node, endpoint, type) {
    if (!type || !node?.assets || !endpoint?.assets) return;
    const key = type === 'tank' ? 'tanks' : type === 'truck' ? 'trucks' : null;
    if (!key) return;
    endpoint.assets[key] = Math.max(endpoint.assets[key] || 0, node.assets[key] || 0);
    node.assets[key] = endpoint.assets[key];
  }

  let economyAcc = 0;
  function step(seconds) {
    let elapsed = Math.min(8, Math.max(.1, seconds));
    for (const event of logistics.step(elapsed)) {
      releaseTerminalConvoyFlight(inFlight, event);
      if (event.type !== 'convoy-arrived') continue;
      const node = territory.get(event.to);
      if (node && event.cargo) receiveTerritoryDelivery(node, { team: event.team, cargo: event.cargo });
    }

    economyAcc += elapsed;
    if(economyAcc < 1)return;
    elapsed=economyAcc;economyAcc=0;
    const logisticsSnapshot = logistics.snapshot();
    // Rebuild after movement/events so capture, route cuts, repair and expiring
    // threat reports cannot survive in a cache from the previous simulation tick.
    economyRouteInfo = routeIndex(logisticsSnapshot);
    for (const [id, node] of territory) {
      const record = records.get(id), endpoint = logistics.getNode(id);
      if (!record || !endpoint) continue;
      syncTerritoryAssets(node, endpoint);
      const routeOpen = Boolean(node.owner && sources.some(sourceId => {
        const source = logistics.getNode(sourceId);
        return source?.team === node.owner && (sourceId === id || Boolean(economyRouteInfo(node.owner, sourceId, id)));
      }));
      const development = stepTerritoryDevelopment(node, elapsed, { routeOpen, contested: node.contested });
      stageProducedVehicle(node, endpoint, development?.vehicleBuilt);
      record.sector.structures = [...node.structures];
      if (!node.owner || node.contested) continue;

      const effects = territoryOperationalEffects(node);
      const pressure = clamp((1 - frontDistance(record.sector) / 15_000) * (.75 - effects.defensiveCover), 0, 1);
      const routeThreat = supplyRouteThreat(node.owner, id);
      const projectPlan = chooseTerritoryProject(node, {
        routeOpen,
        routeThreat,
        frontPressure: pressure,
        infantryThreat: pressure,
        armorThreat: pressure * .82,
        armorDemand: pressure,
      });
      if (projectPlan) {
        startTerritoryProject(node, projectPlan.type);
        continue;
      }

      const vehiclePlan = chooseVehicleProduction(node, {
        routeOpen,
        frontPressure: pressure,
        infantryThreat: pressure,
        armorThreat: pressure * .9,
        armorDemand: pressure,
        logisticsDeficit: endpoint.assets.trucks < 2 ? .8 : .1,
        reinforcementNeed: frontDistance(record.sector) < 10_500 ? .7 : .2,
      });
      if (vehiclePlan) startVehicleProduction(node, vehiclePlan.type);

      const type = wanted(node);
      const supplyKey = `supply:${id}`;
      if (type && !inFlight.has(supplyKey)) {
        const request = projectSupplyRequest(node, type);
        if (request) {
          const source = sourceFor(node.owner, id, request.cargo, { trucks: 1 });
          if (source) {
            const sent = logistics.dispatch({ team: node.owner, from: source, to: id, cargo: request.cargo, assets: { trucks: 1 }, kind: 'supply', speed: 55 });
            if (sent.ok && sent.status === 'arrived') receiveTerritoryDelivery(node, { team: node.owner, cargo: request.cargo });
            else rememberFlight(supplyKey, sent);
          }
        }
      }

      const fd = frontDistance(record.sector);
      if (fd < 11_500) {
        const troopKey = `troops:${id}`;
        if ((endpoint.assets.troops || 0) < 18 && !inFlight.has(troopKey)) {
          const source = sourceFor(node.owner, id, {}, { troops: 18, trucks: 1 });
          if (source) rememberFlight(troopKey, logistics.dispatch({ team: node.owner, from: source, to: id, assets: { troops: 18, trucks: 1 }, kind: 'troops', speed: 60 }));
        }
        const armorKey = `armor:${id}`;
        if (pressure > .2 && (endpoint.assets.tanks || 0) < 1 && !inFlight.has(armorKey)) {
          const source = sourceFor(node.owner, id, {}, { tanks: 1 });
          if (source) rememberFlight(armorKey, logistics.dispatch({ team: node.owner, from: source, to: id, assets: { tanks: 1 }, kind: 'armor', speed: 38 }));
        }
      }

      const returnKey = `return:${id}`;
      if (endpoint.kind !== 'depot' && (endpoint.assets.trucks || 0) > 0 && !inFlight.has(returnKey) && fd < 13_500) {
        const depot = nearestDepot(node.owner, id);
        if (depot) rememberFlight(returnKey, logistics.dispatch({ team: node.owner, from: id, to: depot, assets: { trucks: 1 }, kind: 'return', speed: 62 }));
      }
    }
  }

  // Durable state is separate from immutable presentation snapshots. Keep
  // convoy progress and pending delivery IDs so restart never duplicates cargo.
  const snapshot = () => structuredClone({ version: 1, hexes, territory: [...territory], logistics: logistics.exportState(), inFlight: [...inFlight] });
  return { hexes, records, territory, logistics, step, snapshot };
}

function installStyles() {
  if (document.getElementById('strategicWarLiveStyles')) return;
  const style = document.createElement('style');
  style.id = 'strategicWarLiveStyles';
  style.textContent = `
.strategic-war-btn{position:fixed;left:calc(12px + var(--safeL,0px));top:calc(66px + var(--safeT,0px));z-index:46;border:1px solid #8da78b66;background:#101812e8;color:#d8dfd3;padding:9px 12px;font:700 10px/1 system-ui;letter-spacing:1.2px;border-radius:3px;box-shadow:0 4px 14px #0008}
.strategic-war{position:fixed;inset:0;z-index:120;background:#07100b;color:#d8dfd3;display:grid;grid-template-rows:auto 1fr;font-family:system-ui,sans-serif}.strategic-war.hidden{display:none}
.strategic-war header{display:grid;grid-template-columns:minmax(260px,1fr) auto minmax(260px,1fr);align-items:center;padding:9px 12px;border-bottom:1px solid #9caa8750;background:linear-gradient(180deg,#121c15,#0b120d)}
.strategic-war-title b{font-size:14px;letter-spacing:1.4px}.strategic-war-title small{display:block;color:#9ba596;font-size:8px;margin-top:2px}.strategic-war-balance{display:flex;gap:14px;align-items:center;font-size:9px;letter-spacing:.7px}.strategic-war-balance strong{font-size:15px}.strategic-war-balance .ally{color:#69c4ff}.strategic-war-balance .enemy{color:#73d08e}.strategic-war header button{justify-self:end;border:1px solid #a8b29b55;background:#1b241d;color:#dfe6db;padding:8px 10px}
.strategic-war-main{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 285px}.strategic-war-map{position:relative;min-height:0;background:#0b130e;overflow:hidden}.strategic-war canvas{width:100%;height:100%;display:block;touch-action:none}.strategic-war-locate{position:absolute;left:10px;bottom:10px;z-index:2;max-width:360px;padding:8px 10px;border:1px solid #b9c8a941;background:#0b120de8;box-shadow:0 5px 18px #0008}.strategic-war-locate b{display:block;color:#f0f3e8;font-size:11px}.strategic-war-locate small{color:#9da99a;font-size:8px;letter-spacing:.6px}.strategic-war-locate button{margin-top:6px;border:1px solid #9ba88b55;background:#18231a;color:#dfe5d9;padding:5px 8px;font-size:8px}
.strategic-war-side{padding:12px;overflow:auto;border-left:1px solid #9caa8738;background:#0b120d}.strategic-war-side h3{font-size:12px;letter-spacing:.8px;margin:0 0 8px}.strategic-war-side p{font-size:10px;line-height:1.5;color:#b7c0b3}.strategic-war-side strong{color:#eef2e9}.war-kpis{display:grid;grid-template-columns:1fr 1fr;gap:5px}.war-kpis div{padding:7px;border:1px solid #91a08b38;background:#151d17}.war-kpis b{display:block;font-size:14px}.war-kpis small{font-size:7px;color:#919d8d}.war-legend{font-size:8px;margin:9px 0;display:flex;gap:8px;flex-wrap:wrap}.war-legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:3px}.war-rule{height:1px;background:#95a58b28;margin:10px 0}.map-location-chip{display:inline-block;margin-left:9px;padding:3px 6px;border:1px solid #635f49;color:#5f5a3d;background:#ded1a5;font:700 7px/1.1 system-ui;letter-spacing:.55px;vertical-align:middle}
@media(max-width:720px){.strategic-war header{grid-template-columns:1fr auto}.strategic-war-balance{grid-column:1/-1;grid-row:2;justify-content:center;padding-top:5px}.strategic-war-main{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) 160px}.strategic-war-side{border-left:0;border-top:1px solid #9caa8738;padding:8px 10px}.war-kpis{display:flex}.strategic-war-btn{top:calc(58px + var(--safeT,0px));padding:8px 9px}.strategic-war-locate{max-width:calc(100% - 20px)}}`;
  document.head.appendChild(style);
}

function hexPath(ctx, x, y, radius) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function parseMamutePosition() {
  const text = document.getElementById('ownCoord')?.textContent || '';
  const match = text.match(/X\s*(\d+)\s*Y\s*(\d+)/i);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

export function installNotebookBridge(locate) {
  const notebook = document.getElementById('notebook');
  if (!notebook) return () => {};
  const update = () => {
    const title = notebook.querySelector('.map-head-title');
    if (!title) return;
    let chip = title.querySelector('.map-location-chip');
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'map-location-chip';
      title.appendChild(chip);
    }
    const position = parseMamutePosition();
    const current = position && locate(position);
    const label = current ? `TEATRO: ${current.hex.name} / ${current.sector.name}` : 'TEATRO: LOCALIZAÇÃO INDISPONÍVEL';
    if (chip.textContent !== label) chip.textContent = label;
  };
  const observer = new MutationObserver(update);
  observer.observe(notebook, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
  const own = document.getElementById('ownCoord');
  if (own) observer.observe(own, { childList: true, characterData: true, subtree: true });
  update();
  return () => observer.disconnect();
}

export function installStrategicWarLive({ app = document.getElementById('app') } = {}) {
  if (!app || document.getElementById('strategicWarBtn')) return null;
  installStyles();
  const serverRuntime=globalThis.ironRainEntry?.runtime?.isAuthoritativeClient?globalThis.ironRainEntry.runtime:null;
  function clientTheatre(data = {}) {
    const hexes = data.hexes || createStrategicHexMap();
    const records = new Map(hexes.flatMap(hex => hex.sectors.map(sector => [sector.id, { hex, sector }])));
    const logistics = data.logistics || { nodes: [], routes: [], convoys: [] };
    const nodes = new Map((logistics.nodes || []).map(node => [node.id, node]));
    return { hexes, records, territory: new Map(data.territory || []), summary: data.summary,
      logistics: { snapshot: () => logistics, getNode: id => nodes.get(String(id)) || null } };
  }
  // The authoritative client only holds projections; it does not seed a second economy.
  let theatre = serverRuntime ? clientTheatre(serverRuntime.snapshot()?.strategic) : makeTheatre();
  const convoyPresentation = createConvoyPresentation({ limit: 192 });
  const button = document.createElement('button');
  button.id = 'strategicWarBtn';
  button.className = 'menu-war-map';
  button.type = 'button';
  button.textContent = '▦ GUERRA';
  (document.querySelector('.menu-grid')||document.body).appendChild(button);

  const root = document.createElement('section');
  root.className = 'strategic-war hidden';root.dataset.canonicalNavigation='1';
  root.innerHTML = `<header>
    <div class="strategic-war-title"><b>TEATRO ESTRATÉGICO</b><small>REGIÕES · SETORES · IA · LOGÍSTICA · INTEL</small></div>
    <div class="strategic-war-balance" data-balance></div>
    <button type="button" data-close>VOLTAR AO MAMUTE ×</button>
  </header>
  <nav class="war-map-toolbar" aria-label="Navegação do mapa"><span>ARRASTE PARA MOVER · PINÇA PARA ZOOM</span><button data-map-out aria-label="Diminuir zoom">−</button><button data-map-center>MEU MAMUTE</button><button data-map-in aria-label="Aumentar zoom">+</button><button data-map-details>SETOR</button></nav>
  <div class="strategic-war-main">
    <div class="strategic-war-map"><canvas aria-label="Mapa estratégico da guerra"></canvas></div>
    <aside class="strategic-war-side">
      <div class="war-kpis" data-kpis></div>
      <div class="war-legend"><span><i style="background:${COLOR.ally}"></i>ALIADOS</span><span><i style="background:${COLOR.enemy}"></i>EIXO</span><span><i style="background:${COLOR.neutral}"></i>NEUTRO</span><span><i style="background:${COLOR.contested}"></i>DISPUTADO</span></div>
      <div class="war-rule"></div>
      <div data-recon aria-live="polite"></div>
      <div data-detail><h3>MAPA DA GUERRA</h3><p>Selecione um setor. Regiões grandes contêm sete setores. A linha tracejada é a frente contínua; a faixa cinza/amarela é terra neutra e disputada.</p></div>
    </aside>
  </div><div class="war-location-bar" data-locate></div>`;
  document.body.appendChild(root);

  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const detail = root.querySelector('[data-detail]');
  const kpis = root.querySelector('[data-kpis]');
  const balance = root.querySelector('[data-balance]');
  const locateBox = root.querySelector('[data-locate]');
  const reconBox = root.querySelector('[data-recon]');
  let open = false, selected = null, width = 1, height = 1, dpr = 1, raf = 0;

  const view = { scale: 1, ox: 0, oy: 0 };
  function fitView() {
    const pad = 34;
    view.scale = Math.min((width - pad * 2) / THEATRE_SIZE.w, (height - pad * 2) / THEATRE_SIZE.h);
    view.ox = (width - THEATRE_SIZE.w * view.scale) / 2;
    view.oy = (height - THEATRE_SIZE.h * view.scale) / 2;
  }
  const toScreen = point => ({ x: view.ox + point.x * view.scale, y: view.oy + point.y * view.scale });
  const toWorld = point => ({ x: (point.x - view.ox) / view.scale, y: (point.y - view.oy) / view.scale });
  const scaled = metres => metres * view.scale;

  function locate(position) {
    if (!position) return null;
    let bestHex = null, bestHexDistance = Infinity;
    for (const hex of theatre.hexes) {
      const current = distance(position, hex);
      if (current < bestHexDistance) { bestHex = hex; bestHexDistance = current; }
    }
    if (!bestHex) return null;
    let bestSector = bestHex.sectors[0], bestSectorDistance = Infinity;
    for (const sector of bestHex.sectors) {
      const current = distance(position, sector);
      if (current < bestSectorDistance) { bestSector = sector; bestSectorDistance = current; }
    }
    return { hex: bestHex, sector: bestSector, position, insideRegion: bestHexDistance <= bestHex.radius * 1.04 };
  }

  function claimAsset(sectorId, team, type, count = 1) {
    if(serverRuntime)return false;
    const id = String(sectorId ?? ''), amount = Math.max(1, Math.floor(Number(count) || 1));
    if (!id || !['ally', 'enemy'].includes(team) || !['trucks', 'tanks', 'troops'].includes(type)) return false;
    const endpoint = theatre.logistics.getNode(id);
    if (!endpoint?.alive || endpoint.team !== team || (endpoint.assets?.[type] || 0) < amount) return false;
    endpoint.assets[type] -= amount;
    const node = theatre.territory.get(id);
    if (node?.assets) node.assets[type] = endpoint.assets[type];
    return true;
  }

  function assetCount(sectorId, team, type) {
    const endpoint = theatre.logistics.getNode(String(sectorId ?? ''));
    if (!endpoint?.alive || endpoint.team !== team) return 0;
    return Math.max(0, Number(endpoint.assets?.[type]) || 0);
  }

  function combatReserveContext(sectorId, team) {
    const id = String(sectorId ?? '');
    if (!id || !['ally', 'enemy'].includes(team)) return null;
    const node = theatre.territory.get(id);
    const endpoint = theatre.logistics.getNode(id);
    if (!node || node.owner !== team || !endpoint?.alive || endpoint.team !== team) return null;
    return Object.freeze({
      strategicLogistics: theatre.logistics,
      territory: territorySnapshot(node),
      to: id,
      assetCount: type => assetCount(id, team, type),
      claimAsset: (type, count = 1) => claimAsset(id, team, type, count),
    });
  }

  function applySectorControl({ sectorId, owner, contested = false, revision } = {}) {
    if(serverRuntime)return Object.freeze({ok:false,reason:'server-authority'});
    const id = String(sectorId ?? '');
    const record = theatre.records.get(id);
    const territoryNode = theatre.territory.get(id);
    if (!record || !territoryNode) return Object.freeze({ ok: false, changed: false, reason: 'unknown-sector' });
    const result = applyAuthoritativeSectorControl({
      record,
      territoryNode,
      logistics: theatre.logistics,
      owner,
      contested,
      revision,
    });
    if (result.ok && result.changed) {
      updatePanels();
      if (open) draw();
    }
    return result;
  }

  window.ironRainStrategicMap = Object.freeze({ locate, combatReserveContext, claimAsset, assetCount, applySectorControl, open: () => setOpen(true) });
  const stopNotebookBridge = installNotebookBridge(locate);
  let lastStrategic = null;
  const offServer = serverRuntime?.subscribeSnapshots(snapshot=>{
    if(!snapshot.strategic || snapshot.strategic === lastStrategic)return;
    lastStrategic = snapshot.strategic;
    theatre = clientTheatre(snapshot.strategic);
    if(open)updatePanels();
  });
  const warClock = createPersistentWarClock({ stepSeconds: .25, maxCatchUpSeconds: 5 });
  const strategicTimer = setInterval(() => {
    if(serverRuntime)return;
    const advance = warClock.advance();
    for (let i = 0; i < advance.ticks; i++) theatre.step(advance.stepSeconds);
    if (advance.ticks && open) { updatePanels(); draw(); }
  }, 100);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    width = rect.width; height = rect.height; dpr = Math.min(1.5, devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fitView();
  }

  function currentLocation() {
    return locate(serverRuntime?.snapshot()?.mamute?.robot || globalThis.ironRainWarBridge?.position || parseMamutePosition());
  }

  function reconContacts() {
    const snapshot = serverRuntime?.snapshot(), bridge = globalThis.ironRainWarBridge;
    return earnedReconContacts(snapshot?.recon || bridge?.recon, { team: playerTeam(), now: Number(snapshot?.time ?? bridge?.time) || 0 });
  }

  function updateReconPanel(contacts = reconContacts()) {
    const relevant = selected ? contacts.filter(contact => locate(contact)?.sector.id === selected) : contacts;
    const shown = relevant.slice(0, 6);
    reconBox.innerHTML = `<h3>RÁDIO / RECONHECIMENTO</h3>${shown.length ? `<p>${shown.map(contact => `<strong>${reconContactLabel(contact)}</strong>${contact.count > 1 ? ` ×${contact.count}` : ''} · ${reconSourceLabel(contact.source)} · ${Math.floor(contact.age)}s<br><small>Última posição: ${Math.round(contact.x)} / ${Math.round(contact.y)}</small>`).join('<br>')}</p>` : '<p>Sem contato recente confirmado neste setor.</p>'}<p>◇ Última observação recebida. Aproxime o mapa para ver origem e idade.</p><div class="war-rule"></div>`;
  }

  function updatePanels() {
    const current = currentLocation();
    const nodes = [...theatre.territory.values()].map(territorySnapshot);
    const counts = { ally: 0, enemy: 0, neutral: 0, contested: 0 };
    for (const { sector } of theatre.records.values()) counts[sector.owner] = (counts[sector.owner] || 0) + 1;
    const total = Math.max(1, counts.ally + counts.enemy + counts.neutral + counts.contested);
    const allyPct = Math.round(counts.ally / total * 100), enemyPct = Math.round(counts.enemy / total * 100);
    balance.innerHTML = `<span class="ally"><strong>${allyPct}%</strong> ALIADOS</span><span>${counts.neutral} neutros · ${counts.contested} disputados</span><span class="enemy">EIXO <strong>${enemyPct}%</strong></span>`;

    const t = playerTeam();
    const mine = nodes.filter(node => node.owner === t);
    const logistics = theatre.logistics.snapshot();
    const convoys = (logistics.convoys || []).filter(convoy => convoy.team === t && ['moving', 'blocked'].includes(convoy.status));
    const tanks = logistics.nodes.filter(node => node.team === t).reduce((sum, node) => sum + (node.assets?.tanks || 0), 0);
    const troops = logistics.nodes.filter(node => node.team === t).reduce((sum, node) => sum + (node.assets?.troops || 0), 0);
    const summary = theatre.summary?.[t];
    kpis.innerHTML = `<div><b>${summary?.sectors ?? mine.length}</b><small>SETORES DA FACÇÃO</small></div><div><b>${summary?.convoys ?? convoys.length}</b><small>COMBOIOS</small></div><div><b>${summary?.tanks ?? tanks}</b><small>BLINDADOS EM ESTOQUE</small></div><div><b>${summary?.troops ?? troops}</b><small>REFORÇOS EM TRÂNSITO/BASE</small></div>`;

    if (current) {
      locateBox.innerHTML = `<small>POSIÇÃO ATUAL DO M-47</small><b>★ ${current.hex.name} · ${current.sector.name}</b><small>X ${Math.round(current.position.x).toString().padStart(5, '0')} · Y ${Math.round(current.position.y).toString().padStart(5, '0')}</small><br><button type="button" data-select-current>SELECIONAR MEU SETOR</button>`;
      locateBox.querySelector('[data-select-current]')?.addEventListener('click', () => { selected = current.sector.id; updatePanels(); });
    } else locateBox.innerHTML = `<small>POSIÇÃO ATUAL DO M-47</small><b>AGUARDANDO COORDENADAS</b>`;

    if (!selected && current) selected = current.sector.id;
    updateReconPanel();
    if (!selected) return;
    const record = theatre.records.get(selected);
    const rawNode = theatre.territory.get(selected);
    const node = rawNode ? territorySnapshot(rawNode) : null;
    const endpoint = theatre.logistics.getNode(selected);
    if (!record || !node) return;
    const relation = current?.hex.id === record.hex.id ? '<strong>VOCÊ ESTÁ NESTA REGIÃO</strong><br>' : '';
    const control = hexControl(record.hex);
    if (!node.owner) {
      detail.innerHTML = `<h3>${record.hex.name} / ${record.sector.name}</h3><p>${relation}<strong>${ownerLabel(record.sector.owner)}</strong> · região ${ownerLabel(control)}.</p><p>Área sem domínio consolidado. Pode virar corredor de avanço, zona de contato ou objetivo de captura. Não há estoque mágico enquanto o setor não estiver ligado a uma rede logística válida.</p>`;
      return;
    }
    if (node.owner !== t) {
      detail.innerHTML = `<h3>${record.hex.name} / ${record.sector.name}</h3><p>${relation}<strong>${ownerLabel(record.sector.owner)}</strong> · região ${ownerLabel(control)}.</p><p>Estoque, obras e comboios inimigos permanecem ocultos sem inteligência válida.</p>`;
      return;
    }
    const structures = node.structures.length ? node.structures.map(type => STRUCTURE[type] || type).join(' · ') : 'nenhuma';
    const effects = territoryOperationalEffects(node);
    detail.innerHTML = `<h3>${record.hex.name} / ${record.sector.name}</h3><p>${relation}<strong>${ownerLabel(node.owner)}</strong> · região ${ownerLabel(control)}<br>Estruturas: <strong>${structures}</strong><br>Obra: <strong>${node.activeProject ? STRUCTURE[node.activeProject] || node.activeProject : '—'}</strong><br>Produção: <strong>${node.vehicleProduction ? node.vehicleProduction.toUpperCase() : '—'}</strong><br>MAT ${Math.round(node.stock.materials)} · MUN ${Math.round(node.stock.ammo)} · COMB ${Math.round(node.stock.fuel)}<br>CAM ${endpoint?.assets?.trucks || 0} · TAN ${endpoint?.assets?.tanks || 0} · REF ${endpoint?.assets?.troops || 0}<br>Defesa ${Math.round(effects.defensiveCover * 100)}% · reforço ${Math.round(effects.reinforcementSupport * 100)}%</p>`;
  }

  function drawTerrain() {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#101c17'); gradient.addColorStop(.52, '#182019'); gradient.addColorStop(1, '#0c1711');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.globalAlpha = .11; ctx.strokeStyle = '#b9c4aa'; ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      for (let x = 0; x <= THEATRE_SIZE.w; x += 2_000) {
        const y = 2_000 + i * 3_800 + Math.sin(x / 8_500 + i * .77) * 1_000;
        const p = toScreen({ x, y }); x ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFront() {
    const fallback = lineSnapshot();
    const line = strategicFrontPath({
      sectors: [...theatre.records.values()].map(({ sector }) => sector),
      width: THEATRE_SIZE.w,
      height: THEATRE_SIZE.h,
      fallback,
    });
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#c7a65e22'; ctx.lineWidth = Math.max(8, scaled(10_500));
    ctx.beginPath(); line.forEach((point, index) => { const p = toScreen(point); index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.stroke();
    ctx.strokeStyle = '#eee4c688'; ctx.lineWidth = 1.3; ctx.setLineDash([7, 6]);
    ctx.beginPath(); line.forEach((point, index) => { const p = toScreen(point); index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.stroke();
    ctx.restore();
  }

  function drawConvoy(convoy, p, angle) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    const blocked = convoy.status === 'blocked';
    ctx.fillStyle = blocked ? '#e1ad55' : '#f1e9c9';
    ctx.strokeStyle = '#0b120d';
    ctx.lineWidth = 1;
    if (convoy.kind === 'armor') {
      ctx.fillRect(-6, -3, 10, 6);
      ctx.fillRect(-1, -5, 5, 4);
      ctx.fillRect(3, -1, 7, 2);
      ctx.strokeRect(-6, -3, 10, 6);
    } else {
      ctx.fillRect(-6, -3, 9, 6);
      ctx.fillRect(3, -2, 4, 5);
      ctx.strokeRect(-6, -3, 13, 6);
      ctx.beginPath(); ctx.arc(-3, 4, 1.5, 0, Math.PI * 2); ctx.arc(4, 4, 1.5, 0, Math.PI * 2); ctx.fill();
      if (convoy.kind === 'troops') {
        ctx.fillStyle = '#d4c68f';
        ctx.beginPath(); ctx.arc(-2, -5, 1.5, 0, Math.PI * 2); ctx.arc(2, -5, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function draw(dt = 0) {
    drawTerrain();
    drawFront();
    const t = playerTeam(), logistics = theatre.logistics.snapshot();

    for (const route of logistics.routes) {
      if (route.team !== t || !route.open) continue;
      const a = theatre.records.get(route.from)?.sector, b = theatre.records.get(route.to)?.sector;
      if (!a || !b) continue;
      const A = toScreen(a), B = toScreen(b);
      ctx.strokeStyle = '#d8e0d12a'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    const current = currentLocation();
    for (const hex of theatre.hexes) {
      const p = toScreen(hex), control = hexControl(hex), color = COLOR[control] || COLOR.neutral;
      const radius = scaled(hex.radius) * .985;
      hexPath(ctx, p.x, p.y, radius);
      ctx.fillStyle = color + (current?.hex.id === hex.id ? '36' : '20'); ctx.fill();
      ctx.strokeStyle = current?.hex.id === hex.id ? '#f5f2d9' : color + 'a8';
      ctx.lineWidth = current?.hex.id === hex.id ? 2.4 : control === 'contested' ? 1.6 : 1;
      ctx.stroke();
      ctx.fillStyle = current?.hex.id === hex.id ? '#fff8d9' : '#d6ddd0c5';
      ctx.textAlign = 'center'; ctx.font = `${current?.hex.id === hex.id ? '800' : '700'} 9px system-ui`;
      if(radius>35)ctx.fillText(hex.name, p.x, p.y - Math.max(8, radius * .12));

      ctx.strokeStyle = color + '36'; ctx.lineWidth = .7;
      for (let i = 1; i < hex.sectors.length; i++) {
        const s = toScreen(hex.sectors[i]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
    }

    for (const { sector } of theatre.records.values()) {
      const p = toScreen(sector), isSelected = selected === sector.id;
      ctx.beginPath(); ctx.arc(p.x, p.y, isSelected ? 5.4 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = COLOR[sector.owner] || COLOR.neutral; ctx.fill();
      ctx.strokeStyle = isSelected ? '#fff' : '#0b120d'; ctx.lineWidth = isSelected ? 1.5 : .8; ctx.stroke();
    }

    const localLogistics = serverRuntime?.snapshot()?.localLogistics;
    const traffic = new Map((logistics.convoys || []).map(convoy => [convoy.id, convoy]));
    for (const convoy of localLogistics?.convoys || []) traffic.set(convoy.id, convoy);
    const visibleTraffic = [...traffic.values()].filter(convoy => {
      if (convoy.team !== t || !['moving', 'blocked'].includes(convoy.status) || !convoy.position) return false;
      const p = toScreen(convoy.position); return p.x > -20 && p.y > -20 && p.x < width + 20 && p.y < height + 20;
    });
    for (const convoy of convoyPresentation.step(visibleTraffic, dt)) {
      const p = toScreen(convoy.position);
      drawConvoy(convoy, p, Number(convoy.position.heading) || 0);
    }

    drawEarnedRecon(ctx, reconContacts(), { toScreen, scale: view.scale, hexes: theatre.hexes, width, height });

    for(const m of serverRuntime?.snapshot()?.mamutes||[]){
      if(m.id===serverRuntime.snapshot()?.mamute?.id)continue;
      const p=toScreen(m.robot);ctx.fillStyle=m.faction===globalThis.ironRainEntry?.faction?'#71c3ff':'#ed8070';ctx.fillRect(p.x-4,p.y-4,8,8);ctx.font='9px monospace';ctx.fillText(m.name,p.x,p.y-9);
    }
    if (current) {
      const p = toScreen(current.position);
      ctx.save(); ctx.translate(p.x, p.y); ctx.strokeStyle = '#fff5c8'; ctx.fillStyle = '#fff5c8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.8 : 7;
        const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }

  let drawnAt=0, panelAt=0;
  function frame(at=0) {
    if (!open) return;
    if(at-drawnAt>=33){draw(Math.min(.25, Math.max(0, (at-drawnAt)/1000)));drawnAt=at;}
    if(at-panelAt>=1000){updateReconPanel();panelAt=at;}
    raf = requestAnimationFrame(frame);
  }

  function setOpen(next) {
    open = Boolean(next);
    root.classList.toggle('hidden', !open);
    if (open) {
      resize(); updatePanels();
      cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    } else cancelAnimationFrame(raf);
  }

  button.addEventListener('click', () => {document.getElementById('resumeBtn')?.click();setOpen(true);});
  root.querySelector('[data-close]').addEventListener('click', () => setOpen(false));
  const pointers=new Map();let gesture=null;
  const localPoint=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  function zoomAt(factor,anchor={x:width/2,y:height/2}){
    const before=toWorld(anchor),fit=Math.min((width-68)/THEATRE_SIZE.w,(height-68)/THEATRE_SIZE.h);
    view.scale=clamp(view.scale*factor,Math.max(.0001,fit*.8),fit*9);view.ox=anchor.x-before.x*view.scale;view.oy=anchor.y-before.y*view.scale;draw();
  }
  root.querySelector('[data-map-in]').onclick=()=>zoomAt(1.3);
  root.querySelector('[data-map-out]').onclick=()=>zoomAt(1/1.3);
  root.querySelector('[data-map-center]').onclick=()=>{const position=parseMamutePosition();fitView();if(position){view.scale*=2;view.ox=width/2-position.x*view.scale;view.oy=height/2-position.y*view.scale;}draw();};
  root.querySelector('[data-map-details]').onclick=()=>{root.classList.toggle('show-details');resize();draw();};
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoomAt(Math.exp(-clamp(e.deltaY,-150,150)*.003),localPoint(e));},{passive:false});
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();const p=localPoint(e);pointers.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);gesture={start:p,last:p,moved:false};if(pointers.size===2){const [a,b]=[...pointers.values()];gesture={moved:true,pinch:Math.hypot(a.x-b.x,a.y-b.y)};}});
  canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;e.preventDefault();const p=localPoint(e),old=pointers.get(e.pointerId);pointers.set(e.pointerId,p);if(pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(gesture.pinch>0)zoomAt(d/gesture.pinch,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});gesture.pinch=d;gesture.moved=true;}else{view.ox+=p.x-old.x;view.oy+=p.y-old.y;if(gesture.start&&Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>6)gesture.moved=true;draw();}});
  function releasePointer(e){
    if(!pointers.has(e.pointerId))return;
    if(e.type==='pointerup'&&pointers.size===1&&gesture&&!gesture.moved){const world=toWorld(localPoint(e));let best=null,bestDistance=Infinity;for(const {sector} of theatre.records.values()){const d=distance(world,sector);if(d<bestDistance){best=sector;bestDistance=d;}}if(best&&bestDistance<4600){selected=best.id;updatePanels();}}
    pointers.delete(e.pointerId);gesture=pointers.size?{moved:true}:null;try{canvas.releasePointerCapture(e.pointerId);}catch{}draw();
  }
  canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);
  addEventListener('resize', () => { if (open) { resize(); draw(); } });

  return Object.freeze({
    open: () => setOpen(true),
    close: () => setOpen(false),
    locate,
    applySectorControl,
    destroy() { offServer?.();clearInterval(strategicTimer); setOpen(false); stopNotebookBridge(); button.remove(); root.remove(); delete window.ironRainStrategicMap; },
  });
}
