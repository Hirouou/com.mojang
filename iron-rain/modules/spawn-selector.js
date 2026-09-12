import { createStrategicHexMap, hexControl } from './strategic-hex-map.js';
import { controlLineX } from './theatre-control.js';

const FACTION_TO_TEAM = Object.freeze({ allies: 'ally', axis: 'enemy' });
const teamForFaction = faction => FACTION_TO_TEAM[String(faction)] || null;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const frontDistance = option => Math.abs(option.x - controlLineX(option.y));

export function spawnHexesForFaction(faction, hexes = createStrategicHexMap()) {
  const team = teamForFaction(faction);
  if (!team) return Object.freeze([]);
  const options = hexes
    .filter(hex => hexControl(hex) === team)
    .map(hex => ({ id:hex.id,name:hex.name,x:hex.x,y:hex.y,team,distanceToFront:frontDistance(hex),sectorId:hex.sectors?.[0]?.id||null,sectorName:hex.sectors?.[0]?.name||'CENTRO' }))
    .sort((a,b)=>a.distanceToFront-b.distanceToFront)
    .map(option=>Object.freeze(option));
  return Object.freeze(options);
}

export function resolveSpawnChoice(faction, spawnId, hexes = createStrategicHexMap()) {
  const options = spawnHexesForFaction(faction, hexes);
  return options.find(option => option.id === spawnId) || options[0] || null;
}

export function installSpawnSelector({ lobby, onChange = () => {}, onConfirm = () => {} } = {}) {
  const root = lobby?.element;
  if (!root) return null;
  const card = root.querySelector('.crew-lobby-card');
  if (!card) return null;
  let box = card.querySelector('[data-spawn-selector]');
  if (!box) {
    box = document.createElement('section');
    box.dataset.spawnSelector = '1';
    box.innerHTML = `<style>
      .crew-spawn{margin:10px 0;padding:10px;border:1px solid #78836b55;background:#0b110de8}.crew-spawn-head{display:flex;justify-content:space-between;gap:8px;align-items:end;margin-bottom:7px}.crew-spawn-head b{font-size:9px;letter-spacing:1.1px}.crew-spawn-head small{font-size:7px;color:#8f9b8c;text-align:right}.crew-spawn-list{display:flex;gap:6px;overflow:auto;padding-bottom:3px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}.crew-spawn-list button{flex:0 0 auto;min-width:132px;min-height:46px;padding:7px 9px;text-align:left;scroll-snap-align:start}.crew-spawn-list button.active{border-color:#e4cc82;box-shadow:inset 0 0 0 1px #e4cc82;color:#f4dda0}.crew-spawn-list button b,.crew-spawn-list button small{display:block}.crew-spawn-list button b{font-size:8px}.crew-spawn-list button small{margin-top:4px;font-size:6.5px;color:#9eaa9a}.crew-spawn-list button.frontline b::before{content:'★ ';color:#e4cc82}.crew-spawn-empty{font-size:8px;color:#c09d76;padding:6px 0}.crew-spawn-confirm{display:none;width:100%;margin-top:7px;min-height:36px;border:1px solid #d7bd68;background:#282815;color:#f1dfa0;font:800 9px/1 system-ui;letter-spacing:.8px}.crew-spawn.respawn .crew-spawn-confirm{display:block}
      @media(max-height:430px) and (orientation:landscape){.crew-spawn{margin:5px 0;padding:6px}.crew-spawn-list button{min-height:32px;min-width:112px;padding:4px 6px}.crew-spawn-head{margin-bottom:4px}.crew-spawn-head small{font-size:6px}.crew-spawn-confirm{min-height:28px;margin-top:4px;font-size:7px}}
    </style><div class="crew-spawn"><div class="crew-spawn-head"><b>LOCAL DE NASCIMENTO</b><small>100% DOMINADO · MAIS PERTO DO FRONT PRIMEIRO</small></div><div class="crew-spawn-list" data-spawn-list></div><button type="button" class="crew-spawn-confirm" data-spawn-confirm>NASCER NESTE HEXÁGONO</button></div>`;
    const actions = card.querySelector('.crew-lobby-actions');
    card.insertBefore(box, actions || null);
  }
  const shell=box.querySelector('.crew-spawn'),list=box.querySelector('[data-spawn-list]'),confirm=box.querySelector('[data-spawn-confirm]');
  let faction=null,selected=null,respawnMode=false;
  function render(nextFaction=faction){
    faction=nextFaction||lobby.faction?.()||null;
    const options=spawnHexesForFaction(faction);
    if(!options.length){selected=null;list.innerHTML='<div class="crew-spawn-empty">Escolha uma facção para ver os pontos de nascimento seguros.</div>';onChange(null);return null;}
    if(!options.some(option=>option.id===selected?.id))selected=options[0];
    list.innerHTML=options.map((option,index)=>`<button type="button" data-spawn-id="${escape(option.id)}" class="${option.id===selected.id?'active ':''}${index===0?'frontline':''}"><b>${escape(option.name)}</b><small>${index===0?'MAIS PERTO DO FRONT · ':''}${(option.distanceToFront/1000).toFixed(1)} km · DOMÍNIO TOTAL</small></button>`).join('');
    if(confirm)confirm.textContent=selected?`NASCER EM ${selected.name}`:'NASCER NESTE HEXÁGONO';
    onChange(selected);return selected;
  }
  list.addEventListener('click',event=>{const button=event.target.closest('[data-spawn-id]');if(!button)return;const next=spawnHexesForFaction(faction).find(option=>option.id===button.dataset.spawnId);if(!next)return;selected=next;render(faction);});
  confirm?.addEventListener('click',()=>{if(selected)onConfirm(selected);});
  root.querySelectorAll('[data-crew-faction]').forEach(button=>button.addEventListener('click',()=>queueMicrotask(()=>render(lobby.faction?.()))));
  render(lobby.faction?.());
  return Object.freeze({refresh:()=>render(lobby.faction?.()),selected:()=>selected,setRespawnMode(value){respawnMode=Boolean(value);shell?.classList.toggle('respawn',respawnMode);return respawnMode;},choose(id){const next=spawnHexesForFaction(lobby.faction?.()).find(option=>option.id===id);if(!next)return null;selected=next;return render(lobby.faction?.());},destroy(){box.remove();}});
}
