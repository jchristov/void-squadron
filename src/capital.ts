import * as THREE from 'three';
import { applyDamage } from './rules.ts';

export interface CapitalShipTurret {
  id: number;
  localOffset: THREE.Vector3;
  worldPosition: THREE.Vector3;
  fireCooldown: number;
  destroyed: boolean;
}

export interface CapitalShipSubsystem {
  id: string;
  name: string;
  type: 'bridge' | 'shield_generator' | 'hangar_bay';
  localCenter: THREE.Vector3;
  worldCenter: THREE.Vector3;
  radius: number;
  hull: number;
  maxHull: number;
  destroyed: boolean;
  mesh?: THREE.Object3D;
}

export interface CapitalShipBoss {
  id: string;
  name: string;
  object?: THREE.Group;
  hull: number;
  maxHull: number;
  shield: number;
  maxShield: number;
  subsystems: CapitalShipSubsystem[];
  turrets: CapitalShipTurret[];
  defeated: boolean;
  active: boolean;
}

export function createCapitalShipSubsystems(): CapitalShipSubsystem[] {
  return [
    {
      id: 'shield_gen_port',
      name: 'Port Shield Dome',
      type: 'shield_generator',
      localCenter: new THREE.Vector3(-6.2, 3.8, -4.2),
      worldCenter: new THREE.Vector3(),
      radius: 3.2,
      hull: 350,
      maxHull: 350,
      destroyed: false,
    },
    {
      id: 'shield_gen_starboard',
      name: 'Starboard Shield Dome',
      type: 'shield_generator',
      localCenter: new THREE.Vector3(6.2, 3.8, -4.2),
      worldCenter: new THREE.Vector3(),
      radius: 3.2,
      hull: 350,
      maxHull: 350,
      destroyed: false,
    },
    {
      id: 'hangar_bay',
      name: 'Ventral Flight Deck',
      type: 'hangar_bay',
      localCenter: new THREE.Vector3(0, -2.4, 4.5),
      worldCenter: new THREE.Vector3(),
      radius: 4.8,
      hull: 500,
      maxHull: 500,
      destroyed: false,
    },
    {
      id: 'bridge',
      name: 'Command Bridge Tower',
      type: 'bridge',
      localCenter: new THREE.Vector3(0, 4.2, -6.0),
      worldCenter: new THREE.Vector3(),
      radius: 3.8,
      hull: 600,
      maxHull: 600,
      destroyed: false,
    },
  ];
}

export function createCapitalShipTurrets(): CapitalShipTurret[] {
  const turrets: CapitalShipTurret[] = [];
  let id = 0;
  const positions: [number, number, number][] = [
    [-3.8, 1.8, -8.0],
    [3.8, 1.8, -8.0],
    [-4.5, 1.6, -2.0],
    [4.5, 1.6, -2.0],
    [-5.2, 1.4, 4.0],
    [5.2, 1.4, 4.0],
    [-3.2, -1.2, 0.0],
    [3.2, -1.2, 0.0],
  ];
  for (const pos of positions) {
    turrets.push({
      id: ++id,
      localOffset: new THREE.Vector3(...pos),
      worldPosition: new THREE.Vector3(),
      fireCooldown: 1.0 + id * 0.35,
      destroyed: false,
    });
  }
  return turrets;
}

export interface BossEncounterScaling {
  count: number;
  durability: number;
  damage: number;
}

/** Scales boss durability and fire tempo with the player's upgrade-driven encounter scaling. */
export function createCapitalShipBoss(scaling: Partial<BossEncounterScaling> = {}): CapitalShipBoss {
  const durability = Math.max(1, scaling.durability ?? 1);
  const subsystems = createCapitalShipSubsystems().map((sub) => {
    const hull = Math.round(sub.maxHull * durability);
    return { ...sub, hull, maxHull: hull };
  });
  const turrets = createCapitalShipTurrets();
  const hull = Math.round(2400 * durability);
  const shield = Math.round(1600 * durability);
  return {
    id: 'leviathan',
    name: 'The Leviathan',
    hull,
    maxHull: hull,
    shield,
    maxShield: shield,
    subsystems,
    turrets,
    defeated: false,
    active: false,
  };
}

/** Extra upgrade-driven combat ships translate into a faster battery cycle (at most ~15%). */
export function getBossFireTempo(count: number): number {
  return 1 / (1 + Math.max(0, Math.min(0.3, count - 1)) * 0.5);
}

export function areShieldGeneratorsDestroyed(boss: CapitalShipBoss): boolean {
  const generators = boss.subsystems.filter((s) => s.type === 'shield_generator');
  return generators.length > 0 && generators.every((s) => s.destroyed);
}

export function canDamageBridge(boss: CapitalShipBoss): boolean {
  return areShieldGeneratorsDestroyed(boss) && boss.shield <= 0;
}

export function damageBossSubsystem(
  boss: CapitalShipBoss,
  subsystemId: string,
  rawDamage: number,
): { destroyed: boolean; damageDealt: number } {
  const sub = boss.subsystems.find((s) => s.id === subsystemId);
  if (!sub || sub.destroyed) {
    return { destroyed: false, damageDealt: 0 };
  }

  if (sub.type === 'bridge' && !canDamageBridge(boss)) {
    const shieldResult = applyDamage({ shield: boss.shield, hull: boss.hull }, rawDamage, 0.5);
    boss.shield = shieldResult.shield;
    return { destroyed: false, damageDealt: rawDamage };
  }

  const result = applyDamage({ shield: 0, hull: sub.hull }, rawDamage, 0.35);
  sub.hull = result.hull;
  if (result.destroyed) {
    sub.destroyed = true;
    sub.hull = 0;
    if (sub.type === 'shield_generator') {
      boss.shield = Math.max(0, boss.shield - boss.maxShield * 0.5);
      if (areShieldGeneratorsDestroyed(boss)) {
        boss.shield = 0;
      }
    }
    boss.hull = Math.max(0, boss.hull - sub.maxHull * 0.6);
    if (boss.hull <= 0 || (sub.type === 'bridge' && sub.destroyed)) {
      boss.defeated = true;
      boss.hull = 0;
    }
  }

  return { destroyed: sub.destroyed, damageDealt: rawDamage };
}

export function damageBossHullDirect(
  boss: CapitalShipBoss,
  rawDamage: number,
): { defeated: boolean } {
  const result = applyDamage({ shield: boss.shield, hull: boss.hull }, rawDamage, 0.45);
  boss.shield = result.shield;
  boss.hull = result.hull;
  if (result.destroyed) {
    boss.defeated = true;
    boss.hull = 0;
  }
  return { defeated: boss.defeated };
}

export type BossPhase = 'shielded' | 'exposed' | 'critical' | 'defeated';

export const BOSS_TUNING = {
  hullHitMultiplier: 0.3,
  turretBaseCooldown: 3.9,
  turretCooldownJitter: 2.4,
  exposedRageMultiplier: 0.8,
  criticalRageMultiplier: 0.62,
  turretDamage: 11.5,
  turretLeadFactor: 0.75,
  hangarDarkensVentralTurrets: true,
} as const;

export function getBossPhase(boss: Pick<CapitalShipBoss, 'hull' | 'maxHull' | 'shield' | 'defeated'>): BossPhase {
  if (boss.defeated) return 'defeated';
  if (boss.hull / boss.maxHull <= 0.35) return 'critical';
  if (boss.shield <= 0) return 'exposed';
  return 'shielded';
}

/** Seconds until a turret may fire again; later phases fire faster. `jitter01` is a 0..1 random sample. */
export function getBossTurretCooldown(phase: BossPhase, difficultyCooldownMultiplier: number, jitter01: number): number {
  const rage = phase === 'critical' ? BOSS_TUNING.criticalRageMultiplier : phase === 'exposed' ? BOSS_TUNING.exposedRageMultiplier : 1;
  const base = BOSS_TUNING.turretBaseCooldown + BOSS_TUNING.turretCooldownJitter * Math.min(1, Math.max(0, jitter01));
  return base * rage * Math.max(0.5, difficultyCooldownMultiplier);
}

export function isTurretOnline(boss: CapitalShipBoss, turret: CapitalShipTurret): boolean {
  if (turret.destroyed) return false;
  const hangar = boss.subsystems.find((sub) => sub.type === 'hangar_bay');
  return !(BOSS_TUNING.hangarDarkensVentralTurrets && hangar?.destroyed && turret.localOffset.y < 0);
}

export interface BossDifficultyScale {
  damage: number;
  cooldown: number;
  lead: number;
  spread: number;
}

/** Boss-specific pressure per difficulty; tuned with headless autopilot runs (see docs). */
export const BOSS_DIFFICULTY: Record<'relaxed' | 'standard' | 'veteran', BossDifficultyScale> = {
  relaxed: { damage: 0.72, cooldown: 1.25, lead: 0.62, spread: 1.3 },
  standard: { damage: 1, cooldown: 1, lead: BOSS_TUNING.turretLeadFactor, spread: 1 },
  veteran: { damage: 1.15, cooldown: 0.92, lead: 0.82, spread: 0.9 },
};

/** Seconds between escort arrivals during the boss wave, and the quiet opening before the first. */
/** Escort weapon damage multiplier while the boss is alive: the carrier is the threat, not the escorts. */
export const BOSS_ESCORT_DAMAGE = 0.8;
export const BOSS_ESCORT_GAP = 3.4;
export const BOSS_ESCORT_LEAD_IN = 5;

export const BOSS_ESCORT_LIMIT: Record<'relaxed' | 'standard' | 'veteran', number> = { relaxed: 3, standard: 5, veteran: 7 };

/** Keeps the boss the main event: caps combat escorts (heavies dropped first) while leaving civilian targets alone. */
export function trimBossEscorts<T>(roster: readonly T[], isCombat: (ship: T) => boolean, weight: (ship: T) => number, limit: number): T[] {
  const combat = roster.filter(isCombat);
  const keep = new Set(
    combat
      .map((ship, index) => ({ ship, index, weight: weight(ship) }))
      .sort((a, b) => a.weight - b.weight || a.index - b.index)
      .slice(0, Math.max(0, limit))
      .map((entry) => entry.index),
  );
  let combatIndex = -1;
  return roster.filter((ship) => {
    if (!isCombat(ship)) return true;
    combatIndex += 1;
    return keep.has(combatIndex);
  });
}

export const BOSS_MAX_CONCURRENT_ESCORTS: Record<'relaxed' | 'standard' | 'veteran', number> = { relaxed: 1, standard: 2, veteran: 3 };

/** Escorts trickle in as earlier ones die, so the boss fight never turns into a swarm. */
export function canSpawnBossEscort(aliveCombatEscorts: number, difficulty: 'relaxed' | 'standard' | 'veteran'): boolean {
  return aliveCombatEscorts < BOSS_MAX_CONCURRENT_ESCORTS[difficulty];
}
