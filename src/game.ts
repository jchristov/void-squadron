import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { GameAudio } from './audio';
import {
  createAsteroid,
  createCapitalCarrier,
  createPlanet,
  createShieldShell,
  createShipModel,
  createSpaceBackdrop,
  disposeObject3D,
} from './models';
import {
  FLIGHT_PROFILES,
  WORLD_UP,
  applyOrientationInput,
  getDifficultyAdjustedEnemyPursuitProfile,
  getDifficultyAdjustedEnemyTurnRate,
  getBankAngle,
  getBasisVectors,
  getChaseCameraFrame,
  getEnemyPursuitDirective,
  getHeadingDegrees,
  integrateFlightMotion,
  relativeVelocityMagnitude,
  segmentSphereIntersection,
  solveInterceptCourse,
  sweepSphereAgainstBox,
  sweepSphereAgainstSphere,
  turnTowardsDirection,
  type EnemyDirective,
  type EnemyPursuitProfile,
  type FlightProfile,
} from './flight.ts';
import {
  BOOST_DRAIN_PER_SECOND,
  COMBO_WINDOW,
  MAX_ENERGY,
  PICKUP_COLORS,
  AEGIS,
  OVERCHARGE,
  SHIP_MODEL_SCALE,
  TORPEDO,
  absorbWithOvershield,
  canUseCombatPickup,
  isCombatPickup,
  isUpgradePickup,
  PICKUP_LIFETIME_SECONDS,
  PICKUP_WORLD_CAP,
  SHIPS,
  applyDamage,
  applyPickupRestore,
  getDifficultyTuning,
  getAsteroidScore,
  getComboAfterKill,
  getEnemyAttackTuning,
  getForwardSpeed,
  getMaxConcurrentCombat,
  getKillScore,
  getPickupSpawnAllowance,
  getWaveConfig,
  getWaveEnemyRoster,
  isCombatShip,
  isVictoryWave,
  regenerateEnergy,
  regenerateShield,
  resolveCollision,
  resolvePlayerDamageState,
  type CollisionBody,
  type DamageResult,
  type Difficulty,
  type PickupType,
  type ShipClass,
  type ShipDefinition,
} from './rules.ts';
import {
  UPGRADE_MAX_LEVEL,
  getUpgradedShipStats,
  getUpgradeEncounterScaling,
  loadStoredShipUpgrades,
  saveStoredShipUpgrades,
  type UpgradeLevels,
} from './upgrades.ts';
import {
  createCapitalShipBoss,
  createCapitalShipSubsystems,
  areShieldGeneratorsDestroyed,
  canDamageBridge,
  damageBossSubsystem,
  damageBossHullDirect,
  getBossPhase,
  getBossTurretCooldown,
  getBossFireTempo,
  trimBossEscorts,
  BOSS_ESCORT_LIMIT,
  BOSS_ESCORT_GAP,
  BOSS_ESCORT_DAMAGE,
  canSpawnBossEscort,
  BOSS_ESCORT_LEAD_IN,
  isTurretOnline,
  BOSS_TUNING,
  BOSS_DIFFICULTY,
  type BossPhase,
  type CapitalShipBoss,
  type CapitalShipSubsystem,
  type CapitalShipTurret,
} from './capital.ts';
import { computeAccuracy, type MissionSummary } from './summary.ts';
import { formatSpaceDistance } from './units.ts';
import {
  bearingDegrees,
  breakoutDirection,
  predictCollision,
  describeBearing,
  nextRetreatState,
  pickBossObjective,
  rollLevelInput,
  steeringInputs,
} from './pilot.ts';

export interface GameSnapshot {
  mode: 'menu' | 'playing' | 'paused' | 'ended';
  hull: number;
  shield: number;
  upgrades: UpgradeLevels;
  maxHull: number;
  maxShield: number;
  attackDamage: number;
  energy: number;
  score: number;
  wave: number;
  kills: number;
  speed: number;
  combo: number;
  enemies: number;
  message: string;
  result: 'victory' | 'defeat' | null;
  ship: ShipClass;
  heading?: number;
  altitude?: number;
  targetDistance?: number;
  pickupMessage?: string;
  recovery?: boolean;
  captureActive?: boolean;
  difficulty?: Difficulty;
  summary?: MissionSummary;
  autoMode?: AutoMode;
  autoStatus?: string;
  torpedoes?: number;
  torpedoCapacity?: number;
  overcharge?: number;
  aegis?: number;
  target?: { name: string; detail: string; distance: number } | null;
  boss?: {
    name: string;
    hull: number;
    maxHull: number;
    shield: number;
    maxShield: number;
    phase: BossPhase;
    subsystems: { id: string; name: string; destroyed: boolean; hull: number; maxHull: number }[];
  } | null;
}

export interface FlightTelemetry {
  readonly mode: GameSnapshot['mode'];
  readonly ship: ShipClass;
  readonly player: {
    readonly position: Readonly<TelemetryVector3>;
    readonly velocity: Readonly<TelemetryVector3>;
    readonly orientation: Readonly<TelemetryQuaternion>;
    readonly forward: Readonly<TelemetryVector3>;
    readonly speed: number;
    readonly hull: number;
    readonly shield: number;
    readonly energy: number;
    readonly boundaryLoad: number;
  };
  readonly camera: {
    readonly position: Readonly<TelemetryVector3>;
    readonly forward: Readonly<TelemetryVector3>;
  };
  readonly enemies: readonly Readonly<FlightTelemetryEnemy>[];
  readonly asteroids: readonly Readonly<FlightTelemetryAsteroid>[];
  readonly projectiles: readonly Readonly<FlightTelemetryProjectile>[];
  readonly pickups?: readonly Readonly<FlightTelemetryPickup>[];
  readonly target?: Readonly<{ kind: 'enemy' | 'boss'; id: number }> | null;
  readonly boss?: Readonly<{
    name: string;
    hull: number;
    maxHull: number;
    shield: number;
    maxShield: number;
    position: TelemetryVector3;
    defeated: boolean;
    subsystems: readonly Readonly<{
      id: string;
      name: string;
      destroyed: boolean;
      position: TelemetryVector3;
      hull: number;
      maxHull: number;
    }>[];
  }> | null;
  readonly stats: {
    readonly wave: number;
    readonly score: number;
    readonly kills: number;
    readonly combo: number;
    readonly recovery: boolean;
  };
}

interface TelemetryVector3 {
  x: number;
  y: number;
  z: number;
}

interface TelemetryQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface FlightTelemetryEnemy {
  id: number;
  ship: ShipClass;
  position: TelemetryVector3;
  velocity: TelemetryVector3;
  hull: number;
  shield: number;
  mode: EnemyMode;
}

interface FlightTelemetryAsteroid {
  id: number;
  position: TelemetryVector3;
  velocity: TelemetryVector3;
  radius: number;
  hull: number;
}

interface FlightTelemetryProjectile {
  id: number;
  kind: 'player' | 'enemy';
  position: TelemetryVector3;
  velocity: TelemetryVector3;
  travelled: number;
  life: number;
}

interface FlightTelemetryPickup {
  id: number;
  type: PickupType;
  position: TelemetryVector3;
  amount: number;
  life: number;
}

type GameMode = GameSnapshot['mode'];
type EnemyMode = EnemyDirective;
type EnvironmentObstacleKind = 'planet' | 'carrier';
type UpgradePickupType = Extract<PickupType, 'hull-upgrade' | 'defense-upgrade' | 'attack-upgrade'>;

interface SpawnInstruction {
  type: 'enemy' | 'asteroid';
  delay: number;
  shipClass?: ShipClass;
  radius?: number;
  speed?: number;
}

interface EnemyEntity {
  id: number;
  object: THREE.Group;
  shieldShell: THREE.Mesh;
  shipClass: ShipClass;
  stats: ShipDefinition;
  profile: FlightProfile;
  pursuit: EnemyPursuitProfile;
  radius: number;
  muzzleDistance: number;
  hull: number;
  shield: number;
  mass: number;
  armor: number;
  velocity: THREE.Vector3;
  patrolOrigin: THREE.Vector3;
  fireCooldown: number;
  collisionCooldown: number;
  hitFlash: number;
  strafeSign: number;
  verticalBias: number;
  behaviorTimer: number;
  despawnTimer: number;
  spawnAge: number;
  mode: EnemyMode;
}

interface AsteroidEntity {
  id: number;
  object: THREE.Mesh;
  radius: number;
  hull: number;
  shield: number;
  mass: number;
  armor: number;
  speed: number;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  collisionCooldown: number;
  hitFlash: number;
}

interface LaserEntity {
  id: number;
  kind: 'player' | 'enemy';
  object: THREE.Group;
  velocity: THREE.Vector3;
  damage: number;
  radius: number;
  life: number;
  travelled: number;
  maxDistance: number;
  previousPosition: THREE.Vector3;
  ownerId: number | 'player';
}

type BlastCause = 'weapon' | 'collision';

export type AutoMode = 'off' | 'autopilot' | 'combat';
type TargetRef = { kind: 'enemy'; id: number } | { kind: 'boss' };

export interface TargetGuidance {
  kind: 'enemy' | 'boss';
  name: string;
  detail: string;
  hostile: boolean;
  distance: number;
  closing: number;
  hullPct: number;
  shieldPct: number;
  onScreen: boolean;
  x: number;
  y: number;
  boxPx: number;
  edgeAngle: number;
  lead: { x: number; y: number } | null;
  instruction: string;
  yawDeg: number;
  pitchDeg: number;
}

interface ResolvedTarget {
  heavy: boolean;
  ref: TargetRef;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  name: string;
  detail: string;
  hostile: boolean;
  hullPct: number;
  shieldPct: number;
}

interface TorpedoEntity {
  id: number;
  object: THREE.Group;
  velocity: THREE.Vector3;
  previousPosition: THREE.Vector3;
  target: TargetRef | null;
  age: number;
  trailTimer: number;
  damage: number;
}

interface PilotObjective {
  heavy: boolean;
  kind: 'target' | 'hostile' | 'boss' | 'supply' | 'flee' | 'anchor' | 'hold';
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  label: string;
  hostile: boolean;
  standoff: number;
}

interface BlastEntity {
  id: number;
  root: THREE.Group;
  age: number;
  life: number;
  parts: Array<(age: number, dt: number) => void>;
}

interface ExplosionEntity {
  id: number;
  object: THREE.Group;
  life: number;
  maxLife: number;
  growth: number;
  drift: THREE.Vector3;
}

interface PickupEntity {
  id: number;
  type: PickupType;
  object: THREE.Group;
  radius: number;
  amount: number;
  life: number;
  maxLife: number;
  spin: THREE.Vector3;
  drift: THREE.Vector3;
  pulse: number;
}

interface MotionStars {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
}

const SNAPSHOT_INTERVAL = 0.1;
const COLLISION_COOLDOWN = 0.85;
const WAVE_CLEAR_DELAY = 2.9;
const MENU_MESSAGE = 'Select a ship and launch into the fleet corridor.';
const EPSILON = 0.0001;
const PLAYER_BASE_Y = -1.8;
const PLAYER_START_Z = 58;
const WORLD_SOFT_RADIUS = 760;
const WORLD_HARD_RADIUS = 1040;
const WORLD_BOUNDARY_GUIDANCE = 18;
const ASTEROID_RECYCLE_DISTANCE = 340;
const ASTEROID_SAFE_DISTANCE = 110;
const PICKUP_SPARKLE_DISTANCE = 1.4;
const DEBUG_COLLISION_OPACITY = 0.16;
const LASER_UP_VECTOR = new THREE.Vector3(0, 0, 1);
/** Hull radii before per-class scaling; the chase camera is tuned around these. */
const LEGACY_SHIP_RADIUS: Record<ShipClass, number> = { fighter: 4.45, interceptor: 4.27, bomber: 5.46, shuttle: 4.49, freighter: 5.94, destroyer: 7.89 };
const PICKUP_LABELS_SHORT: Record<PickupType, string> = { energy: 'ENERGY', shield: 'SHIELD', hull: 'HULL REPAIR', 'hull-upgrade': 'HULL UPGRADE', 'defense-upgrade': 'DEFENSE UPGRADE', 'attack-upgrade': 'ATTACK UPGRADE', torpedo: 'TORPEDOES', overcharge: 'OVERCHARGE', aegis: 'AEGIS' };
const POINTER_CAPTURE_SENSITIVITY = 2.25;
// Free-cursor steering shares the sensitivity setting: at the 5x default, reaching full turn rate takes about a third of the half-screen deflection.
const UNLOCKED_CURSOR_GAIN_PER_X = 0.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function vectorToTelemetry(vector: Readonly<THREE.Vector3>): Readonly<TelemetryVector3> {
  return freeze({ x: vector.x, y: vector.y, z: vector.z });
}

function quaternionToTelemetry(quaternion: Readonly<THREE.Quaternion>): Readonly<TelemetryQuaternion> {
  return freeze({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w });
}

function disposeMaterial(material: THREE.Material): void {
  const typed = material as THREE.Material & {
    map?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
  };
  typed.map?.dispose();
  typed.alphaMap?.dispose();
  typed.emissiveMap?.dispose();
  material.dispose();
}

function createLaserBolt(color: number, radius: number, length: number): THREE.Group {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.45, radius * 0.72, length, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.94 }),
  );
  core.rotation.x = Math.PI / 2;
  group.add(core);

  const halo = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.15, length * 1.28, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  halo.rotation.x = Math.PI / 2;
  group.add(halo);
  return group;
}

function withEmissiveMaterials(root: THREE.Object3D, callback: (material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial) => void): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.material) {
      return;
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        callback(material);
      }
    }
  });
}

function getPickupColor(type: PickupType): number {
  return PICKUP_COLORS[type];
}

function createPickupModel(type: PickupType): THREE.Group {
  const group = new THREE.Group();
  const color = getPickupColor(type);
  const glow = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false });
  const solid = new THREE.MeshStandardMaterial({ color: type.endsWith('upgrade') ? 0xfff5fb : 0xf5fbff, emissive: color, emissiveIntensity: 1.45, roughness: 0.22, metalness: 0.18 });

  const core = new THREE.Mesh(type.endsWith('upgrade') ? new THREE.IcosahedronGeometry(0.72, 0) : new THREE.OctahedronGeometry(0.85, 0), solid);
  if (type !== 'torpedo' && type !== 'overcharge' && type !== 'aegis') group.add(core);

  if (type === 'energy') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.08, 10, 28), glow);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    for (const x of [-0.42, 0, 0.42]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.45, 0.18), solid);
      bar.position.set(x, 0, 0);
      bar.rotation.z = x === 0 ? 0 : x > 0 ? 0.18 : -0.18;
      group.add(bar);
    }
  } else if (type === 'shield') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.12, 12, 36), glow);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.08, 10, 24, Math.PI), solid);
    arc.rotation.x = Math.PI / 2;
    arc.rotation.z = Math.PI / 2;
    group.add(arc);
  } else if (type === 'hull') {
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.3), solid);
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 0.32), solid);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 10, 28), glow);
    halo.rotation.x = Math.PI / 2;
    group.add(vertical, horizontal, halo);
  } else if (type === 'hull-upgrade') {
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.5, 6), solid);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.18, 0.24), solid);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.7, 5), solid);
    crown.position.y = 0.92;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.08, 10, 30), glow);
    halo.rotation.x = Math.PI / 2;
    group.add(spine, crossbar, crown, halo);
  } else if (type === 'defense-upgrade') {
    const innerShield = new THREE.Mesh(new THREE.SphereGeometry(0.56, 12, 12), glow);
    innerShield.scale.set(1, 1.15, 1);
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.11, 12, 36), solid);
    outerRing.rotation.x = Math.PI / 2;
    const sideRing = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.08, 10, 26), glow);
    sideRing.rotation.y = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 1.2, 6), solid);
    cap.rotation.z = Math.PI / 2;
    group.add(innerShield, outerRing, sideRing, cap);
  } else if (type === 'torpedo') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 10), solid);
    body.rotation.z = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 10), solid);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.95;
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.4), solid);
      fin.position.set(-0.5, Math.sin(angle) * 0.38, Math.cos(angle) * 0.38);
      fin.rotation.x = angle;
      group.add(fin);
    }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 10, 30), glow);
    halo.rotation.y = Math.PI / 2;
    group.add(body, tip, halo);
  } else if (type === 'overcharge') {
    const zig = [[-0.2, 0.9], [0.25, 0.35], [-0.12, 0.3], [0.3, -0.35], [-0.05, -0.3], [0.1, -0.95]];
    for (let index = 0; index < zig.length - 1; index += 1) {
      const [x1, y1] = zig[index];
      const [x2, y2] = zig[index + 1];
      const length = Math.hypot(x2 - x1, y2 - y1);
      const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.2, length + 0.1, 0.2), solid);
      bolt.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
      bolt.rotation.z = -Math.atan2(x2 - x1, y2 - y1);
      group.add(bolt);
    }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.08, 10, 30), glow);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
  } else if (type === 'aegis') {
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.85 }));
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 14), solid);
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.06, 10, 32), glow);
    const ringB = ringA.clone();
    ringB.rotation.y = Math.PI / 2;
    group.add(shell, heart, ringA, ringB);
  } else {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 1.65, 6), solid);
    barrel.rotation.z = Math.PI / 2;
    const wingLeft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.86, 0.16), solid);
    wingLeft.position.x = -0.48;
    wingLeft.rotation.z = -0.52;
    const wingRight = wingLeft.clone();
    wingRight.position.x = 0.48;
    wingRight.rotation.z = 0.52;
    const reticle = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.08, 10, 28), glow);
    reticle.rotation.y = Math.PI / 2;
    group.add(barrel, wingLeft, wingRight, reticle);
  }

  const aura = new THREE.Mesh(new THREE.IcosahedronGeometry(type.endsWith('upgrade') ? 1.6 : 1.45, 0), glow);
  aura.scale.setScalar(type.endsWith('upgrade') ? 1.12 : 1.08);
  group.add(aura);
  return group;
}

function applyImpactFlash(root: THREE.Object3D, intensity: number, flashColor: number): void {
  const color = new THREE.Color(flashColor);
  withEmissiveMaterials(root, (material) => {
    const userData = material.userData as { baseEmissive?: THREE.Color; baseEmissiveIntensity?: number };
    userData.baseEmissive ??= material.emissive.clone();
    userData.baseEmissiveIntensity ??= material.emissiveIntensity;
    material.emissive.copy(userData.baseEmissive).lerp(color, clamp(intensity, 0, 1) * 0.85);
    material.emissiveIntensity = (userData.baseEmissiveIntensity ?? 0) + intensity * 1.15;
  });
}

function createCarrierCollisionBounds(): THREE.Box3 {
  const carrier = createCapitalCarrier();
  carrier.scale.setScalar(1);
  carrier.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(carrier);
  disposeObject3D(carrier);
  return bounds;
}

export class SpaceGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly onUpdate: (state: GameSnapshot) => void;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2200);
  private readonly clock = new THREE.Clock();
  private readonly audio = new GameAudio();

  private readonly environmentRoot = new THREE.Group();
  private readonly backdropRoot = createSpaceBackdrop();
  private readonly motionStarRoot = new THREE.Group();
  private readonly menuRoot = new THREE.Group();
  private readonly gameplayRoot = new THREE.Group();
  private readonly enemyLayer = new THREE.Group();
  private readonly asteroidLayer = new THREE.Group();
  private readonly laserLayer = new THREE.Group();
  private readonly effectLayer = new THREE.Group();
  private readonly pickupLayer = new THREE.Group();
  private readonly playerRoot = new THREE.Group();
  private menuHero = createShipModel('fighter', { accent: 0xb6c8ff, scale: SHIP_MODEL_SCALE.fighter * 1.25, tint: 0x8a97aa });
  private readonly menuCarrier = createCapitalCarrier();
  private readonly gameplayCarrier = createCapitalCarrier();
  private readonly menuEscorts: THREE.Group[] = [];
  private readonly planet = createPlanet(24);
  private readonly planetPivot = new THREE.Group();
  private readonly motionStars: MotionStars;
  private readonly playerVelocity = new THREE.Vector3();
  private readonly previousPlayerPosition = new THREE.Vector3();
  private readonly waveAnchor = new THREE.Vector3(0, PLAYER_BASE_Y, PLAYER_START_Z);
  private readonly waveSpawnOrientation = new THREE.Quaternion();
  private readonly cameraLookTarget = new THREE.Vector3();
  private readonly carrierCollisionBounds = createCarrierCollisionBounds();
  private readonly planetCollisionBounds = new THREE.Box3();
  private readonly planetCollisionSphere = new THREE.Sphere();
  private readonly reticleElement = document.querySelector<HTMLElement>('.reticle');

  private resizeObserver?: ResizeObserver;
  private raf = 0;
  private disposed = false;
  private highQuality = true;
  private mode: GameMode = 'menu';
  private result: GameSnapshot['result'] = null;
  private message = MENU_MESSAGE;
  private ship: ShipClass = 'fighter';
  private shipUpgrades = loadStoredShipUpgrades();
  private playerShip?: THREE.Group;
  private playerShieldShell?: THREE.Mesh;
  private playerRadius = 1.4;
  private playerMuzzleDistance = 2.2;
  private playerFireCooldown = 0;
  private playerCollisionCooldown = 0;
  private shieldFlash = 0;
  private currentSpeed = SHIPS.fighter.speed;
  private currentBoundaryLoad = 0;
  private environmentSpeed = 12;
  private score = 0;
  private wave = 0;
  private kills = 0;
  private combo = 0;
  private lastKillTimer = COMBO_WINDOW + 1;
  private playerHull = SHIPS.fighter.hull;
  private playerShield = SHIPS.fighter.shield;
  private energy = MAX_ENERGY;
  private timeSincePlayerDamage = 999;
  private spawnClock = 0;
  private nextWaveDelay = 0;
  private snapshotAccumulator = SNAPSHOT_INTERVAL;
  private targetAsteroidCount = 0;
  private enemyId = 0;
  private asteroidId = 0;
  private laserId = 0;
  private explosionId = 0;
  private pickupId = 0;
  private randomState = 0x9e3779b9;
  private collisionBoundsVisible = false;
  private pickupMessage?: string;
  private pickupMessageTimer = 0;
  private recoveryActive = false;
  private recoveryPocketCooldown = 0;
  private collisionsEnabled = true;
  private damageEnabled = true;
  private difficulty: Difficulty = 'standard';
  private mouseCaptureEnabled = false;
  private mouseSensitivity = 5;
  private pointerLockReleaseSuppressed = false;
  private pointerLockRequested = false;

  private enemies: EnemyEntity[] = [];
  private asteroids: AsteroidEntity[] = [];
  private lasers: LaserEntity[] = [];
  private explosions: ExplosionEntity[] = [];
  private blasts: BlastEntity[] = [];
  private blastId = 0;
  private blastTextures: { fire: THREE.CanvasTexture; smoke: THREE.CanvasTexture } | null = null;
  private cameraShake = 0;
  private readonly lastShakeOffset = new THREE.Vector3();
  private slowMo = 0;
  private slowMoDuration = 1;
  private pickups: PickupEntity[] = [];
  private spawnQueue: SpawnInstruction[] = [];
  private boss: CapitalShipBoss | null = null;
  private bossVictoryTimer = 0;
  private torpedoes = 0;
  private torpedoCooldown = 0;
  private torpedoList: TorpedoEntity[] = [];
  private torpedoId = 0;
  private overchargeTimer = 0;
  private aegisPoints = 0;
  private target: TargetRef | null = null;
  private autoMode: AutoMode = 'off';
  private autoStatus = '';
  private autoBoost = false;
  private autoFire = false;
  private readonly autoInput = { yaw: 0, pitch: 0, roll: 0 };
  private pilotRetreating = false;
  private pilotBreakTimer = 0;
  private pilotBreakSign = 1;
  private pilotJinkTimer = 0;
  private readonly pilotJink = new THREE.Vector2();
  private pilotTargetId: number | null = null;
  private pilotTargetHold = 0;
  private manualMouseTravel = 0;
  private missionTime = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private damageTaken = 0;
  private bossStartTime: number | null = null;
  private bossClearTime: number | null = null;
  private bossPhase: BossPhase | null = null;
  private bossShieldFlash = 0;
  private bossFxTimer = 0;
  private bossVisuals: { turrets: Map<number, { group: THREE.Group; barrelMat: THREE.MeshStandardMaterial; glow: THREE.Mesh; flash: number }>; shield: THREE.Mesh } | null = null;
  private readonly bossHomePosition = new THREE.Vector3(-196, 22, -334);
  private readonly bossHomeRotation = new THREE.Euler(-0.03, 0.46, 0.01);

  private unlockedPointerTarget = new THREE.Vector2();
  private capturedPointerTarget = new THREE.Vector2();
  private readonly scratchPointer = new THREE.Vector2();
  private fireHeld = false;
  private boostHeld = false;
  private yawAxis = 0;
  private pitchAxis = 0;
  private rollAxis = 0;
  private wheelRollInput = 0;
  private heldKeys = new Set<string>();

  private readonly onPointerMove = (event: MouseEvent): void => {
    if (this.mode !== 'playing') {
      return;
    }
    if (this.isMouseCaptureActive()) {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width || this.canvas.clientWidth || 1);
      const height = Math.max(1, rect.height || this.canvas.clientHeight || 1);
      if (this.autoMode !== 'off') {
        this.manualMouseTravel += Math.hypot(event.movementX, event.movementY);
        if (this.manualMouseTravel > 260) this.setAutoMode('off', 'MANUAL CONTROL');
      }
      this.capturedPointerTarget.x = clamp(this.capturedPointerTarget.x + (event.movementX / width) * POINTER_CAPTURE_SENSITIVITY * this.mouseSensitivity, -1, 1);
      this.capturedPointerTarget.y = clamp(this.capturedPointerTarget.y - (event.movementY / height) * POINTER_CAPTURE_SENSITIVITY * this.mouseSensitivity, -1, 1);
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    this.unlockedPointerTarget.set(clamp(x, -1, 1), clamp(y, -1, 1));
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.mode !== 'playing') {
      return;
    }
    event.preventDefault();
    this.wheelRollInput = clamp(this.wheelRollInput + event.deltaY * 0.0024, -1.4, 1.4);
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onPointerDown = (event: MouseEvent): void => {
    if (this.mode === 'playing' && event.button === 2) {
      event.preventDefault();
      this.fireTorpedo();
      return;
    }
    if (this.mode !== 'playing' || event.button !== 0) {
      return;
    }
    if (this.mouseCaptureEnabled && !this.isMouseCaptureActive()) {
      this.requestMouseCapture();
    }
    this.fireHeld = true;
    void this.audio.resume();
  };

  private readonly onPointerUp = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.fireHeld = false;
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const playInput = this.mode === 'playing';
    if (playInput && event.code === 'Space') {
      event.preventDefault();
      this.fireHeld = true;
    }
    if (playInput && event.code === 'KeyX' && !event.repeat) {
      event.preventDefault();
      this.fireTorpedo();
    }
    if (!playInput) {
      return;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.boostHeld = true;
    }
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'KeyQ',
        'KeyE',
      ].includes(event.code)
    ) {
      event.preventDefault();
      if (this.autoMode !== 'off') this.setAutoMode('off', 'MANUAL CONTROL');
      this.heldKeys.add(event.code);
      this.recomputeKeyboardAxes();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      this.fireHeld = false;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.boostHeld = false;
    }
    if (this.heldKeys.delete(event.code)) {
      this.recomputeKeyboardAxes();
    }
  };

  private readonly onBlur = (): void => {
    this.releaseContinuousInput();
    if (this.mode === 'playing') {
      this.pause();
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.onBlur();
    }
  };

  private readonly onPointerLockChange = (): void => {
    const captureActive = this.isMouseCaptureActive();
    if (captureActive) {
      this.pointerLockRequested = false;
      this.capturedPointerTarget.set(0, 0);
      if (this.mode !== 'playing' || !this.mouseCaptureEnabled) {
        this.releaseMouseCapture(true);
        return;
      }
      this.emitSnapshot(true);
      return;
    }

    this.pointerLockRequested = false;
    this.capturedPointerTarget.set(0, 0);
    if (this.pointerLockReleaseSuppressed) {
      this.pointerLockReleaseSuppressed = false;
      this.emitSnapshot(true);
      return;
    }
    if (this.mode === 'playing') {
      this.pause();
      return;
    }
    this.emitSnapshot(true);
  };

  private readonly onPointerLockError = (): void => {
    this.pointerLockRequested = false;
    this.capturedPointerTarget.set(0, 0);
    if (this.mode === 'playing') {
      this.message = 'Pointer capture unavailable — continuing with cursor controls.';
      this.emitSnapshot(true);
    }
  };

  private readonly onResize = (): void => {
    this.resize();
  };

  constructor(canvas: HTMLCanvasElement, onUpdate: (state: GameSnapshot) => void) {
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false }) ?? canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!context) {
      throw new Error('WebGL is not available in this browser.');
    }

    this.canvas = canvas;
    this.onUpdate = onUpdate;
    this.renderer = new THREE.WebGLRenderer({ canvas, context: context as WebGLRenderingContext, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.fog = new THREE.FogExp2(0x040812, 0.0014);
    this.scene.add(this.environmentRoot, this.gameplayRoot, this.menuRoot);
    this.environmentRoot.add(this.backdropRoot, this.motionStarRoot, this.planetPivot, this.gameplayCarrier);
    this.gameplayRoot.add(this.asteroidLayer, this.enemyLayer, this.laserLayer, this.effectLayer, this.pickupLayer, this.playerRoot);

    this.buildScene();
    this.motionStars = this.createMotionStars();
    this.motionStarRoot.add(this.motionStars.points);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.05, 0.65, 0.82);
    this.composer.addPass(this.bloomPass);

    this.rebuildPlayerShip(this.ship);
    this.playerRoot.visible = false;
    this.menuRoot.visible = true;
    this.resetCameraForMenu();

    this.installEventListeners();
    this.resize();
    this.setQuality(true);
    const stats = this.getCurrentShipStats();
    this.playerHull = stats.hull;
    this.playerShield = stats.shield;
    this.currentSpeed = stats.speed;
    this.emitSnapshot(true);
    this.animate();
  }

  previewShip(ship: ShipClass): void {
    if (this.mode !== 'menu') return;
    const previous = this.menuHero;
    const next = createShipModel(ship, { accent: 0x8be3ff, scale: SHIP_MODEL_SCALE[ship] * 1.25, tint: 0x8a97aa });
    next.position.copy(previous.position);
    next.rotation.copy(previous.rotation);
    this.menuRoot.remove(previous);
    disposeObject3D(previous);
    this.menuHero = next;
    this.menuRoot.add(next);
  }

  getShipUpgradeLevels(ship: ShipClass): UpgradeLevels {
    return { ...this.shipUpgrades[ship] };
  }

  private encounterScaling = { count: 1, durability: 1, damage: 1 };

  start(ship: ShipClass): void {
    this.ship = ship;
    this.encounterScaling = getUpgradeEncounterScaling(this.shipUpgrades[ship]);
    this.resetGameplayState();
    this.rebuildPlayerShip(ship);
    this.playerRoot.visible = true;
    this.menuRoot.visible = false;
    this.mode = 'playing';
    this.result = null;
    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.lastKillTimer = COMBO_WINDOW + 1;
    this.target = null;
    this.autoMode = 'off';
    this.autoStatus = '';
    this.autoFire = false;
    this.autoBoost = false;
    this.pilotRetreating = false;
    this.torpedoes = this.getCurrentShipStats().torpedoes;
    this.torpedoCooldown = 0;
    this.overchargeTimer = 0;
    this.aegisPoints = 0;
    this.missionTime = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageTaken = 0;
    this.bossStartTime = null;
    this.bossClearTime = null;
    this.message = 'Squadron launch confirmed.';
    const stats = this.getCurrentShipStats();
    this.playerHull = stats.hull;
    this.playerShield = stats.shield;
    this.energy = MAX_ENERGY;
    this.currentSpeed = stats.speed;
    this.timeSincePlayerDamage = 999;
    this.playerFireCooldown = 0;
    this.playerCollisionCooldown = 0;
    this.shieldFlash = 0;
    this.currentBoundaryLoad = 0;
    this.recoveryActive = false;
    this.recoveryPocketCooldown = 0;
    this.pickupMessage = undefined;
    this.pickupMessageTimer = 0;
    this.playerRoot.position.set(0, PLAYER_BASE_Y, PLAYER_START_Z);
    this.playerRoot.quaternion.identity();
    this.playerVelocity.set(0, 0, 0);
    this.previousPlayerPosition.copy(this.playerRoot.position);
    this.unlockedPointerTarget.set(0, 0);
    this.capturedPointerTarget.set(0, 0);
    this.releaseContinuousInput();
    this.wheelRollInput = 0;
    this.resetMotionStars();
    this.randomState = (Date.now() ^ stats.mass ^ stats.speed) >>> 0;
    this.scheduleWave(1);
    this.syncCameraToPlayer(0, true);
    this.clock.start();
    void this.audio.resume();
    if (this.mouseCaptureEnabled) {
      this.requestMouseCapture();
    }
    this.emitSnapshot(true);
  }

  pause(): void {
    if (this.mode !== 'playing') {
      return;
    }
    this.releaseMouseCapture(true);
    this.releaseContinuousInput();
    this.audio.setBossDrone(false, 0);
    this.mode = 'paused';
    this.message = 'Paused';
    this.emitSnapshot(true);
  }

  resume(): void {
    if (this.mode !== 'paused') {
      return;
    }
    this.mode = 'playing';
    this.message = `Wave ${Math.max(1, this.wave)} re-engaged.`;
    this.clock.getDelta();
    void this.audio.resume();
    this.emitSnapshot(true);
  }

  returnToMenu(): void {
    this.releaseMouseCapture(true);
    this.releaseContinuousInput();
    this.resetGameplayState();
    this.mode = 'menu';
    this.result = null;
    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.lastKillTimer = COMBO_WINDOW + 1;
    this.message = MENU_MESSAGE;
    this.playerRoot.visible = false;
    this.menuRoot.visible = true;
    const stats = this.getCurrentShipStats();
    this.playerHull = stats.hull;
    this.playerShield = stats.shield;
    this.energy = MAX_ENERGY;
    this.currentSpeed = stats.speed;
    this.currentBoundaryLoad = 0;
    this.recoveryActive = false;
    this.recoveryPocketCooldown = 0;
    this.pickupMessage = undefined;
    this.pickupMessageTimer = 0;
    this.playerVelocity.set(0, 0, 0);
    this.playerRoot.position.set(0, PLAYER_BASE_Y, PLAYER_START_Z);
    this.playerRoot.quaternion.identity();
    this.previousPlayerPosition.copy(this.playerRoot.position);
    this.resetCameraForMenu();
    this.audio.setEngine(false, 0, false);
    this.emitSnapshot(true);
  }

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  setQuality(high: boolean): void {
    this.highQuality = high;
    this.bloomPass.enabled = high;
    this.bloomPass.strength = high ? 1.05 : 0.28;
    this.bloomPass.radius = high ? 0.65 : 0.2;
    this.bloomPass.threshold = high ? 0.82 : 0.9;
    this.renderer.toneMappingExposure = high ? 1.08 : 1.0;
    (this.motionStars.points.material as THREE.PointsMaterial).opacity = high ? 0.95 : 0.72;
  }

  setCollisionsEnabled(enabled: boolean): void {
    this.collisionsEnabled = enabled;
    if (!enabled) {
      this.playerCollisionCooldown = 0;
      this.enemies.forEach((enemy) => {
        enemy.collisionCooldown = 0;
      });
      this.asteroids.forEach((asteroid) => {
        asteroid.collisionCooldown = 0;
      });
    }
    this.emitSnapshot(true);
  }

  setDamageEnabled(enabled: boolean): void {
    this.damageEnabled = enabled;
    this.emitSnapshot(true);
  }

  setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    const tuning = getDifficultyTuning(difficulty);
    this.recoveryPocketCooldown = Math.min(this.recoveryPocketCooldown, tuning.recoveryPocketCooldown);
    this.enemies.forEach((enemy) => {
      enemy.pursuit = getDifficultyAdjustedEnemyPursuitProfile(enemy.shipClass, difficulty);
    });
    this.emitSnapshot(true);
  }

  setMouseSensitivity(sensitivity: number): void {
    if (!Number.isFinite(sensitivity)) return;
    this.mouseSensitivity = clamp(sensitivity, 0.5, 10);
  }

  setMouseCaptureEnabled(enabled: boolean): void {
    this.mouseCaptureEnabled = enabled;
    if (!enabled) {
      this.releaseMouseCapture(true);
    } else if (this.mode === 'playing') {
      this.requestMouseCapture();
    }
    this.emitSnapshot(true);
  }

  requestMouseCapture(): void {
    if (!this.mouseCaptureEnabled || this.mode !== 'playing' || this.disposed || this.isMouseCaptureActive() || this.pointerLockRequested) {
      return;
    }
    const target = this.canvas as HTMLCanvasElement & {
      requestPointerLock?: (options?: { unadjustedMovement?: boolean }) => Promise<void> | void;
    };
    if (typeof document === 'undefined' || typeof target.requestPointerLock !== 'function') {
      this.message = 'Pointer capture is not supported in this browser.';
      this.emitSnapshot(true);
      return;
    }
    const userActivation = window.navigator.userActivation;
    if (userActivation && !userActivation.isActive) {
      return;
    }

    this.pointerLockRequested = true;
    try {
      const requested = target.requestPointerLock({ unadjustedMovement: true });
      if (requested && typeof (requested as Promise<void>).catch === 'function') {
        void (requested as Promise<void>).catch(() => {
          this.pointerLockRequested = false;
          if (this.mode === 'playing') {
            this.message = 'Pointer capture unavailable — continuing with cursor controls.';
            this.emitSnapshot(true);
          }
        });
      }
    } catch {
      try {
        const fallback = target.requestPointerLock();
        if (fallback && typeof (fallback as Promise<void>).catch === 'function') {
          void (fallback as Promise<void>).catch(() => {
            this.pointerLockRequested = false;
            if (this.mode === 'playing') {
              this.message = 'Pointer capture unavailable — continuing with cursor controls.';
              this.emitSnapshot(true);
            }
          });
        }
      } catch {
        this.pointerLockRequested = false;
        this.message = 'Pointer capture unavailable — continuing with cursor controls.';
        this.emitSnapshot(true);
      }
    }
  }

  setCollisionBoundsVisible(visible: boolean): void {
    this.collisionBoundsVisible = visible;
    this.syncCollisionBoundsVisibility();
  }

  getFlightTelemetry(): FlightTelemetry {
    const basis = getBasisVectors(this.playerRoot.quaternion);
    const enemies = freeze(
      this.enemies.map((enemy) =>
        freeze({
          id: enemy.id,
          ship: enemy.shipClass,
          position: vectorToTelemetry(enemy.object.position),
          velocity: vectorToTelemetry(enemy.velocity),
          hull: enemy.hull,
          shield: enemy.shield,
          mode: enemy.mode,
        }),
      ),
    );
    const asteroids = freeze(
      this.asteroids.map((asteroid) =>
        freeze({
          id: asteroid.id,
          position: vectorToTelemetry(asteroid.object.position),
          velocity: vectorToTelemetry(asteroid.velocity),
          radius: asteroid.radius,
          hull: asteroid.hull,
        }),
      ),
    );
    const projectiles = freeze(
      this.lasers.map((laser) =>
        freeze({
          id: laser.id,
          kind: laser.kind,
          position: vectorToTelemetry(laser.object.position),
          velocity: vectorToTelemetry(laser.velocity),
          travelled: laser.travelled,
          life: laser.life,
        }),
      ),
    );
    const pickups = freeze(
      this.pickups.map((pickup) =>
        freeze({
          id: pickup.id,
          type: pickup.type,
          position: vectorToTelemetry(pickup.object.position),
          amount: pickup.amount,
          life: pickup.life,
        }),
      ),
    );

    return freeze({
      mode: this.mode,
      ship: this.ship,
      player: freeze({
        position: vectorToTelemetry(this.playerRoot.position),
        velocity: vectorToTelemetry(this.playerVelocity),
        orientation: quaternionToTelemetry(this.playerRoot.quaternion),
        forward: vectorToTelemetry(basis.forward),
        speed: this.playerVelocity.length(),
        hull: this.playerHull,
        shield: this.playerShield,
        energy: this.energy,
        boundaryLoad: this.currentBoundaryLoad,
      }),
      camera: freeze({
        position: vectorToTelemetry(this.camera.position),
        forward: vectorToTelemetry(this.cameraLookTarget.clone().sub(this.camera.position).normalize()),
      }),
      enemies,
      asteroids,
      projectiles,
      pickups,
      target: this.target ? freeze({ kind: this.target.kind, id: this.target.kind === 'enemy' ? this.target.id : 0 }) : null,
      boss: this.boss
        ? freeze({
            name: this.boss.name,
            hull: this.boss.hull,
            maxHull: this.boss.maxHull,
            shield: this.boss.shield,
            maxShield: this.boss.maxShield,
            position: vectorToTelemetry(this.gameplayCarrier.position),
            defeated: this.boss.defeated,
            subsystems: freeze(
              this.boss.subsystems.map((sub) =>
                freeze({ id: sub.id, name: sub.name, destroyed: sub.destroyed, position: vectorToTelemetry(sub.worldCenter), hull: sub.hull, maxHull: sub.maxHull }),
              ),
            ),
          })
        : null,
      stats: freeze({ wave: this.wave, score: this.score, kills: this.kills, combo: this.combo, recovery: this.recoveryActive }),
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.releaseMouseCapture(true);
    this.removeEventListeners();
    this.resetGameplayState();
    disposeObject3D(this.menuRoot);
    disposeObject3D(this.environmentRoot);
    disposeObject3D(this.gameplayRoot);
    (this.composer as unknown as { dispose?: () => void }).dispose?.();
    this.renderer.dispose();
    this.audio.dispose();
  }

  private buildScene(): void {
    this.planetPivot.position.set(172, 68, -262);
    this.planet.rotation.y = 0.2;
    this.planetPivot.add(this.planet);

    this.gameplayCarrier.position.copy(this.bossHomePosition);
    this.gameplayCarrier.rotation.copy(this.bossHomeRotation);

    this.menuCarrier.position.set(-2, 13.5, -112);
    this.menuCarrier.rotation.set(-0.08, 0.16, 0.02);
    this.menuRoot.add(this.menuCarrier);

    const escortData: Array<[ShipClass, [number, number, number], [number, number, number], number]> = [
      ['destroyer', [-16, 15.8, -122], [-0.05, 0.18, 0.03], 1.05],
      ['freighter', [11, 11.5, -102], [-0.08, -0.22, -0.03], 1.18],
      ['shuttle', [18, 8.5, -88], [0.12, -0.35, 0.08], 1.05],
    ];
    for (const [shipClass, position, rotation, scale] of escortData) {
      const escort = createShipModel(shipClass, { scale });
      escort.position.set(position[0], position[1], position[2]);
      escort.rotation.set(rotation[0], rotation[1], rotation[2]);
      this.menuEscorts.push(escort);
      this.menuRoot.add(escort);
    }

    this.menuHero.position.set(3.2, -3.4, -10.5);
    this.menuHero.rotation.set(0.16, -0.62, -0.2);
    this.menuRoot.add(this.menuHero);

    const heroLight = new THREE.PointLight(0x8ab8ff, 5.5, 70, 2.4);
    heroLight.position.set(5, -0.5, -2);
    this.menuRoot.add(heroLight);

    const ambient = new THREE.AmbientLight(0x4f617b, 1.2);
    const front = new THREE.DirectionalLight(0xe3eeff, 3.1);
    const fill = new THREE.DirectionalLight(0x79b8ff, 1.0);
    const rim = new THREE.PointLight(0x6cc4ff, 2.6, 220, 2);
    front.position.set(2, 12, -18);
    fill.position.set(-26, 18, 12);
    rim.position.set(18, 22, -80);
    this.scene.add(ambient, front, fill, rim);
  }

  private createMotionStars(): MotionStars {
    const geometry = new THREE.BufferGeometry();
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = this.randomRange(-55, 55);
      positions[index * 3 + 1] = this.randomRange(-32, 26);
      positions[index * 3 + 2] = this.randomRange(-420, 22);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xb7dcff,
      size: 0.34,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    return { points: new THREE.Points(geometry, material), geometry, positions };
  }

  private installEventListeners(): void {
    this.canvas.addEventListener('mousemove', this.onPointerMove);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('mousedown', this.onPointerDown);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('mouseup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    window.addEventListener('resize', this.onResize);
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      if (this.canvas.parentElement) {
        this.resizeObserver.observe(this.canvas.parentElement);
      }
      this.resizeObserver.observe(this.canvas);
    }
  }

  private removeEventListeners(): void {
    this.canvas.removeEventListener('mousemove', this.onPointerMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('mousedown', this.onPointerDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('mouseup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
  }

  private resize(): void {
    const width = Math.max(1, Math.floor(this.canvas.clientWidth || window.innerWidth || 1));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight || window.innerHeight || 1));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  private animate = (): void => {
    if (this.disposed) {
      return;
    }
    let dt = Math.min(0.05, this.clock.getDelta() || 0.016);
    if (this.slowMo > 0) {
      const progress = 1 - this.slowMo / this.slowMoDuration;
      this.slowMo = Math.max(0, this.slowMo - dt);
      dt *= 0.2 + 0.8 * progress * progress;
    }
    if (this.mode === 'playing') {
      this.updatePlaying(dt);
    } else if (this.mode === 'menu') {
      this.updateMenuScene(dt);
    } else if (this.mode === 'ended') {
      this.updateEndedScene(dt);
    } else {
      this.updatePausedScene();
    }

    if (this.highQuality) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    this.snapshotAccumulator += dt;
    if (this.snapshotAccumulator >= SNAPSHOT_INTERVAL) {
      this.emitSnapshot();
    }
    this.raf = requestAnimationFrame(this.animate);
  };

  private updateMenuScene(dt: number): void {
    const elapsed = performance.now() * 0.001;
    this.planet.rotation.y += dt * 0.03;
    this.planet.rotation.x = Math.sin(elapsed * 0.08) * 0.06;
    this.planetPivot.rotation.z = Math.sin(elapsed * 0.05) * 0.05;
    this.menuCarrier.position.y = 13.5 + Math.sin(elapsed * 0.35) * 0.6;
    this.menuCarrier.rotation.z = Math.sin(elapsed * 0.22) * 0.03;
    this.menuHero.position.y = -3.4 + Math.sin(elapsed * 1.1) * 0.4;
    this.menuHero.rotation.y = -0.62 + Math.sin(elapsed * 0.55) * 0.08;
    this.menuEscorts.forEach((escort, index) => {
      escort.position.y += Math.sin(elapsed * (0.42 + index * 0.16)) * 0.004;
      escort.rotation.z = Math.sin(elapsed * (0.26 + index * 0.08)) * 0.04;
    });
    this.updateMotionStars(dt, 9);
    this.updateBackdropAnchors();
    this.updateReticle();
    this.audio.setEngine(false, 0, false);
  }

  private updatePausedScene(): void {
    this.updateBackdropAnchors();
    this.updateReticle();
    this.audio.setEngine(false, 0, false);
  }

  private updateEndedScene(dt: number): void {
    this.planet.rotation.y += dt * 0.02;
    this.updateExplosions(dt);
    this.updateBlasts(dt);
    this.updateMotionStars(dt, Math.max(8, this.playerVelocity.length() * 0.35));
    this.syncCameraToPlayer(dt, false);
    this.updateBackdropAnchors();
    this.updateReticle();
    this.audio.setEngine(false, 0, false);
  }

  private updatePlaying(dt: number): void {
    const movementStats = this.getCurrentShipStats();
    this.spawnClock += dt;
    this.missionTime += dt;
    this.playerFireCooldown = Math.max(0, this.playerFireCooldown - dt);
    this.playerCollisionCooldown = Math.max(0, this.playerCollisionCooldown - dt);
    this.timeSincePlayerDamage += dt;
    this.lastKillTimer += dt;
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 2.2);
    this.wheelRollInput = THREE.MathUtils.lerp(this.wheelRollInput, 0, clamp(dt * 3.8, 0, 1));
    this.pickupMessageTimer = Math.max(0, this.pickupMessageTimer - dt);
    if (this.pickupMessageTimer <= EPSILON) {
      this.pickupMessage = undefined;
    }
    this.recoveryPocketCooldown = Math.max(0, this.recoveryPocketCooldown - dt);

    if (this.combo > 0 && this.lastKillTimer > COMBO_WINDOW) {
      this.combo = 0;
    }

    this.previousPlayerPosition.copy(this.playerRoot.position);
    this.refreshEnvironmentCollisionBounds();
    if (this.target && !this.resolveTarget()) {
      this.target = null;
      this.flashAssistMessage('TARGET DESTROYED');
    }
    this.updateAutopilot(dt);
    this.updatePlayerMovement(dt, movementStats);
    this.updateTorpedoes(dt);
    this.overchargeTimer = Math.max(0, this.overchargeTimer - dt);
    this.aegisPoints = Math.max(0, this.aegisPoints - AEGIS.decayPerSecond * dt);
    this.updateBlasts(dt);
    this.processSpawns();
    this.maintainAsteroidField();
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateAsteroids(dt);
    this.updateLasers(dt);
    this.updateExplosions(dt);
    this.updatePickups(dt);
    this.handleCombat();
    this.resolveBossOutcome(dt);
    if (this.mode !== 'playing') {
      return;
    }

    this.collectPickups();
    this.updateRecoveryState();
    if (this.recoveryActive) {
      this.spawnRecoveryPocket();
    }

    const stats = this.getCurrentShipStats();
    this.playerShield = regenerateShield(this.playerShield, stats.shield, this.timeSincePlayerDamage, dt);
    if (this.isBoosting() && this.energy > 0.1) {
      this.energy = Math.max(0, this.energy - BOOST_DRAIN_PER_SECOND * dt);
    } else {
      this.energy = regenerateEnergy(this.energy, dt);
    }

    if ((this.fireHeld || this.autoFire) && this.playerFireCooldown <= 0) {
      this.firePlayerWeapons(this.getCurrentShipStats());
    }

    this.updatePlayerShieldVisual(stats);
    this.syncCameraToPlayer(dt, false);
    this.updateBackdropAnchors();
    this.updateMotionStars(dt, Math.max(this.environmentSpeed * 0.5, this.playerVelocity.length()));
    this.updateReticle();
    this.audio.setEngine(true, Math.max(0.2, this.playerVelocity.length() / Math.max(1, stats.speed)), this.isBoosting() && this.energy > 0.1);
    this.message = this.buildPlayingMessage();
    this.advanceWaves(dt);
  }

  private isBoosting(): boolean {
    return this.boostHeld || this.autoBoost;
  }

  // ---------------------------------------------------------------- proton torpedoes

  private pickTorpedoTarget(): TargetRef | null {
    if (this.resolveTarget()) return this.target;
    const player = this.playerRoot.position;
    const forward = getBasisVectors(this.playerRoot.quaternion).forward;
    let best: TargetRef | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const entry of this.getTargetCandidates()) {
      if (!entry.hostile) continue;
      const offset = entry.position.clone().sub(player);
      const distance = offset.length();
      if (distance > 700) continue;
      const angle = Math.acos(clamp(forward.dot(offset.multiplyScalar(1 / Math.max(0.001, distance))), -1, 1));
      if (angle > 0.62) continue;
      const score = angle * 400 + distance * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = entry.ref;
      }
    }
    return best;
  }

  /** Fires a homing proton torpedo at the locked target, or the hostile best lined up with the nose. */
  fireTorpedo(): void {
    if (this.mode !== 'playing') return;
    const stats = this.getCurrentShipStats();
    if (stats.torpedoes <= 0) {
      this.flashAssistMessage('THIS CRAFT CARRIES NO TORPEDOES');
      return;
    }
    if (this.torpedoes <= 0) {
      this.flashAssistMessage('TORPEDO MAGAZINE EMPTY');
      return;
    }
    if (this.torpedoCooldown > 0) return;
    this.torpedoes -= 1;
    this.torpedoCooldown = TORPEDO.cooldown;
    this.shotsFired += 1;
    const basis = getBasisVectors(this.playerRoot.quaternion);
    const origin = this.localOffsetToWorld(this.playerRoot.position, this.playerRoot.quaternion, new THREE.Vector3(0, -this.playerRadius * 0.18, -this.playerMuzzleDistance - 1.2));
    const attackMultiplier = stats.damage / Math.max(1, SHIPS[this.ship].damage);
    const object = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xdfe8f2, emissive: 0x7fe9ff, emissiveIntensity: 1.4, roughness: 0.25, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.7, 4, 10), bodyMaterial);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.getBlastTextures().fire, color: 0x7fe9ff, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(3.4);
    glow.position.y = -1.3;
    object.add(body, glow);
    object.position.copy(origin);
    object.quaternion.setFromUnitVectors(LASER_UP_VECTOR, basis.forward);
    this.laserLayer.add(object);
    const velocity = basis.forward.clone().multiplyScalar(TORPEDO.launchSpeed).addScaledVector(this.playerVelocity, 0.4);
    this.torpedoList.push({
      id: ++this.torpedoId,
      object,
      velocity,
      previousPosition: origin.clone(),
      target: this.pickTorpedoTarget(),
      age: 0,
      trailTimer: 0,
      damage: TORPEDO.damage * attackMultiplier * (this.overchargeTimer > 0 ? OVERCHARGE.damageMultiplier : 1),
    });
    this.spawnSpark(origin, 0xbff6ff, 2.2);
    this.audio.playLaser(false, 70);
    this.audio.playImpact(true, 40);
    this.emitSnapshot(true);
  }

  private updateTorpedoes(dt: number): void {
    this.torpedoCooldown = Math.max(0, this.torpedoCooldown - dt);
    for (const torpedo of [...this.torpedoList]) {
      torpedo.age += dt;
      torpedo.previousPosition.copy(torpedo.object.position);
      let resolved = torpedo.target ? this.resolveTarget(torpedo.target) : null;
      if (!resolved && torpedo.age > 0.35 && torpedo.age < 1.6) {
        torpedo.target = this.pickTorpedoTarget();
        resolved = torpedo.target ? this.resolveTarget(torpedo.target) : null;
      }
      const speed = Math.min(TORPEDO.speed, TORPEDO.launchSpeed + (TORPEDO.speed - TORPEDO.launchSpeed) * (torpedo.age / 0.9));
      const heading = torpedo.velocity.clone().normalize();
      if (resolved && torpedo.age > 0.18) {
        const aim = solveInterceptCourse(torpedo.object.position, resolved.position, resolved.velocity, Math.max(40, speed)).aimPoint;
        const desired = aim.clone().sub(torpedo.object.position).normalize();
        const angle = Math.acos(clamp(heading.dot(desired), -1, 1));
        const turn = Math.min(angle, TORPEDO.turnRate * dt * (1 + torpedo.age * 0.4));
        if (angle > 1e-4) {
          const axis = new THREE.Vector3().crossVectors(heading, desired);
          if (axis.lengthSq() > 1e-9) heading.applyAxisAngle(axis.normalize(), turn);
        }
      }
      torpedo.velocity.copy(heading.multiplyScalar(speed));
      torpedo.object.position.addScaledVector(torpedo.velocity, dt);
      torpedo.object.quaternion.setFromUnitVectors(LASER_UP_VECTOR, torpedo.velocity.clone().normalize());
      torpedo.trailTimer -= dt;
      if (torpedo.trailTimer <= 0) {
        torpedo.trailTimer = 0.035;
        this.spawnSpark(torpedo.object.position.clone().addScaledVector(torpedo.velocity.clone().normalize(), -1.4), 0x6fe3ff, 0.9);
      }
      const hit = this.findTorpedoImpact(torpedo);
      if (hit) {
        this.detonateTorpedo(torpedo, hit.position, hit.kind, hit.id);
      } else if (torpedo.age > TORPEDO.life || torpedo.object.position.distanceTo(this.playerRoot.position) > 1500) {
        this.spawnBlast(torpedo.object.position, { radius: 3, power: 0.8, cause: 'weapon' });
        this.removeTorpedo(torpedo);
      }
    }
  }

  private removeTorpedo(torpedo: TorpedoEntity): void {
    this.torpedoList = this.torpedoList.filter((candidate) => candidate.id !== torpedo.id);
    disposeObject3D(torpedo.object);
  }

  private findTorpedoImpact(torpedo: TorpedoEntity): { position: THREE.Vector3; kind: 'enemy' | 'asteroid' | 'subsystem' | 'hull'; id: string | number } | null {
    const from = torpedo.previousPosition;
    const to = torpedo.object.position;
    let best: { position: THREE.Vector3; kind: 'enemy' | 'asteroid' | 'subsystem' | 'hull'; id: string | number } | null = null;
    let bestTime = Number.POSITIVE_INFINITY;
    const consider = (center: THREE.Vector3, radius: number, kind: 'enemy' | 'asteroid' | 'subsystem' | 'hull', id: string | number) => {
      const time = segmentSphereIntersection(from, to, center, radius + 0.9);
      if (time !== null && time < bestTime) {
        bestTime = time;
        best = { position: from.clone().lerp(to, clamp(time, 0, 1)), kind, id };
      }
    };
    for (const enemy of this.enemies) consider(enemy.object.position, enemy.radius, 'enemy', enemy.id);
    for (const asteroid of this.asteroids) consider(asteroid.object.position, asteroid.radius, 'asteroid', asteroid.id);
    const boss = this.boss;
    if (boss && !boss.defeated) {
      const scale = this.gameplayCarrier.scale.x;
      for (const sub of boss.subsystems) if (!sub.destroyed) consider(sub.worldCenter, sub.radius * scale * 0.9, 'subsystem', sub.id);
      consider(this.gameplayCarrier.position, 6 * scale, 'hull', 'hull');
    }
    return best;
  }

  private detonateTorpedo(torpedo: TorpedoEntity, position: THREE.Vector3, kind: 'enemy' | 'asteroid' | 'subsystem' | 'hull', id: string | number): void {
    this.removeTorpedo(torpedo);
    this.shotsHit += 1;
    const damage = torpedo.damage;
    this.spawnBlast(position, { radius: 6, power: 2.2, cause: 'weapon' });
    this.cameraShake = Math.min(1.5, this.cameraShake + 0.25);
    for (const enemy of [...this.enemies]) {
      const distance = enemy.object.position.distanceTo(position);
      if (kind === 'enemy' && enemy.id === id) {
        this.damageEnemy(enemy, damage);
      } else if (distance < TORPEDO.splashRadius + enemy.radius) {
        this.damageEnemy(enemy, damage * TORPEDO.splashFalloff * (1 - distance / (TORPEDO.splashRadius + enemy.radius) * 0.6));
      }
    }
    for (const asteroid of [...this.asteroids]) {
      const distance = asteroid.object.position.distanceTo(position);
      if (kind === 'asteroid' && asteroid.id === id) this.damageAsteroid(asteroid, damage, true);
      else if (distance < TORPEDO.splashRadius + asteroid.radius) this.damageAsteroid(asteroid, damage * TORPEDO.splashFalloff, true);
    }
    const boss = this.boss;
    if (boss && !boss.defeated) {
      if (kind === 'subsystem') {
        const sub = boss.subsystems.find((candidate) => candidate.id === id);
        if (sub && !sub.destroyed) {
          const shielded = sub.type === 'bridge' && !canDamageBridge(boss);
          if (shielded) this.bossShieldFlash = 1;
          const result = damageBossSubsystem(boss, sub.id, damage * TORPEDO.bossSubsystemMultiplier);
          if (result.destroyed) this.onBossSubsystemDestroyed(sub);
        }
      } else if (kind === 'hull') {
        damageBossHullDirect(boss, damage * BOSS_TUNING.hullHitMultiplier);
        if (boss.shield > 0) this.bossShieldFlash = 1;
      }
    }
  }

  // ---------------------------------------------------------------- targeting

  private resolveTarget(ref: TargetRef | null = this.target): ResolvedTarget | null {
    if (!ref) return null;
    if (ref.kind === 'enemy') {
      const enemy = this.enemies.find((candidate) => candidate.id === ref.id);
      if (!enemy) return null;
      return {
        ref,
        position: enemy.object.position,
        velocity: enemy.velocity,
        radius: enemy.radius,
        name: enemy.stats.name.toUpperCase(),
        detail: isCombatShip(enemy.shipClass) ? enemy.mode.toUpperCase().replace('-', ' ') : 'NON-COMBAT · BONUS',
        hostile: isCombatShip(enemy.shipClass),
        heavy: enemy.shipClass === 'bomber' || enemy.shipClass === 'destroyer',
        hullPct: Math.max(0, Math.min(100, (enemy.hull / Math.max(1, enemy.stats.hull)) * 100)),
        shieldPct: Math.max(0, Math.min(100, (enemy.shield / Math.max(1, enemy.stats.shield)) * 100)),
      };
    }
    const boss = this.boss;
    if (!boss || boss.defeated) return null;
    const player = this.playerRoot.position;
    const objective = pickBossObjective(boss.subsystems.map((sub) => ({ id: sub.id, type: sub.type, destroyed: sub.destroyed, distance: sub.worldCenter.distanceTo(player), sub })));
    return {
      ref,
      position: objective ? objective.sub.worldCenter : this.gameplayCarrier.position,
      velocity: new THREE.Vector3(),
      radius: objective ? objective.sub.radius * this.gameplayCarrier.scale.x * 0.85 : 14 * this.gameplayCarrier.scale.x,
      name: boss.name.toUpperCase(),
      detail: objective ? objective.sub.name.toUpperCase() : 'CAPITAL SHIP',
      hostile: true,
      heavy: true,
      hullPct: (boss.hull / boss.maxHull) * 100,
      shieldPct: (boss.shield / boss.maxShield) * 100,
    };
  }

  private getTargetCandidates(): Array<{ ref: TargetRef; position: THREE.Vector3; distance: number; hostile: boolean }> {
    const player = this.playerRoot.position;
    const list: Array<{ ref: TargetRef; position: THREE.Vector3; distance: number; hostile: boolean }> = this.enemies.map((enemy) => ({
      ref: { kind: 'enemy', id: enemy.id },
      position: enemy.object.position,
      distance: enemy.object.position.distanceTo(player),
      hostile: isCombatShip(enemy.shipClass),
    }));
    if (this.boss && !this.boss.defeated) {
      list.push({ ref: { kind: 'boss' }, position: this.gameplayCarrier.position, distance: this.gameplayCarrier.position.distanceTo(player), hostile: true });
    }
    return list.sort((a, b) => Number(b.hostile) - Number(a.hostile) || a.distance - b.distance);
  }

  private sameTarget(a: TargetRef | null, b: TargetRef | null): boolean {
    if (!a || !b) return false;
    return a.kind === b.kind && (a.kind === 'boss' || (b.kind === 'enemy' && a.id === b.id));
  }

  /** First press locks the hostile closest to your nose (or the nearest one); later presses cycle outward. */
  cycleTarget(step = 1): void {
    if (this.mode !== 'playing') return;
    const list = this.getTargetCandidates();
    if (list.length === 0) {
      this.target = null;
      this.flashAssistMessage('NO CONTACTS TO TARGET');
      return;
    }
    const currentIndex = list.findIndex((entry) => this.sameTarget(entry.ref, this.target));
    if (currentIndex === -1) {
      const forward = getBasisVectors(this.playerRoot.quaternion).forward;
      let best = list[0];
      let bestScore = Number.POSITIVE_INFINITY;
      for (const entry of list) {
        const direction = entry.position.clone().sub(this.playerRoot.position).normalize();
        const angle = Math.acos(clamp(forward.dot(direction), -1, 1));
        const score = (entry.hostile ? 0 : 5) + (angle < 0.5 ? angle : 2 + angle) + entry.distance * 0.0006;
        if (score < bestScore) {
          bestScore = score;
          best = entry;
        }
      }
      this.target = best.ref;
    } else {
      this.target = list[(currentIndex + step + list.length) % list.length].ref;
    }
    const resolved = this.resolveTarget();
    this.flashAssistMessage(resolved ? `TARGET LOCKED · ${resolved.name}` : 'TARGET LOST');
  }

  clearTarget(): void {
    if (this.target) this.flashAssistMessage('TARGET CLEARED');
    this.target = null;
  }

  /** Radar click: lock the given contact. */
  setTarget(kind: 'enemy' | 'boss', id = 0): void {
    if (this.mode !== 'playing') return;
    const ref: TargetRef = kind === 'boss' ? { kind: 'boss' } : { kind: 'enemy', id };
    if (!this.resolveTarget(ref)) return;
    this.target = ref;
    this.flashAssistMessage(`TARGET LOCKED · ${this.resolveTarget()?.name ?? ''}`);
  }

  private flashAssistMessage(text: string): void {
    this.pickupMessage = text;
    this.pickupMessageTimer = 2.2;
    this.emitSnapshot(true);
  }

  /** Per-frame HUD guidance for the locked target: screen marker, off-screen arrow, lead pip and turn instructions. */
  getTargetGuidance(): TargetGuidance | null {
    const resolved = this.resolveTarget();
    if (!resolved || this.mode !== 'playing') return null;
    const player = this.playerRoot.position;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || this.canvas.clientWidth || 1;
    const height = rect.height || this.canvas.clientHeight || 1;
    const toTarget = resolved.position.clone().sub(player);
    const distance = Math.max(0.001, toTarget.length());
    const direction = toTarget.clone().multiplyScalar(1 / distance);
    const project = (point: THREE.Vector3) => {
      const cameraSpace = point.clone().applyMatrix4(this.camera.matrixWorldInverse);
      const ndc = point.clone().project(this.camera);
      const behind = cameraSpace.z > 0;
      return { behind, cameraSpace, x: (ndc.x * 0.5 + 0.5) * width, y: (-ndc.y * 0.5 + 0.5) * height, ndcX: ndc.x, ndcY: ndc.y };
    };
    this.camera.updateMatrixWorld();
    const screen = project(resolved.position);
    const onScreen = !screen.behind && Math.abs(screen.ndcX) <= 0.94 && Math.abs(screen.ndcY) <= 0.92;
    const edgeAngle = Math.atan2(screen.cameraSpace.y, screen.cameraSpace.x);
    const cameraDistance = Math.max(1, resolved.position.distanceTo(this.camera.position));
    const pxPerUnit = height / 2 / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * cameraDistance);
    const profile = FLIGHT_PROFILES[this.ship];
    let lead: TargetGuidance['lead'] = null;
    if (onScreen && resolved.hostile) {
      const relative = resolved.velocity.clone().sub(this.playerVelocity.clone().multiplyScalar(0.32));
      const solution = solveInterceptCourse(player, resolved.position, relative, profile.projectileSpeed);
      const projected = project(solution.aimPoint);
      if (!projected.behind) lead = { x: projected.x, y: projected.y };
    }
    const local = direction.clone().applyQuaternion(this.playerRoot.quaternion.clone().invert());
    const bearing = bearingDegrees(local);
    return {
      kind: resolved.ref.kind,
      name: resolved.name,
      detail: resolved.detail,
      hostile: resolved.hostile,
      distance,
      closing: this.playerVelocity.clone().sub(resolved.velocity).dot(direction),
      hullPct: resolved.hullPct,
      shieldPct: resolved.shieldPct,
      onScreen,
      x: screen.x,
      y: screen.y,
      boxPx: clamp(resolved.radius * 2 * pxPerUnit * 1.35, 36, 240),
      edgeAngle,
      lead,
      instruction: describeBearing(bearing.yaw, bearing.pitch),
      yawDeg: bearing.yaw,
      pitchDeg: bearing.pitch,
    };
  }

  // ---------------------------------------------------------------- autopilot / autocombat

  setAutoMode(mode: AutoMode, reason?: string): void {
    if (this.mode !== 'playing' && mode !== 'off') return;
    const previous = this.autoMode;
    this.autoMode = mode;
    this.autoInput.yaw = 0;
    this.autoInput.pitch = 0;
    this.autoInput.roll = 0;
    this.autoFire = false;
    this.autoBoost = false;
    this.pilotRetreating = false;
    this.pilotBreakTimer = 0;
    this.pilotTargetId = null;
    this.manualMouseTravel = 0;
    this.autoStatus = '';
    if (previous !== mode && this.mode === 'playing') {
      this.flashAssistMessage(
        mode === 'off' ? reason ?? 'MANUAL CONTROL' : mode === 'autopilot' ? 'AUTOPILOT ENGAGED' : 'AUTOCOMBAT ENGAGED',
      );
    }
    this.emitSnapshot(true);
  }

  toggleAutoMode(mode: Exclude<AutoMode, 'off'>): void {
    this.setAutoMode(this.autoMode === mode ? 'off' : mode, 'MANUAL CONTROL');
  }

  getAutoMode(): AutoMode {
    return this.autoMode;
  }

  private chooseSupplyObjective(): PilotObjective | null {
    const stats = this.getCurrentShipStats();
    let best: PickupEntity | null = null;
    let bestDistance = 700;
    for (const pickup of this.pickups) {
      const useful =
        pickup.type === 'energy' ? this.energy < MAX_ENERGY * 0.85
        : pickup.type === 'shield' ? this.playerShield < stats.shield * 0.9
        : pickup.type === 'hull' ? this.playerHull < stats.hull * 0.9
        : pickup.type === 'torpedo' ? stats.torpedoes > 0 && this.torpedoes < stats.torpedoes
        : pickup.type === 'overcharge' ? this.overchargeTimer < 4
        : pickup.type === 'aegis' ? this.aegisPoints < 30
        : isUpgradePickup(pickup.type) && this.getAvailableUpgradePickupTypes().includes(pickup.type as UpgradePickupType);
      if (!useful) continue;
      const distance = pickup.object.position.distanceTo(this.playerRoot.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = pickup;
      }
    }
    if (!best) return null;
    return { kind: 'supply', position: best.object.position, velocity: new THREE.Vector3(), radius: best.radius, label: PICKUP_LABELS_SHORT[best.type], hostile: false, heavy: false, standoff: 0 };
  }

  private buildPilotObjective(): PilotObjective | null {
    const player = this.playerRoot.position;
    const combat = this.autoMode === 'combat';
    const toObjective = (resolved: ResolvedTarget, kind: PilotObjective['kind']): PilotObjective => ({
      kind,
      position: resolved.position,
      velocity: resolved.velocity,
      radius: resolved.radius,
      label: resolved.ref.kind === 'boss' ? `${resolved.name} · ${resolved.detail}` : resolved.name,
      hostile: resolved.hostile,
      heavy: resolved.heavy,
      standoff: resolved.ref.kind === 'boss' ? 62 : 0,
    });

    if (combat && this.pilotRetreating) {
      const supply = this.chooseSupplyObjective();
      if (supply) return supply;
      const threats = this.enemies.filter((enemy) => isCombatShip(enemy.shipClass));
      const centroid = new THREE.Vector3();
      threats.forEach((enemy) => centroid.add(enemy.object.position));
      if (this.boss && !this.boss.defeated) centroid.add(this.gameplayCarrier.position);
      const count = threats.length + (this.boss && !this.boss.defeated ? 1 : 0);
      if (count > 0) {
        centroid.multiplyScalar(1 / count);
        const away = player.clone().sub(centroid).normalize();
        return { kind: 'flee', position: player.clone().addScaledVector(away, 500), velocity: new THREE.Vector3(), radius: 0, label: 'OPEN SPACE', hostile: false, heavy: false, standoff: 0 };
      }
    }

    const manual = this.resolveTarget();
    if (manual) return toObjective(manual, 'target');

    const forward = getBasisVectors(this.playerRoot.quaternion).forward;
    // Prefer ships that need little turning: angle off the nose weighs about as much as range.
    const nearestEnemy = (predicate: (enemy: EnemyEntity) => boolean, limit: number): EnemyEntity | null => {
      let best: EnemyEntity | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const enemy of this.enemies) {
        if (!predicate(enemy)) continue;
        const offset = enemy.object.position.clone().sub(player);
        const distance = offset.length();
        if (distance > limit) continue;
        const angleDeg = THREE.MathUtils.radToDeg(Math.acos(clamp(forward.dot(offset.multiplyScalar(1 / Math.max(0.001, distance))), -1, 1)));
        const score = distance * 0.35 + angleDeg * 1.3;
        if (score < bestScore) {
          bestScore = score;
          best = enemy;
        }
      }
      return best;
    };
    const bossAlive = this.boss && !this.boss.defeated;
    // Keep a chosen hostile for a moment instead of flipping between equidistant ships.
    if (this.pilotTargetId !== null && this.pilotTargetHold > 0) {
      const held = this.enemies.find((enemy) => enemy.id === this.pilotTargetId);
      if (held) return toObjective(this.resolveTarget({ kind: 'enemy', id: held.id })!, 'hostile');
    }
    const escort = nearestEnemy((enemy) => isCombatShip(enemy.shipClass), bossAlive ? 150 : 900);
    if (escort) {
      this.pilotTargetId = escort.id;
      this.pilotTargetHold = 0.9;
      return toObjective(this.resolveTarget({ kind: 'enemy', id: escort.id })!, 'hostile');
    }
    if (bossAlive) {
      const resolved = this.resolveTarget({ kind: 'boss' });
      if (resolved) return toObjective(resolved, 'boss');
    }
    const supply = this.chooseSupplyObjective();
    if (combat) {
      const bonus = nearestEnemy((enemy) => !isCombatShip(enemy.shipClass), 320);
      if (bonus) return toObjective(this.resolveTarget({ kind: 'enemy', id: bonus.id })!, 'hostile');
      if (supply) return supply;
    } else if (supply) {
      return supply;
    }
    if (player.distanceTo(this.waveAnchor) > 260) {
      return { kind: 'anchor', position: this.waveAnchor, velocity: new THREE.Vector3(), radius: 0, label: 'BATTLE ZONE', hostile: false, heavy: false, standoff: 0 };
    }
    return null;
  }

  /** Evasion vector from every body whose predicted path intersects ours; the more imminent, the stronger. */
  private computeEvasion(): THREE.Vector3 {
    const total = new THREE.Vector3();
    const player = this.playerRoot.position;
    const velocity = this.playerVelocity;
    const zero = new THREE.Vector3();
    const consider = (center: THREE.Vector3, otherVelocity: THREE.Vector3, radius: number, horizon: number) => {
      const threat = predictCollision(player, velocity, center, otherVelocity, radius + this.playerRadius, horizon);
      if (threat.urgency > 0) total.addScaledVector(threat.escape, 0.6 + threat.urgency * 3);
    };
    for (const asteroid of this.asteroids) consider(asteroid.object.position, asteroid.velocity, asteroid.radius, 1.6);
    for (const enemy of this.enemies) consider(enemy.object.position, enemy.velocity, enemy.radius, 1.1);
    consider(this.planetCollisionSphere.center, zero, this.planetCollisionSphere.radius, 2.2);
    const carrierSphere = this.carrierCollisionBounds.getBoundingSphere(new THREE.Sphere());
    consider(carrierSphere.center.clone().applyMatrix4(this.gameplayCarrier.matrixWorld), zero, carrierSphere.radius * this.gameplayCarrier.scale.x * 0.92, 1.5);
    return total;
  }

  private updateAutopilot(dt: number): void {
    if (this.autoMode === 'off') {
      this.autoFire = false;
      this.autoBoost = false;
      return;
    }
    const combat = this.autoMode === 'combat';
    const stats = this.getCurrentShipStats();
    const profile = FLIGHT_PROFILES[this.ship];
    const player = this.playerRoot.position;
    const basis = getBasisVectors(this.playerRoot.quaternion);
    this.manualMouseTravel = Math.max(0, this.manualMouseTravel - dt * 500);
    this.pilotTargetHold = Math.max(0, this.pilotTargetHold - dt);
    this.pilotBreakTimer = Math.max(0, this.pilotBreakTimer - dt);
    this.pilotJinkTimer -= dt;
    if (this.pilotJinkTimer <= 0) {
      this.pilotJinkTimer = this.randomRange(0.5, 1.3);
      this.pilotJink.set(this.randomRange(-1, 1), this.randomRange(-1, 1));
    }
    const ratio = (this.playerHull + this.playerShield) / Math.max(1, stats.hull + stats.shield);
    this.pilotRetreating = combat && this.damageEnabled ? nextRetreatState(ratio, this.pilotRetreating) : false;

    const objective = this.buildPilotObjective();
    let steer: THREE.Vector3 | null = null;
    let fire = false;
    let boostWanted = false;
    let status = combat ? 'NO HOSTILES · HOLDING POSITION' : 'NO CONTACTS · HOLDING COURSE';

    if (objective) {
      const toObjective = objective.position.clone().sub(player);
      const distance = Math.max(0.01, toObjective.length());
      const direct = toObjective.clone().multiplyScalar(1 / distance);
      const kmText = `${Math.round(distance)} KM`;
      let aim = direct.clone();
      if (objective.hostile && combat) {
        const relative = objective.velocity.clone().sub(this.playerVelocity.clone().multiplyScalar(0.32));
        aim = solveInterceptCourse(player, objective.position, relative, profile.projectileSpeed).direction.clone();
      }
      const closing = basis.forward.dot(direct) > 0.25;
      if (objective.standoff > 0 && distance < objective.standoff && closing && this.pilotBreakTimer <= 0 && objective.kind !== 'supply') {
        this.pilotBreakTimer = objective.kind === 'boss' ? this.randomRange(1.2, 1.9) : this.randomRange(0.45, 0.8);
        this.pilotBreakSign = this.random() < 0.5 ? -1 : 1;
      }
      if (this.pilotBreakTimer > 0 && objective.kind !== 'supply') {
        steer = breakoutDirection(toObjective, this.pilotBreakSign, 0.35);
        status = `BREAKING OFF · ${objective.label}`;
        boostWanted = false;
      } else {
        steer = aim.clone();
        if (combat && objective.hostile) {
          // Weave while closing from range, then track cleanly for the shot.
          const amplitude = objective.kind === 'boss' ? 0.1 : distance > 190 ? 0.2 : 0;
          steer.addScaledVector(basis.right, this.pilotJink.x * amplitude).addScaledVector(basis.up, this.pilotJink.y * amplitude).normalize();
        }
        const verb = objective.kind === 'supply' ? 'COLLECTING' : objective.kind === 'flee' ? 'RETREATING' : objective.kind === 'anchor' ? 'RETURNING TO' : combat && objective.hostile ? 'ENGAGING' : 'TRACKING';
        status = `${this.pilotRetreating ? 'RETREATING · ' : ''}${verb} ${objective.label}${objective.kind === 'flee' ? '' : ` · ${kmText}`}`;
        boostWanted = distance > 230 || (this.pilotRetreating && objective.kind === 'flee');
        if (combat && objective.hostile) {
          const cone = clamp(Math.atan2(Math.max(1, objective.radius) * 0.9, distance) + 0.035, 0.045, 0.13);
          const alignment = Math.acos(clamp(basis.forward.dot(aim), -1, 1));
          fire = alignment < cone && distance < profile.projectileRange * 0.85;
        }
      }
      if (combat && !fire) {
        // Opportunistic shots at anything already lined up in front of the guns.
        for (const enemy of this.enemies) {
          const toEnemy = enemy.object.position.clone().sub(player);
          const range = toEnemy.length();
          if (range < profile.projectileRange * 0.7 && basis.forward.dot(toEnemy.multiplyScalar(1 / range)) > Math.cos(0.05 + enemy.radius / Math.max(40, range))) {
            fire = true;
            break;
          }
        }
      }
    }

    if (steer) {
      if (this.collisionsEnabled) {
        const evasion = this.computeEvasion();
        if (evasion.lengthSq() > 1e-4) {
          // A real collision course overrides the attack: weight evasion above the aim direction.
          steer = steer.clone().multiplyScalar(0.35).add(evasion.multiplyScalar(1.4)).normalize();
          if (this.autoMode === 'combat') status = `EVADING · ${status}`;
        }
      }
      const local = steer.clone().applyQuaternion(this.playerRoot.quaternion.clone().invert());
      const input = steeringInputs(local);
      this.autoInput.yaw = input.yaw;
      this.autoInput.pitch = input.pitch;
      // Level the wings once the turn is mostly done so the view stays readable.
      this.autoInput.roll = rollLevelInput(basis.right) * (Math.abs(input.yaw) < 0.6 && Math.abs(input.pitch) < 0.6 ? 1 : 0.35);
    } else {
      this.autoInput.yaw = 0;
      this.autoInput.pitch = 0;
      this.autoInput.roll = rollLevelInput(basis.right);
    }

    if (boostWanted && this.energy > 55) this.autoBoost = true;
    if (!boostWanted || this.energy < 14) this.autoBoost = false;
    this.autoFire = fire;
    this.autoStatus = status;
    if (combat && objective && objective.hostile && this.torpedoes > 0 && this.torpedoCooldown <= 0 && (objective.heavy || objective.kind === 'target' || objective.kind === 'boss')) {
      const toTarget = objective.position.clone().sub(player);
      const range = toTarget.length();
      const aligned = Math.acos(clamp(basis.forward.dot(toTarget.multiplyScalar(1 / Math.max(0.001, range))), -1, 1));
      if (range > 70 && range < 380 && aligned < 0.11) this.fireTorpedo();
    }
  }

  private updatePlayerMovement(dt: number, stats: ShipDefinition): void {
    const profile = FLIGHT_PROFILES[this.ship];
    if (this.autoMode !== 'off') {
      this.playerRoot.quaternion.copy(
        applyOrientationInput(this.playerRoot.quaternion, { yaw: this.autoInput.yaw, pitch: this.autoInput.pitch, roll: this.autoInput.roll }, profile, dt),
      );
      this.moveAfterSteering(dt, profile, stats);
      return;
    }
    const captured = this.isMouseCaptureActive();
    const cursorGain = clamp(this.mouseSensitivity * UNLOCKED_CURSOR_GAIN_PER_X, 0.5, 8);
    const pointerTarget = captured
      ? this.capturedPointerTarget
      : this.scratchPointer.set(clamp(this.unlockedPointerTarget.x * cursorGain, -1, 1), clamp(this.unlockedPointerTarget.y * cursorGain, -1, 1));
    const mouseYaw = Math.abs(pointerTarget.x) < 0.025 ? 0 : pointerTarget.x;
    const mousePitch = Math.abs(pointerTarget.y) < 0.025 ? 0 : pointerTarget.y;
    const yawInput = clamp(mouseYaw + this.yawAxis * 0.55, -1, 1);
    const pitchInput = clamp(mousePitch + this.pitchAxis * 0.55, -1, 1);
    const rollInput = clamp(this.rollAxis + this.wheelRollInput, -1, 1);
    this.playerRoot.quaternion.copy(
      applyOrientationInput(this.playerRoot.quaternion, { yaw: yawInput, pitch: pitchInput, roll: rollInput }, profile, dt),
    );

    this.moveAfterSteering(dt, profile, stats);
  }

  private moveAfterSteering(dt: number, profile: FlightProfile, stats: ShipDefinition): void {
    this.currentSpeed = getForwardSpeed(stats.speed, this.isBoosting(), this.energy);
    const motion = integrateFlightMotion(
      this.playerRoot.position,
      this.playerVelocity,
      this.playerRoot.quaternion,
      this.currentSpeed,
      dt,
      {
        acceleration: profile.acceleration,
        driftDamping: profile.driftDamping,
        softBoundaryRadius: WORLD_SOFT_RADIUS,
        hardBoundaryRadius: WORLD_HARD_RADIUS,
        boundaryGuidance: WORLD_BOUNDARY_GUIDANCE,
      },
    );
    this.playerRoot.position.copy(motion.position);
    this.playerVelocity.copy(motion.velocity);
    this.currentBoundaryLoad = motion.boundaryFactor;
    if (this.isMouseCaptureActive()) {
      this.capturedPointerTarget.multiplyScalar(Math.max(0, 1 - dt * 6.5));
    }
    if (this.collisionsEnabled) {
      this.resolvePlayerEnvironmentCollision();
    }
  }

  private processSpawns(): void {
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].delay <= this.spawnClock) {
      const next = this.spawnQueue[0];
      if (next.type === 'enemy' && next.shipClass && isCombatShip(next.shipClass)) {
        const alive = this.enemies.filter((enemy) => isCombatShip(enemy.shipClass)).length;
        const bossFight = !!this.boss && !this.boss.defeated;
        if (bossFight ? !canSpawnBossEscort(alive, this.difficulty) : alive >= getMaxConcurrentCombat(this.wave, this.difficulty)) {
          return;
        }
      }
      const spawn = this.spawnQueue.shift();
      if (!spawn) {
        return;
      }
      if (spawn.type === 'enemy' && spawn.shipClass) {
        this.spawnEnemy(spawn.shipClass);
      } else if (spawn.type === 'asteroid') {
        this.spawnAsteroid(spawn.radius ?? 1.5, spawn.speed ?? 18);
      }
    }
  }

  private spawnEnemy(shipClass: ShipClass): void {
    const baseStats = SHIPS[shipClass];
    const stats = isCombatShip(shipClass) ? { ...baseStats, hull: Math.round(baseStats.hull * this.encounterScaling.durability), shield: Math.round(baseStats.shield * this.encounterScaling.durability), damage: baseStats.damage * this.encounterScaling.damage } : baseStats;
    const profile = FLIGHT_PROFILES[shipClass];
    const pursuit = getDifficultyAdjustedEnemyPursuitProfile(shipClass, this.difficulty);
    const difficultyTuning = getDifficultyTuning(this.difficulty);
    const object = createShipModel(shipClass, { accent: 0xff708c, tint: 0x71788a, scale: SHIP_MODEL_SCALE[shipClass] });
    const bounds = new THREE.Box3().setFromObject(object);
    const collisionRadius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    const shieldShell = createShieldShell(collisionRadius, 0x7fe4ff);
    const spawnPosition = this.getSpawnPointAroundAnchor(this.waveAnchor, this.waveSpawnOrientation, this.randomRange(135, 220));
    shieldShell.visible = this.collisionBoundsVisible;
    if (shieldShell.material instanceof THREE.MeshBasicMaterial) {
      shieldShell.material.color.setHex(0x7fe4ff);
      shieldShell.material.opacity = this.collisionBoundsVisible ? DEBUG_COLLISION_OPACITY : 0;
    }
    object.add(shieldShell);
    object.position.copy(spawnPosition);
    object.quaternion.copy(this.lookQuaternion(spawnPosition, this.waveAnchor));
    this.enemyLayer.add(object);

    const muzzleDistance = Math.max(collisionRadius * 0.7, -bounds.min.z);
    const forward = getBasisVectors(object.quaternion).forward;
    const cruiseSpeed = stats.speed * difficultyTuning.enemySpeedMultiplier * pursuit.patrolSpeedMultiplier + this.wave * 0.45;
    const patrolOrigin = spawnPosition.clone();
    this.enemies.push({
      id: ++this.enemyId,
      object,
      shieldShell,
      shipClass,
      stats,
      profile,
      pursuit,
      radius: collisionRadius,
      muzzleDistance,
      hull: stats.hull,
      shield: stats.shield,
      mass: stats.mass,
      armor: stats.armor,
      velocity: forward.multiplyScalar(cruiseSpeed),
      patrolOrigin,
      fireCooldown: this.randomRange(0.9, 1.8),
      collisionCooldown: 0,
      hitFlash: 0,
      strafeSign: this.random() < 0.5 ? -1 : 1,
      verticalBias: this.randomRange(-1, 1),
      behaviorTimer: this.randomRange(1.2, 2.8),
      despawnTimer: 0,
      spawnAge: 0,
      mode: pursuit.combat ? 'attack' : 'flee',
    });
  }

  private spawnAsteroid(radius: number, speed: number): void {
    const object = createAsteroid(radius, (++this.asteroidId * 19) ^ this.randomState);
    this.asteroidLayer.add(object);

    const asteroid: AsteroidEntity = {
      id: this.asteroidId,
      object,
      radius,
      hull: 28 + radius * 58,
      shield: 0,
      mass: 12 + radius * radius * 11,
      armor: clamp(0.08 + radius * 0.06, 0.08, 0.4),
      speed: speed + radius * 1.8,
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      collisionCooldown: 0,
      hitFlash: 0,
    };
    this.seedAsteroidMotion(asteroid);
    this.asteroids.push(asteroid);
  }

  private maintainAsteroidField(): void {
    const pendingAsteroids = this.spawnQueue.filter((spawn) => spawn.type === 'asteroid').length;
    while (this.asteroids.length + pendingAsteroids < this.targetAsteroidCount) {
      this.spawnAsteroid(this.randomRange(1.1, 3.2), this.environmentSpeed * 0.45 + this.randomRange(7, 15));
    }
  }

  private seedAsteroidMotion(asteroid: AsteroidEntity): void {
    const spawnPosition = this.getSpawnPointAroundAnchor(this.waveAnchor, this.waveSpawnOrientation, this.randomRange(125, 235));
    asteroid.object.position.copy(spawnPosition);
    asteroid.object.rotation.set(this.randomRange(0, Math.PI), this.randomRange(0, Math.PI), this.randomRange(0, Math.PI));
    const waveBasis = getBasisVectors(this.waveSpawnOrientation);
    const target = this.waveAnchor
      .clone()
      .addScaledVector(waveBasis.right, this.randomRange(-70, 70))
      .addScaledVector(waveBasis.up, this.randomRange(-38, 38))
      .addScaledVector(waveBasis.forward, this.randomRange(-40, 40));
    asteroid.velocity.copy(target.sub(spawnPosition).normalize().multiplyScalar(asteroid.speed));
    asteroid.velocity.add(new THREE.Vector3(this.randomRange(-4, 4), this.randomRange(-3, 3), this.randomRange(-4, 4)));
    asteroid.spin.set(this.randomRange(-0.7, 0.7), this.randomRange(-0.9, 0.9), this.randomRange(-0.6, 0.6));
    asteroid.hitFlash = 0;
    asteroid.collisionCooldown = 0;
  }

  private updateEnemies(dt: number): void {
    const playerBasis = getBasisVectors(this.playerRoot.quaternion);
    const playerPosition = this.playerRoot.position;
    const difficultyTuning = getDifficultyTuning(this.difficulty);

    for (const enemy of [...this.enemies]) {
      const pursuit = enemy.pursuit;
      enemy.spawnAge += dt;
      enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt);
      enemy.collisionCooldown = Math.max(0, enemy.collisionCooldown - dt);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 3.5);
      enemy.behaviorTimer -= dt;
      const previousPosition = enemy.object.position.clone();

      const toPlayer = playerPosition.clone().sub(enemy.object.position);
      const distance = Math.max(EPSILON, toPlayer.length());
      const toOrigin = enemy.patrolOrigin.clone().sub(enemy.object.position);
      const originDistance = Math.max(EPSILON, toOrigin.length());
      const basis = getBasisVectors(enemy.object.quaternion);
      const forward = basis.forward;
      const alignment = forward.dot(toPlayer.clone().normalize());
      const intercept = solveInterceptCourse(enemy.object.position, playerPosition, this.playerVelocity, enemy.profile.projectileSpeed);

      if (enemy.behaviorTimer <= 0) {
        enemy.behaviorTimer = this.randomRange(1.1, 2.7);
        if (this.random() < 0.55) {
          enemy.strafeSign *= -1;
        }
        enemy.verticalBias = clamp(enemy.verticalBias + this.randomRange(-0.35, 0.35), -1, 1);
      }

      let mode = getEnemyPursuitDirective(enemy.shipClass, distance, originDistance, alignment, pursuit);
      if (pursuit.combat && originDistance <= pursuit.returnRadius && distance > pursuit.reengageDistance) {
        mode = enemy.shipClass === 'destroyer' ? 'guard' : 'return';
      }
      enemy.mode = mode;

      let desiredPoint = enemy.patrolOrigin.clone();
      let desiredSpeed = enemy.stats.speed * difficultyTuning.enemySpeedMultiplier * pursuit.patrolSpeedMultiplier;
      let aimDirection = intercept.direction;

      switch (mode) {
        case 'attack':
          desiredPoint = intercept.aimPoint
            .clone()
            .addScaledVector(playerBasis.right, enemy.strafeSign * (10 + enemy.radius * 1.6))
            .addScaledVector(playerBasis.up, enemy.verticalBias * 10);
          desiredSpeed = enemy.stats.speed * difficultyTuning.enemySpeedMultiplier * pursuit.attackSpeedMultiplier + Math.max(0, this.wave - 1) * 0.55;
          break;
        case 'attack-pass':
          desiredPoint = playerPosition
            .clone()
            .addScaledVector(playerBasis.forward, -40 - enemy.radius * 2)
            .addScaledVector(playerBasis.right, enemy.strafeSign * (26 + enemy.radius * 2.6))
            .addScaledVector(playerBasis.up, enemy.verticalBias * 18);
          desiredSpeed = enemy.stats.speed * difficultyTuning.enemySpeedMultiplier * Math.max(pursuit.attackSpeedMultiplier, 1.02) + 6;
          aimDirection = forward.clone();
          break;
        case 'standoff': {
          const offset = enemy.object.position.clone().sub(playerPosition).normalize();
          desiredPoint = playerPosition
            .clone()
            .addScaledVector(offset, pursuit.preferredDistance)
            .addScaledVector(playerBasis.right, enemy.strafeSign * 18)
            .addScaledVector(playerBasis.up, enemy.verticalBias * 14);
          desiredSpeed = enemy.stats.speed * difficultyTuning.enemySpeedMultiplier * 0.82;
          break;
        }
        case 'guard':
          desiredPoint = enemy.patrolOrigin
            .clone()
            .lerp(playerPosition, 0.24)
            .addScaledVector(playerBasis.right, enemy.strafeSign * 18);
          desiredSpeed = enemy.stats.speed * difficultyTuning.enemySpeedMultiplier * pursuit.patrolSpeedMultiplier;
          break;
        case 'evade':
          desiredPoint = enemy.object.position
            .clone()
            .addScaledVector(forward, 34)
            .addScaledVector(basis.right, enemy.strafeSign * (28 + enemy.radius * 2))
            .addScaledVector(basis.up, enemy.verticalBias * 16);
          desiredSpeed = enemy.stats.speed * difficultyTuning.enemySpeedMultiplier * Math.max(pursuit.disengageSpeedMultiplier, 0.96) + 4;
          break;
        case 'disengage':
        case 'return':
          desiredPoint = enemy.patrolOrigin.clone();
          desiredSpeed = enemy.stats.speed * difficultyTuning.enemySpeedMultiplier * pursuit.disengageSpeedMultiplier + (mode === 'disengage' ? 1.5 : 0);
          break;
        case 'flee': {
          const fleeDirection = enemy.object.position
            .clone()
            .sub(playerPosition)
            .normalize()
            .addScaledVector(WORLD_UP, enemy.verticalBias * 0.18)
            .normalize();
          desiredPoint = enemy.object.position.clone().addScaledVector(fleeDirection, 120);
          desiredSpeed = enemy.stats.speed * difficultyTuning.enemySpeedMultiplier * pursuit.fleeSpeedMultiplier + this.wave * 0.4;
          if (distance > pursuit.despawnDistance || (enemy.spawnAge > pursuit.despawnDelay && distance > pursuit.preferredDistance * 1.2)) {
            enemy.despawnTimer += dt;
          } else {
            enemy.despawnTimer = 0;
          }
          if (enemy.despawnTimer > 1.4) {
            this.removeEnemy(enemy);
            continue;
          }
          break;
        }
      }

      enemy.object.quaternion.copy(
        turnTowardsDirection(
          enemy.object.quaternion,
          desiredPoint.sub(enemy.object.position),
          getDifficultyAdjustedEnemyTurnRate(enemy.shipClass, this.difficulty) * (mode === 'return' ? 1.08 : 1),
          dt,
          WORLD_UP,
        ),
      );

      const motion = integrateFlightMotion(
        enemy.object.position,
        enemy.velocity,
        enemy.object.quaternion,
        clamp(
          desiredSpeed,
          enemy.stats.speed * 0.5 * difficultyTuning.enemySpeedMultiplier,
          enemy.stats.speed * 1.35 * difficultyTuning.enemySpeedMultiplier + this.wave * 0.8,
        ),
        dt,
        {
          acceleration: enemy.profile.acceleration * difficultyTuning.enemyAgilityMultiplier * (enemy.pursuit.combat ? 0.84 : 0.9),
          driftDamping: enemy.profile.driftDamping * 0.78,
          softBoundaryRadius: WORLD_SOFT_RADIUS * 1.08,
          hardBoundaryRadius: WORLD_HARD_RADIUS * 1.15,
          boundaryGuidance: WORLD_BOUNDARY_GUIDANCE * 0.74,
        },
      );
      enemy.object.position.copy(motion.position);
      enemy.velocity.copy(motion.velocity);
      if (this.collisionsEnabled) {
        this.resolveEnemyEnvironmentCollision(enemy, previousPosition);
      }
      this.updateEnemyShieldVisual(enemy);

      if (!pursuit.combat || !['attack', 'attack-pass', 'standoff', 'guard'].includes(mode)) {
        continue;
      }
      if (distance < pursuit.attackDistance && alignment > (mode === 'standoff' ? 0.72 : 0.8) && enemy.fireCooldown <= 0) {
        this.fireEnemyWeapons(enemy, aimDirection);
      }
    }
  }

  private updateAsteroids(dt: number): void {
    for (const asteroid of this.asteroids) {
      asteroid.collisionCooldown = Math.max(0, asteroid.collisionCooldown - dt);
      asteroid.hitFlash = Math.max(0, asteroid.hitFlash - dt * 3.2);
      const previousPosition = asteroid.object.position.clone();
      asteroid.object.position.addScaledVector(asteroid.velocity, dt);
      if (this.collisionsEnabled) {
        this.resolveAsteroidEnvironmentCollision(asteroid, previousPosition);
      }
      asteroid.object.rotation.x += asteroid.spin.x * dt;
      asteroid.object.rotation.y += asteroid.spin.y * dt;
      asteroid.object.rotation.z += asteroid.spin.z * dt;
      const material = asteroid.object.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        if (asteroid.hitFlash > 0) {
          material.emissive.setHex(0xff8f4b);
          material.emissiveIntensity = asteroid.hitFlash * 0.5;
        } else {
          material.emissiveIntensity = 0;
        }
      }
      const distanceToPlayer = asteroid.object.position.distanceTo(this.playerRoot.position);
      const distanceToWave = asteroid.object.position.distanceTo(this.waveAnchor);
      if (distanceToWave > ASTEROID_RECYCLE_DISTANCE && distanceToPlayer > ASTEROID_SAFE_DISTANCE) {
        this.seedAsteroidMotion(asteroid);
      }
    }
  }

  private updateLasers(dt: number): void {
    for (const laser of this.lasers) {
      laser.life -= dt;
      laser.previousPosition.copy(laser.object.position);
      laser.object.position.addScaledVector(laser.velocity, dt);
      laser.travelled += laser.velocity.length() * dt;
    }
    const expired = this.lasers.filter((laser) => laser.life <= 0 || laser.travelled >= laser.maxDistance);
    expired.forEach((laser) => this.removeLaser(laser));
  }

  private updateExplosions(dt: number): void {
    for (const explosion of this.explosions) {
      explosion.life -= dt;
      explosion.object.position.addScaledVector(explosion.drift, dt);
      const progress = clamp(explosion.life / explosion.maxLife, 0, 1);
      explosion.object.scale.multiplyScalar(1 + explosion.growth * dt);
      explosion.object.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.material) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          const typed = material as THREE.Material & { opacity?: number };
          if ('opacity' in typed && typeof typed.opacity === 'number') {
            typed.opacity = progress;
            typed.transparent = true;
          }
        });
      });
    }
    const faded = this.explosions.filter((explosion) => explosion.life <= 0);
    faded.forEach((explosion) => this.removeExplosion(explosion));
  }

  private updateMotionStars(dt: number, speed: number): void {
    const positions = this.motionStars.positions;
    for (let index = 0; index < positions.length; index += 3) {
      positions[index + 2] += speed * dt * 1.85;
      if (positions[index + 2] > 22) {
        positions[index] = this.randomRange(-55, 55);
        positions[index + 1] = this.randomRange(-32, 26);
        positions[index + 2] = this.randomRange(-420, -180);
      }
    }
    this.motionStars.geometry.attributes.position.needsUpdate = true;
  }

  private updatePickups(dt: number): void {
    for (const pickup of [...this.pickups]) {
      pickup.life -= dt;
      pickup.object.position.addScaledVector(pickup.drift, dt);
      pickup.object.rotation.x += pickup.spin.x * dt;
      pickup.object.rotation.y += pickup.spin.y * dt;
      pickup.object.rotation.z += pickup.spin.z * dt;
      const progress = clamp(pickup.life / pickup.maxLife, 0, 1);
      const pulse = 0.88 + Math.sin((pickup.maxLife - pickup.life) * 3.8 + pickup.pulse) * 0.08;
      pickup.object.scale.setScalar(pulse);
      pickup.object.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.material) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          const typed = material as THREE.Material & { opacity?: number; emissiveIntensity?: number; userData: Record<string, unknown> };
          if (typeof typed.opacity === 'number') {
            const baseOpacity = typeof typed.userData.baseOpacity === 'number' ? typed.userData.baseOpacity : typed.opacity;
            typed.userData.baseOpacity = baseOpacity;
            typed.opacity = baseOpacity * (0.55 + progress * 0.45);
            typed.transparent = true;
          }
          if (typeof typed.emissiveIntensity === 'number') {
            const baseEmissive = typeof typed.userData.baseEmissiveIntensity === 'number' ? typed.userData.baseEmissiveIntensity : typed.emissiveIntensity;
            typed.userData.baseEmissiveIntensity = baseEmissive;
            typed.emissiveIntensity = baseEmissive * (0.7 + progress * 0.3);
          }
        }
      });
      if (pickup.life <= 0 || pickup.object.position.length() > WORLD_HARD_RADIUS * 1.3) {
        this.removePickup(pickup);
      }
    }
  }

  private collectPickups(): void {
    for (const pickup of [...this.pickups]) {
      const hit = segmentSphereIntersection(
        this.previousPlayerPosition,
        this.playerRoot.position,
        pickup.object.position,
        this.playerRadius + pickup.radius + PICKUP_SPARKLE_DISTANCE,
      ) !== null || this.sphereHit(this.playerRoot.position, this.playerRadius + PICKUP_SPARKLE_DISTANCE, pickup.object.position, pickup.radius);
      if (!hit) {
        continue;
      }
      if (this.applyPickup(pickup)) {
        this.removePickup(pickup);
      }
    }
  }

  private applyPickup(pickup: PickupEntity): boolean {
    const stats = this.getCurrentShipStats();
    let restored = 0;
    let message = '';

    if (pickup.type === 'energy') {
      const result = applyPickupRestore(this.energy, MAX_ENERGY, pickup.amount);
      this.energy = result.next;
      restored = result.restored;
      message = `ENERGY +${Math.round(restored)}`;
    } else if (pickup.type === 'shield') {
      const result = applyPickupRestore(this.playerShield, stats.shield, pickup.amount);
      this.playerShield = result.next;
      restored = result.restored;
      message = `SHIELD +${Math.round(restored)}`;
    } else if (pickup.type === 'hull') {
      const result = applyPickupRestore(this.playerHull, stats.hull, pickup.amount);
      this.playerHull = result.next;
      restored = result.restored;
      message = `HULL +${Math.round(restored)}`;
    } else if (pickup.type === 'torpedo') {
      if (stats.torpedoes <= 0 || this.torpedoes >= stats.torpedoes) return false;
      const added = Math.min(pickup.amount, stats.torpedoes - this.torpedoes);
      this.torpedoes += added;
      this.pickupMessageTimer = 2.6;
      this.pickupMessage = `PROTON TORPEDOES +${added} · X TO FIRE`;
      this.spawnSpark(pickup.object.position, getPickupColor('torpedo'), 1);
      return true;
    } else if (pickup.type === 'overcharge') {
      this.overchargeTimer = OVERCHARGE.duration;
      this.pickupMessageTimer = 2.6;
      this.pickupMessage = `WEAPON OVERCHARGE · ${OVERCHARGE.duration}S`;
      this.spawnSpark(pickup.object.position, getPickupColor('overcharge'), 1.2);
      return true;
    } else if (pickup.type === 'aegis') {
      this.aegisPoints = Math.min(AEGIS.points * 1.6, this.aegisPoints + AEGIS.points);
      this.pickupMessageTimer = 2.6;
      this.pickupMessage = `AEGIS OVERSHIELD +${AEGIS.points}`;
      this.spawnSpark(pickup.object.position, getPickupColor('aegis'), 1.2);
      return true;
    } else {
      const gained = this.applyUpgradePickup(pickup.type as UpgradePickupType);
      if (gained <= 0) {
        return false;
      }
      const upgrades = this.getShipUpgradeLevels(this.ship);
      const level = pickup.type === 'hull-upgrade' ? upgrades.hull : pickup.type === 'defense-upgrade' ? upgrades.defense : upgrades.attack;
      this.pickupMessageTimer = 2.8;
      this.pickupMessage = `${pickup.type.replace('-upgrade', '').toUpperCase()} UPGRADE Lv${level}`;
      this.spawnSpark(pickup.object.position, getPickupColor(pickup.type), 1);
      return true;
    }

    if (restored <= EPSILON) {
      return false;
    }

    this.pickupMessageTimer = 2.4;
    this.pickupMessage = message;
    this.spawnSpark(pickup.object.position, getPickupColor(pickup.type), 0.9);
    return true;
  }

  private spawnPickup(type: PickupType, position: THREE.Vector3, amount: number, driftScale = 1): void {
    if (getPickupSpawnAllowance(this.pickups.length, 1) <= 0) {
      const overflow = Math.max(1, this.pickups.length - PICKUP_WORLD_CAP + 1);
      this.pickups
        .slice()
        .sort((left, right) => left.life - right.life)
        .slice(0, overflow)
        .forEach((pickup) => this.removePickup(pickup));
    }

    const object = createPickupModel(type);
    object.position.copy(position);
    this.pickupLayer.add(object);
    this.pickups.push({
      id: ++this.pickupId,
      type,
      object,
      radius: 1.8,
      amount,
      life: PICKUP_LIFETIME_SECONDS,
      maxLife: PICKUP_LIFETIME_SECONDS,
      spin: new THREE.Vector3(this.randomRange(-0.9, 0.9), this.randomRange(-1.2, 1.2), this.randomRange(-0.8, 0.8)),
      drift: new THREE.Vector3(this.randomRange(-1.2, 1.2), this.randomRange(-0.6, 0.6), this.randomRange(-1.2, 1.2)).multiplyScalar(driftScale),
      pulse: this.randomRange(0, Math.PI * 2),
    });
  }

  private spawnEnemyDrop(enemy: EnemyEntity): void {
    const chance = enemy.pursuit.combat ? 0.58 : 0.78;
    if (this.random() > chance) {
      return;
    }
    const ownStats = this.getCurrentShipStats();
    const combatPool: PickupType[] = (['torpedo', 'overcharge', 'aegis'] as PickupType[]).filter((type) => canUseCombatPickup(type, ownStats) && (type !== 'torpedo' || this.torpedoes < ownStats.torpedoes));
    if (this.torpedoes === 0 && combatPool.includes('torpedo')) combatPool.push('torpedo', 'torpedo');
    if (combatPool.length > 0 && this.random() < (enemy.pursuit.combat ? 0.26 : 0.16)) {
      const type = combatPool[Math.floor(this.random() * combatPool.length)] ?? combatPool[0];
      this.spawnPickup(type, enemy.object.position.clone(), type === 'torpedo' ? TORPEDO.pickupAmount : 1, 0.7);
      return;
    }
    const availableUpgrades = this.getAvailableUpgradePickupTypes();
    const upgradeChance = enemy.pursuit.combat ? 0.34 : 0.26;
    if (availableUpgrades.length > 0 && this.random() < upgradeChance) {
      const type = availableUpgrades[Math.floor(this.random() * availableUpgrades.length)] ?? availableUpgrades[0];
      this.spawnPickup(type, enemy.object.position.clone(), 1, 0.7);
      return;
    }
    const stats = this.getCurrentShipStats();
    const hullNeed = Math.max(0, stats.hull - this.playerHull);
    const shieldNeed = Math.max(0, stats.shield - this.playerShield);
    const energyNeed = Math.max(0, MAX_ENERGY - this.energy);
    const weighted: PickupType[] = [];
    if (energyNeed > 8) weighted.push('energy', 'energy');
    if (shieldNeed > 12) weighted.push('shield', 'shield');
    if (hullNeed > 16) weighted.push('hull', 'hull');
    weighted.push('energy', 'shield', 'hull');
    const type = weighted[Math.floor(this.random() * weighted.length)] ?? 'energy';
    const amount = type === 'energy' ? 32 : type === 'shield' ? 28 : 24;
    this.spawnPickup(type, enemy.object.position.clone(), amount, 0.7);
  }

  private updateRecoveryState(): void {
    const tuning = getDifficultyTuning(this.difficulty);
    const stats = this.getCurrentShipStats();
    const needsRecovery = this.playerHull < stats.hull || this.playerShield < stats.shield || this.energy < MAX_ENERGY * 0.92;
    const nearestThreat = this.getNearestEnemyDistance(true);
    const farFromBattle = this.playerRoot.position.distanceTo(this.waveAnchor) > 150;
    this.recoveryActive = this.mode === 'playing'
      && needsRecovery
      && this.currentBoundaryLoad < 0.96
      && farFromBattle
      && (nearestThreat === undefined || nearestThreat > tuning.recoveryThreatDistance);
  }

  private spawnRecoveryPocket(): void {
    if (!this.recoveryActive || this.recoveryPocketCooldown > 0) {
      return;
    }
    const nearbyPickups = this.pickups.filter((pickup) => pickup.object.position.distanceTo(this.playerRoot.position) < 70).length;
    if (nearbyPickups >= 3) {
      return;
    }
    const tuning = getDifficultyTuning(this.difficulty);
    const stats = this.getCurrentShipStats();
    const basis = getBasisVectors(this.playerRoot.quaternion);
    const anchor = this.playerRoot.position
      .clone()
      .addScaledVector(basis.forward, tuning.recoveryPocketDistance)
      .addScaledVector(basis.right, this.randomRange(-8, 8))
      .addScaledVector(basis.up, this.randomRange(-6, 6));
    const priorities: PickupType[] = [];
    if (this.energy < MAX_ENERGY * 0.84) priorities.push('energy');
    if (this.playerShield < stats.shield * 0.84) priorities.push('shield');
    if (this.playerHull < stats.hull * 0.9) priorities.push('hull');
    if (priorities.length === 0) priorities.push('energy', 'shield');
    const types = priorities.slice(0, 3);
    if (types.length === 1) {
      types.push('shield');
    }
    types.forEach((type, index) => {
      const offset = basis.right.clone().multiplyScalar((index - (types.length - 1) / 2) * 7.5);
      offset.addScaledVector(basis.up, index % 2 === 0 ? 2.5 : -2.5);
      const baseAmount = type === 'hull' ? 26 : type === 'shield' ? 30 : 34;
      this.spawnPickup(type, anchor.clone().add(offset), Math.round(baseAmount * tuning.recoveryPickupMultiplier), 0.28);
    });
    const availableUpgrades = this.getAvailableUpgradePickupTypes();
    if (availableUpgrades.length > 0 && this.random() < 0.35) {
      const upgradeType = availableUpgrades[Math.floor(this.random() * availableUpgrades.length)] ?? availableUpgrades[0];
      const upgradeOffset = basis.up.clone().multiplyScalar(6).addScaledVector(basis.forward, 4);
      this.spawnPickup(upgradeType, anchor.clone().add(upgradeOffset), 1, 0.18);
    }
    this.pickupMessage = 'Recovery pocket detected';
    this.pickupMessageTimer = Math.max(this.pickupMessageTimer, 2);
    this.recoveryPocketCooldown = tuning.recoveryPocketCooldown;
  }

  private getCurrentShipStats(): ShipDefinition {
    return getUpgradedShipStats(SHIPS[this.ship], this.shipUpgrades[this.ship]);
  }

  private getAvailableUpgradePickupTypes(ship: ShipClass = this.ship): UpgradePickupType[] {
    const upgrades = this.shipUpgrades[ship];
    const available: UpgradePickupType[] = [];
    if (upgrades.hull < UPGRADE_MAX_LEVEL) available.push('hull-upgrade');
    if (upgrades.defense < UPGRADE_MAX_LEVEL) available.push('defense-upgrade');
    if (upgrades.attack < UPGRADE_MAX_LEVEL) available.push('attack-upgrade');
    return available;
  }

  private applyUpgradePickup(type: UpgradePickupType): number {
    const upgrades = this.shipUpgrades[this.ship];
    const key = type === 'hull-upgrade' ? 'hull' : type === 'defense-upgrade' ? 'defense' : 'attack';
    const currentLevel = upgrades[key];
    if (currentLevel >= UPGRADE_MAX_LEVEL) {
      return 0;
    }
    const previousStats = this.getCurrentShipStats();
    upgrades[key] = Math.min(UPGRADE_MAX_LEVEL, currentLevel + 1);
    saveStoredShipUpgrades(this.shipUpgrades);
    const nextStats = this.getCurrentShipStats();
    if (type === 'hull-upgrade') {
      this.playerHull = clamp(this.playerHull + (nextStats.hull - previousStats.hull), 0, nextStats.hull);
    } else if (type === 'defense-upgrade') {
      this.playerShield = clamp(this.playerShield + (nextStats.shield - previousStats.shield), 0, nextStats.shield);
    }
    return upgrades[key] - currentLevel;
  }

  private firePlayerWeapons(stats: ShipDefinition): void {
    const overcharged = this.overchargeTimer > 0;
    const energyCost = overcharged ? 0 : Math.max(3, stats.damage * 0.2);
    if (this.energy < energyCost) {
      return;
    }
    const profile = FLIGHT_PROFILES[this.ship];
    const basis = getBasisVectors(this.playerRoot.quaternion);
    this.energy = Math.max(0, this.energy - energyCost);
    this.playerFireCooldown = stats.fireInterval / (overcharged ? OVERCHARGE.fireRateMultiplier : 1);
    const shotCount = stats.mass >= 70 ? 4 : stats.mass >= 46 ? 3 : 2;
    const span = 0.45 + stats.mass * 0.006;
    for (let index = 0; index < shotCount; index += 1) {
      const t = index / (shotCount - 1);
      const offsetX = THREE.MathUtils.lerp(-span, span, t);
      const offsetY = index % 2 === 0 ? 0.14 : -0.1;
      const origin = this.localOffsetToWorld(this.playerRoot.position, this.playerRoot.quaternion, new THREE.Vector3(offsetX, offsetY, -this.playerMuzzleDistance - 0.82));
      this.spawnLaserEntity({
        kind: 'player',
        ownerId: 'player',
        origin,
        direction: basis.forward,
        inheritedVelocity: this.playerVelocity.clone().multiplyScalar(0.32),
        damage: stats.damage * (overcharged ? OVERCHARGE.damageMultiplier : 1),
        tint: overcharged ? 0xff5cf0 : undefined,
        speed: profile.projectileSpeed,
        radius: 0.58,
        life: profile.projectileLifetime,
        maxDistance: profile.projectileRange,
      });
      this.shotsFired += 1;
    }
    this.audio.playLaser(false, stats.damage);
  }

  private fireEnemyWeapons(enemy: EnemyEntity, leadDirection: THREE.Vector3): void {
    if (!enemy.pursuit.combat) {
      return;
    }
    const tuning = getEnemyAttackTuning(enemy.shipClass, Math.max(1, this.wave), this.difficulty);
    const shotCount = enemy.shipClass === 'destroyer' ? 3 : enemy.shipClass === 'bomber' ? 2 : enemy.shipClass === 'interceptor' ? 1 : 2;
    const spread = THREE.MathUtils.lerp(0.085, 0.014, tuning.accuracy);
    const basis = getBasisVectors(enemy.object.quaternion);
    const lateralSpan = enemy.shipClass === 'destroyer' ? 0.8 : enemy.shipClass === 'bomber' ? 0.6 : 0.45;
    for (let index = 0; index < shotCount; index += 1) {
      const t = shotCount === 1 ? 0.5 : index / (shotCount - 1);
      const offsetX = THREE.MathUtils.lerp(-lateralSpan, lateralSpan, t);
      const offsetY = enemy.shipClass === 'destroyer' ? 0.18 : enemy.shipClass === 'bomber' ? -0.04 : 0.04;
      const origin = this.localOffsetToWorld(enemy.object.position, enemy.object.quaternion, new THREE.Vector3(offsetX, offsetY, -enemy.muzzleDistance - 0.72));
      const direction = leadDirection
        .clone()
        .addScaledVector(basis.right, (t - 0.5) * spread * enemy.radius * 3)
        .addScaledVector(basis.up, (this.random() - 0.5) * spread)
        .normalize();
      this.spawnLaserEntity({
        kind: 'enemy',
        ownerId: enemy.id,
        origin,
        direction,
        inheritedVelocity: enemy.velocity.clone().multiplyScalar(0.24),
        damage: enemy.stats.damage * tuning.damageMultiplier * (this.boss && !this.boss.defeated ? BOSS_ESCORT_DAMAGE : 1),
        speed: enemy.profile.projectileSpeed,
        radius: enemy.shipClass === 'destroyer' ? 0.74 : enemy.shipClass === 'bomber' ? 0.7 : 0.6,
        life: enemy.profile.projectileLifetime,
        maxDistance: enemy.profile.projectileRange,
      });
    }
    enemy.fireCooldown = enemy.stats.fireInterval * tuning.cooldownMultiplier + this.randomRange(0.1, 0.28);
    this.audio.playLaser(true, enemy.stats.damage * tuning.damageMultiplier);
  }

  private spawnLaserEntity(config: {
    kind: 'player' | 'enemy';
    ownerId: number | 'player';
    origin: THREE.Vector3;
    direction: THREE.Vector3;
    inheritedVelocity: THREE.Vector3;
    damage: number;
    speed: number;
    radius: number;
    life: number;
    maxDistance: number;
    tint?: number;
  }): void {
    const bolt = createLaserBolt(config.tint ?? (config.kind === 'player' ? 0x7ce6ff : 0xff7d6d), config.kind === 'player' ? 0.15 : 0.18, config.kind === 'player' ? 3.0 : 2.6);
    const direction = config.direction.clone().normalize();
    bolt.position.copy(config.origin);
    bolt.quaternion.setFromUnitVectors(LASER_UP_VECTOR, direction);
    const velocity = direction.multiplyScalar(config.speed).add(config.inheritedVelocity);
    const entity: LaserEntity = {
      id: ++this.laserId,
      kind: config.kind,
      object: bolt,
      velocity,
      damage: config.damage,
      radius: config.radius,
      life: config.life,
      travelled: 0,
      maxDistance: config.maxDistance,
      previousPosition: config.origin.clone(),
      ownerId: config.ownerId,
    };
    this.laserLayer.add(bolt);
    this.lasers.push(entity);
  }

  private setBossSubsystemVisibility(boss: CapitalShipBoss | null): void {
    this.gameplayCarrier.traverse((node) => {
      if (node.name.startsWith('subsystem_')) {
        const id = node.name.slice('subsystem_'.length);
        node.visible = !boss || !boss.subsystems.find((sub) => sub.id === id)?.destroyed;
      }
    });
  }

  private activateBoss(): void {
    const forward = getBasisVectors(this.waveSpawnOrientation).forward;
    const right = getBasisVectors(this.waveSpawnOrientation).right;
    const position = this.waveAnchor.clone().addScaledVector(forward, 190).addScaledVector(right, -30);
    position.y = this.waveAnchor.y + 12;
    this.gameplayCarrier.position.copy(position);
    this.gameplayCarrier.quaternion.copy(this.lookQuaternion(position, this.waveAnchor));
    this.gameplayCarrier.scale.setScalar(3.2);
    this.gameplayCarrier.updateMatrixWorld(true);
    this.boss = createCapitalShipBoss(this.encounterScaling);
    this.boss.active = true;
    this.bossVictoryTimer = 0;
    this.setBossSubsystemVisibility(this.boss);
    this.updateBossWorldAnchors();
    this.buildBossVisuals(this.boss);
    this.bossPhase = getBossPhase(this.boss);
    this.bossStartTime = this.missionTime;
    this.bossClearTime = null;
    this.audio.playBossAlarm();
  }

  private clearBossVisuals(): void {
    if (!this.bossVisuals) return;
    this.bossVisuals.turrets.forEach((entry) => disposeObject3D(entry.group));
    disposeObject3D(this.bossVisuals.shield);
    this.bossVisuals = null;
  }

  private buildBossVisuals(boss: CapitalShipBoss): void {
    this.clearBossVisuals();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x6c778c, emissive: 0x1a0d14, roughness: 0.4, metalness: 0.85 });
    const glowGeometry = new THREE.SphereGeometry(0.34, 12, 10);
    const turrets = new Map<number, { group: THREE.Group; barrelMat: THREE.MeshStandardMaterial; glow: THREE.Mesh; flash: number }>();
    for (const turret of boss.turrets) {
      const group = new THREE.Group();
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0xaab5c8, emissive: 0xff2a55, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.8 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.55, 10), baseMat);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), baseMat);
      dome.position.y = 0.27;
      group.add(base, dome);
      for (const side of [-0.28, 0.28]) {
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2.1), barrelMat);
        barrel.position.set(side, 0.36, 1.25);
        group.add(barrel);
      }
      const glow = new THREE.Mesh(glowGeometry, new THREE.MeshBasicMaterial({ color: 0xff4f8a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(0, 0.36, 2.35);
      group.add(glow);
      group.scale.setScalar(2.1);
      group.position.copy(turret.localOffset);
      this.gameplayCarrier.add(group);
      turrets.set(turret.id, { group, barrelMat, glow, flash: 0 });
    }
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 20),
      new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    shield.position.set(0, 1, 1.5);
    shield.scale.set(10.5, 7.5, 15.5);
    this.gameplayCarrier.add(shield);
    this.bossVisuals = { turrets, shield };
  }

  private updateBossVisuals(dt: number, boss: CapitalShipBoss): void {
    const visuals = this.bossVisuals;
    if (!visuals) return;
    this.bossShieldFlash = Math.max(0, this.bossShieldFlash - dt * 3);
    const material = visuals.shield.material as THREE.MeshBasicMaterial;
    const ratio = boss.shield / boss.maxShield;
    const pulse = 0.5 + Math.sin(performance.now() * 0.003) * 0.5;
    material.opacity = boss.shield > 0 ? 0.035 + ratio * 0.06 + pulse * 0.02 + this.bossShieldFlash * 0.4 : 0;
    material.color.setHex(this.bossShieldFlash > 0.2 ? 0xffffff : ratio < 0.35 ? 0xff9ec2 : 0x6fe3ff);
    visuals.shield.visible = material.opacity > 0.004;
    for (const turret of boss.turrets) {
      const entry = visuals.turrets.get(turret.id);
      if (!entry) continue;
      entry.group.visible = !turret.destroyed;
      const online = isTurretOnline(boss, turret);
      if (online) {
        entry.group.lookAt(this.playerRoot.position);
      }
      entry.flash = Math.max(0, entry.flash - dt * 4);
      const charge = online ? 1 - Math.max(0, Math.min(1, turret.fireCooldown / 2)) : 0;
      entry.barrelMat.emissiveIntensity = online ? 0.45 + charge * 1.1 + entry.flash * 2.4 : 0.05;
      (entry.glow.material as THREE.MeshBasicMaterial).opacity = online ? 0.2 + charge * 0.5 + entry.flash * 0.5 : 0;
      entry.glow.scale.setScalar(0.8 + charge * 0.7 + entry.flash * 1.9);
    }
    this.bossFxTimer += dt;
    if (this.bossFxTimer >= 0.22) {
      this.bossFxTimer = 0;
      for (const sub of boss.subsystems) {
        if (!sub.destroyed) continue;
        const jitter = new THREE.Vector3(this.randomRange(-3, 3), this.randomRange(-2, 3), this.randomRange(-3, 3)).multiplyScalar(this.gameplayCarrier.scale.x * 0.5);
        this.spawnExplosion(sub.worldCenter.clone().add(jitter), 0.9, this.random() < 0.5 ? 0x3a3a42 : 0xff8a3a);
      }
      if (boss.hull / boss.maxHull < 0.5) {
        const point = new THREE.Vector3(this.randomRange(-6, 6), this.randomRange(-2, 4), this.randomRange(-8, 10)).applyMatrix4(this.gameplayCarrier.matrixWorld);
        this.spawnExplosion(point, 1.1, this.random() < 0.4 ? 0x3a3a42 : 0xff6a2a);
      }
    }
  }

  private trackBossPhase(boss: CapitalShipBoss): void {
    const phase = getBossPhase(boss);
    if (phase === this.bossPhase) return;
    const previous = this.bossPhase;
    this.bossPhase = phase;
    if (phase === 'defeated') return;
    this.audio.playBossStinger(true);
    if (phase === 'exposed' && previous === 'shielded') {
      this.spawnExplosion(this.gameplayCarrier.position.clone(), 9, 0x7fe4ff);
      this.audio.playExplosion(4.5);
    }
    this.emitSnapshot(true);
  }

  private updateBossWorldAnchors(): void {
    if (!this.boss) return;
    this.gameplayCarrier.updateMatrixWorld(true);
    for (const sub of this.boss.subsystems) {
      sub.worldCenter.copy(sub.localCenter).applyMatrix4(this.gameplayCarrier.matrixWorld);
    }
    for (const turret of this.boss.turrets) {
      turret.worldPosition.copy(turret.localOffset).applyMatrix4(this.gameplayCarrier.matrixWorld);
    }
  }

  private updateBoss(dt: number): void {
    const boss = this.boss;
    if (!boss) return;
    if (boss.defeated) {
      this.audio.setBossDrone(false, 0);
      return;
    }
    this.updateBossWorldAnchors();
    this.trackBossPhase(boss);
    this.updateBossVisuals(dt, boss);
    const phase = getBossPhase(boss);
    this.audio.setBossDrone(true, phase === 'critical' ? 1 : phase === 'exposed' ? 0.55 : 0.2);
    const difficulty = BOSS_DIFFICULTY[this.difficulty];
    const profile = FLIGHT_PROFILES.destroyer;
    const scale = this.gameplayCarrier.scale.x;
    const leadFactor = difficulty.lead;
    for (const turret of boss.turrets) {
      turret.fireCooldown -= dt;
      if (turret.fireCooldown > 0 || !isTurretOnline(boss, turret)) continue;
      const distance = turret.worldPosition.distanceTo(this.playerRoot.position);
      if (distance > 320) {
        turret.fireCooldown = 0.6;
        continue;
      }
      const aim = solveInterceptCourse(turret.worldPosition, this.playerRoot.position, this.playerVelocity.clone().multiplyScalar(leadFactor), profile.projectileSpeed).direction;
      // Larger hulls get a wider spread so hitbox size does not dominate survivability.
      const sizeSpread = clamp(Math.pow(this.playerRadius / 4.45, 0.75), 1, 2.5);
      const spread = 0.031 * difficulty.spread * sizeSpread;
      const direction = aim.clone().add(new THREE.Vector3(this.randomRange(-spread, spread), this.randomRange(-spread, spread), this.randomRange(-spread, spread))).normalize();
      const origin = turret.worldPosition.clone().addScaledVector(direction, 1.8 * scale);
      this.spawnLaserEntity({
        kind: 'enemy',
        ownerId: -turret.id,
        origin,
        direction,
        inheritedVelocity: new THREE.Vector3(),
        damage: BOSS_TUNING.turretDamage * difficulty.damage * this.encounterScaling.damage,
        speed: profile.projectileSpeed * 0.9,
        radius: 0.8,
        life: profile.projectileLifetime,
        maxDistance: Math.max(profile.projectileRange, 360),
      });
      this.spawnSpark(origin, 0xff5d8a, 1.6);
      const turretVisual = this.bossVisuals?.turrets.get(turret.id);
      if (turretVisual) turretVisual.flash = 1;
      this.audio.playLaser(true, 20);
      turret.fireCooldown = getBossTurretCooldown(phase, difficulty.cooldown * getBossFireTempo(this.encounterScaling.count), this.random());
    }
  }

  private handleBossLaserHits(): void {
    const boss = this.boss;
    if (!boss || boss.defeated) return;
    const scale = this.gameplayCarrier.scale.x;
    const hullCenter = this.gameplayCarrier.position;
    for (const laser of [...this.lasers]) {
      if (laser.kind !== 'player' || boss.defeated) continue;
      let hitSub: CapitalShipSubsystem | null = null;
      let bestTime = Infinity;
      for (const sub of boss.subsystems) {
        if (sub.destroyed) continue;
        const time = segmentSphereIntersection(laser.previousPosition, laser.object.position, sub.worldCenter, sub.radius * scale * 0.85 + laser.radius);
        if (time !== null && time < bestTime) {
          bestTime = time;
          hitSub = sub;
        }
      }
      if (hitSub) {
        this.removeLaser(laser);
        this.shotsHit += 1;
        const wasDestroyed = hitSub.destroyed;
        const shieldedBridge = hitSub.type === 'bridge' && !canDamageBridge(boss);
        if (shieldedBridge) this.bossShieldFlash = 1;
        const result = damageBossSubsystem(boss, hitSub.id, laser.damage);
        this.spawnSpark(laser.object.position, shieldedBridge ? 0x7fe4ff : 0xffb36b, 1.4);
        if (result.destroyed && !wasDestroyed) {
          this.onBossSubsystemDestroyed(hitSub);
        }
        continue;
      }
      if (segmentSphereIntersection(laser.previousPosition, laser.object.position, hullCenter, 5 * scale + laser.radius) !== null) {
        this.removeLaser(laser);
        this.shotsHit += 1;
        damageBossHullDirect(boss, laser.damage * BOSS_TUNING.hullHitMultiplier);
        if (boss.shield > 0) this.bossShieldFlash = 1;
        this.spawnSpark(laser.object.position, boss.shield > 0 ? 0x7fe4ff : 0xff8f63, 1.1);
      }
    }
  }

  private onBossSubsystemDestroyed(sub: CapitalShipSubsystem): void {
    this.spawnBlast(sub.worldCenter, { radius: sub.radius * this.gameplayCarrier.scale.x * 0.9, power: 2.4, cause: 'collision' });
    this.score += sub.type === 'bridge' ? 2500 : 600;
    this.setBossSubsystemVisibility(this.boss);
    this.spawnPickup('shield', sub.worldCenter.clone(), 40, 0.8);
    this.spawnPickup('hull', sub.worldCenter.clone().add(new THREE.Vector3(3, 1, 0)), 30, 0.8);
    this.pickupMessage = `${sub.name.toUpperCase()} DESTROYED`;
    this.pickupMessageTimer = 3;
  }

  private resolveBossOutcome(dt: number): void {
    const boss = this.boss;
    if (!boss || !boss.defeated || this.mode !== 'playing') return;
    if (this.bossVictoryTimer === 0) {
      this.bossClearTime = this.missionTime;
      this.score += 5000;
      this.setBossSubsystemVisibility(null);
      this.audio.playExplosion(4);
    }
    this.bossVictoryTimer += dt;
    if (Math.floor(this.bossVictoryTimer * 6) !== Math.floor((this.bossVictoryTimer - dt) * 6)) {
      const offset = new THREE.Vector3(this.randomRange(-9, 9), this.randomRange(-4, 6), this.randomRange(-12, 12)).applyQuaternion(this.gameplayCarrier.quaternion);
      this.spawnBlast(this.gameplayCarrier.position.clone().add(offset), { radius: this.randomRange(9, 17), power: 3, cause: 'collision' });
    }
    if (this.bossVictoryTimer > 3.2) {
      this.endGame('victory', 'The Leviathan is broken. The blockade is lifted.');
    }
  }

  private refreshEnvironmentCollisionBounds(): void {
    this.gameplayCarrier.updateMatrixWorld(true);
    this.planetCollisionBounds.setFromObject(this.planetPivot);
    this.planetCollisionBounds.getBoundingSphere(this.planetCollisionSphere);
  }

  private getEnvironmentCollisionBody(kind: EnvironmentObstacleKind): CollisionBody {
    return kind === 'planet'
      ? { hull: 99_999, shield: 0, armor: 0.72, mass: 1_200, speed: 0 }
      : { hull: 99_999, shield: 0, armor: 0.46, mass: 420, speed: 0 };
  }

  private getEnvironmentCollisionHit(
    previousPosition: Readonly<THREE.Vector3>,
    position: Readonly<THREE.Vector3>,
    radius: number,
  ): { obstacle: EnvironmentObstacleKind; collision: NonNullable<ReturnType<typeof sweepSphereAgainstSphere>> | NonNullable<ReturnType<typeof sweepSphereAgainstBox>> } | null {
    const carrierInverse = this.gameplayCarrier.matrixWorld.clone().invert();
    const carrierScale = this.gameplayCarrier.getWorldScale(new THREE.Vector3());
    const carrierScaleRadius = Math.max(EPSILON, carrierScale.x);
    const carrierLocalHit = sweepSphereAgainstBox(
      previousPosition.clone().applyMatrix4(carrierInverse),
      position.clone().applyMatrix4(carrierInverse),
      this.carrierCollisionBounds,
      radius / carrierScaleRadius,
    );
    const carrierHit = carrierLocalHit
      ? {
          ...carrierLocalHit,
          position: carrierLocalHit.position.clone().applyMatrix4(this.gameplayCarrier.matrixWorld),
          normal: carrierLocalHit.normal.clone().transformDirection(this.gameplayCarrier.matrixWorld).normalize(),
        }
      : null;
    const hits = [
      {
        obstacle: 'planet' as const,
        collision: sweepSphereAgainstSphere(previousPosition, position, this.planetCollisionSphere.center, this.planetCollisionSphere.radius, radius),
      },
      {
        obstacle: 'carrier' as const,
        collision: carrierHit,
      },
    ].filter((candidate): candidate is {
      obstacle: EnvironmentObstacleKind;
      collision: NonNullable<ReturnType<typeof sweepSphereAgainstSphere>> | NonNullable<ReturnType<typeof sweepSphereAgainstBox>>;
    } => candidate.collision !== null);

    hits.sort((left, right) => left.collision.time - right.collision.time);
    return hits[0] ?? null;
  }

  private getEnvironmentImpactSpeed(velocity: Readonly<THREE.Vector3>, normal: Readonly<THREE.Vector3>): number {
    const closingSpeed = Math.max(0, -velocity.dot(normal));
    return Math.max(6, closingSpeed + velocity.length() * 0.22);
  }

  private bounceVelocityOffSurface(velocity: THREE.Vector3, normal: Readonly<THREE.Vector3>): void {
    const normalSpeed = velocity.dot(normal);
    if (normalSpeed < 0) {
      velocity.addScaledVector(normal, -(normalSpeed * 1.45));
    }
    velocity.multiplyScalar(0.86);
  }

  private resolvePlayerEnvironmentCollision(): void {
    if (this.playerCollisionCooldown > 0) {
      return;
    }
    const hit = this.getEnvironmentCollisionHit(this.previousPlayerPosition, this.playerRoot.position, this.playerRadius);
    if (!hit) {
      return;
    }
    const stats = this.getCurrentShipStats();
    const impactSpeed = this.getEnvironmentImpactSpeed(this.playerVelocity, hit.collision.normal);
    const outcome = resolveCollision(
      { hull: this.playerHull, shield: this.playerShield, armor: stats.armor, mass: stats.mass, speed: 0 },
      this.getEnvironmentCollisionBody(hit.obstacle),
      impactSpeed,
    );
    this.playerRoot.position.copy(hit.collision.position);
    this.bounceVelocityOffSurface(this.playerVelocity, hit.collision.normal);
    this.playerCollisionCooldown = COLLISION_COOLDOWN;
    this.shieldFlash = 1;
    this.audio.playImpact(this.playerShield > 0, outcome.impactDamage);
    this.commitPlayerDamageResult(
      outcome.a,
      hit.obstacle === 'planet' ? 'Your ship was lost against the planet.' : 'Your ship broke against the carrier hull.',
    );
  }

  private resolveEnemyEnvironmentCollision(enemy: EnemyEntity, previousPosition: Readonly<THREE.Vector3>): void {
    if (enemy.collisionCooldown > 0) {
      return;
    }
    const hit = this.getEnvironmentCollisionHit(previousPosition, enemy.object.position, enemy.radius);
    if (!hit) {
      return;
    }
    const outcome = resolveCollision(
      { hull: enemy.hull, shield: enemy.shield, armor: enemy.armor, mass: enemy.mass, speed: 0 },
      this.getEnvironmentCollisionBody(hit.obstacle),
      this.getEnvironmentImpactSpeed(enemy.velocity, hit.collision.normal),
    );
    enemy.object.position.copy(hit.collision.position);
    this.bounceVelocityOffSurface(enemy.velocity, hit.collision.normal);
    enemy.hull = outcome.a.hull;
    enemy.shield = outcome.a.shield;
    enemy.hitFlash = 1;
    enemy.collisionCooldown = COLLISION_COOLDOWN;
    if (enemy.hull <= 0) {
      this.destroyEnemy(enemy, false);
    }
  }

  private resolveAsteroidEnvironmentCollision(asteroid: AsteroidEntity, previousPosition: Readonly<THREE.Vector3>): void {
    if (asteroid.collisionCooldown > 0) {
      return;
    }
    const hit = this.getEnvironmentCollisionHit(previousPosition, asteroid.object.position, asteroid.radius);
    if (!hit) {
      return;
    }
    const outcome = resolveCollision(
      { hull: asteroid.hull, shield: asteroid.shield, armor: asteroid.armor, mass: asteroid.mass, speed: 0 },
      this.getEnvironmentCollisionBody(hit.obstacle),
      this.getEnvironmentImpactSpeed(asteroid.velocity, hit.collision.normal),
    );
    asteroid.object.position.copy(hit.collision.position);
    this.bounceVelocityOffSurface(asteroid.velocity, hit.collision.normal);
    asteroid.hull = outcome.a.hull;
    asteroid.shield = outcome.a.shield;
    asteroid.hitFlash = 1;
    asteroid.collisionCooldown = COLLISION_COOLDOWN;
    if (asteroid.hull <= 0) {
      this.destroyAsteroid(asteroid, false);
    }
  }

  private handleCombat(): void {
    for (const enemy of [...this.enemies]) {
      for (const laser of [...this.lasers]) {
        if (!this.enemies.includes(enemy)) break;
        if (laser.kind !== 'player') {
          continue;
        }
        if (segmentSphereIntersection(laser.previousPosition, laser.object.position, enemy.object.position, enemy.radius + laser.radius) !== null) {
          this.removeLaser(laser);
          this.shotsHit += 1;
          this.damageEnemy(enemy, laser.damage);
        }
      }
    }

    this.handleBossLaserHits();

    for (const asteroid of [...this.asteroids]) {
      for (const laser of [...this.lasers]) {
        if (!this.asteroids.includes(asteroid)) break;
        if (segmentSphereIntersection(laser.previousPosition, laser.object.position, asteroid.object.position, asteroid.radius + laser.radius) === null) {
          continue;
        }
        this.removeLaser(laser);
        if (laser.kind === 'player') {
          this.shotsHit += 1;
          this.damageAsteroid(asteroid, laser.damage, true);
        } else {
          this.damageAsteroid(asteroid, laser.damage * 0.7, false);
        }
      }
    }

    for (const laser of [...this.lasers]) {
      if (laser.kind !== 'enemy') {
        continue;
      }
      if (segmentSphereIntersection(laser.previousPosition, laser.object.position, this.playerRoot.position, this.playerRadius + laser.radius) !== null) {
        this.removeLaser(laser);
        this.applyPlayerDamage(laser.damage);
      }
    }

    if (!this.collisionsEnabled) {
      return;
    }

    for (const asteroid of [...this.asteroids]) {
      this.resolvePlayerCollisionWithAsteroid(asteroid);
      for (const enemy of [...this.enemies]) {
        this.resolveEnemyCollisionWithAsteroid(enemy, asteroid);
      }
    }

    for (const enemy of [...this.enemies]) {
      this.resolvePlayerCollisionWithEnemy(enemy);
    }
  }

  private resolvePlayerCollisionWithAsteroid(asteroid: AsteroidEntity): void {
    if (this.playerCollisionCooldown > 0 || asteroid.collisionCooldown > 0) {
      return;
    }
    if (!this.sphereHit(this.playerRoot.position, this.playerRadius, asteroid.object.position, asteroid.radius)) {
      return;
    }

    const relativeSpeed = relativeVelocityMagnitude(this.playerVelocity, asteroid.velocity);
    const stats = this.getCurrentShipStats();
    const outcome = resolveCollision(
      { hull: this.playerHull, shield: this.playerShield, armor: stats.armor, mass: stats.mass, speed: 0 },
      { hull: asteroid.hull, shield: asteroid.shield, armor: asteroid.armor, mass: asteroid.mass, speed: 0 },
      relativeSpeed,
    );
    asteroid.hull = outcome.b.hull;
    asteroid.shield = outcome.b.shield;
    asteroid.hitFlash = 1;
    this.shieldFlash = 1;
    this.playerCollisionCooldown = COLLISION_COOLDOWN;
    asteroid.collisionCooldown = COLLISION_COOLDOWN;
    this.separate(this.playerRoot.position, asteroid.object.position, this.playerRadius + asteroid.radius, 0.45, 0.55);
    this.bounceVelocities(this.playerVelocity, asteroid.velocity, this.playerRoot.position, asteroid.object.position, outcome.separationSpeed);
    this.audio.playImpact(this.playerShield > 0, outcome.impactDamage);
    this.commitPlayerDamageResult(outcome.a, 'Your ship broke apart in the debris field.');
    if (asteroid.hull <= 0) {
      this.destroyAsteroid(asteroid, false);
    }
  }

  private resolveEnemyCollisionWithAsteroid(enemy: EnemyEntity, asteroid: AsteroidEntity): void {
    if (enemy.collisionCooldown > 0 || asteroid.collisionCooldown > 0) {
      return;
    }
    if (!this.sphereHit(enemy.object.position, enemy.radius, asteroid.object.position, asteroid.radius)) {
      return;
    }
    const relativeSpeed = relativeVelocityMagnitude(enemy.velocity, asteroid.velocity);
    const outcome = resolveCollision(
      { hull: enemy.hull, shield: enemy.shield, armor: enemy.armor, mass: enemy.mass, speed: 0 },
      { hull: asteroid.hull, shield: asteroid.shield, armor: asteroid.armor, mass: asteroid.mass, speed: 0 },
      relativeSpeed,
    );
    enemy.hull = outcome.a.hull;
    enemy.shield = outcome.a.shield;
    asteroid.hull = outcome.b.hull;
    asteroid.shield = outcome.b.shield;
    enemy.hitFlash = 1;
    asteroid.hitFlash = 1;
    enemy.collisionCooldown = COLLISION_COOLDOWN;
    asteroid.collisionCooldown = COLLISION_COOLDOWN;
    this.separate(enemy.object.position, asteroid.object.position, enemy.radius + asteroid.radius, 0.5, 0.5);
    this.bounceVelocities(enemy.velocity, asteroid.velocity, enemy.object.position, asteroid.object.position, outcome.separationSpeed);
    if (enemy.hull <= 0) {
      this.destroyEnemy(enemy, false);
    }
    if (asteroid.hull <= 0) {
      this.destroyAsteroid(asteroid, false);
    }
  }

  private resolvePlayerCollisionWithEnemy(enemy: EnemyEntity): void {
    if (this.playerCollisionCooldown > 0 || enemy.collisionCooldown > 0) {
      return;
    }
    if (!this.sphereHit(this.playerRoot.position, this.playerRadius, enemy.object.position, enemy.radius)) {
      return;
    }
    const relativeSpeed = relativeVelocityMagnitude(this.playerVelocity, enemy.velocity);
    const stats = this.getCurrentShipStats();
    const outcome = resolveCollision(
      { hull: this.playerHull, shield: this.playerShield, armor: stats.armor, mass: stats.mass, speed: 0 },
      { hull: enemy.hull, shield: enemy.shield, armor: enemy.armor, mass: enemy.mass, speed: 0 },
      relativeSpeed,
    );
    enemy.hull = outcome.b.hull;
    enemy.shield = outcome.b.shield;
    this.playerCollisionCooldown = COLLISION_COOLDOWN;
    enemy.collisionCooldown = COLLISION_COOLDOWN;
    this.shieldFlash = 1;
    enemy.hitFlash = 1;
    this.separate(this.playerRoot.position, enemy.object.position, this.playerRadius + enemy.radius, 0.45, 0.55);
    this.bounceVelocities(this.playerVelocity, enemy.velocity, this.playerRoot.position, enemy.object.position, outcome.separationSpeed);
    this.audio.playImpact(this.playerShield > 0, outcome.impactDamage);
    this.commitPlayerDamageResult(outcome.a, 'Your ship was crushed in a closing pass.');
    if (enemy.hull <= 0) {
      this.destroyEnemy(enemy, false);
    }
  }

  private damageEnemy(enemy: EnemyEntity, rawDamage: number): void {
    const result = applyDamage({ shield: enemy.shield, hull: enemy.hull }, rawDamage, enemy.armor);
    enemy.shield = result.shield;
    enemy.hull = result.hull;
    enemy.hitFlash = 1;
    this.spawnSpark(enemy.object.position, 0xff8f63, 0.6);
    if (result.destroyed) {
      this.destroyEnemy(enemy, true);
    }
  }

  private damageAsteroid(asteroid: AsteroidEntity, rawDamage: number, byPlayer: boolean): void {
    const result = applyDamage({ shield: asteroid.shield, hull: asteroid.hull }, rawDamage, asteroid.armor);
    asteroid.shield = result.shield;
    asteroid.hull = result.hull;
    asteroid.hitFlash = 1;
    if (result.destroyed) {
      this.destroyAsteroid(asteroid, byPlayer);
    }
  }

  private commitPlayerDamageResult(incoming: DamageResult, defeatMessage: string, cause: BlastCause = 'collision'): void {
    let result = incoming;
    if (this.aegisPoints > 0 && this.damageEnabled) {
      const soaked = absorbWithOvershield(incoming, this.aegisPoints);
      this.aegisPoints = soaked.remaining;
      result = soaked.result;
      if (soaked.absorbed > 0) this.spawnSpark(this.playerRoot.position, 0xeaf6ff, 1.6);
    }
    const next = resolvePlayerDamageState(
      { shield: this.playerShield, hull: this.playerHull },
      result,
      this.damageEnabled,
    );
    const tookDamage = next.shield !== this.playerShield || next.hull !== this.playerHull;
    this.damageTaken += Math.max(0, this.playerShield - next.shield) + Math.max(0, this.playerHull - next.hull);
    this.playerShield = next.shield;
    this.playerHull = next.hull;
    this.shieldFlash = 1;
    if (tookDamage) {
      this.timeSincePlayerDamage = 0;
    }
    if (this.damageEnabled && result.destroyed) {
      this.endGame('defeat', defeatMessage, cause);
    }
  }

  private applyPlayerDamage(rawDamage: number): void {
    if (this.mode !== 'playing') {
      return;
    }
    const stats = this.getCurrentShipStats();
    const result = applyDamage({ shield: this.playerShield, hull: this.playerHull }, rawDamage, stats.armor);
    this.audio.playImpact(this.damageEnabled ? result.shieldLoss > 0 : this.playerShield > 0, rawDamage);
    this.commitPlayerDamageResult(result, 'Your hull has collapsed.', 'weapon');
  }

  private destroyEnemy(enemy: EnemyEntity, byPlayer: boolean): void {
    if (!this.enemies.includes(enemy)) return;
    const power: Record<ShipClass, number> = { fighter: 1.2, interceptor: 1, bomber: 1.5, shuttle: 1.3, freighter: 1.9, destroyer: 2.6 };
    this.spawnBlast(enemy.object.position, {
      radius: enemy.radius * 1.15,
      power: power[enemy.shipClass],
      velocity: enemy.velocity,
      cause: byPlayer ? 'weapon' : 'collision',
    });
    if (byPlayer) {
      this.kills += 1;
      this.combo = getComboAfterKill(this.combo, this.lastKillTimer);
      this.lastKillTimer = 0;
      this.score += getKillScore(enemy.shipClass, Math.max(1, this.wave), Math.max(1, this.combo));
      this.spawnEnemyDrop(enemy);
    }
    this.removeEnemy(enemy);
  }

  private destroyAsteroid(asteroid: AsteroidEntity, byPlayer: boolean): void {
    if (!this.asteroids.includes(asteroid)) return;
    this.spawnBlast(asteroid.object.position, {
      radius: asteroid.radius * 1.5,
      power: 0.7 + asteroid.radius * 0.28,
      velocity: asteroid.velocity,
      cause: byPlayer ? 'weapon' : 'collision',
      rocky: true,
    });
    if (byPlayer) {
      this.score += getAsteroidScore(asteroid.radius, Math.max(1, this.combo));
    }
    this.removeAsteroid(asteroid);
  }

  private getBlastTextures(): { fire: THREE.CanvasTexture; smoke: THREE.CanvasTexture } {
    if (this.blastTextures) return this.blastTextures;
    const make = (draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture => {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) draw(ctx, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    const blob = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stops: Array<[number, string]>) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      stops.forEach(([at, color]) => gradient.addColorStop(at, color));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    };
    const fire = make((ctx, size) => {
      blob(ctx, size / 2, size / 2, size / 2, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.85)'], [0.6, 'rgba(255,255,255,.3)'], [1, 'rgba(255,255,255,0)']]);
    });
    const smoke = make((ctx, size) => {
      for (let index = 0; index < 7; index += 1) {
        const angle = (index / 7) * Math.PI * 2;
        const distance = index === 0 ? 0 : size * 0.16;
        blob(ctx, size / 2 + Math.cos(angle) * distance, size / 2 + Math.sin(angle) * distance, size * 0.34, [[0, 'rgba(255,255,255,.55)'], [0.6, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']]);
      }
    });
    this.blastTextures = { fire, smoke };
    return this.blastTextures;
  }

  private updateBlasts(dt: number): void {
    for (const blast of this.blasts) {
      blast.age += dt;
      for (const part of blast.parts) part(blast.age, dt);
    }
    const finished = this.blasts.filter((blast) => blast.age >= blast.life);
    finished.forEach((blast) => {
      disposeObject3D(blast.root);
      this.blasts = this.blasts.filter((candidate) => candidate.id !== blast.id);
    });
  }

  /** Layered, additive-glow explosion: flash, fireballs, smoke, shockwaves, debris, sparks and secondary blasts. */
  private spawnBlast(
    position: THREE.Vector3,
    options: { radius: number; power: number; cause?: BlastCause; velocity?: THREE.Vector3; rocky?: boolean },
  ): void {
    const collision = options.cause === 'collision';
    const radius = Math.max(1.4, options.radius);
    const power = clamp(options.power * (collision ? 1.3 : 1), 0.5, 4.5);
    const inherit = (options.velocity ?? new THREE.Vector3()).clone().multiplyScalar(0.45);
    const root = new THREE.Group();
    root.position.copy(position);
    this.effectLayer.add(root);
    const parts: BlastEntity['parts'] = [];
    const ramp = [0xffffff, 0xfff0b0, 0xffb347, 0xff5a1f, 0x6e1a0c].map((hex) => new THREE.Color(hex));
    const rampColor = (t: number, target: THREE.Color): THREE.Color => {
      const scaled = clamp(t, 0, 1) * (ramp.length - 1);
      const index = Math.min(ramp.length - 2, Math.floor(scaled));
      return target.copy(ramp[index]).lerp(ramp[index + 1], scaled - index);
    };
    const unit = () => new THREE.Vector3(this.randomRange(-1, 1), this.randomRange(-1, 1), this.randomRange(-1, 1)).normalize();
    const additive = (color: number, opacity = 1) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

    const textures = this.getBlastTextures();
    const sprite = (map: THREE.Texture, color: number, blending: THREE.Blending): THREE.Sprite => {
      const material = new THREE.SpriteMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, blending });
      material.rotation = this.randomRange(0, Math.PI * 2);
      const instance = new THREE.Sprite(material);
      instance.visible = false;
      root.add(instance);
      return instance;
    };
    const addFlash = (offset: THREE.Vector3, size: number, delay: number, life: number) => {
      const flash = sprite(textures.fire, 0xfff6d8, THREE.AdditiveBlending);
      flash.position.copy(offset);
      parts.push((age) => {
        const t = (age - delay) / life;
        flash.visible = t >= 0 && t <= 1;
        if (!flash.visible) return;
        flash.scale.setScalar(size * 2 * (0.6 + 1.9 * (1 - Math.pow(1 - t, 3))));
        flash.material.opacity = Math.pow(1 - t, 2);
      });
    };
    const addFireball = (offset: THREE.Vector3, r0: number, r1: number, delay: number, life: number) => {
      const ball = sprite(textures.fire, 0xffffff, THREE.AdditiveBlending);
      ball.position.copy(offset);
      const color = new THREE.Color();
      const spin = this.randomRange(-0.9, 0.9);
      parts.push((age, dt) => {
        const t = (age - delay) / life;
        ball.visible = t >= 0 && t <= 1;
        if (!ball.visible) return;
        ball.scale.setScalar(2 * (r0 + (r1 - r0) * (1 - Math.pow(1 - t, 2.2))));
        ball.material.rotation += spin * dt;
        ball.material.color.copy(rampColor(t, color));
        ball.material.opacity = Math.min(1, t / 0.08) * Math.pow(1 - t, 1.1);
      });
    };
    const addSmoke = (offset: THREE.Vector3, r0: number, r1: number, delay: number, life: number) => {
      const puff = sprite(textures.smoke, rocky(0x6a5d50, 0x30323a), THREE.NormalBlending);
      puff.position.copy(offset);
      const drift = unit().multiplyScalar(radius * 0.3);
      const spin = this.randomRange(-0.5, 0.5);
      parts.push((age, dt) => {
        const t = (age - delay) / life;
        puff.visible = t >= 0 && t <= 1;
        if (!puff.visible) return;
        puff.position.addScaledVector(drift, dt);
        puff.scale.setScalar(2 * (r0 + (r1 - r0) * (1 - Math.pow(1 - t, 1.8))));
        puff.material.rotation += spin * dt;
        puff.material.opacity = Math.min(1, t / 0.2) * (1 - t) * 0.75;
      });
    };
    function rocky(rockColor: number, metalColor: number): number {
      return options.rocky ? rockColor : metalColor;
    }
    const addShock = (color: number, reach: number, life: number, delay = 0) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 56), additive(color, 0));
      (mesh.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
      mesh.rotation.set(this.randomRange(0, Math.PI), this.randomRange(0, Math.PI), 0);
      mesh.visible = false;
      root.add(mesh);
      parts.push((age) => {
        const t = (age - delay) / life;
        mesh.visible = t >= 0 && t <= 1;
        if (!mesh.visible) return;
        mesh.scale.setScalar(radius * (0.3 + reach * (1 - Math.pow(1 - t, 3))));
        (mesh.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - t, 1.5) * 0.85;
      });
    };

    // Primary burst
    addFlash(new THREE.Vector3(), radius, 0, 0.28);
    const fireballs = 4 + Math.round(power * 1.5);
    for (let index = 0; index < fireballs; index += 1) {
      const offset = unit().multiplyScalar(radius * this.randomRange(0.05, 0.55));
      addFireball(offset, radius * 0.4, radius * this.randomRange(1.4, 2.3), this.randomRange(0, 0.14), this.randomRange(0.85, 1.4));
    }
    for (let index = 0; index < 3 + Math.round(power); index += 1) {
      addSmoke(unit().multiplyScalar(radius * 0.5), radius * 0.6, radius * this.randomRange(1.6, 2.5), this.randomRange(0.15, 0.45), this.randomRange(1.4, 2.2));
    }
    addShock(options.rocky ? 0xffd2a0 : 0xbfe9ff, 3.6 + power, 0.6);
    addShock(0xffb46b, 2.6 + power * 0.7, 0.8, 0.06);
    if (collision) addShock(0xffffff, 5.5 + power, 0.5, 0.02);

    // Secondary blasts: cooking-off reactors and ruptured tanks
    const secondaries = collision ? 3 + Math.round(power * 0.7) : Math.round(power * 0.6);
    let secondaryBang = 0;
    for (let index = 0; index < secondaries; index += 1) {
      const delay = 0.14 + index * 0.17 + this.randomRange(0, 0.08);
      const offset = unit().multiplyScalar(radius * this.randomRange(0.5, 1.2));
      addFlash(offset, radius * 0.55, delay, 0.22);
      addFireball(offset, radius * 0.2, radius * this.randomRange(0.6, 0.95), delay, this.randomRange(0.5, 0.8));
      if (index === 0) {
        parts.push((age) => {
          if (secondaryBang === 0 && age >= delay) {
            secondaryBang = 1;
            this.audio.playExplosion(clamp(1.2 + power * 0.6, 1, 5));
          }
        });
      }
    }

    // Debris: hot chunks that cool as they tumble away
    const debrisGeometries = [new THREE.BoxGeometry(1, 1, 1), new THREE.TetrahedronGeometry(1), new THREE.OctahedronGeometry(1)];
    const debrisCount = Math.round((10 + 12 * power) * (collision ? 1.4 : 1));
    for (let index = 0; index < debrisCount; index += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: rocky(0x6b5f55, 0x59627a),
        emissive: 0xff6a1f,
        emissiveIntensity: 2.4,
        roughness: 0.6,
        metalness: options.rocky ? 0.1 : 0.7,
        transparent: true,
      });
      const mesh = new THREE.Mesh(debrisGeometries[index % debrisGeometries.length], material);
      const baseScale = new THREE.Vector3(this.randomRange(0.06, 0.26), this.randomRange(0.06, 0.2), this.randomRange(0.08, 0.34)).multiplyScalar(radius);
      mesh.scale.copy(baseScale);
      mesh.rotation.set(this.randomRange(0, 6), this.randomRange(0, 6), this.randomRange(0, 6));
      root.add(mesh);
      const velocity = unit().multiplyScalar(radius * this.randomRange(2.5, 9) * (collision ? 1.3 : 1)).add(inherit);
      const spin = unit().multiplyScalar(this.randomRange(2, 9));
      const life = this.randomRange(1.4, 2.7);
      parts.push((age, dt) => {
        const t = age / life;
        mesh.visible = t < 1;
        if (!mesh.visible) return;
        mesh.position.addScaledVector(velocity, dt);
        velocity.multiplyScalar(Math.exp(-0.8 * dt));
        mesh.rotation.x += spin.x * dt;
        mesh.rotation.y += spin.y * dt;
        mesh.rotation.z += spin.z * dt;
        material.emissiveIntensity = 2.6 * Math.pow(1 - clamp(t * 1.4, 0, 1), 2);
        const shrink = 1 - clamp((t - 0.7) / 0.3, 0, 1);
        mesh.scale.copy(baseScale).multiplyScalar(shrink);
        material.opacity = clamp(shrink * 1.5, 0, 1);
      });
    }

    // Sparks: fast glowing streaks
    const sparkCount = Math.round(70 + 90 * power);
    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkVelocities = Array.from({ length: sparkCount }, () => unit().multiplyScalar(radius * this.randomRange(5, 20)).add(inherit));
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    const sparkMaterial = new THREE.PointsMaterial({
      map: textures.fire,
      color: 0xffd08a,
      size: 1.1 * clamp(radius / 3, 0.7, 2.2),
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
    sparks.frustumCulled = false;
    root.add(sparks);
    parts.push((age, dt) => {
      const t = age / 1.3;
      sparks.visible = t < 1;
      if (!sparks.visible) return;
      for (let index = 0; index < sparkCount; index += 1) {
        const velocity = sparkVelocities[index];
        sparkPositions[index * 3] += velocity.x * dt;
        sparkPositions[index * 3 + 1] += velocity.y * dt;
        sparkPositions[index * 3 + 2] += velocity.z * dt;
        velocity.multiplyScalar(Math.exp(-1.7 * dt));
      }
      sparkGeometry.attributes.position.needsUpdate = true;
      sparkMaterial.opacity = Math.pow(1 - t, 1.3);
      sparkMaterial.color.setHex(t < 0.35 ? 0xfff0c0 : 0xff9a45);
    });

    const blast: BlastEntity = { id: ++this.blastId, root, age: 0, life: 3.4, parts };
    this.blasts.push(blast);
    while (this.blasts.length > 14) {
      const oldest = this.blasts.shift();
      if (oldest) disposeObject3D(oldest.root);
    }

    const distance = position.distanceTo(this.camera.position);
    this.cameraShake = Math.min(1.5, this.cameraShake + 0.2 * power * clamp(90 / (distance + 25), 0, 1.3));
    this.audio.playExplosion(clamp(1 + radius * 0.3 + power, 1, 6));
  }

  private spawnExplosion(position: THREE.Vector3, size: number, color: number): void {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.28 * size, 16, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    group.add(core);

    for (let index = 0; index < 6; index += 1) {
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(0.16 * size, 0.16 * size, 0.6 * size),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, depthWrite: false }),
      );
      shard.position.set(this.randomRange(-0.5, 0.5), this.randomRange(-0.4, 0.4), this.randomRange(-0.4, 0.4));
      shard.rotation.set(this.randomRange(0, Math.PI), this.randomRange(0, Math.PI), this.randomRange(0, Math.PI));
      group.add(shard);
    }

    group.position.copy(position);
    this.effectLayer.add(group);
    this.explosions.push({
      id: ++this.explosionId,
      object: group,
      life: 0.55 + size * 0.1,
      maxLife: 0.55 + size * 0.1,
      growth: 1.5 + size * 0.25,
      drift: new THREE.Vector3(this.randomRange(-2, 2), this.randomRange(-1, 1), this.randomRange(-2, 2)),
    });
  }

  private spawnSpark(position: THREE.Vector3, color: number, size: number): void {
    const wrapper = new THREE.Group();
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 * size, 10, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    wrapper.position.copy(position);
    wrapper.add(spark);
    this.effectLayer.add(wrapper);
    this.explosions.push({
      id: ++this.explosionId,
      object: wrapper,
      life: 0.18,
      maxLife: 0.18,
      growth: 2.4,
      drift: new THREE.Vector3(),
    });
  }

  private updatePlayerShieldVisual(_stats: ShipDefinition): void {
    this.syncCollisionShell(this.playerShieldShell, this.playerShield > 0);
    if (!this.playerShip) {
      return;
    }
    applyImpactFlash(this.playerShip, this.shieldFlash, this.playerShield > 0 ? 0x7fd8ff : 0xff8c68);
  }

  private updateEnemyShieldVisual(enemy: EnemyEntity): void {
    this.syncCollisionShell(enemy.shieldShell, enemy.shield > 0);
    applyImpactFlash(enemy.object, enemy.hitFlash, enemy.pursuit.combat ? 0xff8665 : 0xffd36f);
  }

  private syncCollisionShell(shell: THREE.Mesh | undefined, enabled: boolean): void {
    if (!shell) {
      return;
    }
    const material = shell.material;
    if (!(material instanceof THREE.MeshBasicMaterial)) {
      return;
    }
    shell.visible = this.collisionBoundsVisible && enabled;
    material.color.setHex(0x7fe4ff);
    material.opacity = this.collisionBoundsVisible && enabled ? DEBUG_COLLISION_OPACITY : 0;
    shell.scale.setScalar(1);
  }

  private syncCollisionBoundsVisibility(): void {
    this.syncCollisionShell(this.playerShieldShell, this.playerShield > 0);
    this.enemies.forEach((enemy) => this.syncCollisionShell(enemy.shieldShell, enemy.shield > 0));
  }

  private scheduleWave(wave: number): void {
    const config = getWaveConfig(wave);
    const roster = getWaveEnemyRoster(wave);
    const combatRoster = roster.filter(isCombatShip);
    const extraCombat = Math.floor(combatRoster.length * (this.encounterScaling.count - 1) + 1e-6);
    for (let index = 0; index < extraCombat; index += 1) {
      roster.push(wave >= 3 && index % 2 === 0 ? 'bomber' : 'interceptor');
    }
    if (isVictoryWave(wave)) {
      const trimmed = trimBossEscorts(roster, isCombatShip, (ship) => SHIPS[ship].hull + SHIPS[ship].shield, BOSS_ESCORT_LIMIT[this.difficulty]);
      roster.length = 0;
      roster.push(...trimmed);
    }
    this.wave = wave;
    this.message = `Wave ${wave}: ${config.message}`;
    this.spawnClock = 0;
    this.nextWaveDelay = 0;
    this.spawnQueue = [];
    this.targetAsteroidCount = config.asteroids;
    this.environmentSpeed = config.environmentSpeed;
    this.waveAnchor.copy(this.playerRoot.position);
    this.waveSpawnOrientation.copy(this.playerRoot.quaternion);
    if (isVictoryWave(wave)) {
      this.activateBoss();
    }

    this.spawnWaveSupplies(wave);
    const bossWave = isVictoryWave(wave);
    const combatGap = bossWave ? BOSS_ESCORT_GAP : wave === 1 ? 4.5 : wave === 2 ? 3.4 : wave === 3 ? 2.2 : 1.4;
    const bonusGap = wave <= 2 ? 1.05 : 0.86;
    let combatIndex = 0;
    let bonusIndex = 0;
    for (const shipClass of roster) {
      const bonus = !isCombatShip(shipClass);
      const delay = bonus
        ? 1.6 + bonusIndex * bonusGap + this.randomRange(0, 0.28)
        : (bossWave ? BOSS_ESCORT_LEAD_IN : wave === 1 ? 4 : 1.6) + combatIndex * combatGap + this.randomRange(0, 0.22 + (bossWave ? 1.2 : 0));
      this.spawnQueue.push({ type: 'enemy', delay, shipClass });
      if (bonus) bonusIndex += 1; else combatIndex += 1;
    }
    for (let index = 0; index < config.asteroids; index += 1) {
      this.spawnQueue.push({
        type: 'asteroid',
        delay: 0.55 + index * 0.84 + this.randomRange(0, 0.32),
        radius: this.randomRange(1.1, 3.0),
        speed: config.asteroidSpeed + this.randomRange(-2, 4),
      });
    }
    this.spawnQueue.sort((a, b) => a.delay - b.delay);
  }

  /** Every wave opens with a visible combat powerup (torpedoes when you carry them) so the radar always has something to chase. */
  private spawnWaveSupplies(wave: number): void {
    const stats = this.getCurrentShipStats();
    const forward = getBasisVectors(this.playerRoot.quaternion);
    const place = (type: PickupType, amount: number, distance: number, side: number) => {
      const position = this.playerRoot.position.clone().addScaledVector(forward.forward, distance).addScaledVector(forward.right, side).addScaledVector(forward.up, this.randomRange(-8, 10));
      this.spawnPickup(type, position, amount, 0.25);
    };
    const first: PickupType = stats.torpedoes > 0 && this.torpedoes < stats.torpedoes ? 'torpedo' : 'overcharge';
    place(first, first === 'torpedo' ? TORPEDO.pickupAmount : 1, 62, this.randomRange(-26, -10));
    place('aegis', 1, 78, this.randomRange(10, 28));
    if (wave % 2 === 0 || isVictoryWave(wave)) place('shield', 30, 55, this.randomRange(-6, 6));
    if (wave === 1) place('energy', 35, 48, this.randomRange(-5, 5));
  }

  private advanceWaves(dt: number): void {
    if (this.boss && !this.boss.defeated) {
      this.nextWaveDelay = 0;
      return;
    }
    const activeCombat = this.enemies.filter((enemy) => isCombatShip(enemy.shipClass)).length;
    const pendingCombat = this.spawnQueue.reduce((total, spawn) => total + (spawn.type === 'enemy' && spawn.shipClass && isCombatShip(spawn.shipClass) ? 1 : 0), 0);
    if (activeCombat === 0 && pendingCombat === 0) {
      if (this.wave >= 1 && this.nextWaveDelay <= 0) {
        this.nextWaveDelay = WAVE_CLEAR_DELAY;
      }
      if (this.nextWaveDelay > 0) {
        this.nextWaveDelay -= dt;
        if (this.nextWaveDelay <= 0) {
          if (isVictoryWave(this.wave)) {
            this.endGame('victory', 'Enemy combat wave destroyed. Corridor secured.');
          } else {
            this.scheduleWave(this.wave + 1);
          }
        }
      }
    } else {
      this.nextWaveDelay = 0;
    }
  }

  private buildPlayingMessage(): string {
    if (this.result === 'victory') {
      return 'Victory';
    }
    if (this.result === 'defeat') {
      return 'Defeat';
    }
    if (this.currentBoundaryLoad > 0.72) {
      return 'Boundary advisory — you can recover out wide, but arc back before the edge closes in.';
    }
    if (this.boss && !this.boss.defeated) {
      const remaining = this.boss.subsystems.filter((sub) => !sub.destroyed).length;
      const shieldPct = Math.round((this.boss.shield / this.boss.maxShield) * 100);
      return this.boss.shield > 0
        ? `${this.boss.name} — shields ${shieldPct}%. Destroy the shield domes, then strike the bridge (${remaining}/4 systems online).`
        : `${this.boss.name} — shields down! Hit the bridge tower (${remaining}/4 systems online).`;
    }
    if (this.nextWaveDelay > 0) {
      return isVictoryWave(this.wave) ? 'Sector clear. Hold formation...' : `Wave ${this.wave} clear. Next combat contacts in ${this.nextWaveDelay.toFixed(1)}s`;
    }
    if (this.recoveryActive) {
      return 'Recovery pocket clear — regroup, collect supplies, and re-enter on your terms.';
    }
    const tracked = this.enemies.filter((enemy) => isCombatShip(enemy.shipClass)).length
      + this.spawnQueue.reduce((total, spawn) => total + (spawn.type === 'enemy' && spawn.shipClass && isCombatShip(spawn.shipClass) ? 1 : 0), 0);
    const bonuses = this.enemies.filter((enemy) => !isCombatShip(enemy.shipClass)).length;
    const distance = this.getNearestEnemyDistance(true);
    const bonusText = bonuses > 0 ? ` / ${bonuses} fleeing bonus target${bonuses === 1 ? '' : 's'}` : '';
    return distance !== undefined
      ? `Wave ${this.wave} engaged — ${tracked} combat threat${tracked === 1 ? '' : 's'}${bonusText} / nearest ${formatSpaceDistance(distance)}`
      : `Wave ${this.wave} engaged — ${tracked} combat threat${tracked === 1 ? '' : 's'}${bonusText}`;
  }

  private buildSummary(): MissionSummary {
    const stats = this.getCurrentShipStats();
    const boss = this.boss;
    const bossTimeSec = this.bossStartTime !== null && this.bossClearTime !== null ? this.bossClearTime - this.bossStartTime : null;
    return {
      durationSec: this.missionTime,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      accuracy: computeAccuracy(this.shotsFired, this.shotsHit),
      kills: this.kills,
      damageTaken: this.damageTaken,
      maxDurability: stats.hull + stats.shield,
      bossEngaged: this.bossStartTime !== null,
      bossTimeSec,
      bossHullPct: boss ? Math.round(((boss.hull + boss.shield) / (boss.maxHull + boss.maxShield)) * 100) : null,
      subsystemsDestroyed: boss ? boss.subsystems.filter((sub) => sub.destroyed).length : 0,
      subsystemsTotal: boss ? boss.subsystems.length : 0,
    };
  }

  private emitSnapshot(force = false): void {
    if (!force && this.snapshotAccumulator < SNAPSHOT_INTERVAL) {
      return;
    }
    this.snapshotAccumulator = 0;
    const stats = this.getCurrentShipStats();
    const basis = getBasisVectors(this.playerRoot.quaternion);
    const combatTracked = this.enemies.filter((enemy) => isCombatShip(enemy.shipClass)).length
      + this.spawnQueue.reduce((total, spawn) => total + (spawn.type === 'enemy' && spawn.shipClass && isCombatShip(spawn.shipClass) ? 1 : 0), 0);
    this.onUpdate({
      mode: this.mode,
      hull: Math.round(this.playerHull),
      shield: Math.round(this.playerShield),
      upgrades: this.getShipUpgradeLevels(this.ship),
      maxHull: stats.hull,
      maxShield: stats.shield,
      attackDamage: stats.damage,
      energy: Math.round(this.energy),
      score: this.score,
      wave: this.wave,
      kills: this.kills,
      speed: Math.round(this.playerVelocity.length() * 10) / 10,
      combo: this.combo,
      enemies: combatTracked,
      message: this.message,
      result: this.result,
      ship: this.ship,
      heading: Math.round(getHeadingDegrees(basis.forward)),
      altitude: Math.round(this.playerRoot.position.y * 10) / 10,
      targetDistance: this.getNearestEnemyDistance(true),
      pickupMessage: this.pickupMessage,
      recovery: this.recoveryActive,
      captureActive: this.isMouseCaptureActive(),
      difficulty: this.difficulty,
      summary: this.buildSummary(),
      autoMode: this.autoMode,
      autoStatus: this.autoStatus,
      torpedoes: this.torpedoes,
      torpedoCapacity: stats.torpedoes,
      overcharge: Math.round(this.overchargeTimer * 10) / 10,
      aegis: Math.round(this.aegisPoints),
      target: (() => {
        const resolved = this.resolveTarget();
        return resolved ? { name: resolved.name, detail: resolved.detail, distance: resolved.position.distanceTo(this.playerRoot.position) } : null;
      })(),
      boss: this.boss
        ? {
            name: this.boss.name,
            hull: Math.round(this.boss.hull),
            maxHull: this.boss.maxHull,
            shield: Math.round(this.boss.shield),
            maxShield: this.boss.maxShield,
            phase: getBossPhase(this.boss),
            subsystems: this.boss.subsystems.map((sub) => ({ id: sub.id, name: sub.name, destroyed: sub.destroyed, hull: Math.round(sub.hull), maxHull: sub.maxHull })),
          }
        : null,
    });
  }

  private rebuildPlayerShip(shipClass: ShipClass): void {
    if (this.playerShip) {
      disposeObject3D(this.playerShip);
      this.playerShip = undefined;
      this.playerShieldShell = undefined;
    }
    this.playerRoot.clear();
    this.playerRoot.position.set(0, PLAYER_BASE_Y, PLAYER_START_Z);
    this.playerRoot.quaternion.identity();
    const ship = createShipModel(shipClass, { accent: 0x8be3ff, tint: 0x909db3, scale: SHIP_MODEL_SCALE[shipClass] });
    const bounds = new THREE.Box3().setFromObject(ship);
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    const shield = createShieldShell(radius, 0x86e7ff);
    if (shield.material instanceof THREE.MeshBasicMaterial) {
      shield.material.color.setHex(0x7fe4ff);
      shield.material.opacity = this.collisionBoundsVisible ? DEBUG_COLLISION_OPACITY : 0;
    }
    shield.visible = this.collisionBoundsVisible;
    ship.add(shield);
    this.playerRoot.add(ship);
    this.playerShip = ship;
    this.playerShieldShell = shield;
    this.playerRadius = radius;
    this.playerMuzzleDistance = Math.max(radius * 0.7, -bounds.min.z);
    this.syncCollisionBoundsVisibility();
  }

  private endGame(result: GameSnapshot['result'], message: string, cause: BlastCause = 'weapon'): void {
    if (this.mode !== 'playing') {
      return;
    }
    this.mode = 'ended';
    this.result = result;
    this.message = message;
    this.releaseMouseCapture(true);
    this.releaseContinuousInput();
    this.audio.setEngine(false, 0, false);
    this.audio.setBossDrone(false, 0);
    this.autoMode = 'off';
    this.autoFire = false;
    this.autoBoost = false;
    this.autoStatus = '';
    this.target = null;
    if (result === 'defeat') {
      this.spawnBlast(this.playerRoot.position, {
        radius: this.playerRadius * 1.5,
        power: cause === 'collision' ? 3.2 : 2.4,
        velocity: this.playerVelocity,
        cause,
      });
      this.playerRoot.visible = false;
      this.slowMoDuration = cause === 'collision' ? 2 : 1.4;
      this.slowMo = this.slowMoDuration;
    }
    this.emitSnapshot(true);
  }

  private resetGameplayState(): void {
    this.torpedoList.forEach((torpedo) => disposeObject3D(torpedo.object));
    this.torpedoList = [];
    this.overchargeTimer = 0;
    this.aegisPoints = 0;
    this.torpedoes = 0;
    this.blasts.forEach((blast) => disposeObject3D(blast.root));
    this.blasts = [];
    this.cameraShake = 0;
    this.slowMo = 0;
    this.boss = null;
    this.bossVictoryTimer = 0;
    this.bossPhase = null;
    this.bossShieldFlash = 0;
    this.clearBossVisuals();
    this.audio.setBossDrone(false, 0);
    this.gameplayCarrier.position.copy(this.bossHomePosition);
    this.gameplayCarrier.rotation.copy(this.bossHomeRotation);
    this.gameplayCarrier.scale.setScalar(1.45);
    this.setBossSubsystemVisibility(null);
    this.spawnQueue = [];
    this.spawnClock = 0;
    this.nextWaveDelay = 0;
    this.targetAsteroidCount = 0;
    this.environmentSpeed = 12;
    this.recoveryActive = false;
    this.recoveryPocketCooldown = 0;
    this.pickupMessage = undefined;
    this.pickupMessageTimer = 0;
    this.enemies.forEach((enemy) => this.removeEnemy(enemy));
    this.asteroids.forEach((asteroid) => this.removeAsteroid(asteroid));
    this.lasers.forEach((laser) => this.removeLaser(laser));
    this.explosions.forEach((explosion) => this.removeExplosion(explosion));
    this.pickups.forEach((pickup) => this.removePickup(pickup));
    this.enemies = [];
    this.asteroids = [];
    this.lasers = [];
    this.explosions = [];
    this.pickups = [];
    this.playerVelocity.set(0, 0, 0);
    this.currentBoundaryLoad = 0;
    this.previousPlayerPosition.copy(this.playerRoot.position);
    this.resetMotionStars();
  }

  private removeEnemy(enemy: EnemyEntity): void {
    this.enemies = this.enemies.filter((candidate) => candidate.id !== enemy.id);
    disposeObject3D(enemy.object);
  }

  private removeAsteroid(asteroid: AsteroidEntity): void {
    this.asteroids = this.asteroids.filter((candidate) => candidate.id !== asteroid.id);
    disposeObject3D(asteroid.object);
  }

  private removeLaser(laser: LaserEntity): void {
    this.lasers = this.lasers.filter((candidate) => candidate.id !== laser.id);
    disposeObject3D(laser.object);
  }

  private removeExplosion(explosion: ExplosionEntity): void {
    this.explosions = this.explosions.filter((candidate) => candidate.id !== explosion.id);
    explosion.object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      mesh.geometry?.dispose?.();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(disposeMaterial);
      } else if (mesh.material) {
        disposeMaterial(mesh.material);
      }
    });
    explosion.object.removeFromParent();
  }

  private removePickup(pickup: PickupEntity): void {
    this.pickups = this.pickups.filter((candidate) => candidate.id !== pickup.id);
    disposeObject3D(pickup.object);
  }

  private separate(a: THREE.Vector3, b: THREE.Vector3, minimumDistance: number, aWeight: number, bWeight: number): void {
    const delta = new THREE.Vector3().subVectors(b, a);
    const distance = Math.max(EPSILON, delta.length());
    const overlap = minimumDistance - distance;
    if (overlap <= 0) {
      return;
    }
    delta.multiplyScalar(1 / distance);
    a.addScaledVector(delta, -overlap * aWeight);
    b.addScaledVector(delta, overlap * bWeight);
  }

  private bounceVelocities(a: THREE.Vector3, b: THREE.Vector3, aPosition: THREE.Vector3, bPosition: THREE.Vector3, impulse: number): void {
    const normal = aPosition.clone().sub(bPosition);
    if (normal.lengthSq() < EPSILON) {
      return;
    }
    normal.normalize();
    a.addScaledVector(normal, impulse * 0.42);
    b.addScaledVector(normal, -impulse * 0.42);
  }

  private sphereHit(a: THREE.Vector3, aRadius: number, b: THREE.Vector3, bRadius: number): boolean {
    return a.distanceToSquared(b) <= (aRadius + bRadius) * (aRadius + bRadius);
  }

  private isMouseCaptureActive(): boolean {
    return typeof document !== 'undefined' && document.pointerLockElement === this.canvas;
  }

  private releaseMouseCapture(suppressPause: boolean): void {
    this.capturedPointerTarget.set(0, 0);
    if (!this.isMouseCaptureActive()) {
      if (suppressPause) {
        this.pointerLockReleaseSuppressed = false;
      }
      return;
    }
    this.pointerLockReleaseSuppressed = suppressPause;
    document.exitPointerLock?.();
  }

  private recomputeKeyboardAxes(): void {
    const left = this.heldKeys.has('ArrowLeft') || this.heldKeys.has('KeyA');
    const right = this.heldKeys.has('ArrowRight') || this.heldKeys.has('KeyD');
    const up = this.heldKeys.has('ArrowUp') || this.heldKeys.has('KeyW');
    const down = this.heldKeys.has('ArrowDown') || this.heldKeys.has('KeyS');
    const rollLeft = this.heldKeys.has('KeyQ');
    const rollRight = this.heldKeys.has('KeyE');
    this.yawAxis = (right ? 1 : 0) - (left ? 1 : 0);
    this.pitchAxis = (up ? 1 : 0) - (down ? 1 : 0);
    this.rollAxis = (rollRight ? 1 : 0) - (rollLeft ? 1 : 0);
  }

  private releaseContinuousInput(): void {
    this.fireHeld = false;
    this.boostHeld = false;
    this.heldKeys.clear();
    this.yawAxis = 0;
    this.pitchAxis = 0;
    this.rollAxis = 0;
    this.wheelRollInput = 0;
    this.capturedPointerTarget.set(0, 0);
  }

  private syncCameraToPlayer(dt: number, force: boolean): void {
    if (this.lastShakeOffset.lengthSq() > 0) {
      this.camera.position.sub(this.lastShakeOffset);
      this.lastShakeOffset.set(0, 0, 0);
    }
    const profile = FLIGHT_PROFILES[this.ship];
    const camScale = clamp(Math.pow(this.playerRadius / LEGACY_SHIP_RADIUS[this.ship], 0.8), 0.78, 1.6);
    const frame = getChaseCameraFrame(this.playerRoot.position, this.playerRoot.quaternion, this.playerVelocity, {
      distance: profile.cameraDistance * camScale,
      height: profile.cameraHeight * camScale,
      lookAhead: profile.cameraLookAhead,
      lookLift: 1.35,
    });
    if (force) {
      this.camera.position.copy(frame.position);
      this.cameraLookTarget.copy(frame.lookAt);
      this.camera.up.copy(frame.up);
    } else {
      const blend = 1 - Math.exp(-profile.cameraResponsiveness * dt);
      this.camera.position.lerp(frame.position, blend);
      this.cameraLookTarget.lerp(frame.lookAt, blend);
      this.camera.up.lerp(frame.up, blend).normalize();
    }
    this.camera.lookAt(this.cameraLookTarget);
    this.cameraShake = Math.max(0, this.cameraShake - dt * 1.7);
    if (this.cameraShake > 0.01) {
      this.lastShakeOffset.set(this.randomRange(-1, 1), this.randomRange(-1, 1), this.randomRange(-1, 1)).multiplyScalar(this.cameraShake * 1.1);
      this.camera.position.add(this.lastShakeOffset);
    }
  }

  private resetCameraForMenu(): void {
    this.camera.position.set(0, 6, 28);
    this.camera.up.set(0, 1, 0);
    this.cameraLookTarget.set(0, 3, -120);
    this.camera.lookAt(this.cameraLookTarget);
    this.updateBackdropAnchors();
    this.updateReticle();
  }

  private updateBackdropAnchors(): void {
    this.backdropRoot.position.copy(this.camera.position);
    this.motionStarRoot.position.copy(this.camera.position);
    this.motionStarRoot.quaternion.copy(this.camera.quaternion);
  }

  private updateReticle(): void {
    if (!this.reticleElement) {
      return;
    }
    if (this.mode === 'menu') {
      this.reticleElement.style.transform = '';
      return;
    }
    const roll = getBankAngle(this.playerRoot.quaternion);
    this.reticleElement.style.transform = `translate(-50%, -50%) rotate(${roll.toFixed(4)}rad)`;
  }

  private resetMotionStars(): void {
    const positions = this.motionStars.positions;
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] = this.randomRange(-55, 55);
      positions[index + 1] = this.randomRange(-32, 26);
      positions[index + 2] = this.randomRange(-420, 22);
    }
    this.motionStars.geometry.attributes.position.needsUpdate = true;
  }

  private getNearestEnemyDistance(combatOnly = false): number | undefined {
    const relevantEnemies = combatOnly ? this.enemies.filter((enemy) => isCombatShip(enemy.shipClass)) : this.enemies;
    if (relevantEnemies.length === 0) {
      return undefined;
    }
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const enemy of relevantEnemies) {
      bestDistance = Math.min(bestDistance, enemy.object.position.distanceTo(this.playerRoot.position));
    }
    return Number.isFinite(bestDistance) ? Math.round(bestDistance * 10) / 10 : undefined;
  }

  private getSpawnPointAroundAnchor(anchor: Readonly<THREE.Vector3>, orientation: Readonly<THREE.Quaternion>, distance: number): THREE.Vector3 {
    const basis = getBasisVectors(orientation);
    return anchor
      .clone()
      .addScaledVector(basis.forward, distance)
      .addScaledVector(basis.right, this.randomRange(-distance * 0.58, distance * 0.58))
      .addScaledVector(basis.up, this.randomRange(-distance * 0.34, distance * 0.34));
  }

  private localOffsetToWorld(position: Readonly<THREE.Vector3>, orientation: Readonly<THREE.Quaternion>, localOffset: THREE.Vector3): THREE.Vector3 {
    return localOffset.applyQuaternion(orientation).add(position);
  }

  private lookQuaternion(from: Readonly<THREE.Vector3>, to: Readonly<THREE.Vector3>): THREE.Quaternion {
    const matrix = new THREE.Matrix4().lookAt(from, to, WORLD_UP);
    return new THREE.Quaternion().setFromRotationMatrix(matrix);
  }

  private random(): number {
    this.randomState = (1664525 * this.randomState + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }

  private randomRange(min: number, max: number): number {
    return min + (max - min) * this.random();
  }
}
