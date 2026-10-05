import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOOST_MULTIPLIER,
  COMBO_WINDOW,
  DIFFICULTIES,
  MAX_WAVE,
  PICKUP_TYPES,
  PICKUP_WORLD_CAP,
  SHIPS,
  SHIP_CLASSES,
  applyDamage,
  applyPickupRestore,
  countCombatShips,
  getAsteroidScore,
  getDifficultyTuning,
  getComboAfterKill,
  getEnemyAttackTuning,
  getEnemyShipClass,
  getForwardSpeed,
  getKillScore,
  getPickupSpawnAllowance,
  getWaveCombatCount,
  getWaveConfig,
  getWaveEnemyRoster,
  isCombatShip,
  isVictoryWave,
  regenerateEnergy,
  regenerateShield,
  resolvePlayerDamageState,
  resolveCollision,
} from './rules.ts';

test('ship roster exposes all six selectable classes with distinct behaviors', () => {
  assert.deepEqual([...SHIP_CLASSES], ['fighter', 'interceptor', 'bomber', 'shuttle', 'freighter', 'destroyer']);
  assert.ok(SHIPS.interceptor.speed > SHIPS.fighter.speed);
  assert.ok(SHIPS.bomber.damage > SHIPS.interceptor.damage);
  assert.ok(SHIPS.destroyer.hull > SHIPS.freighter.hull);
  assert.ok(SHIPS.shuttle.shield > SHIPS.fighter.shield);
  assert.ok(SHIPS.freighter.armor > SHIPS.shuttle.armor);
  assert.equal(isCombatShip('shuttle'), false);
  assert.equal(isCombatShip('fighter'), true);
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

test('wave configuration separates combat threats from optional fleeing targets', () => {
  const wave1 = getWaveConfig(1);
  const wave2 = getWaveConfig(2);
  const wave4 = getWaveConfig(4);
  const finalWave = getWaveConfig(MAX_WAVE);

  assert.equal(MAX_WAVE, 5);
  assert.equal(wave1.enemies, 6);
  assert.equal(wave1.combatEnemies, 6);
  assert.ok(wave2.bonusTargets > 0);
  assert.ok(wave4.enemies > wave1.enemies);
  assert.ok(finalWave.eliteCount > wave4.eliteCount);
  assert.ok(finalWave.classes.includes('destroyer'));
  assert.equal(getEnemyShipClass(2, wave2.enemies - 1), 'shuttle');
  assert.equal(getWaveCombatCount(2), 6);
  assert.equal(isVictoryWave(MAX_WAVE - 1), false);
  assert.equal(isVictoryWave(MAX_WAVE), true);
});

test('wave rosters never open with only fleeing ships and combat counting ignores them', () => {
  const wave4Roster = getWaveEnemyRoster(4);
  assert.ok(isCombatShip(wave4Roster[0]));
  assert.ok(isCombatShip(wave4Roster[1]));
  assert.equal(countCombatShips(['shuttle', 'freighter', 'fighter', 'destroyer']), 2);
});

test('enemy attack tuning softens early waves and keeps optional targets non-hostile', () => {
  const earlyInterceptor = getEnemyAttackTuning('interceptor', 1);
  const lateInterceptor = getEnemyAttackTuning('interceptor', MAX_WAVE);
  const bomber = getEnemyAttackTuning('bomber', 3);
  const shuttle = getEnemyAttackTuning('shuttle', 3);

  assert.ok(earlyInterceptor.damageMultiplier < lateInterceptor.damageMultiplier);
  assert.ok(earlyInterceptor.cooldownMultiplier > lateInterceptor.cooldownMultiplier);
  assert.ok(bomber.cooldownMultiplier > lateInterceptor.cooldownMultiplier);
  assert.equal(shuttle.damageMultiplier, 0);
  assert.equal(shuttle.accuracy, 0);
});

test('difficulty tuning orders enemy pressure and recovery generosity predictably', () => {
  const relaxed = getDifficultyTuning('relaxed');
  const standard = getDifficultyTuning('standard');
  const veteran = getDifficultyTuning('veteran');
  const relaxedAttack = getEnemyAttackTuning('fighter', 3, 'relaxed');
  const veteranAttack = getEnemyAttackTuning('fighter', 3, 'veteran');

  assert.deepEqual([...DIFFICULTIES], ['relaxed', 'standard', 'veteran']);
  assert.ok(relaxed.enemyDamageMultiplier < standard.enemyDamageMultiplier);
  assert.ok(veteran.enemyDamageMultiplier > standard.enemyDamageMultiplier);
  assert.ok(relaxed.enemyCooldownMultiplier > standard.enemyCooldownMultiplier);
  assert.ok(veteran.enemyCooldownMultiplier < standard.enemyCooldownMultiplier);
  assert.ok(relaxed.recoveryPocketCooldown < standard.recoveryPocketCooldown);
  assert.ok(veteran.recoveryThreatDistance > standard.recoveryThreatDistance);
  assert.ok(relaxedAttack.damageMultiplier < veteranAttack.damageMultiplier);
  assert.ok(relaxedAttack.cooldownMultiplier > veteranAttack.cooldownMultiplier);
});

test('pickup roster preserves recovery items and adds separate upgrade drops', () => {
  assert.deepEqual([...PICKUP_TYPES], ['energy', 'shield', 'hull', 'hull-upgrade', 'defense-upgrade', 'attack-upgrade']);
});

test('pickup helpers respect player caps and world spawn caps', () => {
  const partial = applyPickupRestore(72, 100, 35);
  const capped = applyPickupRestore(94, 100, 20);

  assert.deepEqual(partial, { next: 100, restored: 28, full: true });
  assert.deepEqual(capped, { next: 100, restored: 6, full: true });
  assert.equal(getPickupSpawnAllowance(2, 4), 4);
  assert.equal(getPickupSpawnAllowance(PICKUP_WORLD_CAP - 1, 4), 1);
  assert.equal(getPickupSpawnAllowance(PICKUP_WORLD_CAP, 3), 0);
});

test('scoring rewards heavier targets, later waves, and combo chains', () => {
  const fighterScore = getKillScore('fighter', 1, 1);
  const destroyerScore = getKillScore('destroyer', 1, 1);
  const comboScore = getKillScore('fighter', 4, 3);
  const shuttleScore = getKillScore('shuttle', 3, 2);
  const asteroidScore = getAsteroidScore(2.4, 2);

  assert.ok(destroyerScore > fighterScore);
  assert.ok(comboScore > fighterScore);
  assert.ok(shuttleScore < destroyerScore);
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

test('collision helper accepts explicit relative speed magnitude for 3d impacts', () => {
  const direct = resolveCollision(
    { hull: 120, shield: 40, armor: 0.12, mass: 28, speed: 0 },
    { hull: 120, shield: 40, armor: 0.12, mass: 28, speed: 0 },
    52,
  );
  const glancing = resolveCollision(
    { hull: 120, shield: 40, armor: 0.12, mass: 28, speed: 0 },
    { hull: 120, shield: 40, armor: 0.12, mass: 28, speed: 0 },
    14,
  );

  assert.ok(direct.impactDamage > glancing.impactDamage);
  assert.ok(direct.a.effectiveDamage > glancing.a.effectiveDamage);
});

test('player damage policy can preserve hull and shields without blocking enemy damage resolution', () => {
  const current = { shield: 52, hull: 110 };
  const next = applyDamage(current, 80, 0.18);

  assert.deepEqual(resolvePlayerDamageState(current, next, true), { shield: next.shield, hull: next.hull });
  assert.deepEqual(resolvePlayerDamageState(current, next, false), current);
  assert.ok(next.effectiveDamage > 0);
});
