import assert from 'node:assert/strict';
import test from 'node:test';

import { SHIPS } from './rules.ts';
import {
  UPGRADE_MAX_LEVEL,
  UPGRADE_STORAGE_KEY,
  createDefaultShipUpgradeRegistry,
  createDefaultUpgradeLevels,
  decodeStoredShipUpgrades,
  encodeStoredShipUpgrades,
  getUpgradedShipStats,
  getUpgradeEncounterScaling,
  loadStoredShipUpgrades,
  saveStoredShipUpgrades,
  sanitizeUpgradeLevels,
} from './upgrades.ts';

test('encounter scaling is proportional and capped below player upgrade gains', () => {
  assert.deepEqual(getUpgradeEncounterScaling({ hull: 0, defense: 0, attack: 0 }), { count: 1, durability: 1, damage: 1 });
  const middle = getUpgradeEncounterScaling({ hull: 5, defense: 5, attack: 5 });
  const max = getUpgradeEncounterScaling({ hull: 100, defense: 100, attack: 100 });
  assert.equal(middle.count, 1.15);
  assert.equal(max.count, 1.3);
  assert.equal(max.durability, 1.2);
  assert.equal(max.damage, 1.1);
});

test('upgrade defaults start at zero for every spacecraft', () => {
  const defaults = createDefaultShipUpgradeRegistry();

  assert.deepEqual(createDefaultUpgradeLevels(), { hull: 0, defense: 0, attack: 0 });
  assert.deepEqual(defaults.fighter, { hull: 0, defense: 0, attack: 0 });
  assert.deepEqual(defaults.destroyer, { hull: 0, defense: 0, attack: 0 });
  assert.notEqual(defaults.fighter, defaults.interceptor);
});

test('decode returns defaults for corrupt or missing storage data', () => {
  assert.deepEqual(decodeStoredShipUpgrades(undefined).fighter, { hull: 0, defense: 0, attack: 0 });
  assert.deepEqual(decodeStoredShipUpgrades(null).destroyer, { hull: 0, defense: 0, attack: 0 });
  assert.deepEqual(decodeStoredShipUpgrades('not json').bomber, { hull: 0, defense: 0, attack: 0 });
  assert.deepEqual(decodeStoredShipUpgrades(JSON.stringify({ version: 99, ships: {} })).shuttle, { hull: 0, defense: 0, attack: 0 });
});

test('decode clamps bad data and keeps upgrades independent per ship', () => {
  const decoded = decodeStoredShipUpgrades(JSON.stringify({
    version: 1,
    ships: {
      fighter: { hull: 12.8, defense: -4, attack: 3.9 },
      interceptor: { hull: 1, defense: 2, attack: 3 },
      destroyer: { hull: Number.NaN, defense: Number.POSITIVE_INFINITY, attack: 7 },
    },
  }));

  assert.deepEqual(decoded.fighter, { hull: UPGRADE_MAX_LEVEL, defense: 0, attack: 3 });
  assert.deepEqual(decoded.interceptor, { hull: 1, defense: 2, attack: 3 });
  assert.deepEqual(decoded.destroyer, { hull: 0, defense: 0, attack: 7 });
  assert.deepEqual(decoded.bomber, { hull: 0, defense: 0, attack: 0 });
});

test('storage helpers round-trip and survive storage failures', () => {
  const state = createDefaultShipUpgradeRegistry();
  state.fighter = { hull: 2, defense: 4, attack: 6 };
  state.destroyer = { hull: 1, defense: 0, attack: 3 };

  let storedValue = '';
  const storage = {
    getItem(key: string) {
      return key === UPGRADE_STORAGE_KEY ? storedValue : null;
    },
    setItem(key: string, value: string) {
      assert.equal(key, UPGRADE_STORAGE_KEY);
      storedValue = value;
    },
  };

  assert.equal(saveStoredShipUpgrades(state, storage), true);
  assert.deepEqual(loadStoredShipUpgrades(storage), state);
  assert.deepEqual(decodeStoredShipUpgrades(encodeStoredShipUpgrades(state)), state);

  const failingStorage = {
    getItem() {
      throw new Error('private mode');
    },
    setItem() {
      throw new Error('private mode');
    },
  };

  assert.equal(saveStoredShipUpgrades(state, failingStorage), false);
  assert.deepEqual(loadStoredShipUpgrades(failingStorage).freighter, { hull: 0, defense: 0, attack: 0 });
});

test('sanitized levels cap effective hull shield and attack bonuses', () => {
  const base = SHIPS.fighter;
  const upgraded = getUpgradedShipStats(base, sanitizeUpgradeLevels({ hull: 99, defense: 5, attack: 8.7 }));

  assert.equal(upgraded.hull, base.hull * 2);
  assert.equal(upgraded.shield, base.shield * 1.5);
  assert.equal(upgraded.damage, base.damage * 1.8);
  assert.equal(upgraded.speed, base.speed);
  assert.equal(upgraded.armor, base.armor);
});
