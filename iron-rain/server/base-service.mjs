/** Finite, server-owned loading at a friendly base. No client-supplied stock. */
const SHELL_CAP = Object.freeze({ HE: 18, FRAG: 8, SMOKE: 8 });
const RACK = Object.freeze({ x: -12, z: 0 });
const REAR = Object.freeze({ x: 0, z: 8 });
const BOUNDS = 24, WALK_SPEED = 5, REACH = 2.8;
const fail = reason => ({ ok: false, reason });
const teamOf = faction => faction === 'axis' ? 'enemy' : faction === 'allies' ? 'ally' : null;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const number = value => typeof value === 'number' && Number.isFinite(value);
const copyCarry = carry => carry ? { ...carry } : null;

export function createBaseService({ state, theatre, online, release = () => {}, event = () => {} } = {}) {
  const clock = () => Math.max(0, Number(state.time) || 0);
  const validPlayer = player => Boolean(player && state.players[player.id] === player);
  const vehicle = player => state.mamutes[player?.mamuteId] || null;
  const present = player => {
    const p = online.get(player?.id);
    const wall = Number(state.wallMs);
    return Boolean(p && (!Number.isFinite(wall) || !Number.isFinite(p.at) || wall - p.at < 8000));
  };
  const sourceNode = id => theatre.logistics.getNode(id);
  function baseRecord(id, team) {
    const node = theatre.territory.get(id), endpoint = sourceNode(id);
    const record = theatre.records.get(id);
    if (!node || node.owner !== team || node.contested || !endpoint?.alive || endpoint.team !== team
      || !node.structures?.some(type => type === 'outpost' || type === 'depot')) return null;
    return { id, name: record?.hex?.name ? `${record.hex.name} / ${record.sector.name}` : record?.sector?.name || id,
      x: endpoint.x, y: endpoint.y, ammo: Math.max(0, Math.floor(Number(endpoint.stock?.ammo) || 0)), structures: [...node.structures] };
  }
  function closestBase(player, m) {
    let found = null, range = 500;
    for (const [id] of theatre.territory) {
      const base = baseRecord(id, teamOf(player.faction));
      if (!base) continue;
      const d = Math.hypot(base.x - m.robot.x, base.y - m.robot.y);
      if (d <= range) { range = d; found = base; }
    }
    return found;
  }
  function eligibility(player) {
    if (!validPlayer(player) || !present(player)) return fail('presence-required');
    const m = vehicle(player);
    if (!m) return fail('no-mamute');
    if (m.destroyed || m.robot.armor <= 0) return fail('mamute-destroyed');
    if (Math.abs(Number(m.robot.speed) || 0) >= .5) return fail('park-mamute-first');
    if ((m.engine?.fire || 0) > 0) return fail('extinguish-mamute-first');
    const base = closestBase(player, m);
    if (!base) return fail('friendly-base-required');
    const pose = online.get(player.id)?.pose;
    if (!pose || !number(pose.x) || !number(pose.z) || Math.abs(pose.x) >= 1 || pose.z < 3 || pose.z > 4.5) return { ...fail('rear-hatch-out-of-reach'), base };
    return { ok: true, base, m };
  }
  function worldPoint(exterior, point) {
    const c = Math.cos(exterior.anchor.facing), s = Math.sin(exterior.anchor.facing);
    return { x: exterior.anchor.x + point.x * c - point.z * s, y: exterior.anchor.y + point.x * s + point.z * c };
  }
  function localPoint(exterior, point) {
    const c = Math.cos(exterior.anchor.facing), s = Math.sin(exterior.anchor.facing);
    const dx = point.x - exterior.anchor.x, dy = point.y - exterior.anchor.y;
    return { x: dx * c + dy * s, z: -dx * s + dy * c };
  }
  function rearPoint(exterior, m) {
    const facing = (Number(m.robot.facing) || 0) + Math.PI / 2;
    return localPoint(exterior, { x: m.robot.x - Math.sin(facing) * REAR.z, y: m.robot.y + Math.cos(facing) * REAR.z });
  }
  function exteriorValid(player) {
    if (!validPlayer(player) || !present(player)) return fail('presence-required');
    const exterior = player.exterior, m = vehicle(player);
    if (!exterior || exterior.mamuteId !== m?.id) return fail('not-outside');
    const base = baseRecord(exterior.baseId, teamOf(player.faction));
    // Capture closes the stock room, not the operator's ability to walk back
    // into their own Mamute with ammunition already legitimately collected.
    return { ok: true, exterior, m, base };
  }
  function near(player, point) { return distance(player.exterior, point) <= REACH; }
  function segmentHitsVehicle(exterior, m, from, to) {
    const transform = point => {
      const world = worldPoint(exterior, point), dx = world.x - m.robot.x, dy = world.y - m.robot.y;
      const angle = (Number(m.robot.facing) || 0) + Math.PI / 2;
      const c = Math.cos(angle), s = Math.sin(angle);
      return { x: dx * c + dy * s, z: -dx * s + dy * c };
    };
    const a = transform(from), b = transform(to);
    let enter = 0, leave = 1;
    for (const [axis, half] of [['x', 3.6], ['z', 6]]) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-9) { if (Math.abs(a[axis]) >= half) return false; continue; }
      const first = (-half - a[axis]) / delta, last = (half - a[axis]) / delta;
      enter = Math.max(enter, Math.min(first, last)); leave = Math.min(leave, Math.max(first, last));
      if (enter >= leave) return false;
    }
    return enter < leave;
  }
  function heartbeat(player, pose) {
    const check = exteriorValid(player);
    if (!check.ok) return check;
    if (!pose || !['x', 'z', 'yaw', 'pitch'].every(key => number(pose[key]))) return fail('invalid-exterior-pose');
    if (Math.abs(pose.x) > BOUNDS || Math.abs(pose.z) > BOUNDS) return fail('base-boundary');
    const { exterior, m } = check;
    const elapsed = Math.max(0, Math.min(1.5, clock() - (Number(exterior.poseAt) || 0)));
    // Consume a bounded movement budget. Repeating zero-time packets cannot
    // repeatedly claim the quantization allowance and walk faster than 5m/s.
    const travel = distance(exterior, pose);
    const credit = Math.min(WALK_SPEED * 1.5 + .25, Math.max(0, Number(exterior.walkCredit) || 0) + WALK_SPEED * elapsed);
    if (travel > credit + 1e-6) return fail('exterior-movement-too-fast');
    if (segmentHitsVehicle(exterior, m, exterior, pose)) return fail('mamute-collision');
    Object.assign(exterior, { x: pose.x, z: pose.z, yaw: Math.atan2(Math.sin(pose.yaw), Math.cos(pose.yaw)),
      pitch: Math.max(-1.35, Math.min(1.35, pose.pitch)), poseAt: clock(), walkCredit: Math.max(0, credit - travel) });
    return { ok: true };
  }
  function command(player, type, payload = {}) {
    if (!['exit-base', 'enter-mamute', 'pickup-ammo', 'deposit-ammo', 'return-ammo'].includes(type)) return null;
    if (type === 'exit-base') {
      if (player?.exterior) return fail('already-outside');
      const check = eligibility(player);
      if (!check.ok) return check;
      const { m, base } = check;
      release(player);
      player.exterior = { mamuteId: m.id, baseId: base.id, ...REAR, yaw: 0, pitch: 0, carry: null, poseAt: clock(), walkCredit: .25,
        // Local exterior -Z is the nose; the strategic heading is +X at zero.
        anchor: { x: m.robot.x, y: m.robot.y, facing: (Number(m.robot.facing) || 0) + Math.PI / 2 } };
      m.hatchOpen = true;
      event('base-exit', m, { playerId: player.id, baseId: base.id });
      return { ok: true, outside: true, baseId: base.id };
    }
    const check = exteriorValid(player);
    if (!check.ok) return check;
    const { exterior, m } = check;
    if (type === 'enter-mamute') {
      if (exterior.carry) return fail('deposit-or-return-ammo-first');
      if (m.destroyed) return fail('mamute-destroyed');
      if (Math.abs(Number(m.robot.speed) || 0) >= .5) return fail('park-mamute-first');
      if (!near(player, rearPoint(exterior, m))) return fail('rear-hatch-out-of-reach');
      player.exterior = null;
      const presence = online.get(player.id);
      if (presence) presence.pose = { x: 0, z: 3.4, yaw: 0, pitch: 0 };
      event('base-enter', m, { playerId: player.id });
      return { ok: true, outside: false, cabinPose: { x: 0, z: 3.4, yaw: 0, pitch: 0 } };
    }
    if (type === 'pickup-ammo') {
      if (!check.base) return fail('base-no-longer-friendly');
      if (exterior.carry) return fail('already-carrying');
      if (!near(player, RACK)) return fail('ammo-rack-out-of-reach');
      const shell = payload.shell || 'HE';
      if (!Object.hasOwn(SHELL_CAP, shell)) return fail('invalid-shell');
      if ((m.ammo[shell] || 0) >= SHELL_CAP[shell]) return fail('ammo-full');
      const source = sourceNode(exterior.baseId), amount = Math.min(3, Math.floor(Number(source.stock.ammo) || 0));
      if (amount <= 0) return fail('base-ammo-empty');
      source.stock.ammo -= amount;
      exterior.carry = { shell, amount, sourceId: exterior.baseId };
      event('ammo-pickup', m, { playerId: player.id, shell, amount, baseId: exterior.baseId });
      return { ok: true, carry: copyCarry(exterior.carry) };
    }
    if (!exterior.carry) return fail('no-ammo-box');
    if (type === 'return-ammo') {
      if (!check.base) return fail('base-no-longer-friendly');
      if (!near(player, RACK)) return fail('ammo-rack-out-of-reach');
      const source = sourceNode(exterior.carry.sourceId);
      if (!source?.stock) return fail('ammo-source-unavailable');
      source.stock.ammo = Math.max(0, Number(source.stock.ammo) || 0) + exterior.carry.amount;
      event('ammo-return', m, { playerId: player.id, ...exterior.carry }); exterior.carry = null;
      return { ok: true };
    }
    if (m.destroyed) return fail('mamute-destroyed');
    if (Math.abs(Number(m.robot.speed) || 0) >= .5) return fail('park-mamute-first');
    if (!near(player, rearPoint(exterior, m))) return fail('mamute-loading-out-of-reach');
    const { shell, amount } = exterior.carry;
    const loaded = Math.min(amount, Math.max(0, SHELL_CAP[shell] - (m.ammo[shell] || 0)));
    if (!loaded) return fail('ammo-full');
    m.ammo[shell] = (m.ammo[shell] || 0) + loaded;
    exterior.carry.amount -= loaded;
    if (!exterior.carry.amount) exterior.carry = null;
    event('ammo-deposit', m, { playerId: player.id, shell, amount: loaded });
    return { ok: true, shell, amount: loaded, carry: copyCarry(exterior.carry) };
  }
  function snapshot(player) {
    if (!validPlayer(player)) return null;
    const m = vehicle(player);
    if (!m) return { outside: false, canExit: false, reason: 'no-mamute' };
    const exterior = player.exterior;
    if (!exterior) {
      const check = eligibility(player);
      return { outside: false, canExit: check.ok, reason: check.reason || null, base: check.base || null, ammoCap: SHELL_CAP };
    }
    const occupants = Object.values(state.players).filter(p => p.exterior?.baseId === exterior.baseId && online.has(p.id))
      .map(p => ({ id: p.id, ...localPoint(exterior, worldPoint(p.exterior, p.exterior)),
        yaw: p.exterior.yaw + p.exterior.anchor.facing - exterior.anchor.facing, carry: copyCarry(p.exterior.carry) }));
    return { outside: true, baseId: exterior.baseId, base: baseRecord(exterior.baseId, teamOf(player.faction)),
      pose: { x: exterior.x, z: exterior.z, yaw: exterior.yaw, pitch: exterior.pitch }, anchor: { ...exterior.anchor },
      carry: copyCarry(exterior.carry), rack: RACK, rear: rearPoint(exterior, m), bounds: BOUNDS, walkSpeed: WALK_SPEED, ammoCap: SHELL_CAP, occupants };
  }
  // Use for an intentional Mamute switch/respawn, not ordinary disconnect.
  // A disconnected carrier keeps this persisted box for later reconnection.
  function reset(player) {
    if (!validPlayer(player)) return fail('invalid-player');
    const carried = player.exterior?.carry;
    if (carried) {
      const source = sourceNode(carried.sourceId);
      if (!source?.stock) return fail('ammo-source-unavailable');
      source.stock.ammo = Math.max(0, Number(source.stock.ammo) || 0) + carried.amount;
    }
    player.exterior = null;
    return { ok: true };
  }
  return { command, heartbeat, snapshot, reset };
}
