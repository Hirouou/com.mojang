import { createCrewLobbyUI } from './modules/crew-lobby-ui.js';
import { createCrewRuntime } from './modules/crew-runtime.js';
import { createCrewBroadcastTransport } from './modules/crew-broadcast-transport.js';
import { normalizeFaction, factionInfo } from './modules/factions.js';

const params = new URLSearchParams(location.search);
const crewQa = params.has('crewqa');
const app = document.getElementById('app');
let started = false;
let lobby = null;
let heartbeatTimer = 0;

function localPlayerId() {
  const key = 'iron-rain-player-id';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = `crew-${globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `crew-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const localId = localPlayerId();
const transportFactory = crewQa ? options => createCrewBroadcastTransport(options) : null;
const runtime = createCrewRuntime({
  localId,
  transportFactory,
  onStatus: status => lobby?.setStatus(status),
});

function setNotice(title, copy = '') {
  const root = lobby?.element;
  if (!root) return;
  const status = root.querySelector('[data-crew-status]');
  const message = root.querySelector('[data-crew-copy]');
  if (status) status.textContent = title;
  if (message && copy) message.textContent = copy;
}

function sessionDescriptor(status = {}, fallbackMode = 'offline') {
  const faction = normalizeFaction(status.faction || lobby?.faction());
  return {
    localId,
    faction,
    factionInfo: factionInfo(faction),
    mode: status.mode || fallbackMode,
    room: status.room || '',
    seat: Number.isFinite(Number(status.seat)) ? Number(status.seat) : 0,
    capacity: Number(status.capacity) || 3,
    runtime,
    qaTransport: crewQa,
  };
}

async function startGame(status = {}, fallbackMode = 'offline') {
  if (started) return;
  const entry = sessionDescriptor(status, fallbackMode);
  if (!entry.faction) {
    setNotice('ESCOLHA ALIADOS OU EIXO', 'A facção define de que lado da mesma guerra persistente você vai lutar.');
    return;
  }
  started = true;
  window.ironRainEntry = entry;
  app.dataset.faction = entry.faction;
  app.classList.toggle('faction-allies', entry.faction === 'allies');
  app.classList.toggle('faction-axis', entry.faction === 'axis');
  lobby.hide();
  try {
    await import('./game-v6.js');
  } catch (error) {
    started = false;
    lobby.show();
    setNotice('FALHA AO ABRIR O MAMUTE', 'A interface de entrada foi carregada, mas o jogo principal não iniciou. Reabra o aplicativo.');
    console.error('Iron Rain bootstrap:', error);
  }
}

function ensureHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = window.setInterval(() => {
    const status = runtime.status();
    if (status.mode === 'host' || status.mode === 'guest') runtime.update(null);
  }, 1000);
}

lobby = createCrewLobbyUI({
  root: document.body,
  onHost(room, faction) {
    if (!crewQa) {
      setNotice('MULTIPLAYER ONLINE · EM PREPARAÇÃO', 'Sala, facção e limite de 3 tripulantes já estão prontos. Falta somente o transporte público entre dispositivos; jogar sozinho continua disponível.');
      return;
    }
    const result = runtime.host(room, faction);
    lobby.setStatus(result.status);
    ensureHeartbeat();
  },
  onJoin(room, faction) {
    if (!crewQa) {
      setNotice('MULTIPLAYER ONLINE · EM PREPARAÇÃO', 'O código de Mamute já faz parte do fluxo. A conexão pública entre celulares/PC ainda está sendo ligada.');
      return;
    }
    const result = runtime.join(room, faction);
    lobby.setStatus(result.status);
    ensureHeartbeat();
  },
  onOffline(faction) {
    startGame({ mode: 'offline', faction, room: '', seat: 0, capacity: 3, count: 1 }, 'offline');
  },
  onEnterMamute(status) {
    startGame(status, status?.mode || 'offline');
  },
});

lobby.setStatus({ mode: 'offline', faction: null, localId, seat: 0, count: 1, capacity: 3, lastEvent: 'choose-faction' });
lobby.show();

// The production URL never exposes the same-browser QA transport as public multiplayer.
if (crewQa) setNotice('QA MULTIPLAYER LOCAL', 'Modo de teste: duas abas/PWAs no mesmo navegador podem criar/entrar na mesma sala. Isso ainda não é o transporte público entre dispositivos.');

window.addEventListener('beforeunload', () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  runtime.disconnect('page-close');
}, { once: true });
