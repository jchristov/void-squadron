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

export function createCapitalShipBoss(): CapitalShipBoss {
  const subsystems = createCapitalShipSubsystems();
  const turrets = createCapitalShipTurrets();
  return {
    id: 'leviathan',
    name: 'The Leviathan',
    hull: 2400,
    maxHull: 2400,
    shield: 1600,
    maxShield: 1600,
    subsystems,
    turrets,
    defeated: false,
    active: false,
  };
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
  turretBaseCooldown: 2.4,
  turretCooldownJitter: 1.5,
  exposedRageMultiplier: 0.8,
  criticalRageMultiplier: 0.62,
  turretDamage: 13,
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
