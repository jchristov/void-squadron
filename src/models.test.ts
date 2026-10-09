import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShipModel, getObjectBoundingRadius } from './models.ts';
import { SHIP_CLASSES, SHIP_MODEL_SCALE, SHIP_TARGET_RADIUS } from './rules.ts';

const radiusOf = (ship: (typeof SHIP_CLASSES)[number]) =>
  getObjectBoundingRadius(createShipModel(ship, { scale: SHIP_MODEL_SCALE[ship] }));

test('scaled model radii tightly wrap every ship and strictly grow in hangar order', () => {
  let previous = 0;
  for (const ship of SHIP_CLASSES) {
    const model = createShipModel(ship, { scale: SHIP_MODEL_SCALE[ship] });
    const radius = radiusOf(ship);
    let furthestVertex = 0;
    model.updateMatrixWorld(true);
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const positions = child.geometry.getAttribute('position');
      if (!positions) return;
      for (let index = 0; index < positions.count; index += 1) {
        furthestVertex = Math.max(
          furthestVertex,
          new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld).length(),
        );
      }
    });
    assert.ok(radius >= SHIP_TARGET_RADIUS[ship] * 0.9 && radius <= SHIP_TARGET_RADIUS[ship] * 1.1, `${ship} radius ${radius.toFixed(2)} vs ${SHIP_TARGET_RADIUS[ship]}`);
    assert.ok(Math.abs(radius - furthestVertex) < 1e-6, `${ship} collision sphere must tightly enclose its furthest vertex`);
    assert.ok(radius > previous, `${ship} must be larger than the previous class`);
    previous = radius;
  }
});
