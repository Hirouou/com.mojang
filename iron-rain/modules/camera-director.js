import { stepMarchAutopilot } from './march-autopilot.js';
import { installOperatorEnhancements, publishReconVisual } from './operator-enhancements.js';
import { stepTankTactics } from './tank-tactics.js';

// Local camera only. Cinematic states never change scale to fit the theatre.
const CAMERA_MODES = new Set(['follow', 'shell', 'intel', 'impact', 'return']);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
export const cinematicActive = state => state.cam.mode !== 'follow';
export const smooth = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));

export function cameraAnchor(state, viewportWidth) {
  const width = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  const zoom = Number.isFinite(state.cam.zoom) && state.cam.zoom > 0 ? state.cam.zoom : 1;
  const fallbackX = Number.isFinite(state.cam.x) ? state.cam.x : 0;
  const fallbackY = Number.isFinite(state.cam.y) ? state.cam.y : 0;
  const robotPositionValid = Number.isFinite(state.robot?.x) && Number.isFinite(state.robot?.y);
  if (!robotPositionValid) return { x: fallbackX, y: fallbackY };
  return { x: state.robot.x + Math.min(230, width / zoom * .12), y: state.robot.y };
}

export function finishCamera(state, viewportWidth) {
  const p = cameraAnchor(state, viewportWidth);
  Object.assign(state.cam, p, { mode:'follow', manualX:0, manualY:0, elapsed:0 });
  state.returning = false;
  state.impactHold = 0;
}

export function beginReturn(state) {
  state.cam.mode = 'return';
  state.cam.elapsed = 0;
  state.returning = true;
  state.cam.manualX = state.cam.manualY = 0;
}

function updateOperatorZoom(state, dt) {
  const cam = state.cam;
  const requested = Number(globalThis.ironRainMarchZoomTarget);
  const fallback = Number.isFinite(cam.targetZoom) && cam.targetZoom > 0 ? cam.targetZoom : Number.isFinite(cam.zoom) && cam.zoom > 0 ? cam.zoom : .78;
  const desired = clamp(Number.isFinite(requested) ? requested : fallback, .38, 1.28);
  cam.targetZoom = desired;
  if (!Number.isFinite(cam.zoom) || cam.zoom <= 0) cam.zoom = desired;
  if (cam.mode === 'follow') cam.zoom += (desired - cam.zoom) * smooth(7, dt);
}

export function stepCamera(state, dt, viewportWidth) {
  const cam = state.cam;
  const frameDtValid = Number.isFinite(dt) && dt >= 0;
  const frameDt = frameDtValid ? dt : 0;

  installOperatorEnhancements();

  // Strategic-map movement is physical movement of the same Mamute. Running it
  // here keeps manual driving, camera follow, multiplayer/war updates and the
  // world marker on one state instead of inventing a second vehicle position.
  if(!globalThis.ironRainEntry?.runtime?.isAuthoritativeClient)stepMarchAutopilot(state, frameDt);

  // Armour now manoeuvres in two dimensions instead of sliding on one X axis:
  // damaged tanks fall back, assault armour closes, fire-support armour holds
  // standoff distance and crews relocate laterally when smoke blocks the lane.
  if(!globalThis.ironRainEntry?.runtime?.isAuthoritativeClient)stepTankTactics(state, frameDt);
  updateOperatorZoom(state, frameDt);

  // The radio/recon aircraft presentation lives in a transparent overlay so it
  // can be upgraded without changing what the intelligence system knows.
  publishReconVisual(state);

  // Unknown transient modes otherwise count as cinematic forever while falling
  // through to ordinary follow smoothing. Fail closed to the canonical Mamute
  // anchor so a corrupted projectile/intel state cannot trap operator controls.
  if (!CAMERA_MODES.has(cam.mode)) {
    finishCamera(state, viewportWidth);
    return;
  }
  if (cam.mode === 'shell' || cam.mode === 'intel') return;
  if (cam.mode === 'impact') {
    const impactHold = Number.isFinite(state.impactHold) ? Math.max(0, state.impactHold) : 0;
    state.impactHold = impactHold - frameDt;
    if (!frameDtValid || state.impactHold <= 0) beginReturn(state);
    return;
  }
  const anchor = cameraAnchor(state, viewportWidth);
  // Cinematic camera coordinates come from transient projectile/impact state.
  // If either axis is corrupted, arithmetic interpolation would keep NaN/Infinity
  // forever and prevent a reliable return to the Mamute. Recover each axis from
  // the canonical local anchor before applying the normal smoothing step.
  if (!Number.isFinite(cam.x)) cam.x = anchor.x;
  if (!Number.isFinite(cam.y)) cam.y = anchor.y;
  if (cam.mode === 'return') {
    // A corrupted/negative frame delta cannot safely advance the bounded return
    // timer. Snap to the same canonical anchor rather than leave the projectile
    // camera stranded indefinitely away from the Mamute.
    if (!frameDtValid) {
      finishCamera(state, viewportWidth);
      return;
    }
    cam.elapsed = (cam.elapsed || 0) + frameDt;
    const a = smooth(5.5, frameDt);
    cam.x += (anchor.x - cam.x) * a;
    cam.y += (anchor.y - cam.y) * a;
    if (Math.hypot(cam.x-anchor.x,cam.y-anchor.y) < 8 || cam.elapsed >= 2.8) finishCamera(state, viewportWidth);
  } else {
    const a = smooth(5, frameDt);
    cam.x += (anchor.x + cam.manualX - cam.x) * a;
    cam.y += (anchor.y + cam.manualY - cam.y) * a;
  }
}
