/** One shared theatre; a Mamute is a three-seat vehicle, never a world host. */
export function createServerLobbyUI({ runtime, onEnter }) {
  const element = document.createElement('section');
  element.className = 'server-lobby';
  element.innerHTML = `<div class="server-lobby-card"><small>IRON RAIN · GUERRA COMPARTILHADA</small><h1>ENTRAR NA GUERRA</h1>
    <p data-server-notice>Conectando à guerra…</p><div class="server-factions"><button data-server-faction="allies">ALIADOS</button><button data-server-faction="axis">EIXO</button></div>
    <label>BASE DE PARTIDA<select data-server-spawn aria-label="Base de partida"></select></label>
    <button data-server-create>CRIAR MEU MAMUTE · ATÉ 3 TRIPULANTES</button>
    <button data-server-resume hidden>VOLTAR AO MEU MAMUTE</button>
    <label>ENTRAR POR CÓDIGO<input data-server-code maxlength="20" autocomplete="off" aria-label="Código do Mamute" placeholder="Código recebido do amigo"></label><button data-server-code-join>ENTRAR POR CÓDIGO</button><h2>MAMUTES DA SUA FACÇÃO</h2><div data-server-list></div><button data-server-retry hidden>RECONECTAR</button>
    <small>Cada Mamute participa da mesma guerra. Entre no veículo de um amigo ou crie o seu.</small></div>`;
  document.body.appendChild(element);
  let faction = null, busy = false, lastList = '', lastSpawns = '';
  const $ = selector => element.querySelector(selector);
  const notice = text => { $('[data-server-notice]').textContent = text; };
  function refresh() {
    const status = runtime.status(), snapshot = runtime.snapshot();
    faction = snapshot?.faction || faction;
    element.querySelectorAll('[data-server-faction]').forEach(button => {
      button.classList.toggle('active', button.dataset.serverFaction === faction);
      button.disabled = busy || Boolean(snapshot?.faction && button.dataset.serverFaction !== faction);
    });
    const spawns = snapshot?.spawnsByFaction?.[faction] || [];
    const spawnKey = JSON.stringify(spawns);
    if (lastSpawns !== spawnKey) {
      const previous = $('[data-server-spawn]').value;
      $('[data-server-spawn]').replaceChildren(...spawns.map(spawn => {
        const option = document.createElement('option'); option.value = spawn.id; option.textContent = spawn.name; return option;
      }));
      if (spawns.some(spawn => spawn.id === previous)) $('[data-server-spawn]').value = previous;
      lastSpawns = spawnKey;
    }
    $('[data-server-create]').disabled = busy || !status.connected || !faction || !spawns.length;
    $('[data-server-resume]').hidden = !snapshot?.mamute;
    $('[data-server-resume]').disabled = busy || !status.connected;
    $('[data-server-retry]').hidden = status.connected;
    const vehicles = (snapshot?.lobbyMamutes || []).filter(m => m.faction === faction);
    const key = JSON.stringify(vehicles);
    if (key !== lastList) {
      const list = $('[data-server-list]'); list.replaceChildren();
      if (!vehicles.length) { const text = document.createElement('p'); text.textContent = 'Nenhum Mamute disponível nesta facção.'; list.appendChild(text); }
      for (const m of vehicles) {
        const button = document.createElement('button'); button.textContent = `${m.name} · ${m.crew}/3 · ${m.destroyed ? 'DESTRUÍDO' : 'ENTRAR'}`;
        button.dataset.serverJoin = m.id; button.disabled = m.destroyed || m.crew >= 3;
        button.onclick = () => act('join', { mamuteId: m.id, faction }); list.appendChild(button);
      }
      lastList = key;
    }
    if (!busy) notice(status.connected ? `${snapshot?.theatreId || 'GUERRA'} · ${faction ? 'Escolha seu Mamute.' : 'Escolha sua facção.'}` : 'Servidor temporariamente indisponível. Tentando reconectar…');
  }
  async function act(type, payload) {
    if (busy) return;
    busy = true; refresh(); notice('Preparando sua entrada…');
    try {
      const result = await runtime.command(type, payload);
      if (result.ok) onEnter(runtime.status());
      else notice(result.reason === 'crew-full' ? 'Este Mamute já tem três tripulantes.' : `Não foi possível entrar: ${result.reason}`);
    } finally { busy = false; refresh(); }
  }
  element.querySelectorAll('[data-server-faction]').forEach(button => button.onclick = () => { faction = button.dataset.serverFaction; refresh(); });
  $('[data-server-code-join]').onclick=()=>act('join',{code:$('[data-server-code]').value.trim(),faction});
  $('[data-server-create]').onclick = () => act('create', { faction, spawnId: $('[data-server-spawn]').value });
  $('[data-server-resume]').onclick = () => onEnter(runtime.status());
  $('[data-server-retry]').onclick = () => runtime.connect().then(refresh);
  const unsubscribe = runtime.subscribeSnapshots(refresh);
  refresh(); runtime.connect().then(refresh);
  return { element, faction: () => faction, setStatus: refresh, show: () => element.classList.remove('hidden'), hide: () => element.classList.add('hidden'), destroy() { unsubscribe(); element.remove(); } };
}
