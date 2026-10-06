import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_CLASSES } from './rules.ts';
import {
  createEmptyRecords,
  decodeRecords,
  encodeRecords,
  isBetterRank,
  loadRecords,
  saveRecords,
  updateRecords,
  RECORDS_STORAGE_KEY,
} from './records.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => { data[key] = value; },
  };
}

test('empty records cover every ship with no best rank', () => {
  const records = createEmptyRecords();
  assert.deepEqual(Object.keys(records).sort(), [...SHIP_CLASSES].sort());
  assert.equal(records.fighter.bestRank, null);
  assert.equal(records.fighter.wins, 0);
});

test('rank comparison orders S above A above B above C', () => {
  assert.equal(isBetterRank('C', null), true);
  assert.equal(isBetterRank('A', 'B'), true);
  assert.equal(isBetterRank('S', 'A'), true);
  assert.equal(isBetterRank('B', 'A'), false);
  assert.equal(isBetterRank('A', 'A'), false);
});

test('victories raise rank, boss time and wins; slower or worse runs do not overwrite', () => {
  let state = createEmptyRecords();
  let update = updateRecords(state, 'fighter', { victory: true, rank: 'B', bossTimeSec: 90, score: 4000 });
  assert.equal(update.newBestRank && update.newFastestBoss && update.newBestScore, true);
  state = update.records;
  assert.equal(state.fighter.bestRank, 'B');
  assert.equal(state.fighter.wins, 1);
  update = updateRecords(state, 'fighter', { victory: true, rank: 'C', bossTimeSec: 120, score: 3000 });
  assert.equal(update.newBestRank || update.newFastestBoss || update.newBestScore, false);
  assert.equal(update.records.fighter.bestRank, 'B');
  assert.equal(update.records.fighter.fastestBossSec, 90);
  assert.equal(update.records.fighter.wins, 2);
  update = updateRecords(update.records, 'fighter', { victory: true, rank: 'S', bossTimeSec: 55.44, score: 9000 });
  assert.equal(update.records.fighter.bestRank, 'S');
  assert.equal(update.records.fighter.fastestBossSec, 55.44);
  assert.equal(update.records.bomber.bestRank, null);
});

test('defeats only update the best score and never rank or wins', () => {
  const update = updateRecords(createEmptyRecords(), 'bomber', { victory: false, rank: '—', bossTimeSec: null, score: 1200 });
  assert.equal(update.records.bomber.bestScore, 1200);
  assert.equal(update.records.bomber.bestRank, null);
  assert.equal(update.records.bomber.wins, 0);
  assert.equal(update.newBestRank, false);
});

test('decode tolerates corrupt, wrong-version and out-of-range data', () => {
  assert.deepEqual(decodeRecords(null), createEmptyRecords());
  assert.deepEqual(decodeRecords('not json'), createEmptyRecords());
  assert.deepEqual(decodeRecords(JSON.stringify({ version: 2, ships: {} })), createEmptyRecords());
  const messy = decodeRecords(JSON.stringify({ version: 1, ships: { fighter: { bestRank: 'Z', fastestBossSec: -5, bestScore: 'x', wins: 2.9 }, bomber: { bestRank: 'A', fastestBossSec: 61, bestScore: 777.6, wins: 3 } } }));
  assert.equal(messy.fighter.bestRank, null);
  assert.equal(messy.fighter.fastestBossSec, null);
  assert.equal(messy.fighter.bestScore, 0);
  assert.equal(messy.fighter.wins, 2);
  assert.deepEqual(messy.bomber, { bestRank: 'A', fastestBossSec: 61, bestScore: 778, wins: 3 });
});

test('records round-trip through storage and survive storage failures', () => {
  const storage = memoryStorage();
  const update = updateRecords(createEmptyRecords(), 'destroyer', { victory: true, rank: 'A', bossTimeSec: 40, score: 5000 });
  assert.equal(saveRecords(update.records, storage), true);
  assert.equal(typeof storage.data[RECORDS_STORAGE_KEY], 'string');
  assert.deepEqual(loadRecords(storage), update.records);
  assert.deepEqual(decodeRecords(encodeRecords(update.records)), update.records);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.deepEqual(loadRecords(broken), createEmptyRecords());
  assert.equal(saveRecords(update.records, broken), false);
});
