import { createCrewLobbyUI } from './modules/crew-lobby-ui.js';
import { createCrewRuntime } from './modules/crew-runtime.js';
import { createCrewBroadcastTransport } from './modules/crew-broadcast-transport.js';
import { createCrewMqttTransport } from './modules/crew-mqtt-transport.js';
import { createCrewCabinBridge } from './modules/crew-cabin-bridge.js';
import { stationGateMessage } from './modules/crew-station-gate.js';
import { normalizeFaction, factionInfo } from './modules/factions.js';

const params = new URLSearchParams(location.search);
const crewQa = params.has('crewqa');
const app = document.getElementById('app');
let started = false;
let lobby = null;
let heartbeatTimer = 0;
let crewBridge = null;
let crewFrame = 0;
let strategicWar = null;
let crewToastTimer = 0;
let liveIntegrationPromise = null;
let lastCrewFrameAt = performance.now();

if (!document.querySelector('link[data-iron-rain-mobile-station]')) {
  const stationStyles = document.createElement('link');
  stationStyles.rel = 'stylesheet';
  stationStyles.href = './mobile-station-ui.css';
  stationStyles.dataset.ironRainMobileStation = '1';
  document.head.appendChild(stationStyles);
}

function localPlayerId() {
  const tabKey = 'iron-rain-crew-tab-id';
  try {
    const existing = sessionStorage.getItem(tabKey);
    if (existing) return existing;
    let device = localStorage.getItem('iron-rain-device-id');
    if (!device) {
      device = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
      localStorage.setItem('iron-rain-device-id', device);
    }
    const created = `crew-${device}-${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem(tabKey, created);
    return created;
  } catch { return `crew-${Math.random().toString(36).slice(2, 12)}`; }
}

const localId = localPlayerId();
const transportFactory = crewQa ? options => createCrewBroadcastTransport(options) : options => createCrewMqttTransport(options);
const runtime = createCrewRuntime({ localId, transportFactory, onStatus: status => lobby?.setStatus(status) });

function setNotice(title, copy = '') {
  const root = lobby?.element;
  if (!root) return;
  const status = root.querySelector('[data-crew-status]');
  const message = root.querySelector('[data-crew-copy]');
  if (status) status.textContent = title;
  if (message && copy) message.textContent = copy;
}

function showCrewToast(message, source = 'TRIPULAÇÃO') {
  const shell = document.getElementById('warToast'), label = document.getElementById('warToastSource'), text = document.getElementById('warToastText');
  if (!shell || !text) return false;
  if (label) label.textContent = source;
  text.textContent = message;
  shell.classList.remove('hidden');
  clearTimeout(crewToastTimer);
  crewToastTimer = window.setTimeout(() => shell.classList.add('hidden'), 2600);
  return true;
}

function loadLiveIntegration() {
  if (!liveIntegrationPromise) {
    liveIntegrationPromise = import('./modules/integration-live.js').catch(error => {
      console.error('Iron Rain live integration:', error);
      return null;
    });
  }
  return liveIntegrationPromise;
}

async function fallbackSpawn(faction) {
  const selected = globalThis.ironRainSpawnChoice;
  if (selected) return { ...selected };
  try {
    const { resolveSpawnChoice } = await import('./modules/spawn-selector.js');
    const fallback = resolveSpawnChoice(faction);
    if (!fallback) return null;
    globalThis.ironRainSpawnChoice = { ...fallback };
    return { ...fallback };
  } catch (error) {
    console.error('Iron Rain spawn fallback:', error);
    return null;
  }
}

function sessionDescriptor(status = {}, fallbackMode = 'offline') {
  const faction = normalizeFaction(status.faction || lobby?.faction());
  const spawn = globalThis.ironRainSpawnChoice ? { ...globalThis.ironRainSpawnChoice } : null;
  return { localId, faction, factionInfo: factionInfo(faction), mode: status.mode || fallbackMode, room: status.room || '', seat: Number.isFinite(Number(status.seat)) ? Number(status.seat) : 0, capacity: Number(status.capacity) || 3, runtime, crewBridge: null, qaTransport: crewQa, spawn };
}

function publishCrewBridge(nextBridge) {
  crewBridge = nextBridge || null;
  if (window.ironRainEntry) window.ironRainEntry.crewBridge = crewBridge;
  window.dispatchEvent(new CustomEvent('ironrain:crew-bridge-change', { detail: { bridge: crewBridge } }));
}

function stopCrewFrame() {
  if (crewFrame) cancelAnimationFrame(crewFrame);
  crewFrame = 0;
  crewBridge?.clear?.();
  publishCrewBridge(null);
}

function attachCrewCabin(cabin) {
  if (!cabin || typeof cabin.snapshot !== 'function' || typeof cabin.updateRemoteCrew !== 'function') return false;
  stopCrewFrame();
  publishCrewBridge(createCrewCabinBridge({ runtime, cabin, interpolationDelay: .1 }));
  lastCrewFrameAt = performance.now();
  const frame = nowMs => {
    if (!crewBridge) return;
    const dt = Math.min(.1, Math.max(0, (nowMs - lastCrewFrameAt) / 1000));
    lastCrewFrameAt = nowMs;
    crewBridge.update(dt, nowMs / 1000);
    crewFrame = requestAnimationFrame(frame);
  };
  crewFrame = requestAnimationFrame(frame);
  return true;
}

window.addEventListener('ironrain:cabin-ready', event => { attachCrewCabin(event.detail?.cabin); });
window.addEventListener('ironrain:station-gate', event => { const message = stationGateMessage(event.detail); if (message) showCrewToast(message, 'POSTO'); });

async function startGame(status = {}, fallbackMode = 'offline') {
  if (started) return;
  const entry = sessionDescriptor(status, fallbackMode);
  if (!entry.faction) { setNotice('ESCOLHA ALIADOS OU EIXO', 'A facção define de que lado da mesma guerra persistente você vai lutar.'); return; }
  if (!entry.spawn) entry.spawn = await fallbackSpawn(entry.faction);
  if (!entry.spawn) { setNotice('LOCAL DE NASCIMENTO INDISPONÍVEL', 'O mapa não conseguiu resolver um hexágono seguro. Reabra o aplicativo para tentar novamente.'); return; }
  started = true;
  window.ironRainEntry = entry;
  app.dataset.faction = entry.faction;
  app.classList.toggle('faction-allies', entry.faction === 'allies');
  app.classList.toggle('faction-axis', entry.faction === 'axis');
  try {
    const strategicModule = await import('./modules/strategic-war-live.js');
    strategicWar ||= strategicModule.installStrategicWarLive({ app });
    lobby.hide();
    void loadLiveIntegration();
    await import('./game-v6.js');
  } catch (error) {
    started = false; stopCrewFrame(); lobby.show();
    setNotice('FALHA AO ABRIR O MAMUTE', 'A entrada continua disponível, mas um módulo da partida falhou ao iniciar. Recarregue a página para receber a build mais recente.');
    console.error('Iron Rain bootstrap:', error);
  }
}

function ensureHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = window.setInterval(() => {
    if (crewBridge) return;
    const status = runtime.status();
    if (status.mode === 'host' || status.mode === 'guest') runtime.update(null);
  }, 1000);
}

function beginCrew(mode, room, faction) {
  const result = mode === 'host' ? runtime.host(room, faction) : runtime.join(room, faction);
  lobby.setStatus(result.status);
  if (!result.ok) { setNotice('CONEXÃO INDISPONÍVEL', 'Não foi possível iniciar o transporte multiplayer neste navegador. Jogar sozinho continua disponível.'); return result; }
  ensureHeartbeat();
  if (!crewQa && mode === 'host') setNotice('SALA ABERTA · CONECTANDO', 'Compartilhe o mesmo código e a mesma facção. O segundo jogador aparece quando a conexão pública responder.');
  if (!crewQa && mode === 'guest') setNotice('PROCURANDO MAMUTE', 'Aguardando resposta do host pelo código informado.');
  return result;
}

lobby = createCrewLobbyUI({
  root: document.body,
  onHost(room, faction) { beginCrew('host', room, faction); },
  onJoin(room, faction) { beginCrew('guest', room, faction); },
  onOffline(faction) { startGame({ mode: 'offline', faction, room: '', seat: 0, capacity: 3, count: 1 }, 'offline'); },
  onEnterMamute(status) { startGame(status, status?.mode || 'offline'); },
});

lobby.setStatus({ mode: 'offline', faction: null, localId, seat: 0, count: 1, capacity: 3, lastEvent: 'choose-faction' });
setNotice('ESCOLHA ALIADOS OU EIXO', 'Escolha seu lado, depois o hexágono 100% dominado onde o Mamute vai nascer.');
lobby.show();
void loadLiveIntegration();
if (crewQa) setNotice('QA MULTIPLAYER LOCAL', 'Modo de teste: duas abas no mesmo computador podem criar/entrar na mesma sala sem usar a internet pública.');

window.addEventListener('beforeunload', () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (crewToastTimer) clearTimeout(crewToastTimer);
  stopCrewFrame();
  runtime.disconnect('page-close');
}, { once: true });
