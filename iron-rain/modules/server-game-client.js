import { sampleTrajectory } from './ballistics.js';
/** Presentation boundary. No local damage, movement, inventory or war clock. */
export function createServerGameClient({ runtime, getState, onEffect = () => {}, onError = () => {}, now = () => performance.now() } = {}) {
  let first = true, driveAt = 0, aimAt = 0;
  let bearing = 0, elevation = 0;
  let ownId = null, driveKey = '0,0';
  const motion = new Map();
  let followedShot = null, flightAge = 0, flights = [];
  const motionKeys = ['x', 'y', 'facing', 'turret'];
  function receiveMotion(id, robot, at, snap = false) {
    const previous = motion.get(id);
    const target = Object.fromEntries(motionKeys.map(key => [key, Number(robot[key]) || 0]));
    if (!previous || snap || Math.hypot(target.x - previous.to.x, target.y - previous.to.y) > 250) {
      const track = { from: target, to: target, display: { ...target }, elapsed: 0, duration: 0, at };
      motion.set(id, track); return track.display;
    }
    if (motionKeys.some(key => target[key] !== previous.to[key])) {
      previous.from = { ...previous.display }; previous.to = target; previous.elapsed = 0;
      previous.duration = Math.max(.12, Math.min(.35, (at - previous.at) / 1000)); previous.at = at;
    }
    return previous.display;
  }
  function renderMotion(dt) {
    const state = getState();
    for (const track of motion.values()) {
      track.elapsed += Math.max(0, Number(dt) || 0);
      const alpha = track.duration ? Math.min(1, track.elapsed / track.duration) : 1;
      for (const key of motionKeys) {
        const delta = key === 'facing' || key === 'turret'
          ? Math.atan2(Math.sin(track.to[key] - track.from[key]), Math.cos(track.to[key] - track.from[key]))
          : track.to[key] - track.from[key];
        track.display[key] = track.from[key] + delta * alpha;
      }
    }
    if (motion.has(ownId)) Object.assign(state.robot, motion.get(ownId).display);
    for (const m of state.serverMamutes || []) if (motion.has(m.id)) Object.assign(m.robot, motion.get(m.id).display);
  }
  const command = (type, payload = {}) => runtime.command(type, payload).then(result => {
    if (!result.ok) onError(result.reason);
    return result;
  });
  function apply(snapshot) {
    const state = getState(), m = snapshot?.mamute;
    if (!state || !m) return;
    const at = now(), changedMamute = ownId !== m.id;
    ownId = m.id;
    const recoil = state.robot.recoil || 0;
    Object.assign(state.robot, structuredClone(m.robot));
    Object.assign(state.robot, receiveMotion(m.id, m.robot, at, changedMamute));
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
    state.shell = m.projectile ? { ...structuredClone(m.projectile), follow: m.projectile.id === followedShot } : null;
    flights = structuredClone(snapshot.projectiles || (m.projectile ? [{...m.projectile,mamuteId:m.id}] : []));
    flightAge = 0;
    state.serverProjectiles = flights;
    if (snapshot.sectors) state.sectors = structuredClone(snapshot.sectors);
    if (snapshot.tracers) state.tracers = structuredClone(snapshot.tracers);
    if (snapshot.support) { state.warSimulation ||= {}; state.warSimulation.support = structuredClone(snapshot.support); }
    if (snapshot.airWar) state.serverAirWar = snapshot.airWar;
    if (snapshot.recon) state.serverRecon = snapshot.recon;
    if (snapshot.localLogistics) state.serverLocalLogistics = snapshot.localLogistics;
    state.serverMamute = { id: m.id, name: m.name, destroyed: m.destroyed, respawnAt: m.respawnAt, hatchOpen: m.hatchOpen };
    if (snapshot.mamutes) {
      state.serverMamutes = structuredClone(snapshot.mamutes);
      const visible = new Set([m.id]);
      for (const remote of state.serverMamutes) {
        visible.add(remote.id);
        Object.assign(remote.robot, receiveMotion(remote.id, remote.robot, at));
      }
      for (const id of motion.keys()) if (!visible.has(id)) motion.delete(id);
    }
    state.serverStrategic = snapshot.strategic || state.serverStrategic;
    if (first || changedMamute) {
      state.cam.x = m.robot.x; state.cam.y = m.robot.y;
      state.base = { x: m.robot.x + (m.faction === 'axis' ? 450 : -450), y: m.robot.y };
      first = false;
    }
  }
  const offSnapshot = runtime.subscribeSnapshots(apply);
  const offEffects = runtime.subscribeEffects(effect => {
    const state = getState(), payload = effect.payload || {};
    if (effect.type === 'fire' && payload.playerId === runtime.status().localId) {
      followedShot = payload.shotId;
      if (state.shell) state.shell.follow = true;
      if (state.cam) Object.assign(state.cam, {mode:'shell',elapsed:0});
    }
    if (effect.type === 'explosion' && payload.shotId === followedShot) {
      if (state.cam) Object.assign(state.cam, {mode:'impact',x:payload.x,y:payload.y,elapsed:0});
      state.impactHold = 1.65; followedShot = null;
    }
    onEffect(effect);
  });
  function renderFlights(dt) {
    const state = getState();
    if (followedShot && state.shell && state.shell.follow === false) followedShot = null;
    flightAge = Math.min(.8, flightAge + Math.max(0,dt));
    state.serverProjectiles = flights.map(shell => {
      if (!shell.solution) return shell;
      const t = Math.min(shell.solution.tof, shell.t + flightAge * shell.compression);
      return {...shell,...sampleTrajectory(shell.solution,shell.origin,shell.bearing,shell.wind,t),t};
    });
    const own = state.serverProjectiles.find(shell => shell.mamuteId === ownId);
    if (own && state.shell) Object.assign(state.shell,own,{follow:own.id===followedShot});
    if (own?.id === followedShot && state.cam?.mode === 'shell') Object.assign(state.cam,{x:own.x,y:own.y});
  }
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
      // Interpolate only between server positions. Never extrapolate velocity,
      // advance inventory, or apply damage in the browser.
      renderMotion(dt);
      renderFlights(dt);
      driveAt += dt; aimAt += dt;
      if (aimAt >= .1) { aimAt = 0; flushAim(); }
      if (runtime.stationOwner('drive') === runtime.status().localId) {
        const next = driving ? { x: Math.round((Number(vector?.x) || 0) * 100) / 100, y: Math.round((Number(vector?.y) || 0) * 100) / 100 } : { x: 0, y: 0 };
        const key = `${next.x},${next.y}`, changed = key !== driveKey, stop = key === '0,0';
        if ((changed && (stop || driveAt >= .1)) || (!stop && driveAt >= .4)) {
          driveAt = 0; driveKey = key; command('drive-vector', next);
        }
      }
    },
    dispose() { offSnapshot(); offEffects(); },
  };
}
