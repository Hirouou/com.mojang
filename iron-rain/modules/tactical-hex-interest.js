import { createStrategicHexMap, neighboringHexIds } from './strategic-hex-map.js';

const canonicalHexes = createStrategicHexMap();
const point = value => Number.isFinite(value?.x) && Number.isFinite(value?.y);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const TACTICAL_PRESENTATION_LIMITS = Object.freeze({ traffic: 40, capitals: 40, interpolationSeconds: 2.5 });

export function nearestStrategicHex(position, hexes = canonicalHexes) {
  if (!point(position)) return null;
  let nearest = null, best = Infinity;
  for (const hex of hexes) {
    const current = distance(position, hex);
    if (current < best) { nearest = hex; best = current; }
  }
  return nearest;
}

/** Neighbors are already resident before a border crossing; the camera adds its own ring. */
export function createTacticalHexInterest({ position, camera = position, hexes = canonicalHexes } = {}) {
  const current = nearestStrategicHex(position, hexes), viewed = nearestStrategicHex(camera, hexes) || current;
  const active = new Set();
  for (const hex of [current, viewed]) if (hex) {
    active.add(hex.id);
    for (const id of neighboringHexIds(hex, hexes)) active.add(id);
  }
  return Object.freeze({ currentHexId: current?.id || null, cameraHexId: viewed?.id || null,
    hexIds: Object.freeze([...active]), focus: Object.freeze({ ...(point(camera) ? camera : point(position) ? position : { x: 0, y: 0 }) }) });
}

export function pointInHexInterest(position, interest, hexes = canonicalHexes) {
  if (!interest?.hexIds?.length) return false;
  return interest.hexIds.includes(nearestStrategicHex(position, hexes)?.id);
}

/** A bounded render buffer. Inputs remain authoritative and no position is extrapolated. */
export function createConvoyPresentation({ limit = TACTICAL_PRESENTATION_LIMITS.traffic } = {}) {
  const tracks = new Map();
  let clock = 0;
  function step(convoys = [], dt = 0) {
    clock += Math.max(0, Math.min(.25, Number(dt) || 0));
    const selected = convoys.filter(convoy => convoy?.id && point(convoy.position)).slice(0, limit);
    const ids = new Set(selected.map(convoy => convoy.id));
    for (const id of tracks.keys()) if (!ids.has(id)) tracks.delete(id);
    return selected.map(convoy => {
      const target = convoy.position;
      let track = tracks.get(convoy.id);
      if (!track) {
        track = { from: { ...target }, to: { ...target }, shown: { ...target }, receivedAt: clock, duration: .1 };
        tracks.set(convoy.id, track);
      } else if (target.x !== track.to.x || target.y !== track.to.y || target.heading !== track.to.heading) {
        const elapsed = clock - track.receivedAt;
        track.from = { ...track.shown };
        track.to = { ...target };
        track.duration = Math.max(.08, Math.min(TACTICAL_PRESENTATION_LIMITS.interpolationSeconds, elapsed));
        track.receivedAt = clock;
        // A restored session or remote relocation should not drive across unrelated terrain.
        if (distance(track.from, track.to) > Math.max(1500, (Number(convoy.speed) || 0) * 5)) track.from = { ...target };
      }
      const t = Math.min(1, Math.max(0, (clock - track.receivedAt) / track.duration));
      const heading = Number(track.from.heading) || 0;
      const delta = Math.atan2(Math.sin((Number(track.to.heading) || 0) - heading), Math.cos((Number(track.to.heading) || 0) - heading));
      track.shown = { x: track.from.x + (track.to.x - track.from.x) * t,
        y: track.from.y + (track.to.y - track.from.y) * t, heading: heading + delta * t };
      return Object.freeze({ ...convoy, position: Object.freeze({ ...track.shown }) });
    });
  }
  return Object.freeze({ step, size: () => tracks.size });
}
