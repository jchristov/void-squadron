import assert from 'node:assert/strict';
import test from 'node:test';

import { DROP_TABLE, rollDrops, type DropContext } from './drops.ts';
import { PICKUP_TYPES, SHIP_CLASSES, isUpgradePickup, type PickupType } from './rules.ts';

function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let next = Math.imul(t ^ (t >>> 15), t | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

const base: DropContext = {
  shipClass: 'fighter',
  byPlayer: true,
  usableCombat: ['torpedo', 'overcharge', 'aegis'],
  availableUpgrades: ['hull-upgrade', 'defense-upgrade', 'attack-upgrade'],
  needs: { hull: 50, shield: 50, energy: 50 },
  torpedoesEmpty: false,
};

function sample(context: DropContext, runs = 4000) {
  const random = seeded(42);
  const counts = new Map<PickupType, number>();
  let wrecks = 0;
  let pods = 0;
  for (let index = 0; index < runs; index += 1) {
    const drops = rollDrops(random, context);
    wrecks += drops.length > 0 ? 1 : 0;
    pods += drops.length;
    for (const drop of drops) counts.set(drop.type, (counts.get(drop.type) ?? 0) + 1);
  }
  return { counts, wrecks, pods, runs };
}

test('every ship class has a sane drop table and can drop', () => {
  for (const shipClass of SHIP_CLASSES) {
    const entry = DROP_TABLE[shipClass];
    assert.ok(entry.rolls >= 1 && entry.chance > 0 && entry.chance <= 1, shipClass);
    assert.ok(sample({ ...base, shipClass }, 500).pods > 0, shipClass);
  }
});

test('larger wrecks drop more pods than fighters', () => {
  const fighter = sample({ ...base, shipClass: 'fighter' }).pods;
  const destroyer = sample({ ...base, shipClass: 'destroyer' }).pods;
  assert.ok(destroyer > fighter * 2);
});

test('both temporary and permanent pickups occur, and permanent ones are rarer', () => {
  const { counts, pods } = sample(base, 6000);
  const permanent = [...counts].filter(([type]) => isUpgradePickup(type)).reduce((sum, [, n]) => sum + n, 0);
  const temporary = pods - permanent;
  assert.ok(permanent > 0 && temporary > 0);
  assert.ok(permanent < temporary * 0.4);
  for (const type of PICKUP_TYPES) assert.ok((counts.get(type) ?? 0) > 0, `${type} never dropped`);
});

test('drops respect what the pilot can use', () => {
  const { counts } = sample({ ...base, usableCombat: [], availableUpgrades: [] }, 2000);
  for (const type of ['torpedo', 'overcharge', 'aegis', 'hull-upgrade', 'defense-upgrade', 'attack-upgrade'] as PickupType[]) {
    assert.equal(counts.get(type) ?? 0, 0, type);
  }
});

test('at most one permanent upgrade per wreck', () => {
  const random = seeded(7);
  for (let index = 0; index < 3000; index += 1) {
    const drops = rollDrops(random, { ...base, shipClass: 'destroyer' });
    assert.ok(drops.filter((drop) => drop.permanent).length <= 1);
  }
});

test('wrecks the player did not shoot down drop less often', () => {
  assert.ok(sample({ ...base, byPlayer: false }).pods < sample(base).pods * 0.7);
});

test('supply drops favour what the pilot is missing', () => {
  const needy = sample({ ...base, usableCombat: [], availableUpgrades: [], needs: { hull: 100, shield: 0, energy: 0 } }, 4000).counts;
  assert.ok((needy.get('hull') ?? 0) > (needy.get('shield') ?? 0) * 1.6);
});
