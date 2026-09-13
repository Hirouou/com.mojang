export function createArtilleryShotReplayGuard(limit = 64) {
  const capacity = Math.max(1, Math.trunc(Number(limit) || 64));
  const seen = new Set();
  const order = [];

  function accept(shotId) {
    const id = String(shotId || '').trim();
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    order.push(id);
    while (order.length > capacity) {
      seen.delete(order.shift());
    }
    return true;
  }

  function reset() {
    seen.clear();
    order.length = 0;
  }

  return Object.freeze({ accept, reset });
}
