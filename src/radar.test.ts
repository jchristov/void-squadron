import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeRadarPosition, projectRadarContact } from './radar.ts';

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
