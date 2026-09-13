import { FACTIONS, FACTION_INFO, normalizeFaction, factionInfo } from './factions.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const cleanRoom = value => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);

/** A Mamute session owns one room + faction once it is authoritative/connected. */
export function crewLobbySessionLocked(status = {}) {
  const mode = String(status?.mode || 'offline');
  return mode === 'host' || (mode === 'guest' && Boolean(status?.connected));
}

function ensureLobbyStyles() {
  if (document.getElementById('iron-rain-crew-lobby-style')) return;
  const style = document.createElement('style');
  style.id = 'iron-rain-crew-lobby-style';
  style.textContent = `
    .crew-lobby{position:fixed;inset:0;z-index:90;display:grid;place-items:center;min-height:0;padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;background:radial-gradient(circle at 50% 30%,#273129f2,#090d0bf8);color:#d9d2b1;font-family:ui-monospace,Consolas,monospace}
    .crew-lobby.hidden{display:none}.crew-lobby-card{width:min(560px,100%);max-height:calc(100dvh - 18px);overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding:22px;border:1px solid #81785b;background:#111813f5;box-shadow:0 22px 90px #000c}.crew-lobby-card>small{letter-spacing:2px;color:#8e9a86;font-size:9px}.crew-lobby-card h2{margin:8px 0 6px;font-size:26px;letter-spacing:2px;color:#eadcaf}.crew-lobby-card p{margin:0 0 16px;color:#aeb7a4;font-size:10px;line-height:1.5}
    .crew-factions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px}.crew-factions button{position:relative;min-height:66px;text-align:left;padding:10px 12px 10px 15px;overflow:hidden}.crew-factions button:before{content:'';position:absolute;inset:0 auto 0 0;width:4px;background:#566}.crew-factions button b,.crew-factions button small{position:relative;z-index:1;display:block}.crew-factions button b{margin-top:5px;font-size:15px;letter-spacing:1.5px}.crew-factions button small{font-size:7px;letter-spacing:1.2px;color:#a8b0a2}.crew-factions [data-crew-faction="allies"]{background:linear-gradient(90deg,#213750aa,#18221d);border-color:#527ca1}.crew-factions [data-crew-faction="allies"]:before{background:#628ebd}.crew-factions [data-crew-faction="axis"]{background:linear-gradient(90deg,#35442faa,#18221d);border-color:#6b7f59}.crew-factions [data-crew-faction="axis"]:before{background:#71885f}.crew-factions button.active{box-shadow:inset 0 0 0 2px #e6d49a,0 0 18px #0008;color:#fff0bd}.crew-factions button:not(.active){filter:saturate(.55);opacity:.72}
    .crew-lobby-room{display:grid;grid-template-columns:1fr 1fr;gap:8px}.crew-lobby-room label{grid-column:1/-1;font-size:9px;letter-spacing:1px;color:#bdb58f}.crew-lobby-room input{box-sizing:border-box;width:100%;margin-top:6px;padding:13px 12px;border:1px solid #73795f;background:#080e0a;color:#f0dfad;font:700 17px ui-monospace,monospace;letter-spacing:2px;text-transform:uppercase}.crew-lobby-room input[readonly]{border-color:#566253;color:#bbb18f;background:#0d130f}.crew-lobby button{min-height:46px;border:1px solid #727b61;background:#273124;color:#ddcf9f;font:700 10px ui-monospace,monospace;letter-spacing:1px}.crew-lobby button:disabled{opacity:.35}.crew-lobby button:active{transform:translateY(1px)}
    .crew-lobby-members{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:14px 0 8px}.crew-lobby-members div{min-height:48px;padding:8px;border-left:2px solid #8f7e51;background:#182118}.crew-lobby-members b,.crew-lobby-members span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.crew-lobby-members b{font-size:10px;color:#e0d3aa}.crew-lobby-members span{margin-top:6px;font-size:7px;color:#8e9a87}.crew-lobby-status{padding:8px 10px;background:#0a100c;border:1px solid #414b3b;color:#aebc9f;font-size:9px;letter-spacing:1px}.crew-lobby-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.crew-lobby-actions [data-crew-enter]{background:#4a442a;border-color:#a69055;color:#f2dca0}

    @media(max-width:720px) and (orientation:landscape){
      .crew-lobby{padding:max(7px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(7px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:radial-gradient(circle at 50% 26%,#1d281ff5,#080c0afc)}
      .crew-lobby-card{width:min(660px,calc(100vw - 32px));max-height:calc(100dvh - 16px);padding:11px 14px;border:0;background:#101713e8;box-shadow:0 16px 60px #0008;overflow-y:auto}
      .crew-lobby-card>small{font-size:7px;letter-spacing:1.5px}.crew-lobby-card h2{font-size:17px;line-height:1.12;margin:3px 0 5px}.crew-lobby-card p{font-size:8px;line-height:1.3;margin:0 0 7px;position:relative;z-index:1}
      .crew-factions{gap:6px;margin-bottom:7px}.crew-factions button{min-height:40px;padding:5px 9px 5px 11px}.crew-factions button b{font-size:10px;margin-top:2px}.crew-factions button small{font-size:6px}
      .crew-lobby-room{gap:5px}.crew-lobby-room label{font-size:7px;line-height:1.25;letter-spacing:.8px}.crew-lobby-room input{height:31px;margin-top:3px;padding:5px 9px;font-size:12px;line-height:1.15}.crew-lobby button{min-height:32px;font-size:8px}
      .crew-lobby-members{gap:5px;margin:6px 0 5px}.crew-lobby-members div{min-height:29px;padding:4px 6px}.crew-lobby-members b{font-size:8px}.crew-lobby-members span{font-size:6px;margin-top:2px}
      .crew-lobby-status{min-height:24px;padding:5px 7px;font-size:7px;line-height:1.25}.crew-lobby-actions{gap:5px;margin-top:5px}
    }

    @media(max-height:430px) and (orientation:landscape){
      .crew-lobby{padding:max(5px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(5px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}
      .crew-lobby-card{width:min(650px,calc(100vw - 36px));max-height:calc(100dvh - 12px);padding:8px 12px;border:0;box-shadow:0 12px 42px #0007}
      .crew-lobby-card>small{font-size:6.5px;letter-spacing:1.35px}.crew-lobby-card h2{font-size:16px;line-height:1.12;margin:2px 0 5px}.crew-lobby-card p{font-size:7.5px;line-height:1.3;margin:0 0 6px}
      .crew-factions{gap:5px;margin-bottom:6px}.crew-factions button{min-height:37px;padding:4px 8px 4px 10px}.crew-factions button b{font-size:9px}.crew-factions button small{font-size:5.8px}
      .crew-lobby-room{gap:4px}.crew-lobby-room label{font-size:6.8px;line-height:1.2}.crew-lobby-room input{height:29px;margin-top:3px;padding:4px 8px;font-size:11px}.crew-lobby button{min-height:30px;font-size:7.5px}
      .crew-lobby-members{gap:4px;margin:5px 0 4px}.crew-lobby-members div{min-height:27px;padding:3px 5px}.crew-lobby-members b{font-size:7.5px}.crew-lobby-members span{font-size:5.8px;margin-top:1px}
      .crew-lobby-status{min-height:23px;padding:4px 6px;font-size:6.7px;line-height:1.25}.crew-lobby-actions{gap:4px;margin-top:4px}.crew-lobby-actions button{min-height:30px}
    }

    @media(max-height:330px) and (orientation:landscape){
      .crew-lobby{place-items:start center;padding-top:max(4px,env(safe-area-inset-top));padding-bottom:max(4px,env(safe-area-inset-bottom))}
      .crew-lobby-card{max-height:calc(100dvh - 8px);overflow-y:auto}
    }

    /* iOS needs vertical pan permission all the way through actionable radio rows. */
    .radio,.radio-log,.radio-msg,.radio-report{touch-action:pan-y}.radio-log{-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
  `;
  document.head.appendChild(style);
}

/**
 * DOM-only lobby for one Mamute. It does not choose a network transport.
 * The player chooses Allies or Axis before creating/joining a crew.
 */
export function createCrewLobbyUI({
  root = document.body,
  onHost = () => {},
  onJoin = () => {},
  onOffline = () => {},
  onEnterMamute = () => {},
} = {}) {
  ensureLobbyStyles();
  const shell = document.createElement('section');
  shell.className = 'crew-lobby hidden';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-modal', 'true');
  shell.setAttribute('aria-label', 'Tripulação do M-47 Mamute');
  shell.innerHTML = `
    <div class="crew-lobby-card">
      <small>M–47 MAMUTE / TRIPULAÇÃO</small>
      <h2>ENTRAR NA GUERRA</h2>
      <p data-crew-copy>Escolha de que lado da guerra você vai lutar.</p>
      <div class="crew-factions" data-crew-factions>
        <button type="button" data-crew-faction="${FACTIONS.ALLIES}" aria-pressed="false"><small>LADO AZUL</small><b>ALIADOS</b></button>
        <button type="button" data-crew-faction="${FACTIONS.AXIS}" aria-pressed="false"><small>LADO VERDE</small><b>EIXO</b></button>
      </div>
      <div class="crew-lobby-room">
        <label>CÓDIGO DO MAMUTE<input data-crew-room inputmode="text" maxlength="16" autocomplete="off" spellcheck="false" placeholder="M47-XXXX"></label>
        <button type="button" data-crew-host disabled>CRIAR PARTIDA</button>
        <button type="button" data-crew-join disabled>ENTRAR</button>
      </div>
      <div class="crew-lobby-members" data-crew-members></div>
      <div class="crew-lobby-status" data-crew-status>ESCOLHA ALIADOS OU EIXO</div>
      <div class="crew-lobby-actions">
        <button type="button" data-crew-offline disabled>JOGAR SOZINHO</button>
        <button type="button" data-crew-enter disabled>ENTRAR NO MAMUTE</button>
      </div>
    </div>`;
  root.appendChild(shell);

  const input = shell.querySelector('[data-crew-room]');
  const status = shell.querySelector('[data-crew-status]');
  const members = shell.querySelector('[data-crew-members]');
  const enter = shell.querySelector('[data-crew-enter]');
  const hostButton = shell.querySelector('[data-crew-host]');
  const joinButton = shell.querySelector('[data-crew-join]');
  const offlineButton = shell.querySelector('[data-crew-offline]');
  const factionButtons = [...shell.querySelectorAll('[data-crew-faction]')];
  let latest = null, selectedFaction = null;

  const room = () => cleanRoom(input.value);
  const faction = () => selectedFaction;
  const generateRoom = () => `M47-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  function syncSessionLock() {
    const locked = crewLobbySessionLocked(latest);
    const ready = Boolean(selectedFaction);
    factionButtons.forEach(button => { button.disabled = locked; });
    input.readOnly = locked;
    input.setAttribute('aria-readonly', String(locked));
    hostButton.disabled = locked || !ready;
    joinButton.disabled = locked || !ready;
    offlineButton.disabled = locked || !ready;
    return locked;
  }

  function setFaction(next, { authoritative = false } = {}) {
    const normalized = normalizeFaction(next);
    if (!authoritative && crewLobbySessionLocked(latest) && selectedFaction && normalized !== selectedFaction) return selectedFaction;
    selectedFaction = normalized;
    factionButtons.forEach(button => {
      const active = button.dataset.crewFaction === selectedFaction;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    syncSessionLock();
    if (!latest || latest.mode === 'offline') {
      const info = factionInfo(selectedFaction);
      status.textContent = info ? `${info.label} · PRONTO PARA ENTRAR` : 'ESCOLHA ALIADOS OU EIXO';
      shell.querySelector('[data-crew-copy]').textContent = info ? `${info.label} selecionado. Crie um Mamute, entre por código ou jogue sozinho.` : 'Escolha de que lado da guerra você vai lutar.';
    }
    return selectedFaction;
  }

  factionButtons.forEach(button => button.addEventListener('click', () => setFaction(button.dataset.crewFaction)));
  hostButton.addEventListener('click', () => {
    if (crewLobbySessionLocked(latest) || !selectedFaction) return;
    if (!room()) input.value = generateRoom();
    onHost(room(), selectedFaction);
  });
  joinButton.addEventListener('click', () => { if (!crewLobbySessionLocked(latest) && selectedFaction && room()) onJoin(room(), selectedFaction); });
  offlineButton.addEventListener('click', () => { if (!crewLobbySessionLocked(latest) && selectedFaction) onOffline(selectedFaction); });
  enter.addEventListener('click', () => { if (!enter.disabled) onEnterMamute(latest); });
  input.addEventListener('input', () => { if (!crewLobbySessionLocked(latest)) input.value = cleanRoom(input.value); });

  function setStatus(next = {}) {
    latest = next;
    if (next.faction) setFaction(next.faction, { authoritative: true });
    const connected = Boolean(next.connected || next.mode === 'host');
    const locked = syncSessionLock();
    const count = Math.max(1, Number(next.count) || 1), capacity = Math.max(1, Number(next.capacity) || 3);
    const mode = next.mode === 'host' ? 'HOST' : next.mode === 'guest' ? 'TRIPULANTE' : 'OFFLINE';
    const transport = next.transport && next.transport !== 'none' ? ` · ${String(next.transport).toUpperCase()}` : '';
    const info = factionInfo(next.faction || selectedFaction);
    status.textContent = `${info ? info.label + ' · ' : ''}${mode} · ${count}/${capacity}${transport}`;
    if (next.room) input.value = cleanRoom(next.room);
    const rows = [{ id: next.localId || 'você', seat: Number(next.seat) || 0, local: true }, ...(Array.isArray(next.peers) ? next.peers : [])]
      .sort((a, b) => (Number(a.seat) || 0) - (Number(b.seat) || 0));
    members.innerHTML = rows.slice(0, 3).map(player => `<div><b>${player.local ? 'VOCÊ' : escape(player.id)}</b><span>ASSENTO ${Number(player.seat) + 1}</span></div>`).join('');
    enter.disabled = !selectedFaction || (!connected && next.mode !== 'offline');
    const denied = next.lastEvent?.startsWith?.('denied:');
    shell.querySelector('[data-crew-copy]').textContent = denied
      ? (next.lastEvent === 'denied:faction-mismatch' ? 'Esse Mamute pertence ao outro lado da guerra.' : 'Mamute cheio ou entrada recusada.')
      : locked
        ? `${info?.label || 'FAÇÃO'} · sessão travada neste Mamute. Facção e código não podem mudar enquanto a tripulação estiver conectada.`
        : `${info?.label || 'FAÇÃO'} · até 3 tripulantes no mesmo Mamute. Cada posto físico pertence a uma pessoa por vez.`;
    return latest;
  }

  return Object.freeze({
    show() {
      shell.style.removeProperty('display');
      shell.classList.remove('hidden');
      if (crewLobbySessionLocked(latest)) enter.focus({ preventScroll: true });
      else if (!selectedFaction) factionButtons[0]?.focus({ preventScroll: true });
      else input.focus({ preventScroll: true });
    },
    hide() {
      shell.classList.add('hidden');
      shell.style.setProperty('display', 'none', 'important');
      input.blur();
    },
    setStatus,
    setFaction,
    room,
    faction,
    element: shell,
    destroy() { shell.remove(); },
  });
}