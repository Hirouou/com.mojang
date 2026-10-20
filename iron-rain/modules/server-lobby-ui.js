/** One shared theatre; a Mamute is a three-seat vehicle, never a world host. */
export function createServerLobbyUI({ runtime, onEnter, local = false, configured = true }) {
  const element = document.createElement('section');
  element.className = 'server-lobby';
  element.innerHTML = `<div class="server-lobby-card">
    <header class="server-lobby-head"><div class="server-lobby-brand">
      <svg viewBox="0 0 90 64" aria-hidden="true"><path d="M11 34h57l12 10v9H9V39zm10-10h37v12H21zm29 1V19h35v6M18 55h48M21 44h3m10 0h3m10 0h3m10 0h3" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="bevel"/></svg>
      <div><small data-server-mode>TEATRO DE GUERRA</small><h1>IRON RAIN</h1></div></div>
      <div class="server-lobby-seal"><b>MAMUTE</b><span>03 ASSENTOS</span></div></header>
    <p data-server-notice role="status" aria-live="polite">Conectando à guerra…</p>
    <div class="server-lobby-body">
      <section class="server-deploy"><h2><span>01</span> ENTRAR NA GUERRA</h2>
        <div class="server-factions"><button data-server-faction="allies" aria-pressed="false"><b>ALIADOS</b><small>FRENTE AZUL</small></button><button data-server-faction="axis" aria-pressed="false"><b>EIXO</b><small>FRENTE VERDE</small></button></div>
        <label>BASE DE PARTIDA<select data-server-spawn aria-label="Base de partida"></select></label>
        <button data-server-create>CRIAR MEU MAMUTE <span>ATÉ 3 TRIPULANTES</span></button>
        <button data-server-resume hidden>↳ VOLTAR AO MEU MAMUTE</button>
      </section>
      <section class="server-enlist"><h2><span>02</span> JUNTAR-SE À TRIPULAÇÃO</h2>
        <div class="server-code-entry"><label>CÓDIGO DO MAMUTE<input data-server-code maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Código do Mamute" placeholder="Código do amigo"></label><button data-server-code-join>ENTRAR</button></div>
        <h2 class="server-vehicles-title">MAMUTES DA SUA FACÇÃO</h2><div data-server-list></div>
      </section>
    </div>
    <footer class="server-lobby-foot"><small data-server-footnote>UMA GUERRA · VÁRIOS MAMUTES · ATÉ 3 TRIPULANTES POR VEÍCULO</small><button data-server-retry hidden>RECONECTAR</button></footer>
  </div>`;
  document.body.appendChild(element);
  let faction = null, busy = false, connecting = false, attempted = false, lastList = '', lastSpawns = '', actionError = '';
  const $ = selector => element.querySelector(selector);
  const notice = text => { $('[data-server-notice]').textContent = text; };
  if (local) {
    element.dataset.local = 'true';
    $('[data-server-mode]').textContent = 'CAMPANHA LOCAL';
    $('[data-server-create]').innerHTML = 'JOGAR SOZINHO <span>CRIAR MEU MAMUTE</span>';
    $('[data-server-footnote]').textContent = 'PROGRESSO SALVO NESTE COMPUTADOR · NÃO PRECISA DE INTERNET';
    $('[data-server-code]').placeholder = 'Código do Mamute';
    $('.server-enlist h2').innerHTML = '<span>02</span> ENTRAR EM UM MAMUTE';
  }
  function connectionNotice(status) {
    if (!configured) return 'O jogo está disponível no computador. Abra pelo atalho ABRIR-IRON-RAIN para jogar localmente.';
    if (status.connected) return `${local ? 'PARTIDA LOCAL' : 'GUERRA EM ANDAMENTO'} · ${faction ? 'Escolha seu Mamute.' : 'Escolha sua facção.'}`;
    if (connecting || !attempted) return local ? 'Abrindo sua partida neste computador…' : 'Conectando à guerra…';
    if (local) return 'Não foi possível abrir a partida local. Mantenha a janela do jogo aberta e toque em RECONECTAR.';
    return 'A conexão com a guerra foi interrompida. Confira sua conexão e toque em RECONECTAR.';
  }
  function refresh() {
    const status = runtime.status(), snapshot = runtime.snapshot();
    faction = snapshot?.faction || faction;
    element.querySelectorAll('[data-server-faction]').forEach(button => {
      button.classList.toggle('active', button.dataset.serverFaction === faction);
      button.setAttribute('aria-pressed', String(button.dataset.serverFaction === faction));
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
    $('[data-server-spawn]').disabled = busy || !status.connected || !spawns.length;
    $('[data-server-create]').disabled = busy || !configured || !status.connected || !faction || !spawns.length;
    $('[data-server-code-join]').disabled = busy || !configured || !status.connected;
    $('[data-server-resume]').hidden = !snapshot?.mamute;
    $('[data-server-resume]').disabled = busy || !status.connected;
    $('[data-server-retry]').hidden = !configured || status.connected;
    $('[data-server-retry]').disabled = connecting;
    const vehicles = (snapshot?.lobbyMamutes || []).filter(m => m.faction === faction);
    const key = JSON.stringify({ faction, vehicles, busy, connected: status.connected });
    if (key !== lastList) {
      const list = $('[data-server-list]'); list.replaceChildren();
      if (!vehicles.length) { const text = document.createElement('p'); text.className = 'server-list-empty'; text.textContent = faction ? 'Nenhum Mamute disponível. Crie o primeiro da sua facção.' : 'Escolha uma facção para ver os Mamutes.'; list.appendChild(text); }
      for (const m of vehicles) {
        const button = document.createElement('button'), name = document.createElement('b'), crew = document.createElement('small'), state = document.createElement('span');
        name.textContent = m.name; crew.textContent = `${m.crew}/3 TRIPULANTES`; state.textContent = m.destroyed ? 'DESTRUÍDO' : m.crew >= 3 ? 'LOTADO' : 'ENTRAR ↗';
        button.append(name, crew, state);
        button.dataset.serverJoin = m.id; button.disabled = busy || !configured || !status.connected || m.destroyed || m.crew >= 3;
        button.onclick = () => act('join', { mamuteId: m.id, faction }); list.appendChild(button);
      }
      lastList = key;
    }
    element.dataset.connected = String(status.connected);
    if (!busy) notice(actionError || connectionNotice(status));
  }
  async function act(type, payload) {
    if (busy || !configured || !runtime.status().connected) return;
    busy = true; actionError = ''; refresh(); notice('Preparando sua entrada…');
    try {
      const result = await runtime.command(type, payload);
      if (result.ok) onEnter(runtime.status());
      else actionError = result.reason === 'crew-full' ? 'Este Mamute já tem três tripulantes.' : type === 'join' ? 'Não foi possível entrar. Confira o código ou escolha outro Mamute.' : 'Não foi possível preparar o Mamute. Tente novamente.';
    } catch { actionError = 'A conexão foi interrompida. Aguarde e tente novamente.';
    } finally { busy = false; refresh(); }
  }
  element.querySelectorAll('[data-server-faction]').forEach(button => button.onclick = () => { faction = button.dataset.serverFaction; actionError = ''; refresh(); });
  $('[data-server-code-join]').onclick=()=>act('join',{code:$('[data-server-code]').value.trim(),faction});
  $('[data-server-code]').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('[data-server-code-join]').click(); } });
  $('[data-server-create]').onclick = () => act('create', { faction, spawnId: $('[data-server-spawn]').value });
  $('[data-server-resume]').onclick = () => onEnter(runtime.status());
  async function connect() {
    if (!configured || connecting) return;
    connecting = true; actionError = ''; refresh();
    try { await runtime.connect(); }
    catch { actionError = local ? 'Não foi possível abrir a partida local. Abra o jogo novamente e tente reconectar.' : 'Não foi possível conectar à guerra. Tente novamente.'; }
    finally { attempted = true; connecting = false; refresh(); }
  }
  $('[data-server-retry]').onclick = connect;
  const unsubscribe = runtime.subscribeSnapshots(refresh);
  refresh(); void connect();
  return { element, faction: () => faction, setStatus: refresh, show: () => element.classList.remove('hidden'), hide: () => element.classList.add('hidden'), destroy() { unsubscribe(); element.remove(); } };
}
