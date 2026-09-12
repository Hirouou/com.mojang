import { createStrategicHexMap, hexControl, neighboringHexIds } from './strategic-hex-map.js';
import {
  createTerritoryNode,
  setTerritoryControl,
  receiveTerritoryDelivery,
  startTerritoryProject,
  stepTerritoryDevelopment,
  territorySnapshot,
  DEVELOPMENT_PROJECTS,
} from './territory-development.js';
import { chooseTerritoryProject, projectSupplyRequest, territoryOperationalEffects } from './territory-ai.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from './strategic-logistics.js';
import { THEATRE_SIZE } from './theatre-control.js';

const COLORS = Object.freeze({ ally:'#57aef7', enemy:'#58a66d', contested:'#c2a158', neutral:'#7a7d76', paper:'#111813' });
const STRUCTURE_LABEL = Object.freeze({ outpost:'POSTO', depot:'DEPÓSITO', mortar:'MORTEIRO', bunker:'BUNKER', garage:'GARAGEM', factory:'FÁBRICA' });
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const playerTeam = () => window.ironRainEntry?.faction === 'axis' ? 'enemy' : 'ally';
const ownerLabel = owner => owner === 'ally' ? 'ALIADOS' : owner === 'enemy' ? 'EIXO' : owner === 'contested' ? 'DISPUTADO' : 'NEUTRO';

function mutableHexes() {
  return createStrategicHexMap().map(hex => ({ ...hex, sectors: hex.sectors.map(sector => ({ ...sector, structures:[...(sector.structures || [])] })) }));
}

function sectorIndex(hexes) {
  const map = new Map();
  for (const hex of hexes) for (const sector of hex.sectors) map.set(sector.id, { sector, hex });
  return map;
}

function nearestBorderDistance(sector) {
  // Current canonical theatre starts as a coherent west/east split. Distance
  // from the centre line is enough to seed rear/front readiness without adding
  // a second ownership model.
  return Math.abs(sector.x - THEATRE_SIZE.w * .5);
}

function createLiveTheatre() {
  const hexes = mutableHexes();
  const sectors = sectorIndex(hexes);
  const territory = new Map();
  const logisticNodes = [];

  for (const { sector } of sectors.values()) {
    const owner = sector.owner === 'ally' || sector.owner === 'enemy' ? sector.owner : null;
    const node = createTerritoryNode({ id:sector.id, owner });
    node.contested = sector.owner === 'contested' || !owner;
    const rear = nearestBorderDistance(sector) > 15500;
    const mid = nearestBorderDistance(sector) > 8500;
    node.securedFor = node.contested ? 0 : rear ? 620 : mid ? 250 : 90;
    // Starting infrastructure is part of the initial theatre, not free runtime
    // construction. Everything added after boot still requires delivered cargo.
    if (owner && mid) node.structures.push('outpost');
    if (owner && rear) node.structures.push('depot');
    territory.set(sector.id, node);
    logisticNodes.push(createLogisticsNode({
      id:sector.id, team:owner, x:sector.x, y:sector.y,
      kind: rear ? 'depot' : mid ? 'outpost' : 'front',
      stock: rear ? { materials:520, ammo:150, fuel:170 } : { materials:0, ammo:0, fuel:0 },
    }));
  }

  const routes = [];
  const seen = new Set();
  for (const hex of hexes) {
    const neighborIds = new Set(neighboringHexIds(hex, hexes));
    const nearbyHexes = hexes.filter(candidate => candidate.id === hex.id || neighborIds.has(candidate.id));
    for (const sector of hex.sectors) {
      if (!['ally','enemy'].includes(sector.owner)) continue;
      const candidates = nearbyHexes.flatMap(h => h.sectors).filter(other => other.id !== sector.id && other.owner === sector.owner && dist(sector, other) < 7600);
      candidates.sort((a,b) => dist(sector,a)-dist(sector,b));
      for (const other of candidates.slice(0,2)) {
        const key = [sector.id,other.id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        routes.push(createSupplyRoute({ id:`RT-${routes.length+1}`, team:sector.owner, from:sector.id, to:other.id, distance:Math.round(dist(sector,other)) }));
      }
    }
  }

  const logistics = createStrategicLogistics({ nodes:logisticNodes, routes });
  const activeRequests = new Map();
  let clock = 0;

  function routeSource(team, destination, cargo) {
    let best = null;
    for (const node of logistics.snapshot().nodes) {
      if (node.team !== team || !node.alive || node.id === destination) continue;
      const enough = ['materials','ammo','fuel'].every(k => (node.stock?.[k] || 0) >= (cargo?.[k] || 0));
      if (!enough) continue;
      const path = logistics.route(team, node.id, destination);
      if (!path) continue;
      const length = path.reduce((sum,leg) => sum + leg.distance,0);
      if (!best || length < best.length) best = { id:node.id, length };
    }
    return best?.id || null;
  }

  function desiredProject(node) {
    if (!node || !node.owner || node.contested || node.activeProject) return null;
    const missing = type => !node.structures.includes(type);
    if (missing('outpost') && node.securedFor >= DEVELOPMENT_PROJECTS.outpost.secureFor) return 'outpost';
    if (missing('depot') && node.securedFor >= DEVELOPMENT_PROJECTS.depot.secureFor && node.structures.includes('outpost')) return 'depot';
    if (missing('bunker') && node.securedFor >= DEVELOPMENT_PROJECTS.bunker.secureFor && node.structures.includes('outpost')) return 'bunker';
    if (missing('mortar') && node.securedFor >= DEVELOPMENT_PROJECTS.mortar.secureFor && node.structures.includes('outpost')) return 'mortar';
    if (missing('garage') && node.securedFor >= DEVELOPMENT_PROJECTS.garage.secureFor && node.structures.includes('depot')) return 'garage';
    if (missing('factory') && node.securedFor >= DEVELOPMENT_PROJECTS.factory.secureFor && node.structures.includes('depot') && node.structures.includes('garage')) return 'factory';
    return null;
  }

  function step(dt) {
    const elapsed = clamp(dt,0,4);
    clock += elapsed;
    const logisticEvents = logistics.step(elapsed);
    for (const event of logisticEvents) {
      if (event.type !== 'convoy-arrived') continue;
      const node = territory.get(event.to);
      if (node) receiveTerritoryDelivery(node, event);
      activeRequests.delete(event.to);
    }

    for (const [id,node] of territory) {
      const record = sectors.get(id);
      if (!record) continue;
      const owner = record.sector.owner;
      const contested = owner === 'contested' || !['ally','enemy'].includes(owner);
      setTerritoryControl(node, contested ? node.owner : owner, { contested, dt:elapsed });
      const hasRoute = node.owner ? logistics.snapshot().nodes.some(source => source.team === node.owner && logistics.route(node.owner, source.id, id)) : false;
      stepTerritoryDevelopment(node, elapsed, { routeOpen:hasRoute, contested });
      const effects = territoryOperationalEffects(node);
      const borderFactor = clamp(1 - nearestBorderDistance(record.sector)/15000,0,1);
      const pressure = clamp(borderFactor * (.68 - effects.defensiveCover),0,1);
      const plan = chooseTerritoryProject(node, { routeOpen:hasRoute, frontPressure:pressure, infantryThreat:pressure, armorThreat:pressure*.7 });
      if (plan) startTerritoryProject(node, plan.type);

      const wanted = desiredProject(node);
      if (wanted && !activeRequests.has(id)) {
        const request = projectSupplyRequest(node, wanted);
        if (request) {
          const source = routeSource(node.owner, id, request.cargo);
          if (source) {
            const sent = logistics.dispatch({ team:node.owner, from:source, to:id, cargo:request.cargo, speed:20 });
            if (sent.ok && sent.status !== 'arrived') activeRequests.set(id, sent.convoyId);
            if (sent.ok && sent.status === 'arrived') receiveTerritoryDelivery(node, { team:node.owner, cargo:request.cargo });
          }
        }
      }
      record.sector.structures = [...node.structures];
    }
  }

  return { hexes, sectors, territory, logistics, step, get clock(){return clock;} };
}

function installStyles() {
  if (document.getElementById('strategicWarLiveStyles')) return;
  const style = document.createElement('style');
  style.id = 'strategicWarLiveStyles';
  style.textContent = `
    .strategic-war-btn{position:fixed;left:calc(12px + var(--safeL,0px));top:calc(66px + var(--safeT,0px));z-index:46;border:1px solid #8da78b66;background:#101812e8;color:#d8dfd3;padding:9px 12px;font:700 10px/1 system-ui;letter-spacing:1.2px;border-radius:3px;box-shadow:0 4px 14px #0008}
    .strategic-war{position:fixed;inset:0;z-index:120;background:#080d09f2;color:#d8dfd3;display:grid;grid-template-rows:auto 1fr;font-family:system-ui,sans-serif}
    .strategic-war.hidden{display:none}.strategic-war header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #9caa8750;background:#101711}.strategic-war header b{font-size:14px;letter-spacing:1.4px}.strategic-war header small{display:block;color:#9ba596;font-size:9px;margin-top:2px}.strategic-war header button{border:1px solid #a8b29b55;background:#1b241d;color:#dfe6db;padding:8px 12px}
    .strategic-war-main{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 260px}.strategic-war-map{position:relative;min-height:0;background:#111713}.strategic-war canvas{width:100%;height:100%;display:block;touch-action:none}.strategic-war-side{padding:12px;overflow:auto;border-left:1px solid #9caa8738;background:#0d130f}.strategic-war-side h3{font-size:11px;letter-spacing:1px;margin:0 0 9px}.strategic-war-side p,.strategic-war-side li{font-size:10px;line-height:1.45;color:#b7c0b3}.strategic-war-side strong{color:#eef2e9}.strategic-war-kpis{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px}.strategic-war-kpis div{padding:7px;border:1px solid #91a08b38;background:#151d17}.strategic-war-kpis b{display:block;font-size:13px}.strategic-war-kpis small{font-size:7px;letter-spacing:.8px;color:#919d8d}.strategic-war-legend{display:flex;gap:10px;flex-wrap:wrap;font-size:8px;margin:7px 0}.strategic-war-legend i{width:8px;height:8px;display:inline-block;margin-right:3px;border-radius:50%}
    @media(max-width:720px){.strategic-war-main{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) 150px}.strategic-war-side{border-left:0;border-top:1px solid #9caa8738;padding:8px 10px}.strategic-war-side h3{margin-bottom:5px}.strategic-war-kpis{display:flex;gap:5px;margin-bottom:5px}.strategic-war-kpis div{padding:5px 7px}.strategic-war-side p{margin:4px 0}.strategic-war-btn{top:calc(58px + var(--safeT,0px));padding:8px 9px}}
  `;
  document.head.appendChild(style);
}

function hexPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i=0;i<6;i++) {
    const a=Math.PI/3*i;
    const px=x+Math.cos(a)*r, py=y+Math.sin(a)*r;
    i ? ctx.lineTo(px,py) : ctx.moveTo(px,py);
  }
  ctx.closePath();
}

export function installStrategicWarLive({ app=document.getElementById('app') } = {}) {
  if (!app || document.getElementById('strategicWarBtn')) return null;
  installStyles();
  const theatre = createLiveTheatre();
  const button = document.createElement('button');
  button.id='strategicWarBtn'; button.className='strategic-war-btn'; button.type='button'; button.textContent='▦ GUERRA';
  button.setAttribute('aria-label','Abrir mapa estratégico da guerra');
  document.body.appendChild(button);

  const root=document.createElement('section');
  root.className='strategic-war hidden';
  root.innerHTML=`<header><div><b>TEATRO ESTRATÉGICO</b><small>HEXÁGONOS · SETORES · DESENVOLVIMENTO · LOGÍSTICA</small></div><button type="button" data-war-close>VOLTAR AO MAMUTE ×</button></header><div class="strategic-war-main"><div class="strategic-war-map"><canvas aria-label="Mapa estratégico da guerra"></canvas></div><aside class="strategic-war-side"><div class="strategic-war-kpis" data-war-kpis></div><div class="strategic-war-legend"><span><i style="background:${COLORS.ally}"></i>ALIADOS</span><span><i style="background:${COLORS.enemy}"></i>EIXO</span><span><i style="background:${COLORS.contested}"></i>DISPUTADO</span></div><div data-war-detail><h3>SELECIONE UM SETOR</h3><p>Toque num ponto interno de um hexágono. Território, rotas, comboios e construção usam a mesma regra para os dois lados.</p></div></aside></div>`;
  document.body.appendChild(root);
  const canvas=root.querySelector('canvas'), ctx=canvas.getContext('2d');
  const detail=root.querySelector('[data-war-detail]'), kpis=root.querySelector('[data-war-kpis]');
  let open=false, selected=null, width=1,height=1,dpr=1, last=performance.now(), raf=0;

  function transform(p){return {x:24+p.x/THEATRE_SIZE.w*(width-48),y:24+p.y/THEATRE_SIZE.h*(height-48)};}
  function scaleRadius(r){return r/THEATRE_SIZE.w*(width-48);}
  function resize(){
    const rect=canvas.getBoundingClientRect(); if(rect.width<2||rect.height<2)return;
    width=rect.width;height=rect.height;dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function updateSide(){
    const team=playerTeam();
    const snapshots=[...theatre.territory.values()].map(territorySnapshot);
    const mine=snapshots.filter(n=>n.owner===team), active=mine.filter(n=>n.activeProject).length;
    const logistics=theatre.logistics.snapshot();
    const convoys=logistics.convoys.filter(c=>c.team===team&&c.status!=='arrived'&&c.status!=='destroyed').length;
    kpis.innerHTML=`<div><b>${mine.length}</b><small>SETORES DA FACÇÃO</small></div><div><b>${convoys}</b><small>COMBOIOS ATIVOS</small></div><div><b>${active}</b><small>OBRAS EM CURSO</small></div><div><b>${snapshots.filter(n=>n.structures.includes('factory')).length}</b><small>FÁBRICAS NO TEATRO</small></div>`;
    if(!selected)return;
    const record=theatre.sectors.get(selected); if(!record)return;
    const node=territorySnapshot(theatre.territory.get(selected));
    const own=node.owner===team;
    const control=hexControl(record.hex);
    if(!own){
      detail.innerHTML=`<h3>${record.hex.name} / ${record.sector.name}</h3><p><strong>${ownerLabel(record.sector.owner)}</strong> · hex ${ownerLabel(control)}</p><p>Detalhe logístico inimigo indisponível sem inteligência válida. O mapa não revela estoque, obra ou comboio por onisciência.</p>`;
      return;
    }
    const structures=node.structures.length?node.structures.map(x=>STRUCTURE_LABEL[x]||x).join(' · '):'nenhuma';
    const project=node.activeProject?`${STRUCTURE_LABEL[node.activeProject]||node.activeProject} · ${Math.round(node.projectProgress)}s`:'sem obra ativa';
    detail.innerHTML=`<h3>${record.hex.name} / ${record.sector.name}</h3><p><strong>${ownerLabel(node.owner)}</strong> · hex ${ownerLabel(control)} · seguro há ${Math.round(node.securedFor)}s</p><p>Estruturas: <strong>${structures}</strong><br>Obra: <strong>${project}</strong><br>Estoque entregue: MAT ${Math.round(node.stock.materials)} · MUN ${Math.round(node.stock.ammo)} · COMB ${Math.round(node.stock.fuel)}</p>`;
  }
  function draw(){
    ctx.clearRect(0,0,width,height);ctx.fillStyle=COLORS.paper;ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#87927e18';ctx.lineWidth=1;for(let x=0;x<width;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}for(let y=0;y<height;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
    const team=playerTeam(), logistics=theatre.logistics.snapshot();
    for(const route of logistics.routes){if(route.team!==team||!route.open)continue;const a=theatre.sectors.get(route.from)?.sector,b=theatre.sectors.get(route.to)?.sector;if(!a||!b)continue;const pa=transform(a),pb=transform(b);ctx.strokeStyle='#b8c5ad18';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);ctx.stroke();}
    for(const hex of theatre.hexes){const p=transform(hex), control=hexControl(hex);hexPath(ctx,p.x,p.y,Math.max(10,scaleRadius(hex.radius)));ctx.fillStyle=(COLORS[control]||COLORS.neutral)+'16';ctx.fill();ctx.strokeStyle=(COLORS[control]||COLORS.neutral)+'8a';ctx.lineWidth=control==='contested'?2:1;ctx.stroke();ctx.fillStyle='#d6ddd0a8';ctx.font='700 8px system-ui';ctx.textAlign='center';ctx.fillText(hex.name,p.x,p.y-3);}
    for(const {sector} of theatre.sectors.values()){const p=transform(sector);ctx.beginPath();ctx.arc(p.x,p.y,selected===sector.id?5.5:3.4,0,Math.PI*2);ctx.fillStyle=COLORS[sector.owner]||COLORS.neutral;ctx.fill();if(selected===sector.id){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();}}
    for(const convoy of logistics.convoys){if(convoy.team!==team||!['moving','blocked'].includes(convoy.status))continue;const leg=convoy.path[convoy.leg],a=leg&&theatre.sectors.get(leg.from)?.sector,b=leg&&theatre.sectors.get(leg.to)?.sector;if(!a||!b)continue;const t=clamp(convoy.legProgress/Math.max(1,leg.distance),0,1),p=transform({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});ctx.fillStyle=convoy.status==='blocked'?'#e0b35f':'#e6e2c4';ctx.fillRect(p.x-2.5,p.y-2.5,5,5);}
  }
  function frame(now){if(!open)return;const dt=Math.min(1,(now-last)/1000);last=now;theatre.step(dt*8);updateSide();draw();raf=requestAnimationFrame(frame);}
  function setOpen(next){open=Boolean(next);root.classList.toggle('hidden',!open);if(open){resize();last=performance.now();updateSide();draw();cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);}else cancelAnimationFrame(raf);}
  button.addEventListener('click',()=>setOpen(true));root.querySelector('[data-war-close]').addEventListener('click',()=>setOpen(false));
  canvas.addEventListener('pointerdown',event=>{const r=canvas.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;let hit=null,best=16;for(const {sector} of theatre.sectors.values()){const p=transform(sector),d=Math.hypot(p.x-x,p.y-y);if(d<best){best=d;hit=sector.id;}}selected=hit;updateSide();draw();});
  addEventListener('resize',()=>{if(open){resize();draw();}});
  return Object.freeze({ open:()=>setOpen(true), close:()=>setOpen(false), theatre });
}
