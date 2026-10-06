import { TORPEDO, isUpgradePickup, type PickupType, type ShipClass } from './rules.ts';

export interface DropContext {
  shipClass: ShipClass;
  /** True when the wreck was shot down by the player; collision and friendly-fire wrecks drop less. */
  byPlayer: boolean;
  /** Combat boosts the player can currently use (torpedoes only when the ship carries them and has room). */
  usableCombat: readonly PickupType[];
  /** Permanent upgrade pickups that are not yet maxed. */
  availableUpgrades: readonly PickupType[];
  needs: { hull: number; shield: number; energy: number };
  torpedoesEmpty: boolean;
}

export interface Drop {
  type: PickupType;
  amount: number;
  permanent: boolean;
}

/** How many times each class rolls the loot table and how likely each roll is to produce a pod. */
export const DROP_TABLE: Record<ShipClass, { rolls: number; chance: number }> = {
  fighter: { rolls: 1, chance: 0.55 },
  interceptor: { rolls: 1, chance: 0.5 },
  bomber: { rolls: 2, chance: 0.5 },
  shuttle: { rolls: 1, chance: 0.75 },
  freighter: { rolls: 2, chance: 0.8 },
  destroyer: { rolls: 3, chance: 0.85 },
};

export const COMBAT_BOOST_SHARE = 0.22;
export const PERMANENT_UPGRADE_SHARE = 0.16;
export const UNPLAYED_DROP_FACTOR = 0.5;

const SUPPLY_AMOUNT = { energy: 32, shield: 28, hull: 24 } as const;

/**
 * Rolls the salvage a destroyed spacecraft ejects. Each roll yields at most one pod, which is a permanent upgrade
 * (at most one per wreck), a temporary combat boost, or a recovery supply weighted toward what the pilot is missing.
 */
export function rollDrops(random: () => number, context: DropContext): Drop[] {
  const table = DROP_TABLE[context.shipClass];
  const chance = table.chance * (context.byPlayer ? 1 : UNPLAYED_DROP_FACTOR);
  const drops: Drop[] = [];
  let upgradeDropped = false;
  for (let roll = 0; roll < table.rolls; roll += 1) {
    if (random() > chance) continue;
    const category = random();
    if (category < PERMANENT_UPGRADE_SHARE && !upgradeDropped && context.availableUpgrades.length > 0) {
      const type = context.availableUpgrades[Math.floor(random() * context.availableUpgrades.length)] ?? context.availableUpgrades[0];
      if (isUpgradePickup(type)) {
        upgradeDropped = true;
        drops.push({ type, amount: 1, permanent: true });
        continue;
      }
    }
    if (category < PERMANENT_UPGRADE_SHARE + COMBAT_BOOST_SHARE && context.usableCombat.length > 0) {
      const pool = [...context.usableCombat];
      if (context.torpedoesEmpty && pool.includes('torpedo')) pool.push('torpedo', 'torpedo');
      const type = pool[Math.floor(random() * pool.length)] ?? pool[0];
      drops.push({ type, amount: type === 'torpedo' ? TORPEDO.pickupAmount : 1, permanent: false });
      continue;
    }
    const weighted: PickupType[] = ['energy', 'shield', 'hull'];
    if (context.needs.energy > 8) weighted.push('energy', 'energy');
    if (context.needs.shield > 12) weighted.push('shield', 'shield');
    if (context.needs.hull > 16) weighted.push('hull', 'hull');
    const type = weighted[Math.floor(random() * weighted.length)] ?? 'energy';
    drops.push({ type, amount: SUPPLY_AMOUNT[type as keyof typeof SUPPLY_AMOUNT], permanent: false });
  }
  return drops;
}
