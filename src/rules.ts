export const SHIP_CLASSES = [
  'fighter',
  'interceptor',
  'bomber',
  'shuttle',
  'freighter',
  'destroyer',
] as const;

export const DIFFICULTIES = ['relaxed', 'standard', 'veteran'] as const;
export const PICKUP_TYPES = ['energy', 'shield', 'hull', 'hull-upgrade', 'defense-upgrade', 'attack-upgrade', 'torpedo', 'overcharge', 'aegis'] as const;

export type ShipClass = (typeof SHIP_CLASSES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type PickupType = (typeof PICKUP_TYPES)[number];

/** Single source of truth for supply colors: 3D pickups, radar markers and legends all read these. */
export const PICKUP_COLORS: Record<PickupType, number> = {
  energy: 0xffe14d,
  shield: 0x4db8ff,
  hull: 0x62f08a,
  'hull-upgrade': 0xff9f43,
  'defense-upgrade': 0xa78bff,
  'attack-upgrade': 0xff5f8f,
  torpedo: 0xff3b3b,
  overcharge: 0xff2bd6,
  aegis: 0xeaf6ff,
};

export const PICKUP_LABELS: Record<PickupType, string> = {
  energy: 'ENERGY',
  shield: 'SHIELD',
  hull: 'HULL',
  'hull-upgrade': 'HULL UPGRADE',
  'defense-upgrade': 'DEFENSE UPGRADE',
  'attack-upgrade': 'ATTACK UPGRADE',
  torpedo: 'PROTON TORPEDOES',
  overcharge: 'WEAPON OVERCHARGE',
  aegis: 'AEGIS OVERSHIELD',
};

export const COMBAT_PICKUPS = ['torpedo', 'overcharge', 'aegis'] as const;
export function isCombatPickup(type: PickupType): boolean {
  return (COMBAT_PICKUPS as readonly string[]).includes(type);
}

export function isUpgradePickup(type: PickupType): boolean {
  return type.endsWith('-upgrade');
}

export function pickupCssColor(type: PickupType): string {
  return `#${PICKUP_COLORS[type].toString(16).padStart(6, '0')}`;
}

export interface ShipDefinition {
  name: string;
  role: string;
  hull: number;
  shield: number;
  speed: number;
  armor: number;
  mass: number;
  damage: number;
  fireInterval: number;
  /** Proton torpedo magazine size; 0 means the craft carries none. */
  torpedoes: number;
  description: string;
}

export interface DamageResult {
  shield: number;
  hull: number;
  shieldLoss: number;
  hullLoss: number;
  effectiveDamage: number;
  destroyed: boolean;
}

export interface CollisionBody {
  hull: number;
  shield: number;
  armor: number;
  mass: number;
  speed: number;
}

export interface CollisionOutcome {
  impactDamage: number;
  separationSpeed: number;
  a: DamageResult;
  b: DamageResult;
}

export interface WaveConfig {
  wave: number;
  enemies: number;
  combatEnemies: number;
  bonusTargets: number;
  asteroids: number;
  environmentSpeed: number;
  asteroidSpeed: number;
  eliteCount: number;
  classes: ShipClass[];
  bonusClasses: ShipClass[];
  message: string;
}

export interface EnemyAttackTuning {
  damageMultiplier: number;
  accuracy: number;
  cooldownMultiplier: number;
}

export interface DifficultyTuning {
  enemyDamageMultiplier: number;
  enemyAccuracyMultiplier: number;
  enemyCooldownMultiplier: number;
  enemySpeedMultiplier: number;
  enemyAgilityMultiplier: number;
  pursuitRangeMultiplier: number;
  recoveryThreatDistance: number;
  recoveryPocketDistance: number;
  recoveryPocketCooldown: number;
  recoveryPickupMultiplier: number;
}

export interface PickupRestoreResult {
  next: number;
  restored: number;
  full: boolean;
}

export const SHIPS: Record<ShipClass, ShipDefinition> = {
  fighter: {
    name: 'Vanguard Fighter',
    role: 'Attack-pass combat wing',
    hull: 130,
    shield: 95,
    speed: 34,
    armor: 0.16,
    mass: 34,
    damage: 19,
    fireInterval: 0.19,
    torpedoes: 4,
    description: 'Front-line wedge fighter built for readable attack runs, breakaway passes, and steady multirole pressure.',
  },
  interceptor: {
    name: 'Needle Interceptor',
    role: 'Aggressive pursuit hunter',
    hull: 92,
    shield: 72,
    speed: 42,
    armor: 0.1,
    mass: 24,
    damage: 16,
    fireInterval: 0.14,
    torpedoes: 0,
    description: 'Featherweight sprint craft that commits hard to pursuit, pivots quickly, and pressures exposed targets.',
  },
  bomber: {
    name: 'Hammer Bomber',
    role: 'Slow ranged siege striker',
    hull: 172,
    shield: 108,
    speed: 27,
    armor: 0.24,
    mass: 52,
    damage: 30,
    fireInterval: 0.32,
    torpedoes: 8,
    description: 'Armored strike platform that prefers standoff volleys, deliberate turns, and punishing heavy shots.',
  },
  shuttle: {
    name: 'Aegis Shuttle',
    role: 'Civilian support runner',
    hull: 148,
    shield: 132,
    speed: 29,
    armor: 0.2,
    mass: 46,
    damage: 22,
    fireInterval: 0.24,
    torpedoes: 0,
    description: 'Unarmed support transport that will break away from combat, flee the player, and sometimes carry supplies.',
  },
  freighter: {
    name: 'Bastion Freighter',
    role: 'Civilian cargo escapee',
    hull: 360,
    shield: 150,
    speed: 16,
    armor: 0.48,
    mass: 150,
    damage: 13,
    fireInterval: 0.42,
    torpedoes: 0,
    description: 'Slow, heavily plated hauler: the toughest hull and armor in the fleet but only light defensive guns and the lowest speed. As an enemy it flees and never fires.',
  },
  destroyer: {
    name: 'Citadel Destroyer',
    role: 'Defensive line guardian',
    hull: 340,
    shield: 190,
    speed: 19,
    armor: 0.4,
    mass: 120,
    damage: 38,
    fireInterval: 0.36,
    torpedoes: 6,
    description: 'Compact line destroyer that defends its patrol zone with slow turns, long reach, and layered armor.',
  },
};

export const MAX_WAVE = 5;
export const MAX_ENERGY = 100;
export const COMBO_WINDOW = 4;
export const PLAYER_SHIELD_REGEN_DELAY = 3.5;
export const PLAYER_SHIELD_REGEN_RATE = 18;
export const PLAYER_ENERGY_REGEN_RATE = 30;
export const BOOST_DRAIN_PER_SECOND = 26;
export const BOOST_MULTIPLIER = 1.42;
export const BRAKE_SPEED_FACTOR = 0.25;
export const PICKUP_WORLD_CAP = 14;
export const PICKUP_LIFETIME_SECONDS = 28;

const COMBAT_SHIPS = new Set<ShipClass>(['fighter', 'interceptor', 'bomber', 'destroyer']);

const WAVE_PRESETS: Record<number, Omit<WaveConfig, 'wave' | 'enemies' | 'combatEnemies' | 'bonusTargets' | 'classes' | 'bonusClasses'> & {
  roster: readonly ShipClass[];
}> = {
  1: {
    roster: ['fighter', 'fighter', 'interceptor', 'fighter'],
    asteroids: 3,
    environmentSpeed: 22,
    asteroidSpeed: 14,
    eliteCount: 0,
    message: 'Light contacts only. Ease into the corridor and learn their approach vectors.',
  },
  2: {
    roster: ['fighter', 'interceptor', 'fighter', 'bomber', 'shuttle', 'shuttle'],
    asteroids: 4,
    environmentSpeed: 24,
    asteroidSpeed: 15,
    eliteCount: 0,
    message: 'Escort craft are screening civilian runners. Break the fighters first.',
  },
  3: {
    roster: ['interceptor', 'fighter', 'bomber', 'interceptor', 'fighter', 'bomber', 'shuttle', 'freighter', 'shuttle'],
    asteroids: 5,
    environmentSpeed: 26,
    asteroidSpeed: 17,
    eliteCount: 1,
    message: 'Bombers are staging deeper volleys while support ships try to slip past the lane.',
  },
  4: {
    roster: ['fighter', 'interceptor', 'bomber', 'fighter', 'bomber', 'interceptor', 'destroyer', 'shuttle', 'freighter', 'shuttle'],
    asteroids: 6,
    environmentSpeed: 28,
    asteroidSpeed: 19,
    eliteCount: 2,
    message: 'Line defenders are anchoring the pocket. Pull them apart and use the gaps to recover.',
  },
  5: {
    roster: ['interceptor', 'fighter', 'bomber', 'destroyer', 'interceptor', 'fighter', 'bomber', 'destroyer', 'fighter', 'bomber', 'shuttle', 'freighter', 'shuttle', 'freighter'],
    asteroids: 7,
    environmentSpeed: 30,
    asteroidSpeed: 21,
    eliteCount: 3,
    message: 'Final command elements are holding the lane while bonus traffic attempts to break away.',
  },
};

const ATTACK_TUNING: Record<ShipClass, EnemyAttackTuning> = {
  fighter: { damageMultiplier: 0.94, accuracy: 0.82, cooldownMultiplier: 1.04 },
  interceptor: { damageMultiplier: 0.82, accuracy: 0.68, cooldownMultiplier: 0.92 },
  bomber: { damageMultiplier: 1.08, accuracy: 0.76, cooldownMultiplier: 1.22 },
  shuttle: { damageMultiplier: 0, accuracy: 0, cooldownMultiplier: Number.POSITIVE_INFINITY },
  freighter: { damageMultiplier: 0, accuracy: 0, cooldownMultiplier: Number.POSITIVE_INFINITY },
  destroyer: { damageMultiplier: 1.18, accuracy: 0.88, cooldownMultiplier: 1.34 },
};

const DIFFICULTY_TUNING: Record<Difficulty, DifficultyTuning> = Object.freeze({
  relaxed: {
    enemyDamageMultiplier: 0.78,
    enemyAccuracyMultiplier: 0.92,
    enemyCooldownMultiplier: 1.18,
    enemySpeedMultiplier: 0.88,
    enemyAgilityMultiplier: 0.9,
    pursuitRangeMultiplier: 0.9,
    recoveryThreatDistance: 160,
    recoveryPocketDistance: 28,
    recoveryPocketCooldown: 4.8,
    recoveryPickupMultiplier: 1.18,
  },
  standard: {
    enemyDamageMultiplier: 1,
    enemyAccuracyMultiplier: 1,
    enemyCooldownMultiplier: 1,
    enemySpeedMultiplier: 1,
    enemyAgilityMultiplier: 1,
    pursuitRangeMultiplier: 1,
    recoveryThreatDistance: 210,
    recoveryPocketDistance: 34,
    recoveryPocketCooldown: 6.5,
    recoveryPickupMultiplier: 1,
  },
  veteran: {
    enemyDamageMultiplier: 1.24,
    enemyAccuracyMultiplier: 1.08,
    enemyCooldownMultiplier: 0.86,
    enemySpeedMultiplier: 1.12,
    enemyAgilityMultiplier: 1.14,
    pursuitRangeMultiplier: 1.12,
    recoveryThreatDistance: 250,
    recoveryPocketDistance: 38,
    recoveryPocketCooldown: 8.2,
    recoveryPickupMultiplier: 0.88,
  },
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniqueShips(roster: readonly ShipClass[], predicate: (shipClass: ShipClass) => boolean): ShipClass[] {
  return [...new Set(roster.filter(predicate))];
}

export function isCombatShip(shipClass: ShipClass): boolean {
  return COMBAT_SHIPS.has(shipClass);
}

export function countCombatShips(shipClasses: readonly ShipClass[]): number {
  return shipClasses.reduce((total, shipClass) => total + (isCombatShip(shipClass) ? 1 : 0), 0);
}

export function getWaveEnemyRoster(wave: number): ShipClass[] {
  const normalizedWave = clamp(Math.round(wave), 1, MAX_WAVE);
  return [...WAVE_PRESETS[normalizedWave].roster];
}

export function getWaveConfig(wave: number): WaveConfig {
  const normalizedWave = clamp(Math.round(wave), 1, MAX_WAVE);
  const preset = WAVE_PRESETS[normalizedWave];
  const roster = getWaveEnemyRoster(normalizedWave);
  const combatEnemies = countCombatShips(roster);
  return {
    wave: normalizedWave,
    enemies: roster.length,
    combatEnemies,
    bonusTargets: roster.length - combatEnemies,
    asteroids: preset.asteroids,
    environmentSpeed: preset.environmentSpeed,
    asteroidSpeed: preset.asteroidSpeed,
    eliteCount: preset.eliteCount,
    classes: uniqueShips(roster, isCombatShip),
    bonusClasses: uniqueShips(roster, (shipClass) => !isCombatShip(shipClass)),
    message: preset.message,
  };
}

export function getEnemyShipClass(wave: number, index: number): ShipClass {
  const roster = getWaveEnemyRoster(wave);
  const safeIndex = clamp(Math.floor(index), 0, Math.max(0, roster.length - 1));
  return roster[safeIndex] ?? roster[roster.length - 1] ?? 'fighter';
}

export function getWaveCombatCount(wave: number): number {
  return countCombatShips(getWaveEnemyRoster(wave));
}

export function getDifficultyTuning(difficulty: Difficulty = 'standard'): Readonly<DifficultyTuning> {
  return DIFFICULTY_TUNING[difficulty];
}

export function getEnemyAttackTuning(shipClass: ShipClass, wave: number, difficulty: Difficulty = 'standard'): EnemyAttackTuning {
  const base = ATTACK_TUNING[shipClass];
  if (!isCombatShip(shipClass)) {
    return { ...base };
  }
  const tuning = getDifficultyTuning(difficulty);
  const progression = (clamp(wave, 1, MAX_WAVE) - 1) / Math.max(1, MAX_WAVE - 1);
  const earlyRelief = 1 - progression;
  return {
    damageMultiplier: Math.round((base.damageMultiplier * (0.5 + progression * 0.5) * tuning.enemyDamageMultiplier) * 1000) / 1000,
    accuracy: Math.round(clamp((base.accuracy * (0.58 + progression * 0.42) - earlyRelief * 0.08) * tuning.enemyAccuracyMultiplier, 0.34, 0.98) * 1000) / 1000,
    cooldownMultiplier: Math.round(((base.cooldownMultiplier + earlyRelief * 0.7) * tuning.enemyCooldownMultiplier) * 1000) / 1000,
  };
}

export function getKillScore(shipClass: ShipClass, wave: number, combo: number): number {
  const ship = SHIPS[shipClass];
  const optionalTargetMultiplier = isCombatShip(shipClass) ? 1 : 0.72;
  const base = (ship.mass * 2 + ship.damage * 6 + ship.shield * 0.6 + ship.hull * 0.4) * optionalTargetMultiplier;
  const waveMultiplier = 1 + (clamp(wave, 1, MAX_WAVE) - 1) * 0.18;
  const comboMultiplier = 1 + Math.max(0, combo - 1) * 0.14;
  return Math.round(base * waveMultiplier * comboMultiplier);
}

export function getAsteroidScore(radius: number, combo: number): number {
  const sizeScore = 45 + radius * 40;
  const comboMultiplier = 1 + Math.max(0, combo - 1) * 0.08;
  return Math.round(sizeScore * comboMultiplier);
}

export function applyDamage(
  state: Pick<CollisionBody, 'shield' | 'hull'>,
  rawDamage: number,
  armor: number,
): DamageResult {
  const sanitizedDamage = Math.max(0, rawDamage);
  const shieldBefore = Math.max(0, state.shield);
  const hullBefore = Math.max(0, state.hull);
  const shieldLoss = Math.min(shieldBefore, sanitizedDamage);
  const remainder = sanitizedDamage - shieldLoss;
  const armorFactor = clamp(1 - armor, 0.18, 1);
  const hullDamage = Math.min(hullBefore, remainder * armorFactor);
  return {
    shield: Math.max(0, shieldBefore - shieldLoss),
    hull: Math.max(0, hullBefore - hullDamage),
    shieldLoss,
    hullLoss: hullDamage,
    effectiveDamage: shieldLoss + hullDamage,
    destroyed: hullBefore - hullDamage <= 0,
  };
}

export function resolvePlayerDamageState(
  current: Pick<CollisionBody, 'shield' | 'hull'>,
  next: Pick<DamageResult, 'shield' | 'hull'>,
  enabled: boolean,
): Pick<CollisionBody, 'shield' | 'hull'> {
  return enabled
    ? { shield: Math.max(0, next.shield), hull: Math.max(0, next.hull) }
    : { shield: Math.max(0, current.shield), hull: Math.max(0, current.hull) };
}

export function resolveCollision(a: CollisionBody, b: CollisionBody, relativeSpeedOverride?: number): CollisionOutcome {
  const relativeSpeed = Math.max(4, Number.isFinite(relativeSpeedOverride) ? Math.abs(relativeSpeedOverride ?? 0) : Math.abs(a.speed - b.speed));
  const totalMass = Math.max(1, a.mass + b.mass);
  const reducedMass = (a.mass * b.mass) / totalMass;
  const impactDamage = Math.max(6, reducedMass * relativeSpeed * relativeSpeed * 0.0012);
  const aShare = 0.45 + b.mass / totalMass;
  const bShare = 0.45 + a.mass / totalMass;
  return {
    impactDamage,
    separationSpeed: relativeSpeed * 0.34 + impactDamage / Math.max(a.mass, b.mass, 1),
    a: applyDamage(a, impactDamage * aShare, a.armor),
    b: applyDamage(b, impactDamage * bShare, b.armor),
  };
}

export function regenerateShield(
  shield: number,
  maxShield: number,
  secondsSinceDamage: number,
  dt: number,
  rate = PLAYER_SHIELD_REGEN_RATE,
  delay = PLAYER_SHIELD_REGEN_DELAY,
): number {
  if (secondsSinceDamage < delay || shield >= maxShield || maxShield <= 0) {
    return clamp(shield, 0, maxShield);
  }
  return clamp(shield + rate * dt, 0, maxShield);
}

export function regenerateEnergy(energy: number, dt: number, rate = PLAYER_ENERGY_REGEN_RATE): number {
  return clamp(energy + rate * dt, 0, MAX_ENERGY);
}

export function applyPickupRestore(current: number, max: number, amount: number): PickupRestoreResult {
  const next = clamp(current + Math.max(0, amount), 0, Math.max(0, max));
  return {
    next,
    restored: Math.max(0, next - clamp(current, 0, max)),
    full: next >= Math.max(0, max),
  };
}

export function getPickupSpawnAllowance(currentCount: number, requestedCount: number, maxCount = PICKUP_WORLD_CAP): number {
  return clamp(Math.min(requestedCount, maxCount - currentCount), 0, Math.max(0, requestedCount));
}

export function getComboAfterKill(currentCombo: number, secondsSinceLastKill: number): number {
  return secondsSinceLastKill <= COMBO_WINDOW ? currentCombo + 1 : 1;
}

export function getForwardSpeed(baseSpeed: number, boosting: boolean, energy: number): number {
  const speed = boosting && energy > 1 ? baseSpeed * BOOST_MULTIPLIER : baseSpeed;
  return Math.round(speed * 10) / 10;
}

export function isVictoryWave(wave: number): boolean {
  return wave >= MAX_WAVE;
}

/**
 * Hull collision radius per class in world units. Sizes grow strictly in hangar order (fighter -> destroyer)
 * and are used to derive each model's scale so models, hitboxes and the preview all agree.
 */
export const SHIP_TARGET_RADIUS: Record<ShipClass, number> = {
  fighter: 3.4,
  interceptor: 4.4,
  bomber: 5.8,
  shuttle: 7.4,
  freighter: 9.3,
  destroyer: 12.0,
};

/** Model scale that makes each procedural model hit SHIP_TARGET_RADIUS (measured at scale 1). */
export const SHIP_MODEL_SCALE: Record<ShipClass, number> = {
  fighter: 0.8310,
  interceptor: 0.8360,
  bomber: 1.2690,
  shuttle: 1.8450,
  freighter: 1.9300,
  destroyer: 1.7320,
};

export const TORPEDO = {
  damage: 150,
  splashRadius: 24,
  splashFalloff: 0.55,
  bossSubsystemMultiplier: 1.6,
  speed: 150,
  launchSpeed: 55,
  turnRate: 2.6,
  life: 5.5,
  cooldown: 0.9,
  pickupAmount: 2,
} as const;

export const OVERCHARGE = { duration: 12, damageMultiplier: 1.7, fireRateMultiplier: 1.45, energyCostMultiplier: 0 } as const;
export const AEGIS = { points: 90, decayPerSecond: 3 } as const;

/** Combat powerups only drop when the current ship can use them (torpedoes need a magazine). */
export function canUseCombatPickup(type: PickupType, ship: ShipDefinition): boolean {
  return type === 'torpedo' ? ship.torpedoes > 0 : isCombatPickup(type);
}

/**
 * An overshield sits on top of shield and hull: it soaks the damage a hit would have dealt, shields first,
 * and returns the adjusted result plus the points it has left.
 */
export function absorbWithOvershield(result: DamageResult, overshield: number): { result: DamageResult; remaining: number; absorbed: number } {
  const total = result.shieldLoss + result.hullLoss;
  if (overshield <= 0 || total <= 0) return { result, remaining: Math.max(0, overshield), absorbed: 0 };
  const absorbed = Math.min(overshield, total);
  const shieldBack = Math.min(result.shieldLoss, absorbed);
  const hullBack = Math.min(result.hullLoss, absorbed - shieldBack);
  const hull = result.hull + hullBack;
  return {
    absorbed,
    remaining: overshield - absorbed,
    result: {
      ...result,
      shield: result.shield + shieldBack,
      hull,
      shieldLoss: result.shieldLoss - shieldBack,
      hullLoss: result.hullLoss - hullBack,
      effectiveDamage: Math.max(0, result.effectiveDamage - absorbed),
      destroyed: hull <= 0,
    },
  };
}

const MAX_CONCURRENT_COMBAT: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 5 };
const CONCURRENT_BY_DIFFICULTY: Record<Difficulty, number> = { relaxed: -1, standard: 0, veteran: 1 };

/** Hostile combat ships that may be alive at once; the rest of the wave queues behind them. */
export function getMaxConcurrentCombat(wave: number, difficulty: Difficulty = 'standard'): number {
  const base = MAX_CONCURRENT_COMBAT[clamp(Math.round(wave), 1, MAX_WAVE)] ?? 6;
  return Math.max(1, base + CONCURRENT_BY_DIFFICULTY[difficulty]);
}
