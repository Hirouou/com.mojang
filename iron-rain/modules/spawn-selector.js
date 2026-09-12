import { createStrategicHexMap, hexControl } from './strategic-hex-map.js';

const FACTION_TO_TEAM = Object.freeze({ allies: 'ally', axis: 'enemy' });
const teamForFaction = faction => FACTION_TO_TEAM[String(faction)] || null;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function spawnHexesForFaction(faction, hexes = createStrategicHexMap()) {
  const team = teamForFaction(faction);
  if (!team) return Object.freeze([]);
  return Object.freeze(hexes
    .filter(hex => hexControl(hex) === team)
    .map(hex => Object.freeze({
      id: hex.id,
      name: hex.name,
      x: hex.x,
      y: hex.y,
      team,
      sectorId: hex.sectors?.[0]?.id || null,
      sectorName: hex.sectors?.[0]?.name || 'CENTRO',
    })));
}

export function resolveSpawnChoice(faction, spawnId, hexes = createStrategicHexMap()) {
  const options = spawnHexesForFaction(faction, hexes);
  return options.find(option => option.id === spawnId) || options[0] || null;
}

export function installSpawnSelector({ lobby, onChange = () => {} } = {}) {
  const root = lobby?.element;
  if (!root) return null;
  const card = root.querySelector('.crew-lobby-card');
  if (!card) return null;

  let box = card.querySelector('[data-spawn-selector]');
  if (!box) {
    box = document.createElement('section');
    box.dataset.spawnSelector = '1';
    box.innerHTML = `<style>
      .crew-spawn{margin:10px 0;padding:10px;border:1px solid #78836b55;background:#0b110de8}
      .crew-spawn-head{display:flex;justify-content:space-between;gap:8px;align-items:end;margin-bottom:7px}.crew-spawn-head b{font-size:9px;letter-spacing:1.1px}.crew-spawn-head small{font-size:7px;color:#8f9b8c;text-align:right}
      .crew-spawn-list{display:flex;gap:6px;overflow:auto;padding-bottom:3px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}.crew-spawn-list button{flex:0 0 auto;min-width:120px;min-height:44px;padding:7px 9px;text-align:left;scroll-snap-align:start}.crew-spawn-list button.active{border-color:#e4cc82;box-shadow:inset 0 0 0 1px #e4cc82;color:#f4dda0}.crew-spawn-list button b,.crew-spawn-list button small{display:block}.crew-spawn-list button b{font-size:8px}.crew-spawn-list button small{margin-top:4px;font-size:6.5px;color:#9eaa9a}.crew-spawn-empty{font-size:8px;color:#c09d76;padding:6px 0}
      @media(max-height:430px) and (orientation:landscape){.crew-spawn{margin:5px 0;padding:6px}.crew-spawn-list button{min-height:32px;min-width:105px;padding:4px 6px}.crew-spawn-head{margin-bottom:4px}.crew-spawn-head small{font-size:6px}}
    </style><div class="crew-spawn"><div class="crew-spawn-head"><b>LOCAL DE NASCIMENTO</b><small>SÓ HEXÁGONOS 100% DA SUA FACÇÃO</small></div><div class="crew-spawn-list" data-spawn-list></div></div>`;
    const actions = card.querySelector('.crew-lobby-actions');
    card.insertBefore(box, actions || null);
  }

  const list = box.querySelector('[data-spawn-list]');
  let faction = null;
  let selected = null;

  function render(nextFaction = faction) {
    faction = nextFaction || lobby.faction?.() || null;
    const options = spawnHexesForFaction(faction);
    if (!options.length) {
      selected = null;
      list.innerHTML = '<div class="crew-spawn-empty">Escolha uma facção para ver os pontos de nascimento seguros.</div>';
      onChange(null);
      return null;
    }
    if (!options.some(option => option.id === selected?.id)) selected = options[0];
    list.innerHTML = options.map(option => `<button type="button" data-spawn-id="${escape(option.id)}" class="${option.id === selected.id ? 'active' : ''}"><b>${escape(option.name)}</b><small>${escape(option.sectorName)} · DOMÍNIO TOTAL</small></button>`).join('');
    onChange(selected);
    return selected;
  }

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-spawn-id]');
    if (!button) return;
    const options = spawnHexesForFaction(faction);
    const next = options.find(option => option.id === button.dataset.spawnId);
    if (!next) return;
    selected = next;
    render(faction);
  });

  root.querySelectorAll('[data-crew-faction]').forEach(button => button.addEventListener('click', () => queueMicrotask(() => render(lobby.faction?.()))));
  render(lobby.faction?.());

  return Object.freeze({
    refresh: () => render(lobby.faction?.()),
    selected: () => selected,
    choose(id) {
      const next = spawnHexesForFaction(lobby.faction?.()).find(option => option.id === id);
      if (!next) return null;
      selected = next;
      return render(lobby.faction?.());
    },
    destroy() { box.remove(); },
  });
}
