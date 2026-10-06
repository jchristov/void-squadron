import { SHIP_CLASSES, type ShipClass } from './rules.ts';
import type { MissionRank } from './summary.ts';

export type RankedGrade = Exclude<MissionRank, '—'>;

export interface ShipRecord {
  bestRank: RankedGrade | null;
  fastestBossSec: number | null;
  bestScore: number;
  wins: number;
}

export type ShipRecords = Record<ShipClass, ShipRecord>;

export interface RecordUpdate {
  records: ShipRecords;
  newBestRank: boolean;
  newFastestBoss: boolean;
  newBestScore: boolean;
}

export const RECORDS_STORAGE_KEY = 'void-squadron.records.v1';

const RANK_ORDER: readonly RankedGrade[] = ['C', 'B', 'A', 'S'];

export function createEmptyRecord(): ShipRecord {
  return { bestRank: null, fastestBossSec: null, bestScore: 0, wins: 0 };
}

export function createEmptyRecords(): ShipRecords {
  return Object.fromEntries(SHIP_CLASSES.map((ship) => [ship, createEmptyRecord()])) as ShipRecords;
}

export function isBetterRank(candidate: RankedGrade, current: RankedGrade | null): boolean {
  return current === null || RANK_ORDER.indexOf(candidate) > RANK_ORDER.indexOf(current);
}

function sanitizeRecord(value: unknown): ShipRecord {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof ShipRecord, unknown>>;
  const bestRank = RANK_ORDER.includes(raw.bestRank as RankedGrade) ? (raw.bestRank as RankedGrade) : null;
  const boss = typeof raw.fastestBossSec === 'number' && Number.isFinite(raw.fastestBossSec) && raw.fastestBossSec > 0 ? raw.fastestBossSec : null;
  const score = typeof raw.bestScore === 'number' && Number.isFinite(raw.bestScore) ? Math.max(0, Math.round(raw.bestScore)) : 0;
  const wins = typeof raw.wins === 'number' && Number.isFinite(raw.wins) ? Math.max(0, Math.floor(raw.wins)) : 0;
  return { bestRank, fastestBossSec: boss, bestScore: score, wins };
}

export function decodeRecords(raw: string | null | undefined): ShipRecords {
  const records = createEmptyRecords();
  if (!raw) return records;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; ships?: Record<string, unknown> };
    if (parsed?.version !== 1 || !parsed.ships || typeof parsed.ships !== 'object') return records;
    for (const ship of SHIP_CLASSES) records[ship] = sanitizeRecord(parsed.ships[ship]);
  } catch {
    return createEmptyRecords();
  }
  return records;
}

export function encodeRecords(records: ShipRecords): string {
  return JSON.stringify({ version: 1, ships: records });
}

/** Folds one finished mission into the records. Defeats only update the best score. */
export function updateRecords(
  records: ShipRecords,
  ship: ShipClass,
  outcome: { victory: boolean; rank: MissionRank; bossTimeSec: number | null; score: number },
): RecordUpdate {
  const current = records[ship];
  const next: ShipRecord = { ...current };
  let newBestRank = false;
  let newFastestBoss = false;
  const newBestScore = outcome.score > current.bestScore;
  if (newBestScore) next.bestScore = Math.round(outcome.score);
  if (outcome.victory) {
    next.wins += 1;
    if (outcome.rank !== '—' && isBetterRank(outcome.rank, current.bestRank)) {
      next.bestRank = outcome.rank;
      newBestRank = true;
    }
    if (outcome.bossTimeSec !== null && outcome.bossTimeSec > 0 && (current.fastestBossSec === null || outcome.bossTimeSec < current.fastestBossSec)) {
      next.fastestBossSec = Math.round(outcome.bossTimeSec * 100) / 100;
      newFastestBoss = true;
    }
  }
  return { records: { ...records, [ship]: next }, newBestRank, newFastestBoss, newBestScore };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function resolveStorage(storage?: StorageLike): StorageLike | undefined {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadRecords(storage?: StorageLike, key = RECORDS_STORAGE_KEY): ShipRecords {
  try {
    return decodeRecords(resolveStorage(storage)?.getItem(key));
  } catch {
    return createEmptyRecords();
  }
}

export function saveRecords(records: ShipRecords, storage?: StorageLike, key = RECORDS_STORAGE_KEY): boolean {
  try {
    const target = resolveStorage(storage);
    if (!target) return false;
    target.setItem(key, encodeRecords(records));
    return true;
  } catch {
    return false;
  }
}
