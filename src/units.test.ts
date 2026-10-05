import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSpaceDistance } from './units.ts';

test('space distances use a consistent kilometer scale', () => {
  assert.equal(formatSpaceDistance(1000), '1,000 KM');
  assert.equal(formatSpaceDistance(2.45), '2.5 KM');
  assert.equal(formatSpaceDistance(0), '0 KM');
  assert.equal(formatSpaceDistance(Infinity), '—');
});
