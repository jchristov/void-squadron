import test from 'node:test';
import assert from 'node:assert/strict';
import { barrelRollAngle, cameraSway, enterState, escortPosition, heroPose } from './menuMotion.ts';

const TAU = Math.PI * 2;

test('barrel roll starts late, completes a full turn and then rests until the next period', () => {
  assert.equal(barrelRollAngle(3), 0);
  assert.equal(barrelRollAngle(9), 0);
  const mid = barrelRollAngle(9 + 1.3);
  assert.ok(mid > Math.PI * 0.9 && mid < Math.PI * 1.1, 'half-way through the roll at the midpoint');
  assert.ok(barrelRollAngle(9 + 2.59) > TAU * 0.99);
  assert.equal(barrelRollAngle(9 + 5), 0);
  assert.ok(barrelRollAngle(9 + 17 + 1.3) > 0, 'repeats every period');
  let previous = 0;
  for (let step = 0; step <= 260; step += 1) {
    const value = barrelRollAngle(9 + step * 0.01);
    assert.ok(value >= previous - 1e-9, 'monotonic through the roll');
    previous = value;
  }
});

test('hero pose stays small, smooth and non-repeating', () => {
  let previous = heroPose(0);
  for (let t = 0.05; t < 60; t += 0.05) {
    const pose = heroPose(t);
    assert.ok(Math.abs(pose.offset.x) < 1.4 && Math.abs(pose.offset.y) < 0.7 && Math.abs(pose.offset.z) < 1);
    assert.ok(Math.abs(pose.yaw) < 0.25 && Math.abs(pose.pitch) < 0.1);
    assert.ok(Math.abs(pose.offset.x - previous.offset.x) < 0.1, 'no jumps');
    assert.ok(Math.abs(pose.offset.y - previous.offset.y) < 0.08, 'no jumps');
    previous = pose;
  }
  const a = heroPose(5.3), b = heroPose(5.3 + 2 * Math.PI / 0.23);
  assert.ok(Math.abs(a.offset.y - b.offset.y) > 1e-4 || Math.abs(a.offset.x - b.offset.x) > 1e-4, 'layers are incommensurate');
});

test('enter transition starts off-screen to the side and settles exactly at the origin', () => {
  const start = enterState(0);
  assert.ok(start.offset.x > 10 && start.yaw < -0.5 && start.flash === 1 && !start.done);
  const end = enterState(1.15);
  assert.deepEqual([end.offset.x, end.offset.z, end.yaw, end.flash, end.done], [0, 0, 0, 0, true]);
  assert.ok(Math.abs(end.offset.y) < 1e-9);
  let previous = enterState(0).offset.x;
  for (let t = 0.02; t <= 1.15; t += 0.02) {
    const x = enterState(t).offset.x;
    assert.ok(x <= previous + 1e-9, 'slides in monotonically');
    previous = x;
  }
});

test('escort paths are continuous, distinct and stay in the background volume', () => {
  const seen = new Set<string>();
  for (let index = 0; index < 4; index += 1) {
    let previous = escortPosition(index, 0);
    seen.add(`${previous.x.toFixed(1)},${previous.z.toFixed(1)}`);
    for (let t = 0.1; t < 120; t += 0.1) {
      const p = escortPosition(index, t);
      assert.ok(Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z) < 1.6, 'smooth');
      assert.ok(p.z < -20 && p.z > -140 && Math.abs(p.x) < 130);
      previous = p;
    }
  }
  assert.equal(seen.size, 4);
  assert.deepEqual(escortPosition(5, 3), escortPosition(1, 3), 'indices wrap');
});

test('camera sway is subtle', () => {
  for (let t = 0; t < 200; t += 0.5) {
    const s = cameraSway(t);
    assert.ok(Math.abs(s.x) < 1.6 && Math.abs(s.y) < 0.4 && Math.abs(s.z) < 0.9);
  }
});
