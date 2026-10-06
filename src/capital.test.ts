import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCapitalShipBoss,
  createCapitalShipSubsystems,
  areShieldGeneratorsDestroyed,
  canDamageBridge,
  damageBossSubsystem,
  damageBossHullDirect,
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

