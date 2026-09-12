// Local camera only. Cinematic states never change scale to fit the theatre.
export const cinematicActive = state => state.cam.mode !== 'follow';
export const smooth = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));
export function cameraAnchor(state, viewportWidth) {
  return { x: state.robot.x + Math.min(230, viewportWidth / state.cam.zoom * .12), y: state.robot.y };
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
export function stepCamera(state, dt, viewportWidth) {
  const cam = state.cam;
  if (cam.mode === 'shell' || cam.mode === 'intel') return;
  if (cam.mode === 'impact') {
    state.impactHold -= dt;
    if (state.impactHold <= 0) beginReturn(state);
    return;
  }
  const anchor = cameraAnchor(state, viewportWidth);
  if (cam.mode === 'return') {
    cam.elapsed = (cam.elapsed || 0) + dt;
    const a = smooth(5.5, dt);
    cam.x += (anchor.x - cam.x) * a;
    cam.y += (anchor.y - cam.y) * a;
    if (Math.hypot(cam.x-anchor.x,cam.y-anchor.y) < 8 || cam.elapsed >= 2.8) finishCamera(state, viewportWidth);
  } else {
    const a = smooth(5, dt);
    cam.x += (anchor.x + cam.manualX - cam.x) * a;
    cam.y += (anchor.y + cam.manualY - cam.y) * a;
  }
}
