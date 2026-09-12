const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BROKERS = Object.freeze([
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
]);

const clean = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
const text = value => encoder.encode(String(value ?? ''));
const u16 = value => new Uint8Array([(value >> 8) & 255, value & 255]);
const concat = (...parts) => {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
const mqttString = value => { const bytes = text(value); return concat(u16(bytes.length), bytes); };
const remaining = value => {
  const bytes = [];
  do { let digit = value % 128; value = Math.floor(value / 128); if (value > 0) digit |= 128; bytes.push(digit); } while (value > 0);
  return new Uint8Array(bytes);
};
const packet = (header, body = new Uint8Array()) => concat(new Uint8Array([header]), remaining(body.length), body);

function connectPacket(clientId, keepAlive = 25) {
  const variable = concat(mqttString('MQTT'), new Uint8Array([4, 2]), u16(keepAlive));
  return packet(0x10, concat(variable, mqttString(clientId)));
}
function subscribePacket(topic, id = 1) { return packet(0x82, concat(u16(id), mqttString(topic), new Uint8Array([0]))); }
function publishPacket(topic, payload) { return packet(0x30, concat(mqttString(topic), text(payload))); }
function readLength(bytes, offset) {
  let multiplier = 1, value = 0, used = 0, digit;
  do { if (offset + used >= bytes.length || used >= 4) return null; digit = bytes[offset + used++]; value += (digit & 127) * multiplier; multiplier *= 128; } while (digit & 128);
  return { value, used };
}
function parsePublish(bytes, start, length) {
  if (length < 2) return null;
  const topicLength = (bytes[start] << 8) | bytes[start + 1];
  const topicStart = start + 2, payloadStart = topicStart + topicLength, end = start + length;
  if (payloadStart > end) return null;
  return { topic: decoder.decode(bytes.subarray(topicStart, payloadStart)), payload: decoder.decode(bytes.subarray(payloadStart, end)) };
}

/**
 * P0 cross-device crew transport for static GitHub Pages.
 * Uses anonymous public MQTT-over-WebSocket brokers as temporary signalling/data relay.
 * No secret is embedded in the client. This is a field-test transport, not the final
 * persistent-war backend: room traffic is not authenticated or encrypted end-to-end.
 */
export function createCrewMqttTransport({
  room,
  faction,
  onMessage = () => {},
  WebSocketImpl = globalThis.WebSocket,
  brokers = BROKERS,
} = {}) {
  const roomCode = clean(room).toUpperCase();
  const side = clean(faction);
  if (!roomCode || !side) throw new RangeError('room and faction required');
  const topic = `iron-rain/crew/v1/${side}/${roomCode.toLowerCase()}`;
  const clientId = `ir-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36).slice(-5)}`;
  const queue = [];
  let socket = null, brokerIndex = 0, stopped = false, active = false, subscribed = false, keepAliveTimer = 0, reconnectTimer = 0;

  const clearTimers = () => { clearInterval(keepAliveTimer); clearTimeout(reconnectTimer); keepAliveTimer = reconnectTimer = 0; };
  const sendRaw = bytes => {
    if (!socket || socket.readyState !== 1) return false;
    try { socket.send(bytes); return true; } catch { return false; }
  };
  const flush = () => { if (!subscribed) return; while (queue.length) if (!sendRaw(publishPacket(topic, queue[0]))) break; else queue.shift(); };

  function handleFrame(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let offset = 0;
    while (offset + 2 <= bytes.length) {
      const header = bytes[offset++], info = readLength(bytes, offset);
      if (!info) return;
      offset += info.used;
      if (offset + info.value > bytes.length) return;
      const type = header >> 4, start = offset;
      if (type === 2 && info.value >= 2 && bytes[start + 1] === 0) {
        sendRaw(subscribePacket(topic, 1));
      } else if (type === 9) {
        subscribed = true; active = true; flush();
      } else if (type === 3) {
        const incoming = parsePublish(bytes, start, info.value);
        if (incoming?.topic === topic) {
          try { onMessage(JSON.parse(incoming.payload)); } catch {}
        }
      }
      offset += info.value;
    }
  }

  function connect() {
    if (stopped || typeof WebSocketImpl !== 'function' || !brokers.length) return false;
    const url = brokers[brokerIndex % brokers.length];
    try { socket = new WebSocketImpl(url, 'mqtt'); } catch { return false; }
    try { socket.binaryType = 'arraybuffer'; } catch {}
    socket.onopen = () => {
      subscribed = active = false;
      sendRaw(connectPacket(clientId));
      clearInterval(keepAliveTimer);
      keepAliveTimer = setInterval(() => sendRaw(new Uint8Array([0xc0, 0x00])), 18000);
    };
    socket.onmessage = event => {
      const data = event?.data;
      if (data instanceof ArrayBuffer) handleFrame(data);
      else if (ArrayBuffer.isView(data)) handleFrame(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      active = subscribed = false;
      clearInterval(keepAliveTimer);
      if (stopped) return;
      brokerIndex = (brokerIndex + 1) % brokers.length;
      reconnectTimer = setTimeout(connect, 900);
    };
    return true;
  }

  function start() { stopped = false; return connect(); }
  function send(value) {
    if (!value) return false;
    let payload;
    try { payload = JSON.stringify(value); } catch { return false; }
    if (subscribed && sendRaw(publishPacket(topic, payload))) return true;
    queue.push(payload);
    if (queue.length > 96) queue.shift();
    return true;
  }
  function close() {
    stopped = true; active = subscribed = false; queue.length = 0; clearTimers();
    try { sendRaw(new Uint8Array([0xe0, 0x00])); socket?.close?.(); } catch {}
    socket = null;
  }

  return Object.freeze({ start, send, close, room: roomCode, kind: 'mqtt-public-p0', get active() { return active; }, get broker() { return brokers[brokerIndex % brokers.length] || ''; } });
}

export const MQTT_PUBLIC_BROKERS = BROKERS;
