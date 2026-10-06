import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCapitalShipBoss,
  createCapitalShipSubsystems,
  areShieldGeneratorsDestroyed,
  canDamageBridge,
  damageBossSubsystem,
  damageBossHullDirect,
  getBossPhase,
  getBossTurretCooldown,
  isTurretOnline,
  BOSS_TUNING,
  BOSS_DIFFICULTY,
  type CapitalShipSubsystem,
} from './capital.ts';

test('createCapitalShipSubsystems returns 4 targetable subsystems with health and radiuses', () => {
  const subsystems = createCapitalShipSubsystems();
  assert.equal(subsystems.length, 4);

  const bridge = subsystems.find((s) => s.id === 'bridge');
  assert.ok(bridge);
  assert.equal(bridge.type, 'bridge');
  assert.ok(bridge.hull > 0);
  assert.equal(bridge.destroyed, false);
  assert.ok(bridge.radius > 0);

  const shieldGens = subsystems.filter((s) => s.type === 'shield_generator');
  assert.equal(shieldGens.length, 2);
});

test('capital ship boss lifecycle and subsystem damage mechanics', () => {
  const boss = createCapitalShipBoss();
  assert.equal(boss.name, 'The Leviathan');
  assert.equal(boss.defeated, false);
  assert.equal(boss.shield, 1600);
  assert.equal(boss.hull, 2400);

  // Initially, shield generators are intact so bridge cannot be damaged directly
  assert.equal(areShieldGeneratorsDestroyed(boss), false);
  assert.equal(canDamageBridge(boss), false);

  // Firing at bridge while shields are intact directs damage to boss shield
  const initialBridgeHull = boss.subsystems.find((s) => s.id === 'bridge')!.hull;
  damageBossSubsystem(boss, 'bridge', 200);
  assert.equal(boss.subsystems.find((s) => s.id === 'bridge')!.hull, initialBridgeHull);
  assert.ok(boss.shield < 1600);

  // Destroy port and starboard shield generators
  damageBossSubsystem(boss, 'shield_gen_port', 1000);
  assert.equal(boss.subsystems.find((s) => s.id === 'shield_gen_port')!.destroyed, true);
  assert.equal(areShieldGeneratorsDestroyed(boss), false);

  damageBossSubsystem(boss, 'shield_gen_starboard', 1000);
  assert.equal(boss.subsystems.find((s) => s.id === 'shield_gen_starboard')!.destroyed, true);
  assert.equal(areShieldGeneratorsDestroyed(boss), true);
  assert.equal(boss.shield, 0);
  assert.equal(canDamageBridge(boss), true);

  // Now bridge can take direct structural damage
  damageBossSubsystem(boss, 'bridge', 1500);
  assert.equal(boss.subsystems.find((s) => s.id === 'bridge')!.destroyed, true);
  assert.equal(boss.defeated, true);
});

test('destroying hangar bay inflicts collateral hull damage', () => {
  const boss = createCapitalShipBoss();
  const initialHull = boss.hull;
  damageBossSubsystem(boss, 'hangar_bay', 1500);
  assert.equal(boss.subsystems.find((s) => s.id === 'hangar_bay')!.destroyed, true);
  assert.ok(boss.hull < initialHull);
});


test('boss phases escalate from shielded to exposed to critical to defeated', () => {
  const boss = createCapitalShipBoss();
  assert.equal(getBossPhase(boss), 'shielded');
  for (const id of ['shield_gen_port', 'shield_gen_starboard']) damageBossSubsystem(boss, id, 99999);
  assert.equal(boss.shield, 0);
  assert.equal(getBossPhase(boss), 'exposed');
  boss.hull = boss.maxHull * 0.3;
  assert.equal(getBossPhase(boss), 'critical');
  boss.defeated = true;
  assert.equal(getBossPhase(boss), 'defeated');
});

test('turret cooldown shrinks in later phases and respects difficulty', () => {
  const shielded = getBossTurretCooldown('shielded', 1, 0.5);
  const exposed = getBossTurretCooldown('exposed', 1, 0.5);
  const critical = getBossTurretCooldown('critical', 1, 0.5);
  assert.ok(shielded > exposed && exposed > critical);
  assert.ok(getBossTurretCooldown('shielded', 1.3, 0.5) > shielded);
  assert.ok(getBossTurretCooldown('critical', 0, 0) >= BOSS_TUNING.turretBaseCooldown * BOSS_TUNING.criticalRageMultiplier * 0.5 - 1e-9);
});

test('ventral turrets go offline only after the hangar bay is destroyed', () => {
  const boss = createCapitalShipBoss();
  const ventral = boss.turrets.find((turret) => turret.localOffset.y < 0)!;
  const dorsal = boss.turrets.find((turret) => turret.localOffset.y > 0)!;
  assert.equal(isTurretOnline(boss, ventral), true);
  damageBossSubsystem(boss, 'hangar_bay', 99999);
  assert.equal(isTurretOnline(boss, ventral), false);
  assert.equal(isTurretOnline(boss, dorsal), true);
});

test('wave 5 flow: domes drop shields, bridge becomes vulnerable, bridge kill defeats the boss', () => {
  const boss = createCapitalShipBoss();
  damageBossSubsystem(boss, 'shield_gen_port', 99999);
  assert.ok(boss.shield <= boss.maxShield * 0.5);
  damageBossSubsystem(boss, 'shield_gen_starboard', 99999);
  assert.equal(canDamageBridge(boss), true);
  const result = damageBossSubsystem(boss, 'bridge', 99999);
  assert.equal(result.destroyed, true);
  assert.equal(boss.defeated, true);
});

test('direct hull hits are deliberately weaker than subsystem play', () => {
  const boss = createCapitalShipBoss();
  const startTotal = boss.hull + boss.shield;
  damageBossHullDirect(boss, 100 * BOSS_TUNING.hullHitMultiplier);
  const lost = startTotal - (boss.hull + boss.shield);
  assert.ok(lost > 0 && lost <= 100 * BOSS_TUNING.hullHitMultiplier);
  assert.ok(BOSS_TUNING.hullHitMultiplier < 0.5);
});

test('boss difficulty scale ramps pressure monotonically and keeps lead below perfect', () => {
  const { relaxed, standard, veteran } = BOSS_DIFFICULTY;
  assert.ok(relaxed.damage < standard.damage && standard.damage < veteran.damage);
  assert.ok(relaxed.cooldown > standard.cooldown && standard.cooldown > veteran.cooldown);
  assert.ok(relaxed.lead < standard.lead && standard.lead < veteran.lead);
  assert.ok(relaxed.spread > standard.spread && standard.spread > veteran.spread);
  for (const scale of [relaxed, standard, veteran]) assert.ok(scale.lead < 1 && scale.lead > 0.5);
});
