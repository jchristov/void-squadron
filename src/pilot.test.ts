import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyOrientationInput, getBasisVectors, FLIGHT_PROFILES } from './flight.ts';
import { PICKUP_TYPES, PICKUP_COLORS, isUpgradePickup, pickupCssColor } from './rules.ts';
import {
  bearingDegrees,
  breakoutDirection,
  predictCollision,
  describeBearing,
  nextRetreatState,
  pickBossObjective,
  rollLevelInput,
  steeringInputs,
} from './pilot.ts';

test('every supply type has a distinct color and upgrades are identifiable', () => {
  const colors = PICKUP_TYPES.map((type) => PICKUP_COLORS[type]);
  assert.equal(new Set(colors).size, PICKUP_TYPES.length);
  assert.equal(pickupCssColor('energy'), '#ffe14d');
  assert.deepEqual(PICKUP_TYPES.filter(isUpgradePickup), ['hull-upgrade', 'defense-upgrade', 'attack-upgrade']);
});

test('steering inputs turn toward the target with the right signs', () => {
  assert.deepEqual(steeringInputs(new THREE.Vector3(0, 0, -1)), { yaw: 0, pitch: 0 });
  assert.ok(steeringInputs(new THREE.Vector3(0.4, 0, -1)).yaw > 0);
  assert.ok(steeringInputs(new THREE.Vector3(-0.4, 0, -1)).yaw < 0);
  assert.ok(steeringInputs(new THREE.Vector3(0, 0.4, -1)).pitch > 0);
  assert.ok(steeringInputs(new THREE.Vector3(0, -0.4, -1)).pitch < 0);
  const behind = steeringInputs(new THREE.Vector3(0, 0, 1));
  assert.equal(Math.abs(behind.yaw), 1);
});

test('steering inputs actually rotate the ship onto the target', () => {
  let orientation = new THREE.Quaternion();
  const target = new THREE.Vector3(60, 25, -40).normalize();
  const profile = FLIGHT_PROFILES.fighter;
  for (let step = 0; step < 240; step += 1) {
    const local = target.clone().applyQuaternion(orientation.clone().invert());
    const input = steeringInputs(local);
    orientation = applyOrientationInput(orientation, { yaw: input.yaw, pitch: input.pitch, roll: 0 }, profile, 1 / 60);
  }
  assert.ok(getBasisVectors(orientation).forward.dot(target) > 0.995);
});

test('roll leveling input reduces bank for both roll directions', () => {
  for (const bank of [0.6, -0.6]) {
    let orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), bank);
    const before = Math.abs(getBasisVectors(orientation).right.y);
    for (let step = 0; step < 120; step += 1) {
      const roll = rollLevelInput(getBasisVectors(orientation).right);
      orientation = applyOrientationInput(orientation, { yaw: 0, pitch: 0, roll }, FLIGHT_PROFILES.fighter, 1 / 60);
    }
    assert.ok(Math.abs(getBasisVectors(orientation).right.y) < before * 0.2);
  }
});

test('collision prediction reacts only to courses that will actually hit', () => {
  const origin = new THREE.Vector3();
  const velocity = new THREE.Vector3(0, 0, -40);
  const still = new THREE.Vector3();
  const headOn = predictCollision(origin, velocity, new THREE.Vector3(0, 0, -50), still, 9, 2);
  assert.ok(headOn.urgency > 0 && headOn.timeToImpact < 2);
  assert.ok(Math.abs(headOn.escape.length() - 1) < 1e-6);
  // Passing 30 units to the side never gets close enough.
  assert.equal(predictCollision(origin, velocity, new THREE.Vector3(30, 0, -50), still, 9, 2).urgency, 0);
  // Too far ahead for the horizon.
  assert.equal(predictCollision(origin, velocity, new THREE.Vector3(0, 0, -400), still, 9, 2).urgency, 0);
  // Moving away.
  assert.equal(predictCollision(origin, velocity, new THREE.Vector3(0, 0, 60), still, 9, 2).urgency, 0);
  // Sooner impact is more urgent.
  const sooner = predictCollision(origin, velocity, new THREE.Vector3(0, 0, -20), still, 9, 2);
  assert.ok(sooner.urgency > headOn.urgency);
});

test('collision escape steers away from the other body at closest approach', () => {
  const threat = predictCollision(new THREE.Vector3(), new THREE.Vector3(0, 0, -40), new THREE.Vector3(3, 0, -50), new THREE.Vector3(), 9, 2);
  assert.ok(threat.urgency > 0);
  assert.ok(threat.escape.x < 0, 'other body is to the right, escape left');
  const moving = predictCollision(new THREE.Vector3(), new THREE.Vector3(0, 0, -20), new THREE.Vector3(0, 0, -80), new THREE.Vector3(0, 0, 30), 9, 2);
  assert.ok(moving.urgency > 0, 'head-on closing speed counts both ships');
  const overlapping = predictCollision(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(2, 0, 0), new THREE.Vector3(), 9, 2);
  assert.equal(overlapping.urgency, 1);
  assert.ok(overlapping.escape.x < 0);
});

test('retreat latch has hysteresis', () => {
  assert.equal(nextRetreatState(0.6, false), false);
  assert.equal(nextRetreatState(0.4, false), true);
  assert.equal(nextRetreatState(0.7, true), true);
  assert.equal(nextRetreatState(0.85, true), false);
});

test('bearing text describes the turn needed', () => {
  assert.equal(describeBearing(0, 0), 'AHEAD');
  assert.equal(describeBearing(34, 12), 'RIGHT 34° · UP 12°');
  assert.equal(describeBearing(-90, 0), 'LEFT 90°');
  assert.equal(describeBearing(170, -20), 'BEHIND · DOWN 20°');
  const bearing = bearingDegrees(new THREE.Vector3(1, 0, -1));
  assert.ok(Math.abs(bearing.yaw - 45) < 1e-6 && Math.abs(bearing.pitch) < 1e-6);
});

test('boss objective prefers nearest shield dome, then the bridge', () => {
  const subs = [
    { id: 'a', type: 'shield_generator' as const, destroyed: false, distance: 90 },
    { id: 'b', type: 'shield_generator' as const, destroyed: false, distance: 60 },
    { id: 'h', type: 'hangar_bay' as const, destroyed: false, distance: 20 },
    { id: 'br', type: 'bridge' as const, destroyed: false, distance: 40 },
  ];
  assert.equal(pickBossObjective(subs)?.id, 'b');
  subs[1].destroyed = true;
  assert.equal(pickBossObjective(subs)?.id, 'a');
  subs[0].destroyed = true;
  assert.equal(pickBossObjective(subs)?.id, 'br');
  subs[3].destroyed = true;
  assert.equal(pickBossObjective(subs)?.id, 'h');
  subs[2].destroyed = true;
  assert.equal(pickBossObjective(subs), null);
});

test('breakout direction leaves the line of sight sideways and away', () => {
  const toTarget = new THREE.Vector3(0, 0, -50);
  const out = breakoutDirection(toTarget, 1, 0.3);
  assert.ok(Math.abs(out.length() - 1) < 1e-6);
  assert.ok(out.z > 0, 'moves away from target');
  assert.ok(Math.abs(out.x) > 0.3, 'moves sideways');
  assert.ok(breakoutDirection(toTarget, -1, 0.3).x * out.x < 0, 'sign flips the side');
});
