import * as THREE from '../vendor/three.module.min.js';

const DEFAULT_PALETTES = Object.freeze([
  Object.freeze({ coat: 0x535849, gear: 0x2b302b, skin: 0x9b8067, helmet: 0x465047, accent: 0x8c7048 }),
  Object.freeze({ coat: 0x4b5146, gear: 0x252c29, skin: 0x8d735e, helmet: 0x596052, accent: 0x6d7b67 }),
]);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Preallocated low-poly visual for at most two remote crew members.
 * It deliberately knows nothing about networking or authority: callers feed it
 * already validated entries from crew-presence.js.
 */
export function createCabinCrewAvatars(scene, { capacity = 2, palettes = DEFAULT_PALETTES } = {}) {
  if (!scene?.add) throw new TypeError('scene with add() required');
  const max = Math.max(0, Math.min(2, Number.isFinite(capacity) ? Math.floor(capacity) : 2));
  const paletteSource = Array.isArray(palettes) && palettes.length ? palettes : DEFAULT_PALETTES;
  const geometries = [
    new THREE.BoxGeometry(.34, .56, .22),
    new THREE.BoxGeometry(.12, .48, .12),
    new THREE.IcosahedronGeometry(.15, 0),
    new THREE.CylinderGeometry(.17, .18, .12, 6),
    new THREE.BoxGeometry(.23, .09, .12),
  ];
  const [torsoGeo, limbGeo, headGeo, helmetGeo, packGeo] = geometries;
  const materials = [];
  const slots = [];

  const material = color => {
    const value = new THREE.MeshLambertMaterial({ color, flatShading: true });
    materials.push(value);
    return value;
  };

  function buildAvatar(index) {
    const palette = paletteSource[index % paletteSource.length] || DEFAULT_PALETTES[index % DEFAULT_PALETTES.length];
    const coat = material(palette.coat), gear = material(palette.gear), skin = material(palette.skin);
    const helmet = material(palette.helmet), accent = material(palette.accent);
    const root = new THREE.Group();
    root.visible = false;
    root.name = `remote-crew-${index + 1}`;

    const torso = new THREE.Mesh(torsoGeo, coat); torso.position.y = 1.16; root.add(torso);
    const pack = new THREE.Mesh(packGeo, gear); pack.position.set(0, 1.18, .16); root.add(pack);
    const headPivot = new THREE.Group(); headPivot.position.y = 1.59; root.add(headPivot);
    const head = new THREE.Mesh(headGeo, skin); headPivot.add(head);
    const cap = new THREE.Mesh(helmetGeo, helmet); cap.position.y = .105; headPivot.add(cap);

    const limbs = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(limbGeo, coat); arm.position.set(side * .24, 1.14, 0); root.add(arm);
      const leg = new THREE.Mesh(limbGeo, gear); leg.position.set(side * .1, .58, 0); root.add(leg);
      const boot = new THREE.Mesh(packGeo, accent); boot.scale.set(.62, .72, 1); boot.position.set(side * .1, .3, -.035); root.add(boot);
      limbs.push({ arm, leg });
    }
    scene.add(root);
    return { root, headPivot, limbs, id: null, x: 0, z: 0, travelled: 0, assigned: false, entry: null };
  }

  for (let i = 0; i < max; i++) slots.push(buildAvatar(i));

  function apply(slot, entry, step) {
    const pose = entry?.pose;
    if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) return false;
    const dx = pose.x - slot.x, dz = pose.z - slot.z;
    const moved = slot.id === entry.id ? Math.hypot(dx, dz) : 0;
    slot.travelled = slot.id === entry.id ? slot.travelled + moved : 0;
    slot.id = entry.id; slot.x = pose.x; slot.z = pose.z;
    slot.root.visible = true;
    slot.root.position.set(pose.x, 0, pose.z);
    slot.root.rotation.y = finite(pose.yaw);
    slot.headPivot.rotation.x = finite(pose.pitch) * .55;
    const stride = Math.min(.45, moved / Math.max(.001, step || .016));
    const swing = Math.sin(slot.travelled * 10) * stride;
    slot.limbs[0].arm.rotation.x = swing; slot.limbs[1].arm.rotation.x = -swing;
    slot.limbs[0].leg.rotation.x = -swing * .7; slot.limbs[1].leg.rotation.x = swing * .7;
    return true;
  }

  function update(entries = [], dt = 0) {
    const list = Array.isArray(entries) ? entries.slice(0, max) : [];
    const step = Math.max(0, Math.min(.1, finite(dt)));
    for (const slot of slots) { slot.assigned = false; slot.entry = null; }

    // Keep a peer on the same preallocated body even when network ordering
    // changes. This avoids palette/animation popping without creating maps or
    // scene nodes every frame.
    for (const entry of list) {
      const slot = slots.find(candidate => !candidate.assigned && candidate.id === entry?.id);
      if (slot) { slot.assigned = true; slot.entry = entry; }
    }
    for (const entry of list) {
      if (slots.some(slot => slot.entry === entry)) continue;
      const slot = slots.find(candidate => !candidate.assigned);
      if (slot) { slot.assigned = true; slot.entry = entry; }
    }

    for (const slot of slots) {
      if (!slot.assigned || !apply(slot, slot.entry, step)) {
        slot.root.visible = false;
        slot.id = null;
      }
      slot.entry = null;
    }
    return snapshot();
  }

  function snapshot() {
    return Object.freeze(slots.map(slot => Object.freeze({
      id: slot.id,
      visible: slot.root.visible,
      x: slot.root.position.x,
      z: slot.root.position.z,
      yaw: slot.root.rotation.y,
      pitch: slot.headPivot.rotation.x,
    })));
  }

  function dispose() {
    for (const slot of slots) scene.remove(slot.root);
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(value => value.dispose());
  }

  return Object.freeze({ update, snapshot, dispose, capacity: max });
}
