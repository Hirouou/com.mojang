/**
 * Same-origin QA transport for the crew protocol.
 * This is intentionally NOT the final internet transport: it lets two tabs or
 * PWA instances on the same browser profile exercise the complete session and
 * replication pipeline before WebRTC/WebSocket signaling is attached.
 */
export function createCrewBroadcastTransport({ room, onMessage = () => {}, channelFactory } = {}) {
  const code = String(room ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
  if (!code) throw new RangeError('room code required');
  const Factory = channelFactory || globalThis.BroadcastChannel;
  let channel = null;
  let active = false;

  function start() {
    if (active) return true;
    if (typeof Factory !== 'function') return false;
    channel = new Factory(`iron-rain:crew:${code}`);
    channel.onmessage = event => {
      if (!active) return;
      try { onMessage(event?.data); } catch { /* consumer errors never poison transport */ }
    };
    active = true;
    return true;
  }

  function send(packet) {
    if (!active || !channel || !packet) return false;
    try { channel.postMessage(packet); return true; } catch { return false; }
  }

  function close() {
    active = false;
    if (channel) {
      try { channel.onmessage = null; channel.close(); } catch {}
      channel = null;
    }
  }

  return Object.freeze({ start, send, close, get active() { return active; }, room: code, kind: 'broadcast-qa' });
}
