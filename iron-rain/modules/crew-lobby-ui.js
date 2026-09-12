const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const cleanRoom = value => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);

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
