import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  applyOrientationInput,
  getDifficultyAdjustedEnemyPursuitProfile,
  getDifficultyAdjustedEnemyTurnRate,
  getBasisVectors,
  getChaseCameraFrame,
  getEnemyPursuitDirective,
  getEnemyPursuitProfile,
  relativeVelocityMagnitude,
  segmentSphereIntersection,
  solveInterceptCourse,
  sweepSphereAgainstBox,
  sweepSphereAgainstSphere,
  turnTowardsDirection,
} from './flight.ts';

test('mouse yaw, pitch, and roll steer quaternion orientation in full 3d', () => {
  const rates = { yawRate: Math.PI / 2, pitchRate: Math.PI / 2, rollRate: Math.PI / 2 };
  const yawPitch = applyOrientationInput(new THREE.Quaternion(), { yaw: 0.6, pitch: 0.45, roll: 0 }, rates, 1);
  const beforeRoll = getBasisVectors(yawPitch);
  assert.ok(beforeRoll.forward.x > 0.5, 'positive yaw should steer right');
  assert.ok(beforeRoll.forward.y > 0.25, 'positive pitch should steer upward');

  const rolled = applyOrientationInput(yawPitch, { yaw: 0, pitch: 0, roll: 0.5 }, rates, 1);
  const afterRoll = getBasisVectors(rolled);
  assert.ok(afterRoll.forward.dot(beforeRoll.forward) > 0.96, 'roll should preserve heading');
  assert.ok(afterRoll.up.dot(beforeRoll.up) < 0.92, 'roll should rotate the local up axis');
});

test('pursuit helpers measure relative speed and compute lead for moving targets', () => {
  const chaserVelocity = new THREE.Vector3(42, 3, -18);
  const targetVelocity = new THREE.Vector3(30, 0, -14);
  const headOnVelocity = new THREE.Vector3(-30, 0, 14);
  assert.ok(relativeVelocityMagnitude(chaserVelocity, targetVelocity) < relativeVelocityMagnitude(chaserVelocity, headOnVelocity));

  const solution = solveInterceptCourse(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -120),
    new THREE.Vector3(24, 0, 0),
    120,
  );
  assert.ok(solution.time > 0);
  assert.ok(solution.aimPoint.x > 0, 'lead point should move ahead of the target');
  assert.ok(solution.direction.x > 0, 'shot direction should include lateral lead');
});

test('enemy pursuit profiles encode combat, disengage, and flee roles', () => {
  const interceptor = getEnemyPursuitProfile('interceptor');
  const bomber = getEnemyPursuitProfile('bomber');
  const shuttle = getEnemyPursuitProfile('shuttle');

  assert.equal(interceptor.combat, true);
  assert.ok(interceptor.maxPursuitDistance > bomber.attackDistance);
  assert.ok(bomber.preferredDistance > interceptor.preferredDistance);
  assert.equal(shuttle.combat, false);
  assert.ok(shuttle.fleeSpeedMultiplier > shuttle.patrolSpeedMultiplier);
});

test('difficulty-adjusted pursuit helpers tighten veteran behavior and relax pursuit on easy', () => {
  const relaxed = getDifficultyAdjustedEnemyPursuitProfile('fighter', 'relaxed');
  const standard = getDifficultyAdjustedEnemyPursuitProfile('fighter', 'standard');
  const veteran = getDifficultyAdjustedEnemyPursuitProfile('fighter', 'veteran');

  assert.ok(relaxed.attackDistance < standard.attackDistance);
  assert.ok(veteran.attackDistance > standard.attackDistance);
  assert.ok(relaxed.retreatDistance > standard.retreatDistance);
  assert.ok(veteran.retreatDistance < standard.retreatDistance);
  assert.ok(getDifficultyAdjustedEnemyTurnRate('interceptor', 'relaxed') < getDifficultyAdjustedEnemyTurnRate('interceptor', 'veteran'));
});

test('pursuit directives switch between attack passes, disengage, return, and flee', () => {
  assert.equal(getEnemyPursuitDirective('fighter', 70, 40, 0.92), 'attack-pass');
  assert.equal(getEnemyPursuitDirective('interceptor', 320, 30, 0.5), 'disengage');
  assert.equal(getEnemyPursuitDirective('destroyer', 190, 170, 0.8), 'return');
  assert.equal(getEnemyPursuitDirective('shuttle', 80, 50, 0.1), 'flee');
});

test('segment-sphere collision catches fast projectiles that tunnel through targets', () => {
  const start = new THREE.Vector3(0, 0, 0);
  const end = new THREE.Vector3(0, 0, 12);
  const center = new THREE.Vector3(0.2, 0, 6);
  const hit = segmentSphereIntersection(start, end, center, 1.25);
  const miss = segmentSphereIntersection(start, end, new THREE.Vector3(4, 0, 6), 1);
  assert.notEqual(hit, null);
  assert.equal(miss, null);
});

test('swept sphere helpers stop fast movers against planets and carriers', () => {
  const planetHit = sweepSphereAgainstSphere(
    new THREE.Vector3(0, 0, 20),
    new THREE.Vector3(0, 0, -20),
    new THREE.Vector3(0, 0, 0),
    10,
    1.5,
  );
  const carrierHit = sweepSphereAgainstBox(
    new THREE.Vector3(-20, 0, 0),
    new THREE.Vector3(20, 0, 0),
    new THREE.Box3(new THREE.Vector3(-4, -2, -8), new THREE.Vector3(4, 2, 8)),
    1.2,
  );

  assert.notEqual(planetHit, null);
  assert.ok(planetHit && planetHit.time > 0 && planetHit.time < 1);
  assert.ok(planetHit && planetHit.position.z > 0);
  assert.notEqual(carrierHit, null);
  assert.ok(carrierHit && carrierHit.time > 0 && carrierHit.time < 1);
  assert.ok(carrierHit && carrierHit.normal.x < 0);
});

test('bounded turning steers toward a target direction without snapping instantly', () => {
  const desired = new THREE.Vector3(1, 0.35, -0.25).normalize();
  const limited = turnTowardsDirection(new THREE.Quaternion(), desired, 0.45, 0.5);
  const basis = getBasisVectors(limited);
  const alignment = basis.forward.dot(desired);
  assert.ok(alignment > 0.4, 'turn should make progress toward the target');
  assert.ok(alignment < 0.999, 'turn rate should remain bounded');
});

test('chase camera frame stays behind the ship and looks ahead along forward vector', () => {
  const orientation = applyOrientationInput(
    new THREE.Quaternion(),
    { yaw: 0.35, pitch: 0.18, roll: -0.22 },
    { yawRate: Math.PI / 2, pitchRate: Math.PI / 2, rollRate: Math.PI / 2 },
    1,
  );
  const position = new THREE.Vector3(12, -4, 30);
  const velocity = new THREE.Vector3(18, 5, -42);
  const frame = getChaseCameraFrame(position, orientation, velocity, { distance: 14, height: 4, lookAhead: 18 });
  const basis = getBasisVectors(orientation);
  const cameraOffset = frame.position.clone().sub(position);
  const lookOffset = frame.lookAt.clone().sub(position);

  assert.ok(cameraOffset.dot(basis.forward) < -10, 'camera should sit behind the ship');
  assert.ok(cameraOffset.dot(basis.up) > 2, 'camera should sit above the ship');
  assert.ok(lookOffset.dot(basis.forward) > 14, 'camera target should look forward of the ship');
  assert.ok(Math.abs(frame.up.length() - 1) < 1e-6, 'camera up vector should stay normalized');
});
