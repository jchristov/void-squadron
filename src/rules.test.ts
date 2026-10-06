import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOOST_MULTIPLIER,
  COMBO_WINDOW,
  DIFFICULTIES,
  MAX_WAVE,
  PICKUP_TYPES,
  getMaxConcurrentCombat,
  SHIP_MODEL_SCALE,
  SHIP_TARGET_RADIUS,
  canUseCombatPickup,
  absorbWithOvershield,
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
  assert.ok(SHIPS.shuttle.shield > SHIPS.fighter.shield);
  assert.ok(SHIPS.freighter.armor > SHIPS.shuttle.armor);
  assert.equal(isCombatShip('shuttle'), false);
  assert.equal(isCombatShip('fighter'), true);
});

test('freighter is the slow, lightly armed, heavily plated hauler', () => {
  const others = SHIP_CLASSES.filter((ship) => ship !== 'freighter');
  const dps = (ship: (typeof SHIP_CLASSES)[number]) => SHIPS[ship].damage / SHIPS[ship].fireInterval;
  for (const ship of others) {
    assert.ok(SHIPS.freighter.hull > SHIPS[ship].hull, `hull vs ${ship}`);
    assert.ok(SHIPS.freighter.armor > SHIPS[ship].armor, `armor vs ${ship}`);
    assert.ok(SHIPS.freighter.speed < SHIPS[ship].speed, `speed vs ${ship}`);
    assert.ok(dps('freighter') < dps(ship), `firepower vs ${ship}`);
  }
});

test('spacecraft sizes grow strictly in hangar order and models scale to match', () => {
  const radii = SHIP_CLASSES.map((ship) => SHIP_TARGET_RADIUS[ship]);
  for (let index = 1; index < radii.length; index += 1) assert.ok(radii[index] > radii[index - 1], `${SHIP_CLASSES[index]} larger than ${SHIP_CLASSES[index - 1]}`);
  for (const ship of SHIP_CLASSES) assert.ok(SHIP_MODEL_SCALE[ship] > 0.5 && SHIP_MODEL_SCALE[ship] < 2);
});

test('torpedo magazines are reserved for some craft and gate the torpedo pickup', () => {
  assert.ok(SHIPS.fighter.torpedoes > 0 && SHIPS.bomber.torpedoes > SHIPS.fighter.torpedoes && SHIPS.destroyer.torpedoes > 0);
  assert.equal(SHIPS.interceptor.torpedoes, 0);
  assert.equal(canUseCombatPickup('torpedo', SHIPS.interceptor), false);
  assert.equal(canUseCombatPickup('torpedo', SHIPS.bomber), true);
  assert.equal(canUseCombatPickup('overcharge', SHIPS.interceptor), true);
  assert.equal(canUseCombatPickup('energy', SHIPS.bomber), false);
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
  assert.equal(wave1.enemies, 4);
  assert.equal(wave1.combatEnemies, 4);
  assert.ok(wave2.bonusTargets > 0);
  assert.ok(wave4.enemies > wave1.enemies);
  assert.ok(finalWave.eliteCount > wave4.eliteCount);
  assert.ok(finalWave.classes.includes('destroyer'));
  assert.equal(getEnemyShipClass(2, wave2.enemies - 1), 'shuttle');
  assert.equal(getWaveCombatCount(2), 4);
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
  assert.deepEqual([...PICKUP_TYPES], ['energy', 'shield', 'hull', 'hull-upgrade', 'defense-upgrade', 'attack-upgrade', 'torpedo', 'overcharge', 'aegis']);
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

test('overshield soaks shield damage first, then hull, and reports what is left', () => {
  const hit = applyDamage({ shield: 30, hull: 100 }, 80, 0.25);
  assert.equal(hit.shieldLoss, 30);
  const partial = absorbWithOvershield(hit, 20);
  assert.equal(partial.absorbed, 20);
  assert.equal(partial.remaining, 0);
  assert.equal(partial.result.shieldLoss, 10);
  assert.equal(partial.result.hullLoss, hit.hullLoss);
  assert.equal(partial.result.shield, 20);
  const full = absorbWithOvershield(hit, 500);
  assert.equal(full.result.shieldLoss + full.result.hullLoss, 0);
  assert.equal(full.result.hull, 100);
  assert.equal(full.remaining, 500 - hit.shieldLoss - hit.hullLoss);
  assert.equal(full.result.destroyed, false);
  assert.equal(absorbWithOvershield(hit, 0).result, hit);
});

test('overshield can save a lethal hit', () => {
  const lethal = applyDamage({ shield: 0, hull: 10 }, 60, 0);
  assert.equal(lethal.destroyed, true);
  const saved = absorbWithOvershield(lethal, 90);
  assert.equal(saved.result.destroyed, false);
  assert.equal(saved.result.hull, 10);
});

test('early waves cap simultaneous hostiles and the cap grows with the wave and difficulty', () => {
  assert.equal(getMaxConcurrentCombat(1), 2);
  assert.ok(getMaxConcurrentCombat(1) < getMaxConcurrentCombat(2) && getMaxConcurrentCombat(2) < getMaxConcurrentCombat(4));
  assert.ok(getMaxConcurrentCombat(1, 'relaxed') <= getMaxConcurrentCombat(1, 'standard'));
  assert.ok(getMaxConcurrentCombat(3, 'veteran') > getMaxConcurrentCombat(3, 'standard'));
  assert.equal(getMaxConcurrentCombat(1, 'relaxed'), 1);
});

test('wave 1 opens gently: the first wave has far weaker enemy fire than the last', () => {
  const early = getEnemyAttackTuning('fighter', 1);
  const late = getEnemyAttackTuning('fighter', MAX_WAVE);
  assert.ok(early.damageMultiplier < late.damageMultiplier * 0.62);
  assert.ok(early.accuracy < late.accuracy * 0.75);
  assert.ok(early.cooldownMultiplier > late.cooldownMultiplier * 1.4);
});
