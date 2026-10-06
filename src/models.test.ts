import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShipModel } from './models.ts';
import { SHIP_CLASSES, SHIP_MODEL_SCALE, SHIP_TARGET_RADIUS } from './rules.ts';

const radiusOf = (ship: (typeof SHIP_CLASSES)[number]) =>
  new THREE.Box3().setFromObject(createShipModel(ship, { scale: SHIP_MODEL_SCALE[ship] })).getBoundingSphere(new THREE.Sphere()).radius;

test('scaled models hit their target radius and strictly grow in hangar order', () => {
  let previous = 0;
  for (const ship of SHIP_CLASSES) {
    const radius = radiusOf(ship);
    assert.ok(Math.abs(radius - SHIP_TARGET_RADIUS[ship]) / SHIP_TARGET_RADIUS[ship] < 0.03, `${ship} radius ${radius.toFixed(2)} vs ${SHIP_TARGET_RADIUS[ship]}`);
    assert.ok(radius > previous, `${ship} must be larger than the previous class`);
    previous = radius;
  }
});
