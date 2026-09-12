import './integration-live.js';
import { installMobileUXReview } from './mobile-ux-review.js';
import { installStrategicWarLive as installBaseStrategicWarLive } from './strategic-war-live-v2.js';
import { createStrategicHexMap, hexControl } from './strategic-hex-map.js';
import { THEATRE_SIZE, controlLineX } from './theatre-control.js';

const hexes = createStrategicHexMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const playerTeam = () => globalThis.ironRainEntry?.faction === 'axis' ? 'enemy' : 'ally';
const ownerLabel = owner => owner === 'ally' ? 'ALIADOS' : owner === 'enemy' ? 'EIXO' : owner === 'contested' ? 'DISPUTADO' : 'NEUTRO';

function parseOwnPosition() {
  const text = document.getElementById('ownCoord')?.textContent || '';
  const match = text.match(/X\s*(\d+)\s*Y\s*(\d+)/i);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function locate(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  let hex = null, hexDistance = Infinity;
  for (const candidate of hexes) {
    const current = distance(point, candidate);
    if (current < hexDistance) { hex = candidate; hexDistance = current; }
  }
  if (!hex) return null;
  let sector = hex.sectors[0] || null, sectorDistance = Infinity;
  for (const candidate of hex.sectors) {
    const current = distance(point, candidate);
    if (current < sectorDistance) { sector = candidate; sectorDistance = current; }
  }
  const distanceToFront = Math.abs(point.x - controlLineX(point.y));
  const owner = sector?.owner || 'neutral';
  const team = playerTeam();
  const zone = owner === 'contested' || distanceToFront <= 1_350 ? 'LINHA DE FRENTE' : owner === 'neutral' ? 'TERRA DE NINGUÉM' : owner === team && distanceToFront > 5_250 ? 'RETAGUARDA SEGURA' : owner === team ? 'ZONA DE APOIO' : 'TERRITÓRIO INIMIGO';
  return { hex, sector, owner, zone, distanceToFront, insideRegion: hexDistance <= hex.radius * 1.04 };
}

function ensureStyle() {
  if (document.getElementById('strategicWorldSyncStyle')) return;
  const style = document.createElement('style');
  style.id = 'strategicWorldSyncStyle';
  style.textContent = `
.strategic-world-marker{position:absolute;z-index:8;width:22px;height:22px;transform:translate(-50%,-50%);border:2px solid #fff4b7;border-radius:50%;box-shadow:0 0 0 2px #111a,0 0 14px #fff4b766;pointer-events:none}
.strategic-world-marker::after{content:'★';position:absolute;inset:0;display:grid;place-items:center;color:#fff4b7;font-size:12px;line-height:1}
.strategic-world-location{position:absolute;z-index:8;left:10px;bottom:10px;max-width:390px;padding:8px 10px;background:#09100be8;border:1px solid #b7c4a94a;box-shadow:0 5px 16px #0009;pointer-events:none}
.strategic-world-location b{display:block;font:800 11px/1.3 system-ui;color:#f4f0d2}.strategic-world-location small{display:block;margin-top:2px;font:700 8px/1.35 system-ui;color:#aeb9aa;letter-spacing:.45px}.strategic-world-location em{display:inline-block;margin-top:5px;padding:3px 5px;border:1px solid #c5ad6c55;color:#d9c282;font:800 8px/1 system-ui;font-style:normal;letter-spacing:.6px}
.strategic-real-front{position:absolute;z-index:7;width:10px;height:10px;transform:translate(-50%,-50%) rotate(45deg);background:#d4aa57;border:1px solid #f4d58d;box-shadow:0 0 8px #d4aa5777;pointer-events:none}
.map-location-chip{display:inline-block;margin-left:8px;padding:3px 6px;border:1px solid #655e42;color:#5f5737;background:#ded1a5;font:700 7px/1.1 system-ui;letter-spacing:.55px;vertical-align:middle}
@media(max-width:720px){.strategic-world-location{left:7px;bottom:6px;max-width:calc(100% - 14px);padding:6px 8px}.strategic-world-location b{font-size:9px}.strategic-world-location small,.strategic-world-location em{font-size:7px}}
`;
  document.head.appendChild(style);
}

function syncNotebook(current) {
  const notebook = document.getElementById('notebook');
  const title = notebook?.querySelector('.map-head-title');
  if (!title) return;
  let chip = title.querySelector('.map-location-chip');
  if (!chip) {
    chip = document.createElement('span');
    chip.className = 'map-location-chip';
    title.appendChild(chip);
  }
  const text = current ? `TEATRO: ${current.hex.name} / ${current.sector?.name || 'SETOR'} · ${current.zone}` : 'TEATRO: LOCALIZAÇÃO INDISPONÍVEL';
  if (chip.textContent !== text) chip.textContent = text;
}

export function installStrategicWarLive(options = {}) {
  const base = installBaseStrategicWarLive(options);
  if (!base) return base;
  ensureStyle();
  const root = document.querySelector('.strategic-war');
  const map = root?.querySelector('.strategic-war-map');
  if (!root || !map) return base;
  map.style.position = 'relative';

  const marker = document.createElement('div');
  marker.className = 'strategic-world-marker';
  const locationBox = document.createElement('div');
  locationBox.className = 'strategic-world-location';
  const frontLayer = document.createElement('div');
  frontLayer.className = 'strategic-real-front-layer';
  frontLayer.style.cssText = 'position:absolute;inset:0;z-index:6;pointer-events:none';
  map.append(frontLayer, marker, locationBox);

  const toScreen = (point) => {
    const canvas = map.querySelector('canvas');
    const width = canvas?.clientWidth || map.clientWidth, height = canvas?.clientHeight || map.clientHeight;
    return { x: 22 + point.x / THEATRE_SIZE.w * Math.max(1, width - 44), y: 22 + point.y / THEATRE_SIZE.h * Math.max(1, height - 44) };
  };

  function update() {
    const position = parseOwnPosition();
    const current = locate(position);
    if (position && current) {
      const p = toScreen(position);
      marker.hidden = false;
      marker.style.left = `${p.x}px`;
      marker.style.top = `${p.y}px`;
      marker.title = `M-47 · ${current.hex.name} / ${current.sector?.name || 'SETOR'}`;
      locationBox.innerHTML = `<small>POSIÇÃO REAL DO M-47</small><b>★ ${current.hex.name} · ${current.sector?.name || 'SETOR'}</b><small>X ${Math.round(position.x).toString().padStart(5, '0')} · Y ${Math.round(position.y).toString().padStart(5, '0')} · ${ownerLabel(current.owner)}</small><em>${current.zone}</em>`;
    } else {
      marker.hidden = true;
      locationBox.innerHTML = '<small>POSIÇÃO REAL DO M-47</small><b>AGUARDANDO COORDENADAS</b>';
    }

    const fronts = Array.isArray(globalThis.ironRainWarBridge?.fronts) ? globalThis.ironRainWarBridge.fronts : [];
    frontLayer.replaceChildren(...fronts.map(front => {
      const node = document.createElement('i');
      node.className = 'strategic-real-front';
      const p = toScreen(front);
      node.style.left = `${p.x}px`;
      node.style.top = `${p.y}px`;
      node.title = `FRENTE TÁTICA · ${front.name} · ${front.status}`;
      return node;
    }));
    syncNotebook(current);
  }

  const own = document.getElementById('ownCoord');
  const ownObserver = own ? new MutationObserver(update) : null;
  ownObserver?.observe(own, { childList: true, characterData: true, subtree: true });
  const notebook = document.getElementById('notebook');
  const notebookObserver = notebook ? new MutationObserver(update) : null;
  notebookObserver?.observe(notebook, { attributes: true, attributeFilter: ['class'] });
  const timer = window.setInterval(update, 350);
  addEventListener('resize', update);
  update();
  const mobileUx = installMobileUXReview(document);

  globalThis.ironRainStrategicMap = Object.freeze({ locate, open: () => base.open?.(), mobileUx });
  return Object.freeze({
    ...base,
    locate,
    destroy() {
      clearInterval(timer);
      ownObserver?.disconnect();
      notebookObserver?.disconnect();
      marker.remove();
      locationBox.remove();
      frontLayer.remove();
      delete globalThis.ironRainStrategicMap;
      base.destroy?.();
    },
  });
}
