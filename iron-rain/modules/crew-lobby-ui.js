const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const cleanRoom = value => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);

function ensureLobbyStyles() {
  if (document.getElementById('iron-rain-crew-lobby-style')) return;
  const style = document.createElement('style');
  style.id = 'iron-rain-crew-lobby-style';
  style.textContent = `
    .crew-lobby{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));background:radial-gradient(circle at 50% 30%,#273129f2,#090d0bf8);color:#d9d2b1;font-family:ui-monospace,Consolas,monospace}
    .crew-lobby.hidden{display:none}.crew-lobby-card{width:min(560px,100%);padding:22px;border:1px solid #81785b;background:#111813f5;box-shadow:0 22px 90px #000c}.crew-lobby-card>small{letter-spacing:2px;color:#8e9a86;font-size:9px}.crew-lobby-card h2{margin:8px 0 6px;font-size:26px;letter-spacing:2px;color:#eadcaf}.crew-lobby-card p{margin:0 0 16px;color:#aeb7a4;font-size:10px;line-height:1.5}
    .crew-lobby-room{display:grid;grid-template-columns:1fr 1fr;gap:8px}.crew-lobby-room label{grid-column:1/-1;font-size:9px;letter-spacing:1px;color:#bdb58f}.crew-lobby-room input{box-sizing:border-box;width:100%;margin-top:6px;padding:13px 12px;border:1px solid #73795f;background:#080e0a;color:#f0dfad;font:700 17px ui-monospace,monospace;letter-spacing:2px;text-transform:uppercase}.crew-lobby button{min-height:46px;border:1px solid #727b61;background:#273124;color:#ddcf9f;font:700 10px ui-monospace,monospace;letter-spacing:1px}.crew-lobby button:disabled{opacity:.35}.crew-lobby button:active{transform:translateY(1px)}
    .crew-lobby-members{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:14px 0 8px}.crew-lobby-members div{min-height:48px;padding:8px;border-left:2px solid #8f7e51;background:#182118}.crew-lobby-members b,.crew-lobby-members span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.crew-lobby-members b{font-size:10px;color:#e0d3aa}.crew-lobby-members span{margin-top:6px;font-size:7px;color:#8e9a87}.crew-lobby-status{padding:8px 10px;background:#0a100c;border:1px solid #414b3b;color:#aebc9f;font-size:9px;letter-spacing:1px}.crew-lobby-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.crew-lobby-actions [data-crew-enter]{background:#4a442a;border-color:#a69055;color:#f2dca0}
    @media(max-width:720px) and (orientation:landscape){.crew-lobby-card{width:min(600px,92vw);padding:13px}.crew-lobby-card h2{font-size:18px;margin:4px 0}.crew-lobby-card p{margin-bottom:9px}.crew-lobby-room input{padding:8px 10px;font-size:13px}.crew-lobby button{min-height:38px;font-size:9px}.crew-lobby-members{margin:8px 0 5px}.crew-lobby-members div{min-height:36px;padding:6px}.crew-lobby-members span{margin-top:3px}}
  `;
  document.head.appendChild(style);
}

/**
 * DOM-only lobby for one Mamute. It does not choose a network transport.
 * The runtime passed by the caller owns host/join/disconnect and status.
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
      <p data-crew-copy>Até 3 tripulantes no mesmo Mamute.</p>
      <div class="crew-lobby-room">
        <label>CÓDIGO DO MAMUTE<input data-crew-room inputmode="text" maxlength="16" autocomplete="off" spellcheck="false" placeholder="M47-XXXX"></label>
        <button type="button" data-crew-host>CRIAR PARTIDA</button>
        <button type="button" data-crew-join>ENTRAR</button>
      </div>
      <div class="crew-lobby-members" data-crew-members></div>
      <div class="crew-lobby-status" data-crew-status>OFFLINE</div>
      <div class="crew-lobby-actions">
        <button type="button" data-crew-offline>JOGAR SOZINHO</button>
        <button type="button" data-crew-enter disabled>ENTRAR NO MAMUTE</button>
      </div>
    </div>`;
  root.appendChild(shell);

  const input = shell.querySelector('[data-crew-room]');
  const status = shell.querySelector('[data-crew-status]');
  const members = shell.querySelector('[data-crew-members]');
  const enter = shell.querySelector('[data-crew-enter]');
  let latest = null;

  const room = () => cleanRoom(input.value);
  const generateRoom = () => `M47-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  shell.querySelector('[data-crew-host]').addEventListener('click', () => {
    if (!room()) input.value = generateRoom();
    onHost(room());
  });
  shell.querySelector('[data-crew-join]').addEventListener('click', () => { if (room()) onJoin(room()); });
  shell.querySelector('[data-crew-offline]').addEventListener('click', () => onOffline());
  enter.addEventListener('click', () => { if (!enter.disabled) onEnterMamute(latest); });
  input.addEventListener('input', () => { input.value = cleanRoom(input.value); });

  function setStatus(next = {}) {
    latest = next;
    const connected = Boolean(next.connected || next.mode === 'host');
    const count = Math.max(1, Number(next.count) || 1), capacity = Math.max(1, Number(next.capacity) || 3);
    const mode = next.mode === 'host' ? 'HOST' : next.mode === 'guest' ? 'TRIPULANTE' : 'OFFLINE';
    const transport = next.transport && next.transport !== 'none' ? ` · ${String(next.transport).toUpperCase()}` : '';
    status.textContent = `${mode} · ${count}/${capacity}${transport}`;
    if (next.room) input.value = cleanRoom(next.room);
    const rows = [{ id: next.localId || 'você', seat: Number(next.seat) || 0, local: true }, ...(Array.isArray(next.peers) ? next.peers : [])]
      .sort((a, b) => (Number(a.seat) || 0) - (Number(b.seat) || 0));
    members.innerHTML = rows.slice(0, 3).map(player => `<div><b>${player.local ? 'VOCÊ' : escape(player.id)}</b><span>ASSENTO ${Number(player.seat) + 1}</span></div>`).join('');
    enter.disabled = !connected && next.mode !== 'offline';
    shell.querySelector('[data-crew-copy]').textContent = next.lastEvent?.startsWith?.('denied:') ? 'Mamute cheio ou entrada recusada.' : 'Até 3 tripulantes no mesmo Mamute. Cada posto físico pertence a uma pessoa por vez.';
    return latest;
  }

  return Object.freeze({
    show() { shell.classList.remove('hidden'); input.focus({ preventScroll: true }); },
    hide() { shell.classList.add('hidden'); input.blur(); },
    setStatus,
    room,
    element: shell,
    destroy() { shell.remove(); },
  });
}
