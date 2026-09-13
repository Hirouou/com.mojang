import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loaderArmPose, loaderActivity, loaderRigState, LOADER_ARM_HOME } from '../modules/loader-arm.js';

const cycle = (progress, phase) => ({ progress, phase, complete: progress >= 1 });

function finitePose(pose) {
  for (const key of ['baseYaw', 'shoulder', 'elbow', 'claw', 'extension', 'rammer']) assert.ok(Number.isFinite(pose[key]), `${key} must stay finite`);
}

test('idle loader rests at the mechanical home pose', () => {
  const pose = loaderArmPose(null);
  assert.equal(pose.phase, 'idle');
  assert.equal(pose.baseYaw, LOADER_ARM_HOME.baseYaw);
  assert.equal(pose.extension, 0);
  assert.equal(pose.shellVisible, false);
  assert.equal(loaderActivity(null).moving, false);
});

test('loader approaches the carousel empty, then visibly owns the picked round', () => {
  const approach = loaderArmPose(cycle(.08, 'extract'));
  const pickup = loaderArmPose(cycle(.16, 'extract'));
  const approachRig = loaderRigState(cycle(.08, 'extract'));
  const pickupRig = loaderRigState(cycle(.16, 'extract'));

  assert.equal(approach.shellVisible, false, 'round stays in the magazine during the empty approach');
  assert.equal(approachRig.shell.owner, null, 'loader does not claim renderer ownership before pickup');
  assert.equal(pickup.shellVisible, true, 'round appears once the claw reaches the pickup band');
  assert.equal(pickupRig.shell.owner, 'claw', 'picked round belongs to the claw');
});

test('loader visibly grabs, swings and rams instead of linearly floating a shell', () => {
  const grab = loaderArmPose(cycle(.18, 'extract'));
  const swing = loaderArmPose(cycle(.48, 'rotate'));
  const ram = loaderArmPose(cycle(.82, 'ram'));
  finitePose(grab); finitePose(swing); finitePose(ram);

  assert.ok(grab.claw < LOADER_ARM_HOME.claw, 'extract phase closes the claw');
  assert.ok(grab.extension > 0, 'arm reaches into the magazine');
  assert.ok(swing.baseYaw > grab.baseYaw, 'rotate phase swings the arm toward the breech');
  assert.notEqual(swing.shoulder, grab.shoulder, 'swing also articulates the shoulder');
  assert.ok(ram.rammer > 0, 'ram phase drives the insertion mechanism');
  assert.equal(loaderActivity(cycle(.82, 'ram')).heavyMotion, true);
});

test('lock phase seats the round before releasing and retracting', () => {
  const held = loaderArmPose(cycle(.915, 'lock'));
  const releaseEdge = loaderArmPose(cycle(.923, 'lock'));
  const released = loaderArmPose(cycle(.94, 'lock'));
  const late = loaderArmPose(cycle(.985, 'lock'));
  finitePose(held); finitePose(releaseEdge); finitePose(released); finitePose(late);

  assert.equal(held.gripping, true, 'claw keeps hold during the lock dwell');
  assert.equal(held.shellVisible, true, 'carried round remains visible while the claw is still closed');
  assert.equal(held.baseYaw, 1.34, 'arm does not swing home while still gripping');
  assert.equal(held.extension, .42, 'ram remains fully seated during the lock dwell');
  assert.equal(held.rammer, 1, 'rammer stays engaged until the claw release point');

  assert.equal(releaseEdge.gripping, false, 'claw releases immediately after the lock dwell');
  assert.equal(releaseEdge.shellVisible, false, 'wrist-parented round disappears as soon as it is released into the breech');
  assert.equal(loaderRigState(cycle(.923, 'lock')).shell.owner, null, 'released round is no longer owned by the moving loader rig');
  assert.equal(released.gripping, false, 'claw stays released during retraction');
  assert.ok(released.extension < held.extension, 'retraction begins only after release');
  assert.equal(loaderRigState(cycle(.94, 'lock')).shell.owner, null, 'released shell is no longer carried by the claw');
  assert.ok(Math.abs(late.baseYaw - LOADER_ARM_HOME.baseYaw) < Math.abs(released.baseYaw - LOADER_ARM_HOME.baseYaw));
  assert.ok(late.extension < released.extension, 'arm continues retracting toward home');
});

test('unknown replicated phase falls back to the canonical progress phase', () => {
  const malformed = loaderArmPose(cycle(.48, 'desync-garbage'));
  const canonical = loaderArmPose(cycle(.48, 'rotate'));

  assert.equal(malformed.phase, 'rotate');
  assert.deepEqual(malformed, canonical, 'visual rig follows the shared loading clock instead of jumping into lock');
  assert.equal(loaderActivity(cycle(.48, 'desync-garbage')).heavyMotion, true);
});

test('malformed progress clamps safely', () => {
  for (const value of [-9, Number.NaN, Infinity, 9]) finitePose(loaderArmPose({ progress: value, phase: 'ram' }));
});