import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAccuracy, formatDuration, getMissionRank, type MissionSummary } from './summary.ts';

const base: MissionSummary = {
  durationSec: 200,
  shotsFired: 100,
  shotsHit: 60,
  accuracy: 0.6,
  kills: 10,
  damageTaken: 40,
  maxDurability: 225,
  bossEngaged: true,
  bossTimeSec: 50,
  bossHullPct: 0,
  subsystemsDestroyed: 4,
  subsystemsTotal: 4,
};

test('accuracy is bounded and safe with no shots', () => {
  assert.equal(computeAccuracy(0, 0), 0);
  assert.equal(computeAccuracy(10, 4), 0.4);
  assert.equal(computeAccuracy(10, 50), 1);
  assert.equal(computeAccuracy(10, -3), 0);
});

test('durations format as m:ss', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(59.6), '1:00');
  assert.equal(formatDuration(125), '2:05');
  assert.equal(formatDuration(-4), '0:00');
});

test('rank rewards precision, durability, speed and thoroughness', () => {
  assert.equal(getMissionRank(base, true), 'S');
  assert.equal(getMissionRank({ ...base, subsystemsDestroyed: 2, bossTimeSec: 100 }, true), 'A');
  assert.equal(getMissionRank({ ...base, accuracy: 0.2, damageTaken: 200, bossTimeSec: 300, subsystemsDestroyed: 0 }, true), 'C');
  assert.equal(getMissionRank({ ...base, accuracy: 0.35, damageTaken: 100, bossTimeSec: 100, subsystemsDestroyed: 1 }, true), 'B');
});

test('defeats are unranked and a missing boss time does not crash ranking', () => {
  assert.equal(getMissionRank(base, false), '—');
  assert.equal(getMissionRank({ ...base, bossTimeSec: null, maxDurability: 0 }, true), 'B');
});
