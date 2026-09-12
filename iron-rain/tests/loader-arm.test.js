import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loaderArmPose, loaderActivity, LOADER_ARM_HOME } from '../modules/loader-arm.js';

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

test('lock phase releases only after seating and retracts toward home', () => {
  const early = loaderArmPose(cycle(.905, 'lock'));
  const late = loaderArmPose(cycle(.985, 'lock'));
  finitePose(early); finitePose(late);
  assert.equal(early.gripping, true, 'claw keeps hold at the start of lock');
  assert.equal(late.gripping, false, 'claw releases after seating');
  assert.ok(Math.abs(late.baseYaw - LOADER_ARM_HOME.baseYaw) < Math.abs(early.baseYaw - LOADER_ARM_HOME.baseYaw));
  assert.ok(late.extension < early.extension, 'arm retracts instead of leaving the round floating');
});

test('malformed progress clamps safely', () => {
  for (const value of [-9, Number.NaN, Infinity, 9]) finitePose(loaderArmPose({ progress: value, phase: 'ram' }));
});
