/** First-person locomotion in the Mamute's physical interior, in metres. */
// The rear hatch leads to a short service corridor.  Keeping it in the same
// local coordinate system makes the transition seamless while preserving the
// close, first-person scale of the Mamute interior.
export const CABIN_BOUNDS = Object.freeze({ minX: -2.45, maxX: 2.45, minZ: -3.15, maxZ: 8.05 });
export const CABIN_OBSTACLES = Object.freeze([
  { minX: -2.48, maxX: -1.14, minZ: -.05, maxZ: 1.55 }, // map desk
  { minX: .55, maxX: 1.79, minZ: -3.2, maxZ: -.52 }, // gun & recoil cradle
  { minX: -2.46, maxX: -.92, minZ: -3.17, maxZ: -2.45 }, // driver instrument panel
  { minX: -.89, maxX: .57, minZ: -1.52, maxZ: -1.02 }, // aiming cabinet and handwheel shafts
  { minX: .31, maxX: .7, minZ: -2.29, maxZ: -1.4 }, // elevation gear housing
  { minX: .92, maxX: 2.22, minZ: -.36, maxZ: .72 }, // revolving magazine and feed cradle
  { minX: -2.13, maxX: -1.4, minZ: -2.24, maxZ: -1.5 }, // driver's seat; narrow aisle remains beside cabinet
  { minX: 1.78, maxX: 2.5, minZ: .72, maxZ: 3.35 }, // ammunition racks
  { minX: -2.48, maxX: -1.78, minZ: 2.01, maxZ: 3.28 }, // radio
  { minX: -1.66, maxX: -.75, minZ: 2.9, maxZ: 3.49 }, // folded crew seat
  { minX: .42, maxX: 1.55, minZ: 2.46, maxZ: 3.19 }, // reserve chest
  { minX: -2.48, maxX: -.78, minZ: 3.56, maxZ: 3.78 }, // rear bulkhead left
  { minX: .78, maxX: 2.48, minZ: 3.56, maxZ: 3.78 }, // rear bulkhead right
  { minX: -2.48, maxX: -.87, minZ: 3.78, maxZ: 5.2 }, // service passage left wall
  { minX: .87, maxX: 2.48, minZ: 3.78, maxZ: 5.2 }, // service passage right wall
  { minX: .74, maxX: 2.48, minZ: 5.65, maxZ: 7.83 }, // engine and cooling manifold
  { minX: -2.48, maxX: -1.3, minZ: 6.19, maxZ: 7.78 }, // workshop bench and lockers
]);
export const CABIN_STATIONS = Object.freeze([
  { id: 'aim', label: 'POSTO DE PONTARIA', action: 'Operar manivelas', x: -.21, y: 1.23, z: -1.05, radius: 1.48 },
  { id: 'map', label: 'MESA DE NAVEGAÇÃO', action: 'Abrir mapa de mesa', x: -1.6, y: 1.03, z: .7, radius: 1.58 },
  { id: 'load', label: 'PAIOL / CULATRA', action: 'Preparar munição', x: 2.03, y: 1.34, z: 1.7, radius: 1.48 },
  { id: 'drive', label: 'POSTO DO CONDUTOR', action: 'Assumir marcha', x: -1.57, y: 1.18, z: -2.68, radius: 1.5 },
  { id: 'radio', label: 'RÁDIO DE CAMPANHA', action: 'Consultar chamados', x: -2.08, y: 1.4, z: 2.53, radius: 1.48 },
  { id: 'extinguisher', label: 'EXTINTOR DE BORDO', action: 'Pegar extintor', x: -2.25, y: 1.15, z: 1.88, radius: 1.2 },
  { id: 'engine', label: 'MOTOR / REFRIGERAÇÃO', action: 'Inspecionar motor', x: .82, y: 1.24, z: 6.6, radius: 1.35 },
]);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const circleHitsBox = (x, z, r, b) => {
  const dx = x - clamp(x, b.minX, b.maxX), dz = z - clamp(z, b.minZ, b.maxZ);
  return dx * dx + dz * dz < r * r;
};
export function canOccupyCabin(x, z, radius = .21) {
  if (![x, z, radius].every(Number.isFinite) || radius < 0) return false;
  if (x < CABIN_BOUNDS.minX + radius || x > CABIN_BOUNDS.maxX - radius || z < CABIN_BOUNDS.minZ + radius || z > CABIN_BOUNDS.maxZ - radius) return false;
  return !CABIN_OBSTACLES.some(b => circleHitsBox(x, z, radius, b));
}
/** Compact, collision-checked pose suitable for crew presence replication. */
export function cabinCrewPose({ x, z, yaw = 0, pitch = 0 } = {}) {
  if (![x, z, yaw, pitch].every(Number.isFinite) || !canOccupyCabin(x, z)) return null;
  return Object.freeze({ x, z, yaw: wrapAngle(yaw), pitch: clamp(pitch, -1.03, .91) });
}
/** Interpolate replicated crew poses without taking the long way around yaw wrap. */
export function interpolateCabinCrewPose(from, to, alpha = 1) {
  const a = cabinCrewPose(from), b = cabinCrewPose(to);
  if (!a || !b || !Number.isFinite(alpha)) return null;
  const t = clamp(alpha, 0, 1), yawDelta = wrapAngle(b.yaw - a.yaw);
  return Object.freeze({
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: wrapAngle(a.yaw + yawDelta * t),
    pitch: a.pitch + (b.pitch - a.pitch) * t,
  });
}
export function createCabinMovement() {
  const position = { x: 0, z: 2.4 };
  let yaw = 0, pitch = -.08, travelled = 0;
  return {
    position,
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get travelled() { return travelled; },
    setPose({ x = position.x, z = position.z, yaw: nextYaw = yaw, pitch: nextPitch = pitch } = {}) {
      if (![x, z, nextYaw, nextPitch].every(Number.isFinite) || !canOccupyCabin(x, z)) return false;
      position.x = x; position.z = z; yaw = nextYaw; pitch = clamp(nextPitch, -1.03, .91); return true;
    },
    look(dx, dy) { yaw -= Number.isFinite(dx) ? dx : 0; pitch = clamp(pitch - (Number.isFinite(dy) ? dy : 0), -1.03, .91); },
    lookToward(point, blend = 1) {
      const dx = point.x - position.x, dz = point.z - position.z;
      const targetYaw = Math.atan2(-dx, -dz), targetPitch = Math.atan2(point.y - 1.58, Math.hypot(dx, dz));
      const delta = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
      yaw += delta * clamp(blend, 0, 1); pitch += (clamp(targetPitch, -1.03, .91) - pitch) * clamp(blend, 0, 1);
    },
    update(dt, move = {}) {
      const mx = Number.isFinite(move.x) ? move.x : 0, my = Number.isFinite(move.y) ? move.y : 0;
      const magnitude = Math.max(1, Math.hypot(mx, my)), distance = clamp(dt, 0, .1) * 1.65;
      // The shared Pointer Events joystick reports up as negative y.
      const dx = (Math.cos(yaw) * mx + Math.sin(yaw) * my) / magnitude * distance;
      const dz = (-Math.sin(yaw) * mx + Math.cos(yaw) * my) / magnitude * distance;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .035));
      for (let i = 0; i < steps; i++) {
        const oldX = position.x, oldZ = position.z, sx = dx / steps, sz = dz / steps;
        const nextX = position.x + sx, nextZ = position.z + sz;
        if (canOccupyCabin(nextX, nextZ)) {
          position.x = nextX; position.z = nextZ;
        } else {
          // When a diagonal step meets a corner, slide along the dominant input
          // axis instead of always preferring X. This keeps tight aisles feeling
          // symmetric and prevents the collision response from steering the player.
          const canX = canOccupyCabin(nextX, position.z), canZ = canOccupyCabin(position.x, nextZ);
          if (canX && canZ) {
            if (Math.abs(sx) >= Math.abs(sz)) position.x = nextX;
            else position.z = nextZ;
          } else if (canX) position.x = nextX;
          else if (canZ) position.z = nextZ;
        }
        travelled += Math.hypot(position.x - oldX, position.z - oldZ);
      }
    },
    focus() {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      return CABIN_STATIONS.map(s => {
        const dx = s.x - position.x, dz = s.z - position.z, distance = Math.hypot(dx, dz);
        return { ...s, distance, facing: (dx * fx + dz * fz) / Math.max(.01, distance) };
      }).filter(s => s.distance <= s.radius && s.facing > .34).sort((a, b) => b.facing - a.facing || a.distance - b.distance)[0] || null;
    },
    reset() { position.x = 0; position.z = 2.4; yaw = 0; pitch = -.08; travelled = 0; },
    crewPose() { return cabinCrewPose({ x: position.x, z: position.z, yaw, pitch }); },
    snapshot() { return { position: { ...position }, yaw, pitch, travelled }; },
  };
}
