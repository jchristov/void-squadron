export const SHIP_CLASSES = [
  'fighter',
  'interceptor',
  'bomber',
  'shuttle',
  'freighter',
  'destroyer',
] as const;

export type ShipClass = (typeof SHIP_CLASSES)[number];

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
  asteroids: number;
  environmentSpeed: number;
  asteroidSpeed: number;
  eliteCount: number;
  classes: ShipClass[];
  message: string;
}

export const SHIPS: Record<ShipClass, ShipDefinition> = {
  fighter: {
    name: 'Vanguard Fighter',
    role: 'Balanced multirole spearhead',
    hull: 130,
    shield: 95,
    speed: 34,
    armor: 0.16,
    mass: 34,
    damage: 19,
    fireInterval: 0.19,
    description: 'Front-line wedge fighter with steady shields, accurate cannons, and dependable handling.',
  },
  interceptor: {
    name: 'Needle Interceptor',
    role: 'High-speed pursuit and evasion',
    hull: 92,
    shield: 72,
    speed: 42,
    armor: 0.1,
    mass: 24,
    damage: 16,
    fireInterval: 0.14,
    description: 'Featherweight knife-edge craft built to sprint, flank, and chain fast firing passes.',
  },
  bomber: {
    name: 'Hammer Bomber',
    role: 'Heavy strike breaker',
    hull: 172,
    shield: 108,
    speed: 27,
    armor: 0.24,
    mass: 52,
    damage: 30,
    fireInterval: 0.32,
    description: 'Armored attack platform with punishing volleys and enough mass to ram through debris.',
  },
  shuttle: {
    name: 'Aegis Shuttle',
    role: 'Defensive command courier',
    hull: 148,
    shield: 132,
    speed: 29,
    armor: 0.2,
    mass: 46,
    damage: 22,
    fireInterval: 0.24,
    description: 'Protective escort shuttle with oversized shield projectors and a calm turning envelope.',
  },
  freighter: {
    name: 'Bastion Freighter',
    role: 'Industrial gun-truck',
    hull: 224,
    shield: 126,
    speed: 23,
    armor: 0.32,
    mass: 70,
    damage: 27,
    fireInterval: 0.27,
    description: 'Cargo hauler rebuilt into a bruiser, carrying thick plating, turret arrays, and raw staying power.',
  },
  destroyer: {
    name: 'Citadel Destroyer',
    role: 'Capital-grade assault craft',
    hull: 310,
    shield: 170,
    speed: 19,
    armor: 0.4,
    mass: 120,
    damage: 38,
    fireInterval: 0.36,
    description: 'Compact line destroyer with siege cannons, layered armor, and overwhelming forward batteries.',
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

const WAVE_PRESETS: Record<number, Omit<WaveConfig, 'wave'>> = {
  1: {
    enemies: 6,
    asteroids: 4,
    environmentSpeed: 27,
    asteroidSpeed: 16,
    eliteCount: 0,
    classes: ['fighter', 'interceptor'],
    message: 'Contact light screen. Break through and keep formation.',
  },
  2: {
    enemies: 8,
    asteroids: 5,
    environmentSpeed: 29,
    asteroidSpeed: 18,
    eliteCount: 1,
    classes: ['fighter', 'interceptor', 'shuttle'],
    message: 'Escort elements entering the lane. Watch for crossfire.',
  },
  3: {
    enemies: 10,
    asteroids: 6,
    environmentSpeed: 31,
    asteroidSpeed: 20,
    eliteCount: 2,
    classes: ['interceptor', 'bomber', 'shuttle'],
    message: 'Strike craft and bombers inbound. Pressure building.',
  },
  4: {
    enemies: 12,
    asteroids: 7,
    environmentSpeed: 33,
    asteroidSpeed: 22,
    eliteCount: 3,
    classes: ['fighter', 'bomber', 'freighter'],
    message: 'Industrial gunships detected. Brace for heavy plating.',
  },
  5: {
    enemies: 14,
    asteroids: 8,
    environmentSpeed: 35,
    asteroidSpeed: 24,
    eliteCount: 4,
    classes: ['bomber', 'freighter', 'destroyer'],
    message: 'Final assault wave. Enemy line ships are advancing. Survive the command elements.',
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getWaveConfig(wave: number): WaveConfig {
  const normalizedWave = clamp(Math.round(wave), 1, MAX_WAVE);
  const preset = WAVE_PRESETS[normalizedWave];
  return {
    wave: normalizedWave,
    ...preset,
    classes: [...preset.classes],
  };
}

export function getEnemyShipClass(wave: number, index: number): ShipClass {
  const config = getWaveConfig(wave);
  const rotation = (index + Math.max(0, wave - 1)) % config.classes.length;
  if (config.eliteCount > 0 && index >= config.enemies - config.eliteCount) {
    return config.classes[config.classes.length - 1];
  }
  return config.classes[rotation];
}

export function getKillScore(shipClass: ShipClass, wave: number, combo: number): number {
  const ship = SHIPS[shipClass];
  const base = ship.mass * 2 + ship.damage * 6 + ship.shield * 0.6 + ship.hull * 0.4;
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

export function resolveCollision(a: CollisionBody, b: CollisionBody): CollisionOutcome {
  const relativeSpeed = Math.max(4, Math.abs(a.speed - b.speed));
  const totalMass = Math.max(1, a.mass + b.mass);
  const reducedMass = (a.mass * b.mass) / totalMass;
  const impactDamage = Math.max(6, reducedMass * relativeSpeed * relativeSpeed * 0.0019);
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
