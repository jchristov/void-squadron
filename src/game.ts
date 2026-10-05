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
  BOOST_DRAIN_PER_SECOND,
  COMBO_WINDOW,
  MAX_ENERGY,
  MAX_WAVE,
  SHIPS,
  applyDamage,
  getAsteroidScore,
  getComboAfterKill,
  getEnemyShipClass,
  getForwardSpeed,
  getKillScore,
  getWaveConfig,
  isVictoryWave,
  regenerateEnergy,
  regenerateShield,
  resolveCollision,
  type ShipClass,
  type ShipDefinition,
} from './rules';

export interface GameSnapshot {
  mode: 'menu' | 'playing' | 'paused' | 'ended';
  hull: number;
  shield: number;
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
}

type GameMode = GameSnapshot['mode'];

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
  radius: number;
  hull: number;
  shield: number;
  mass: number;
  armor: number;
  speed: number;
  fireCooldown: number;
  phase: number;
  baseX: number;
  baseY: number;
  swayX: number;
  swayY: number;
  collisionCooldown: number;
  hitFlash: number;
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
  driftX: number;
  driftY: number;
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
}

interface ExplosionEntity {
  id: number;
  object: THREE.Group;
  life: number;
  maxLife: number;
  growth: number;
  drift: THREE.Vector3;
}

interface MotionStars {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
}

const PLAYER_BASE_Y = -1.8;
const PLAYER_Z = 8;
const PLAYER_MIN_X = -18;
const PLAYER_MAX_X = 18;
const PLAYER_MIN_Y = -7;
const PLAYER_MAX_Y = 11;
const SNAPSHOT_INTERVAL = 0.1;
const COLLISION_COOLDOWN = 0.35;
const WAVE_CLEAR_DELAY = 2.35;
const MENU_MESSAGE = 'Select a ship and launch into the fleet corridor.';
const EPSILON = 0.0001;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

export class SpaceGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly onUpdate: (state: GameSnapshot) => void;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 520);
  private readonly clock = new THREE.Clock();
  private readonly audio = new GameAudio();

  private readonly environmentRoot = new THREE.Group();
  private readonly menuRoot = new THREE.Group();
  private readonly gameplayRoot = new THREE.Group();
  private readonly enemyLayer = new THREE.Group();
  private readonly asteroidLayer = new THREE.Group();
  private readonly laserLayer = new THREE.Group();
  private readonly effectLayer = new THREE.Group();
  private readonly playerRoot = new THREE.Group();
  private readonly menuHero = createShipModel('fighter', { accent: 0xb6c8ff, scale: 1.55, tint: 0x8a97aa });
  private readonly menuCarrier = createCapitalCarrier();
  private readonly menuEscorts: THREE.Group[] = [];
  private readonly planet = createPlanet(24);
  private readonly planetPivot = new THREE.Group();
  private readonly motionStars: MotionStars;

  private resizeObserver?: ResizeObserver;
  private raf = 0;
  private disposed = false;
  private highQuality = true;
  private mode: GameMode = 'menu';
  private result: GameSnapshot['result'] = null;
  private message = MENU_MESSAGE;
  private ship: ShipClass = 'fighter';
  private playerShip?: THREE.Group;
  private playerShieldShell?: THREE.Mesh;
  private playerRadius = 1.4;
  private playerFireCooldown = 0;
  private playerCollisionCooldown = 0;
  private shieldFlash = 0;
  private currentSpeed = SHIPS.fighter.speed;
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
  private enemyId = 0;
  private asteroidId = 0;
  private laserId = 0;
  private explosionId = 0;
  private randomState = 0x9e3779b9;

  private enemies: EnemyEntity[] = [];
  private asteroids: AsteroidEntity[] = [];
  private lasers: LaserEntity[] = [];
  private explosions: ExplosionEntity[] = [];
  private spawnQueue: SpawnInstruction[] = [];

  private pointerTarget = new THREE.Vector2();
  private pointerActive = false;
  private fireHeld = false;
  private boostHeld = false;
  private keyAxisX = 0;
  private keyAxisY = 0;
  private heldKeys = new Set<string>();

  private readonly onPointerMove = (event: MouseEvent): void => {
    if (this.mode !== 'playing') {
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    this.pointerTarget.set(clamp(x, -1, 1), clamp(y, -1, 1));
    this.pointerActive = true;
  };

  private readonly onPointerDown = (event: MouseEvent): void => {
    if (this.mode !== 'playing' || event.button !== 0) {
      return;
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
    if (!playInput) {
      return;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.boostHeld = true;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
      event.preventDefault();
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

    this.camera.position.set(0, 6, 28);
    this.camera.lookAt(0, 3, -120);

    this.scene.fog = new THREE.FogExp2(0x040812, 0.0038);
    this.scene.add(this.environmentRoot, this.gameplayRoot, this.menuRoot);
    this.gameplayRoot.add(this.asteroidLayer, this.enemyLayer, this.laserLayer, this.effectLayer, this.playerRoot);

    this.buildScene();
    this.motionStars = this.createMotionStars();
    this.environmentRoot.add(this.motionStars.points);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.05, 0.65, 0.82);
    this.composer.addPass(this.bloomPass);

    this.rebuildPlayerShip(this.ship);
    this.playerRoot.visible = false;
    this.menuRoot.visible = true;

    this.installEventListeners();
    this.resize();
    this.setQuality(true);
    this.emitSnapshot(true);
    this.animate();
  }

  start(ship: ShipClass): void {
    this.ship = ship;
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
    this.message = 'Squadron launch confirmed.';
    const stats = SHIPS[ship];
    this.playerHull = stats.hull;
    this.playerShield = stats.shield;
    this.energy = MAX_ENERGY;
    this.currentSpeed = stats.speed;
    this.timeSincePlayerDamage = 999;
    this.playerFireCooldown = 0;
    this.playerCollisionCooldown = 0;
    this.shieldFlash = 0;
    this.playerRoot.position.set(0, PLAYER_BASE_Y, PLAYER_Z);
    this.pointerTarget.set(0, 0);
    this.pointerActive = false;
    this.releaseContinuousInput();
    this.randomState = (Date.now() ^ stats.mass ^ stats.speed) >>> 0;
    this.scheduleWave(1);
    this.clock.start();
    void this.audio.resume();
    this.emitSnapshot(true);
  }

  pause(): void {
    if (this.mode !== 'playing') {
      return;
    }
    this.releaseContinuousInput();
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
    const stats = SHIPS[this.ship];
    this.playerHull = stats.hull;
    this.playerShield = stats.shield;
    this.energy = MAX_ENERGY;
    this.currentSpeed = stats.speed;
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

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    cancelAnimationFrame(this.raf);
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
    this.environmentRoot.add(createSpaceBackdrop());

    this.planetPivot.position.set(19, 17, -94);
    this.planet.rotation.y = 0.2;
    this.planetPivot.add(this.planet);
    this.environmentRoot.add(this.planetPivot);

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

    this.menuHero.position.set(12.5, -3.2, -10.5);
    this.menuHero.rotation.set(0.16, -0.62, -0.2);
    this.menuRoot.add(this.menuHero);

    const heroLight = new THREE.PointLight(0x8ab8ff, 5.5, 70, 2.4);
    heroLight.position.set(12, -0.5, -2);
    this.menuRoot.add(heroLight);

    const ambient = new THREE.AmbientLight(0x4f617b, 1.2);
    const front = new THREE.DirectionalLight(0xe3eeff, 3.1);
    const fill = new THREE.DirectionalLight(0x79b8ff, 1.0);
    const rim = new THREE.PointLight(0x6cc4ff, 2.6, 180, 2);
    front.position.set(2, 12, -18);
    fill.position.set(-26, 18, 12);
    rim.position.set(18, 22, -80);
    this.scene.add(ambient, front, fill, rim);
  }

  private createMotionStars(): MotionStars {
    const geometry = new THREE.BufferGeometry();
    const count = 750;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = this.randomRange(-40, 40);
      positions[index * 3 + 1] = this.randomRange(-22, 20);
      positions[index * 3 + 2] = this.randomRange(-320, 16);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xb7dcff,
      size: 0.35,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    return { points, geometry, positions };
  }

  private installEventListeners(): void {
    this.canvas.addEventListener('mousemove', this.onPointerMove);
    this.canvas.addEventListener('mousedown', this.onPointerDown);
    window.addEventListener('mouseup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
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
    this.canvas.removeEventListener('mousedown', this.onPointerDown);
    window.removeEventListener('mouseup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
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
    const dt = Math.min(0.05, this.clock.getDelta() || 0.016);
    if (this.mode === 'playing') {
      this.updatePlaying(dt);
    } else if (this.mode === 'menu') {
      this.updateMenuScene(dt);
    } else {
      this.updateGameplayBackdrop(dt);
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
    this.menuHero.position.y = -3.2 + Math.sin(elapsed * 1.1) * 0.4;
    this.menuHero.rotation.y = -0.62 + Math.sin(elapsed * 0.55) * 0.08;
    this.menuEscorts.forEach((escort, index) => {
      escort.position.y += Math.sin(elapsed * (0.42 + index * 0.16)) * 0.004;
      escort.rotation.z = Math.sin(elapsed * (0.26 + index * 0.08)) * 0.04;
    });
    this.updateMotionStars(dt, 9);
    this.audio.setEngine(false, 0, false);
  }

  private updateGameplayBackdrop(dt: number): void {
    this.planet.rotation.y += dt * 0.03;
    this.planetPivot.rotation.z = Math.sin(performance.now() * 0.00005) * 0.05;
    this.updateMotionStars(dt, this.mode === 'ended' ? 12 : 4);
    this.audio.setEngine(false, 0, false);
  }

  private updatePlaying(dt: number): void {
    const stats = SHIPS[this.ship];
    this.spawnClock += dt;
    this.playerFireCooldown = Math.max(0, this.playerFireCooldown - dt);
    this.playerCollisionCooldown = Math.max(0, this.playerCollisionCooldown - dt);
    this.timeSincePlayerDamage += dt;
    this.lastKillTimer += dt;
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 2.2);

    if (this.combo > 0 && this.lastKillTimer > COMBO_WINDOW) {
      this.combo = 0;
    }

    this.updatePlayerMovement(dt, stats);
    this.updateMotionStars(dt, this.currentSpeed);
    this.processSpawns();
    this.updateEnemies(dt);
    this.updateAsteroids(dt);
    this.updateLasers(dt);
    this.updateExplosions(dt);
    this.handleCombat();
    if (this.mode !== 'playing') {
      return;
    }

    this.playerShield = regenerateShield(this.playerShield, stats.shield, this.timeSincePlayerDamage, dt);
    if (this.boostHeld && this.energy > 0.1) {
      this.energy = Math.max(0, this.energy - BOOST_DRAIN_PER_SECOND * dt);
    } else {
      this.energy = regenerateEnergy(this.energy, dt);
    }

    if (this.fireHeld && this.playerFireCooldown <= 0) {
      this.firePlayerWeapons(stats);
    }

    this.updatePlayerShieldVisual(stats);
    this.audio.setEngine(true, this.currentSpeed / stats.speed, this.boostHeld && this.energy > 0.1);
    this.message = this.buildPlayingMessage();
    this.advanceWaves(dt);
  }

  private updatePlayerMovement(dt: number, stats: ShipDefinition): void {
    const desiredX = clamp((this.pointerActive ? this.pointerTarget.x * 14 : 0) + this.keyAxisX * 10, PLAYER_MIN_X, PLAYER_MAX_X);
    const desiredY = clamp(PLAYER_BASE_Y + (this.pointerActive ? this.pointerTarget.y * 7.4 : 0) + this.keyAxisY * 6.8, PLAYER_MIN_Y, PLAYER_MAX_Y);
    const steering = this.boostHeld ? 7.8 : 5.4;

    this.playerRoot.position.x += (desiredX - this.playerRoot.position.x) * Math.min(1, dt * steering);
    this.playerRoot.position.y += (desiredY - this.playerRoot.position.y) * Math.min(1, dt * steering);
    this.playerRoot.position.z = PLAYER_Z;
    this.playerRoot.rotation.z = THREE.MathUtils.lerp(this.playerRoot.rotation.z, clamp((desiredX - this.playerRoot.position.x) * -0.055, -0.45, 0.45), dt * 6.5);
    this.playerRoot.rotation.x = THREE.MathUtils.lerp(this.playerRoot.rotation.x, clamp((desiredY - this.playerRoot.position.y) * 0.032, -0.22, 0.22), dt * 6.5);

    this.currentSpeed = getForwardSpeed(stats.speed, this.boostHeld, this.energy);
  }

  private processSpawns(): void {
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].delay <= this.spawnClock) {
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
    const stats = SHIPS[shipClass];
    const object = createShipModel(shipClass, { accent: 0xff708c, tint: 0x71788a, scale: shipClass === 'destroyer' ? 1.22 : undefined });
    const bounds = new THREE.Box3().setFromObject(object);
    const collisionRadius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    const shieldShell = createShieldShell(collisionRadius, 0xff7fa6);
    const baseX = this.randomRange(-15.5, 15.5);
    const baseY = this.randomRange(-1.5, 9.2);
    object.position.set(baseX, baseY, this.randomRange(-230, -165));
    shieldShell.visible = true;
    object.add(shieldShell);
    this.enemyLayer.add(object);

    this.enemies.push({
      id: ++this.enemyId,
      object,
      shieldShell,
      shipClass,
      stats,
      radius: collisionRadius,
      hull: stats.hull,
      shield: stats.shield,
      mass: stats.mass,
      armor: stats.armor,
      speed: 13 + stats.speed * 0.32 + this.wave * 1.2,
      fireCooldown: this.randomRange(0.4, 1.2),
      phase: this.randomRange(0, Math.PI * 2),
      baseX,
      baseY,
      swayX: this.randomRange(1.4, 5.2),
      swayY: this.randomRange(0.45, 1.7),
      collisionCooldown: 0,
      hitFlash: 0,
    });
  }

  private spawnAsteroid(radius: number, speed: number): void {
    const object = createAsteroid(radius, (++this.asteroidId * 19) ^ this.randomState);
    object.position.set(this.randomRange(-20, 20), this.randomRange(-8, 12), this.randomRange(-250, -140));
    object.rotation.set(this.randomRange(0, Math.PI), this.randomRange(0, Math.PI), this.randomRange(0, Math.PI));
    this.asteroidLayer.add(object);

    this.asteroids.push({
      id: this.asteroidId,
      object,
      radius,
      hull: 28 + radius * 58,
      shield: 0,
      mass: 12 + radius * radius * 11,
      armor: clamp(0.08 + radius * 0.06, 0.08, 0.4),
      speed: speed + radius * 1.8,
      driftX: this.randomRange(-2.6, 2.6),
      driftY: this.randomRange(-0.9, 1.6),
      spin: new THREE.Vector3(this.randomRange(-0.7, 0.7), this.randomRange(-0.9, 0.9), this.randomRange(-0.4, 0.4)),
      collisionCooldown: 0,
      hitFlash: 0,
    });
  }

  private updateEnemies(dt: number): void {
    const elapsed = performance.now() * 0.001;
    for (const enemy of this.enemies) {
      enemy.fireCooldown -= dt;
      enemy.collisionCooldown = Math.max(0, enemy.collisionCooldown - dt);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 3.5);
      const targetX = enemy.baseX + Math.sin(elapsed * 1.1 + enemy.phase) * enemy.swayX;
      const targetY = enemy.baseY + Math.cos(elapsed * 1.4 + enemy.phase * 0.7) * enemy.swayY;
      enemy.object.position.x += (targetX - enemy.object.position.x) * Math.min(1, dt * 1.6);
      enemy.object.position.y += (targetY - enemy.object.position.y) * Math.min(1, dt * 1.45);
      enemy.object.position.z += enemy.speed * dt;
      enemy.object.rotation.z = THREE.MathUtils.lerp(enemy.object.rotation.z, clamp((targetX - enemy.object.position.x) * -0.1, -0.65, 0.65), dt * 4);
      enemy.object.rotation.x = THREE.MathUtils.lerp(enemy.object.rotation.x, clamp((targetY - enemy.object.position.y) * 0.1, -0.35, 0.35), dt * 4);
      this.updateEnemyShieldVisual(enemy);

      const aligned = Math.abs(enemy.object.position.x - this.playerRoot.position.x) < 7.5 && Math.abs(enemy.object.position.y - this.playerRoot.position.y) < 4.8;
      if (aligned && enemy.object.position.z > -130 && enemy.object.position.z < 8 && enemy.fireCooldown <= 0) {
        this.fireEnemyWeapons(enemy);
      }
    }

    const escaped = this.enemies.filter((enemy) => enemy.object.position.z > 18);
    escaped.forEach((enemy) => this.removeEnemy(enemy));
  }

  private updateAsteroids(dt: number): void {
    for (const asteroid of this.asteroids) {
      asteroid.collisionCooldown = Math.max(0, asteroid.collisionCooldown - dt);
      asteroid.hitFlash = Math.max(0, asteroid.hitFlash - dt * 3.2);
      asteroid.object.position.x += asteroid.driftX * dt;
      asteroid.object.position.y += asteroid.driftY * dt;
      asteroid.object.position.z += asteroid.speed * dt;
      asteroid.object.rotation.x += asteroid.spin.x * dt;
      asteroid.object.rotation.y += asteroid.spin.y * dt;
      asteroid.object.rotation.z += asteroid.spin.z * dt;
      if (asteroid.hitFlash > 0) {
        const material = asteroid.object.material;
        if (material instanceof THREE.MeshStandardMaterial) {
          material.emissive.setHex(0xff8f4b);
          material.emissiveIntensity = asteroid.hitFlash * 0.5;
        }
      } else {
        const material = asteroid.object.material;
        if (material instanceof THREE.MeshStandardMaterial) {
          material.emissiveIntensity = 0;
        }
      }
    }

    const escaped = this.asteroids.filter((asteroid) => asteroid.object.position.z > 26);
    escaped.forEach((asteroid) => this.removeAsteroid(asteroid));
  }

  private updateLasers(dt: number): void {
    for (const laser of this.lasers) {
      laser.life -= dt;
      laser.object.position.addScaledVector(laser.velocity, dt);
    }
    const expired = this.lasers.filter((laser) => laser.life <= 0 || laser.object.position.z < -320 || laser.object.position.z > 38);
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
      positions[index + 2] += speed * dt * 1.55;
      if (positions[index + 2] > 18) {
        positions[index] = this.randomRange(-40, 40);
        positions[index + 1] = this.randomRange(-22, 20);
        positions[index + 2] = this.randomRange(-320, -180);
      }
    }
    this.motionStars.geometry.attributes.position.needsUpdate = true;
  }

  private firePlayerWeapons(stats: ShipDefinition): void {
    const energyCost = Math.max(3, stats.damage * 0.2);
    if (this.energy < energyCost) {
      return;
    }
    this.energy = Math.max(0, this.energy - energyCost);
    this.playerFireCooldown = stats.fireInterval;
    const shotCount = stats.mass >= 70 ? 4 : stats.mass >= 46 ? 3 : 2;
    const span = 0.45 + stats.mass * 0.006;
    for (let index = 0; index < shotCount; index += 1) {
      const t = index / (shotCount - 1);
      const offsetX = THREE.MathUtils.lerp(-span, span, t);
      const offsetY = index % 2 === 0 ? 0.1 : -0.08;
      this.spawnLaser('player', stats.damage, new THREE.Vector3(offsetX, offsetY, -1.8), new THREE.Vector3(0, 0, -(88 + stats.speed)));
    }
    this.audio.playLaser(false, stats.damage);
  }

  private fireEnemyWeapons(enemy: EnemyEntity): void {
    const shotCount = enemy.shipClass === 'destroyer' ? 4 : enemy.shipClass === 'freighter' ? 3 : 2;
    const spread = enemy.shipClass === 'destroyer' ? 1.5 : 0.75;
    for (let index = 0; index < shotCount; index += 1) {
      const t = index / (shotCount - 1);
      const offsetX = THREE.MathUtils.lerp(-spread, spread, t);
      this.spawnEnemyLaser(enemy, enemy.stats.damage * 0.85, new THREE.Vector3(offsetX, 0.02, 1.5), new THREE.Vector3((t - 0.5) * 4.2, 0, 68 + enemy.stats.speed));
    }
    enemy.fireCooldown = enemy.stats.fireInterval * (enemy.shipClass === 'destroyer' ? 1.35 : 1.75) + this.randomRange(0.08, 0.22);
    this.audio.playLaser(true, enemy.stats.damage);
  }

  private spawnLaser(kind: 'player' | 'enemy', damage: number, localOffset: THREE.Vector3, velocity: THREE.Vector3): void {
    const bolt = createLaserBolt(kind === 'player' ? 0x7ce6ff : 0xff7d6d, kind === 'player' ? 0.15 : 0.18, kind === 'player' ? 3.0 : 2.6);
    const anchor = kind === 'player' ? this.playerRoot : undefined;
    if (anchor) {
      bolt.position.copy(this.playerRoot.position).add(localOffset);
    } else {
      return;
    }
    const entity: LaserEntity = {
      id: ++this.laserId,
      kind,
      object: bolt,
      velocity: velocity.clone(),
      damage,
      radius: kind === 'player' ? 0.6 : 0.72,
      life: 3.2,
    };
    this.laserLayer.add(bolt);
    this.lasers.push(entity);
  }

  private spawnEnemyLaser(enemy: EnemyEntity, damage: number, localOffset: THREE.Vector3, velocity: THREE.Vector3): void {
    const bolt = createLaserBolt(0xff7d6d, 0.18, 2.7);
    bolt.position.copy(enemy.object.position).add(localOffset);
    const entity: LaserEntity = {
      id: ++this.laserId,
      kind: 'enemy',
      object: bolt,
      velocity: velocity.clone(),
      damage,
      radius: 0.72,
      life: 3.4,
    };
    this.laserLayer.add(bolt);
    this.lasers.push(entity);
  }

  private handleCombat(): void {
    for (const enemy of [...this.enemies]) {
      for (const laser of [...this.lasers]) {
        if (!this.enemies.includes(enemy)) break;
        if (laser.kind !== 'player') {
          continue;
        }
        if (this.sphereHit(laser.object.position, laser.radius, enemy.object.position, enemy.radius)) {
          this.removeLaser(laser);
          this.damageEnemy(enemy, laser.damage);
        }
      }
    }

    for (const asteroid of [...this.asteroids]) {
      for (const laser of [...this.lasers]) {
        if (!this.asteroids.includes(asteroid)) break;
        if (laser.kind !== 'player') {
          continue;
        }
        if (this.sphereHit(laser.object.position, laser.radius, asteroid.object.position, asteroid.radius)) {
          this.removeLaser(laser);
          this.damageAsteroid(asteroid, laser.damage, true);
        }
      }
    }

    for (const laser of [...this.lasers]) {
      if (laser.kind !== 'enemy') {
        continue;
      }
      if (this.sphereHit(laser.object.position, laser.radius, this.playerRoot.position, this.playerRadius)) {
        this.removeLaser(laser);
        this.applyPlayerDamage(laser.damage);
      }
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

    const outcome = resolveCollision(
      { hull: this.playerHull, shield: this.playerShield, armor: SHIPS[this.ship].armor, mass: SHIPS[this.ship].mass, speed: -this.currentSpeed },
      { hull: asteroid.hull, shield: asteroid.shield, armor: asteroid.armor, mass: asteroid.mass, speed: asteroid.speed },
    );
    this.playerHull = outcome.a.hull;
    this.playerShield = outcome.a.shield;
    asteroid.hull = outcome.b.hull;
    asteroid.shield = outcome.b.shield;
    this.timeSincePlayerDamage = 0;
    asteroid.hitFlash = 1;
    this.shieldFlash = 1;
    this.playerCollisionCooldown = COLLISION_COOLDOWN;
    asteroid.collisionCooldown = COLLISION_COOLDOWN;
    this.separate(this.playerRoot.position, asteroid.object.position, this.playerRadius + asteroid.radius, 0.45, 0.55, true);
    this.audio.playImpact(this.playerShield > 0, outcome.impactDamage);
    if (asteroid.hull <= 0) {
      this.destroyAsteroid(asteroid, false);
    }
    if (this.playerHull <= 0) {
      this.endGame('defeat', 'Your ship broke apart in the debris field.');
    }
  }

  private resolveEnemyCollisionWithAsteroid(enemy: EnemyEntity, asteroid: AsteroidEntity): void {
    if (enemy.collisionCooldown > 0 || asteroid.collisionCooldown > 0) {
      return;
    }
    if (!this.sphereHit(enemy.object.position, enemy.radius, asteroid.object.position, asteroid.radius)) {
      return;
    }
    const outcome = resolveCollision(
      { hull: enemy.hull, shield: enemy.shield, armor: enemy.armor, mass: enemy.mass, speed: enemy.speed },
      { hull: asteroid.hull, shield: asteroid.shield, armor: asteroid.armor, mass: asteroid.mass, speed: asteroid.speed },
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
    const outcome = resolveCollision(
      { hull: this.playerHull, shield: this.playerShield, armor: SHIPS[this.ship].armor, mass: SHIPS[this.ship].mass, speed: -this.currentSpeed },
      { hull: enemy.hull, shield: enemy.shield, armor: enemy.armor, mass: enemy.mass, speed: enemy.speed },
    );
    this.playerHull = outcome.a.hull;
    this.playerShield = outcome.a.shield;
    enemy.hull = outcome.b.hull;
    enemy.shield = outcome.b.shield;
    this.timeSincePlayerDamage = 0;
    this.playerCollisionCooldown = COLLISION_COOLDOWN;
    enemy.collisionCooldown = COLLISION_COOLDOWN;
    this.shieldFlash = 1;
    enemy.hitFlash = 1;
    this.separate(this.playerRoot.position, enemy.object.position, this.playerRadius + enemy.radius, 0.45, 0.55, true);
    this.audio.playImpact(this.playerShield > 0, outcome.impactDamage);
    if (enemy.hull <= 0) {
      this.destroyEnemy(enemy, false);
    }
    if (this.playerHull <= 0) {
      this.endGame('defeat', 'Your ship was crushed in a closing pass.');
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

  private applyPlayerDamage(rawDamage: number): void {
    if (this.mode !== 'playing') {
      return;
    }
    const result = applyDamage({ shield: this.playerShield, hull: this.playerHull }, rawDamage, SHIPS[this.ship].armor);
    this.playerShield = result.shield;
    this.playerHull = result.hull;
    this.timeSincePlayerDamage = 0;
    this.shieldFlash = 1;
    this.audio.playImpact(result.shieldLoss > 0, rawDamage);
    if (result.destroyed) {
      this.endGame('defeat', 'Your hull has collapsed.');
    }
  }

  private destroyEnemy(enemy: EnemyEntity, byPlayer: boolean): void {
    if (!this.enemies.includes(enemy)) return;
    this.spawnExplosion(enemy.object.position, enemy.shipClass === 'destroyer' ? 2.6 : 1.8, 0xff945a);
    this.audio.playExplosion(enemy.shipClass === 'destroyer' ? 2.8 : 1.6);
    if (byPlayer) {
      this.kills += 1;
      this.combo = getComboAfterKill(this.combo, this.lastKillTimer);
      this.lastKillTimer = 0;
      this.score += getKillScore(enemy.shipClass, Math.max(1, this.wave), Math.max(1, this.combo));
    }
    this.removeEnemy(enemy);
  }

  private destroyAsteroid(asteroid: AsteroidEntity, byPlayer: boolean): void {
    if (!this.asteroids.includes(asteroid)) return;
    this.spawnExplosion(asteroid.object.position, 1.2 + asteroid.radius * 0.4, 0xffba75);
    this.audio.playExplosion(1 + asteroid.radius * 0.35);
    if (byPlayer) {
      this.score += getAsteroidScore(asteroid.radius, Math.max(1, this.combo));
    }
    this.removeAsteroid(asteroid);
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
      drift: new THREE.Vector3(this.randomRange(-2, 2), this.randomRange(-1, 1), this.randomRange(-4, 2)),
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

  private updatePlayerShieldVisual(stats: ShipDefinition): void {
    if (!this.playerShieldShell) {
      return;
    }
    const material = this.playerShieldShell.material;
    if (!(material instanceof THREE.MeshBasicMaterial)) {
      return;
    }
    const shieldRatio = stats.shield > 0 ? this.playerShield / stats.shield : 0;
    material.opacity = Math.max(0, shieldRatio * 0.12 + this.shieldFlash * 0.45);
    this.playerShieldShell.scale.setScalar(1 + this.shieldFlash * 0.08);
  }

  private updateEnemyShieldVisual(enemy: EnemyEntity): void {
    const material = enemy.shieldShell.material;
    if (!(material instanceof THREE.MeshBasicMaterial)) {
      return;
    }
    const shieldRatio = enemy.stats.shield > 0 ? enemy.shield / enemy.stats.shield : 0;
    material.opacity = Math.max(0, shieldRatio * 0.08 + enemy.hitFlash * 0.3);
    enemy.shieldShell.scale.setScalar(1 + enemy.hitFlash * 0.1);
  }

  private scheduleWave(wave: number): void {
    const config = getWaveConfig(wave);
    this.wave = wave;
    this.message = `Wave ${wave}: ${config.message}`;
    this.spawnClock = 0;
    this.nextWaveDelay = 0;
    this.spawnQueue = [];

    for (let index = 0; index < config.enemies; index += 1) {
      this.spawnQueue.push({
        type: 'enemy',
        delay: 0.6 + index * 0.62 + this.randomRange(0, 0.28),
        shipClass: getEnemyShipClass(wave, index),
      });
    }
    for (let index = 0; index < config.asteroids; index += 1) {
      this.spawnQueue.push({
        type: 'asteroid',
        delay: 0.25 + index * 0.92 + this.randomRange(0, 0.42),
        radius: this.randomRange(1.1, 3.2),
        speed: config.asteroidSpeed + this.randomRange(-2, 5),
      });
    }
    this.spawnQueue.sort((a, b) => a.delay - b.delay);
  }

  private advanceWaves(dt: number): void {
    const pendingEnemies = this.spawnQueue.filter((spawn) => spawn.type === 'enemy').length;
    if (this.enemies.length === 0 && pendingEnemies === 0) {
      if (this.wave >= 1 && this.nextWaveDelay <= 0) {
        this.nextWaveDelay = WAVE_CLEAR_DELAY;
      }
      if (this.nextWaveDelay > 0) {
        this.nextWaveDelay -= dt;
        if (this.nextWaveDelay <= 0) {
          if (isVictoryWave(this.wave)) {
            this.endGame('victory', 'Enemy command wave destroyed. Corridor secured.');
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
    if (this.nextWaveDelay > 0) {
      return isVictoryWave(this.wave) ? 'Final lane clear. Hold formation...' : `Wave ${this.wave} clear. Next contact in ${this.nextWaveDelay.toFixed(1)}s`;
    }
    if (this.wave > 0) {
      return `Wave ${this.wave} engaged — ${this.enemies.length + this.spawnQueue.filter((spawn) => spawn.type === 'enemy').length} hostiles tracked`;
    }
    return MENU_MESSAGE;
  }

  private emitSnapshot(force = false): void {
    if (!force && this.snapshotAccumulator < SNAPSHOT_INTERVAL) {
      return;
    }
    this.snapshotAccumulator = 0;
    this.onUpdate({
      mode: this.mode,
      hull: Math.round(this.playerHull),
      shield: Math.round(this.playerShield),
      energy: Math.round(this.energy),
      score: this.score,
      wave: this.wave,
      kills: this.kills,
      speed: Math.round(this.currentSpeed * 10) / 10,
      combo: this.combo,
      enemies: this.enemies.length + this.spawnQueue.filter((spawn) => spawn.type === 'enemy').length,
      message: this.message,
      result: this.result,
      ship: this.ship,
    });
  }

  private rebuildPlayerShip(shipClass: ShipClass): void {
    if (this.playerShip) {
      disposeObject3D(this.playerShip);
      this.playerShip = undefined;
      this.playerShieldShell = undefined;
    }
    this.playerRoot.clear();
    this.playerRoot.position.set(0, PLAYER_BASE_Y, PLAYER_Z);
    const ship = createShipModel(shipClass, { accent: 0x8be3ff, tint: 0x909db3, scale: shipClass === 'destroyer' ? 1.16 : undefined });
    const radius = new THREE.Box3().setFromObject(ship).getBoundingSphere(new THREE.Sphere()).radius;
    const shield = createShieldShell(radius, 0x86e7ff);
    ship.add(shield);
    this.playerRoot.add(ship);
    this.playerShip = ship;
    this.playerShieldShell = shield;
    this.playerRadius = radius;
  }

  private endGame(result: GameSnapshot['result'], message: string): void {
    if (this.mode !== 'playing') {
      return;
    }
    this.mode = 'ended';
    this.result = result;
    this.message = message;
    this.releaseContinuousInput();
    this.audio.setEngine(false, 0, false);
    if (result === 'defeat') {
      this.spawnExplosion(this.playerRoot.position, 2.5, 0xff6f4d);
      this.audio.playExplosion(3.2);
    }
    this.emitSnapshot(true);
  }

  private resetGameplayState(): void {
    this.spawnQueue = [];
    this.spawnClock = 0;
    this.nextWaveDelay = 0;
    this.enemies.forEach((enemy) => this.removeEnemy(enemy));
    this.asteroids.forEach((asteroid) => this.removeAsteroid(asteroid));
    this.lasers.forEach((laser) => this.removeLaser(laser));
    this.explosions.forEach((explosion) => this.removeExplosion(explosion));
    this.enemies = [];
    this.asteroids = [];
    this.lasers = [];
    this.explosions = [];
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

  private separate(a: THREE.Vector3, b: THREE.Vector3, minimumDistance: number, aWeight: number, bWeight: number, clampFirst = false): void {
    const delta = new THREE.Vector3().subVectors(b, a);
    const distance = Math.max(EPSILON, delta.length());
    const overlap = minimumDistance - distance;
    if (overlap <= 0) {
      return;
    }
    delta.multiplyScalar(1 / distance);
    a.addScaledVector(delta, -overlap * aWeight);
    b.addScaledVector(delta, overlap * bWeight);
    if (clampFirst) {
      a.x = clamp(a.x, PLAYER_MIN_X, PLAYER_MAX_X);
      a.y = clamp(a.y, PLAYER_MIN_Y, PLAYER_MAX_Y);
    }
  }

  private sphereHit(a: THREE.Vector3, aRadius: number, b: THREE.Vector3, bRadius: number): boolean {
    return a.distanceToSquared(b) <= (aRadius + bRadius) * (aRadius + bRadius);
  }

  private recomputeKeyboardAxes(): void {
    const left = this.heldKeys.has('ArrowLeft') || this.heldKeys.has('KeyA');
    const right = this.heldKeys.has('ArrowRight') || this.heldKeys.has('KeyD');
    const up = this.heldKeys.has('ArrowUp') || this.heldKeys.has('KeyW');
    const down = this.heldKeys.has('ArrowDown') || this.heldKeys.has('KeyS');
    this.keyAxisX = (right ? 1 : 0) - (left ? 1 : 0);
    this.keyAxisY = (up ? 1 : 0) - (down ? 1 : 0);
  }

  private releaseContinuousInput(): void {
    this.fireHeld = false;
    this.boostHeld = false;
    this.pointerActive = false;
    this.heldKeys.clear();
    this.keyAxisX = 0;
    this.keyAxisY = 0;
  }

  private random(): number {
    this.randomState = (1664525 * this.randomState + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }

  private randomRange(min: number, max: number): number {
    return min + (max - min) * this.random();
  }
}
