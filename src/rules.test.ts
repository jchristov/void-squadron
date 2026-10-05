import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOOST_MULTIPLIER,
  COMBO_WINDOW,
  MAX_WAVE,
  SHIPS,
  SHIP_CLASSES,
  applyDamage,
  getAsteroidScore,
  getComboAfterKill,
  getEnemyShipClass,
  getForwardSpeed,
  getKillScore,
  getWaveConfig,
  isVictoryWave,
  regenerateEnergy,
  regenerateShield,
  resolveCollision,
} from './rules.ts';

test('ship roster exposes all six selectable classes with distinct roles', () => {
  assert.deepEqual([...SHIP_CLASSES], ['fighter', 'interceptor', 'bomber', 'shuttle', 'freighter', 'destroyer']);
  assert.ok(SHIPS.interceptor.speed > SHIPS.fighter.speed);
  assert.ok(SHIPS.bomber.damage > SHIPS.interceptor.damage);
  assert.ok(SHIPS.destroyer.hull > SHIPS.freighter.hull);
  assert.ok(SHIPS.shuttle.shield > SHIPS.fighter.shield);
  assert.ok(SHIPS.freighter.armor > SHIPS.shuttle.armor);
});

test('damage is absorbed by shields before armor reduces hull damage', () => {
  const result = applyDamage({ shield: 30, hull: 100 }, 50, 0.25);
  assert.equal(result.shield, 0);
  assert.equal(result.shieldLoss, 30);
  assert.equal(result.hullLoss, 15);
  assert.equal(result.hull, 85);
  assert.equal(result.destroyed, false);
});

test('collision damage scales with mass and relative speed while shields absorb first', () => {
  const lightFast = resolveCollision(
    { hull: 90, shield: 20, armor: 0.08, mass: 20, speed: 48 },
    { hull: 240, shield: 90, armor: 0.3, mass: 90, speed: 12 },
  );
  const lightSlow = resolveCollision(
    { hull: 90, shield: 20, armor: 0.08, mass: 20, speed: 24 },
    { hull: 240, shield: 90, armor: 0.3, mass: 90, speed: 12 },
  );

  assert.ok(lightFast.impactDamage > lightSlow.impactDamage);
  assert.ok(lightFast.a.effectiveDamage > lightFast.b.effectiveDamage, 'lighter ship should suffer more');
  assert.ok(lightFast.b.shield < 90, 'heavy ship shields should absorb part of the collision');
});

test('head-on asteroid impacts punish light hulls and boost increases damage', () => {
  const rock = { hull: 500, shield: 0, armor: 0.2, mass: 100, speed: 20 };
  const needle = { ...SHIPS.interceptor, shield: 0, speed: -SHIPS.interceptor.speed };
  const normal = resolveCollision(needle, rock);
  const boosted = resolveCollision({ ...needle, speed: needle.speed * BOOST_MULTIPLIER }, rock);
  const heavy = resolveCollision({ ...SHIPS.destroyer, shield: 0, speed: -SHIPS.destroyer.speed }, rock);
  assert.ok(normal.a.hullLoss > 20, 'head-on impacts must not stay at minimum chip damage');
  assert.ok(boosted.impactDamage > normal.impactDamage);
  assert.ok(boosted.a.hullLoss >= normal.a.hullLoss, 'hull loss caps at the remaining hull');
  assert.ok(normal.a.hullLoss / SHIPS.interceptor.hull > heavy.a.hullLoss / SHIPS.destroyer.hull);
});

test('wave configuration progresses toward heavy craft and final victory wave', () => {
  const wave1 = getWaveConfig(1);
  const wave4 = getWaveConfig(4);
  const finalWave = getWaveConfig(MAX_WAVE);

  assert.equal(MAX_WAVE, 5);
  assert.equal(wave1.enemies, 6);
  assert.ok(wave4.enemies > wave1.enemies);
  assert.ok(finalWave.eliteCount > wave4.eliteCount);
  assert.ok(finalWave.classes.includes('destroyer'));
  assert.equal(getEnemyShipClass(MAX_WAVE, finalWave.enemies - 1), 'destroyer');
  assert.equal(isVictoryWave(MAX_WAVE - 1), false);
  assert.equal(isVictoryWave(MAX_WAVE), true);
});

test('scoring rewards heavier targets, later waves, and combo chains', () => {
  const fighterScore = getKillScore('fighter', 1, 1);
  const destroyerScore = getKillScore('destroyer', 1, 1);
  const comboScore = getKillScore('fighter', 4, 3);
  const asteroidScore = getAsteroidScore(2.4, 2);

  assert.ok(destroyerScore > fighterScore);
  assert.ok(comboScore > fighterScore);
  assert.ok(asteroidScore > 100);
});

test('shield and energy regeneration wait for delay and respect caps', () => {
  assert.equal(regenerateShield(40, 100, 1.5, 1), 40, 'regen waits until delay expires');
  assert.ok(regenerateShield(40, 100, 5, 1) > 40);
  assert.equal(regenerateShield(98, 100, 10, 1), 100);
  assert.equal(regenerateEnergy(95, 1), 100);
});

test('combo and boost helpers preserve expected pacing', () => {
  assert.equal(getComboAfterKill(0, COMBO_WINDOW + 0.1), 1);
  assert.equal(getComboAfterKill(2, COMBO_WINDOW - 0.1), 3);
  assert.equal(getForwardSpeed(SHIPS.interceptor.speed, false, 100), SHIPS.interceptor.speed);
  assert.equal(getForwardSpeed(SHIPS.interceptor.speed, true, 100), Math.round(SHIPS.interceptor.speed * BOOST_MULTIPLIER * 10) / 10);
  assert.equal(getForwardSpeed(SHIPS.interceptor.speed, true, 0), SHIPS.interceptor.speed);
});
