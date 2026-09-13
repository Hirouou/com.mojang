/** Presentation boundary. No local damage, movement, inventory or war clock. */
export function createServerGameClient({ runtime, getState, onEffect = () => {}, onError = () => {} }) {
  let first = true, driveAt = 0, aimAt = 0;
  let bearing = 0, elevation = 0;
  const command = (type, payload = {}) => runtime.command(type, payload).then(result => {
    if (!result.ok) onError(result.reason);
    return result;
  });
  function apply(snapshot) {
    const state = getState(), m = snapshot?.mamute;
    if (!state || !m) return;
    const recoil = state.robot.recoil || 0;
    Object.assign(state.robot, structuredClone(m.robot));
    state.robot.recoil = Math.max(recoil, m.robot.recoil || 0);
    state.time = snapshot.time;
    state.bearing = state.azTarget = m.bearing;
    state.elev = state.elTarget = m.elev;
    state.charge = m.charge;
    state.ammo = { ...m.ammo };
    state.wind = { ...snapshot.wind };
    state.engine = structuredClone(m.engine);
    state.engineLastArmor = m.robot.armor;
    state.loading = structuredClone(m.loading);
    state.loadedShell = m.loadedShell;
    state.serverSelectedShell = m.selectedShell;
    state.shell = m.projectile ? { ...structuredClone(m.projectile), follow: false } : null;
    state.sectors = structuredClone(snapshot.sectors || []);
    state.tracers = structuredClone(snapshot.tracers || []);
    state.serverMamute = { id: m.id, name: m.name, destroyed: m.destroyed, respawnAt: m.respawnAt, hatchOpen: m.hatchOpen };
    state.serverMamutes = structuredClone(snapshot.mamutes || []);
    state.serverStrategic = snapshot.strategic || state.serverStrategic;
    if (first) {
      state.cam.x = m.robot.x; state.cam.y = m.robot.y;
      state.base = { x: m.robot.x + (m.faction === 'axis' ? 450 : -450), y: m.robot.y };
      first = false;
    }
  }
  const offSnapshot = runtime.subscribeSnapshots(apply);
  const offEffects = runtime.subscribeEffects(onEffect);
  function flushAim() {
    if (Math.abs(bearing) < .00001 && Math.abs(elevation) < .00001) return;
    const b = Math.max(-12, Math.min(12, bearing)), e = Math.max(-8, Math.min(8, elevation));
    bearing -= b; elevation -= e;
    command('aim-delta', { bearing: b, elevation: e });
  }
  return {
    apply, command,
    turn(axis, degrees) { if (axis === 'azimuth') bearing += degrees; else elevation += degrees; },
    fire() { while (Math.abs(bearing) > .00001 || Math.abs(elevation) > .00001) flushAim(); return command('fire'); },
    update(dt, vector, driving) {
      driveAt += dt; aimAt += dt;
      if (aimAt >= .1) { aimAt = 0; flushAim(); }
      if (driveAt >= .2) {
        driveAt = 0;
        if (runtime.stationOwner('drive') === runtime.status().localId) command('drive-vector', driving ? vector : { x: 0, y: 0 });
      }
    },
    dispose() { offSnapshot(); offEffects(); },
  };
}
