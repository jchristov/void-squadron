import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeRadarPosition, projectRadarContact, radarRingDistance } from './radar.ts';

test('radar maps ship-local forward, right, and altitude', () => {
  const local = relativeRadarPosition({ x: 20, y: 30, z: -40 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  assert.deepEqual(local, { x: 20, y: 30, z: 40 });
  assert.ok(projectRadarContact(local).y < 0);
});
test('radar follows yaw orientation rather than world axes', () => {
  const local = relativeRadarPosition({ x: -100, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 });
  assert.ok(Math.abs(local.x) < 1e-10);
  assert.ok(local.z > 99);
});
test('radar keeps distant hostiles at its edge', () => {
  const result = projectRadarContact({ x: 2000, y: 0, z: 2000 }, 1000);
  assert.ok(Math.abs(Math.hypot(result.x, result.y) - 1) < 1e-10);
  assert.equal(result.edge, true);
  assert.ok(result.distance > 2800);
});

test('compressive radar curve spreads nearby contacts but keeps the edge meaning "out of range"', () => {
  const near = { x: 0, y: 0, z: 70 };
  const linear = projectRadarContact(near, 1000);
  const curved = projectRadarContact(near, 1000, 0.62);
  assert.ok(Math.hypot(curved.x, curved.y) > Math.hypot(linear.x, linear.y) * 2.2);
  assert.equal(curved.x, 0);
  assert.ok(curved.y < 0, 'ahead stays at the top');
  const far = projectRadarContact({ x: 0, y: 0, z: 5000 }, 1000, 0.62);
  assert.ok(far.edge);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 1) < 1e-9);
  assert.deepEqual(projectRadarContact({ x: 0, y: 0, z: 0 }, 1000, 0.62).x, 0);
  assert.deepEqual(projectRadarContact(near, 1000, 1), linear);
});

test('radar rings report the real distance they represent', () => {
  assert.equal(radarRingDistance(1, 1000, 0.62), 1000);
  assert.ok(Math.abs(radarRingDistance(0.5, 1000, 1) - 500) < 1e-9);
  const ring = radarRingDistance(0.33, 1000, 0.62);
  const projected = projectRadarContact({ x: 0, y: 0, z: ring }, 1000, 0.62);
  assert.ok(Math.abs(Math.hypot(projected.x, projected.y) - 0.33) < 1e-6);
});
