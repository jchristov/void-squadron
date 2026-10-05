import { SHIP_CLASSES, type ShipClass, type ShipDefinition } from './rules.ts';

export interface UpgradeLevels {
  hull: number;
  defense: number;
  attack: number;
}

interface UpgradeStorageSchema {
  version: 1;
  ships: Partial<Record<ShipClass, Partial<UpgradeLevels>>>;
}

export const UPGRADE_MAX_LEVEL = 10;
export const UPGRADE_STORAGE_KEY = 'void-squadron.upgrades.v1';

export function getUpgradeEncounterScaling(levels: UpgradeLevels): { count: number; durability: number; damage: number } {
  const safe = sanitizeUpgradeLevels(levels);
  const power = (safe.hull + safe.defense + safe.attack) / (3 * UPGRADE_MAX_LEVEL);
  return { count: 1 + power * 0.3, durability: 1 + power * 0.2, damage: 1 + power * 0.1 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveStorage(storage?: Pick<Storage, 'getItem' | 'setItem'>): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  if (storage) {
    return storage;
  }
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function createDefaultUpgradeLevels(): UpgradeLevels {
  return { hull: 0, defense: 0, attack: 0 };
}

export function createDefaultShipUpgradeRegistry(): Record<ShipClass, UpgradeLevels> {
  return Object.fromEntries(SHIP_CLASSES.map((shipClass) => [shipClass, createDefaultUpgradeLevels()])) as Record<ShipClass, UpgradeLevels>;
}

export function sanitizeUpgradeLevels(value: unknown): UpgradeLevels {
  const source = value && typeof value === 'object' ? value as Partial<Record<keyof UpgradeLevels, unknown>> : {};
  const sanitizeLevel = (input: unknown): number => {
    if (typeof input !== 'number' || !Number.isFinite(input)) {
      return 0;
    }
    return clamp(Math.trunc(input), 0, UPGRADE_MAX_LEVEL);
  };
  return {
    hull: sanitizeLevel(source.hull),
    defense: sanitizeLevel(source.defense),
    attack: sanitizeLevel(source.attack),
  };
}

export function decodeStoredShipUpgrades(raw: string | null | undefined): Record<ShipClass, UpgradeLevels> {
  const defaults = createDefaultShipUpgradeRegistry();
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UpgradeStorageSchema> | null;
    if (!parsed || parsed.version !== 1 || !parsed.ships || typeof parsed.ships !== 'object') {
      return defaults;
    }
    for (const shipClass of SHIP_CLASSES) {
      defaults[shipClass] = sanitizeUpgradeLevels(parsed.ships[shipClass]);
    }
    return defaults;
  } catch {
    return defaults;
  }
}

export function encodeStoredShipUpgrades(upgrades: Partial<Record<ShipClass, UpgradeLevels>>): string {
  const ships = createDefaultShipUpgradeRegistry();
  for (const shipClass of SHIP_CLASSES) {
    ships[shipClass] = sanitizeUpgradeLevels(upgrades[shipClass]);
  }
  return JSON.stringify({ version: 1, ships } satisfies UpgradeStorageSchema);
}

export function loadStoredShipUpgrades(
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
  key = UPGRADE_STORAGE_KEY,
): Record<ShipClass, UpgradeLevels> {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return createDefaultShipUpgradeRegistry();
  }
  try {
    return decodeStoredShipUpgrades(resolvedStorage.getItem(key));
  } catch {
    return createDefaultShipUpgradeRegistry();
  }
}

export function saveStoredShipUpgrades(
  upgrades: Partial<Record<ShipClass, UpgradeLevels>>,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
  key = UPGRADE_STORAGE_KEY,
): boolean {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return false;
  }
  try {
    resolvedStorage.setItem(key, encodeStoredShipUpgrades(upgrades));
    return true;
  } catch {
    return false;
  }
}

export function getUpgradedShipStats(base: ShipDefinition, levels: UpgradeLevels): ShipDefinition {
  const sanitized = sanitizeUpgradeLevels(levels);
  const multiplier = (level: number): number => 1 + level * 0.1;
  const roundStat = (value: number): number => Math.round(value * 100) / 100;
  return {
    ...base,
    hull: roundStat(base.hull * multiplier(sanitized.hull)),
    shield: roundStat(base.shield * multiplier(sanitized.defense)),
    damage: roundStat(base.damage * multiplier(sanitized.attack)),
  };
}
