import { isCombatShip, type ShipClass } from './rules.ts';
import type { MissionRank } from './summary.ts';

export type Vec3 = { x: number; y: number; z: number };
export type ObjectiveKind = 'eliminate' | 'scan' | 'retrieve' | 'defend' | 'navigate' | 'hunt' | 'stealth' | 'boss';

export interface HostileScale {
  count: number;
  damage: number;
  durability: number;
}

export interface ChapterEnvironment {
  asteroids: number;
  asteroidSpeed: number;
  environmentSpeed: number;
  hostileScale: HostileScale;
  visibilityNote?: string;
}

export interface RaidSpec {
  atSec: number;
  roster: ShipClass[];
}

export interface AceSpec {
  id: string;
  callsign: string;
  shipClass: ShipClass;
  durabilityMultiplier: number;
  damageMultiplier: number;
}

interface EliminateStageDef {
  kind: 'eliminate';
  label: string;
  roster: ShipClass[];
  bonusRoster?: ShipClass[];
}

interface ScanStageDef {
  kind: 'scan';
  label: string;
  beacons: number;
  scanSeconds: number;
  scanRadius: number;
  maxScanSpeed: number;
  spread: number;
  ambushes?: RaidSpec[];
}

interface RetrieveStageDef {
  kind: 'retrieve';
  label: string;
  artefacts: number;
  pickupRadius: number;
  spread: number;
  gateRadius: number;
  gateDistance: number;
  raids?: RaidSpec[];
}

interface DefendStageDef {
  kind: 'defend';
  label: string;
  durationSec: number;
  assetHull: number;
  assetName: string;
  assetSpeed: number;
  raids: RaidSpec[];
}

interface NavigateStageDef {
  kind: 'navigate';
  label: string;
  gates: number;
  gateRadius: number;
  spacing: number;
  timeLimitSec: number;
}

interface HuntStageDef {
  kind: 'hunt';
  label: string;
  aces: AceSpec[];
  escort: ShipClass[];
}

interface StealthStageDef {
  kind: 'stealth';
  label: string;
  sensors: number;
  sensorRange: number;
  targetRadius: number;
  spread: number;
  maxAlarms: number;
  quietSpeed: number;
  alarmRaid: RaidSpec[];
}

interface BossStageDef {
  kind: 'boss';
  label: string;
  bossName: string;
}

export type StageDef =
  | EliminateStageDef
  | ScanStageDef
  | RetrieveStageDef
  | DefendStageDef
  | NavigateStageDef
  | HuntStageDef
  | StealthStageDef
  | BossStageDef;

export interface ChapterReward {
  label: string;
  score: number;
  upgrade?: 'hull' | 'defense' | 'attack';
}

export interface ChapterDef {
  id: string;
  number: number;
  title: string;
  codename: string;
  homage: string;
  briefing: string[];
  debrief: string;
  difficulty: number;
  parTimeSec: number;
  environment: ChapterEnvironment;
  stages: StageDef[];
  reward: ChapterReward;
}

export type StageEvent =
  | { type: 'tick'; dt: number; playerPos: Vec3; playerSpeed: number; boosting?: boolean; firing?: boolean }
  | { type: 'kill'; shipClass: ShipClass; tag?: string; byPlayer: boolean }
  | { type: 'pickup'; index: number }
  | { type: 'assetDamaged'; amount: number }
  | { type: 'assetPosition'; pos: Vec3 }
  | { type: 'bossDefeated' };

export interface StageSnapshot {
  kind: ObjectiveKind;
  label: string;
  status: 'active' | 'complete' | 'failed';
  failReason?: string;
  fraction: number;
  progressText: string;
  hint: string;
  focusIndex: number | null;
  timeRemainingSec: number | null;
  assetHull?: { current: number; max: number };
  detection?: number;
  counters: Record<string, number>;
}

export interface StageTracker {
  readonly kind: ObjectiveKind;
  readonly points: readonly Vec3[];
  apply(event: StageEvent): void;
  snapshot(): StageSnapshot;
  consumeRaids(): RaidSpec[];
}

export interface ChapterSnapshot {
  chapterId: string;
  status: 'active' | 'complete' | 'failed';
  stageIndex: number;
  stageCount: number;
  stage: StageSnapshot;
  elapsedSec: number;
  overallFraction: number;
}

export interface ChapterRun {
  readonly chapter: ChapterDef;
  readonly stageIndex: number;
  readonly currentTracker: StageTracker;
  apply(event: StageEvent): void;
  snapshot(): ChapterSnapshot;
  consumeRaids(): RaidSpec[];
}

export interface ChapterRecord {
  bestTimeSec: number;
  bestRank: 'S' | 'A' | 'B' | 'C';
  bestScore: number;
  completions: number;
}

export interface CampaignProgress {
  version: 1;
  unlocked: number;
  completed: Record<string, ChapterRecord>;
  rewardsClaimed: string[];
}

type ClearedRank = Exclude<MissionRank, '—'>;

const DEFAULT_PROGRESS_KEY = 'void-squadron.campaign.v1';
const FINAL_CHAPTER_ID = 'ch7';
export const FINAL_CHAPTER_NUMBER = 7;

const RANK_SCORE: Record<ClearedRank, number> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
};

export const CHAPTERS: readonly ChapterDef[] = [
  {
    id: 'ch1',
    number: 1,
    title: 'Ember Wake',
    codename: 'Shakedown Patrol',
    homage: 'A dawn-patrol opener about finding your hands before the void finds your fear.',
    briefing: [
      'New raider skiffs have been ghosting the trade markers along the Ember Wake lanes.',
      'Sweep the beacon line, break the raider pack, and prove your gunsight works before the war deepens.',
    ],
    debrief: 'The patrol corridor is clear and command trusts you with the next jump.',
    difficulty: 1,
    parTimeSec: 150,
    environment: {
      asteroids: 3,
      asteroidSpeed: 7,
      environmentSpeed: 16,
      hostileScale: { count: 0.8, damage: 0.8, durability: 0.9 },
      visibilityNote: 'Clean starlight and long radar horizons.',
    },
    stages: [
      {
        kind: 'eliminate',
        label: 'Clear the raider patrol',
        roster: ['fighter', 'fighter', 'interceptor', 'bomber'],
        bonusRoster: ['shuttle'],
      },
    ],
    reward: { label: 'Composite hull lattice', score: 250, upgrade: 'hull' },
  },
  {
    id: 'ch2',
    number: 2,
    title: 'Silent Choir',
    codename: 'Anomaly Chain',
    homage: 'A lonely survey run that bends into a hush-run infiltration, with the enemy listening for every careless burst.',
    briefing: [
      'Three dormant beacons have begun whispering across an empty survey sector.',
      'Drift close, hold your speed steady, and finish each scan before the static hunters close in.',
      'Once the chain resolves, go quiet and slip through the listening post sensor net without tripping a full alarm.',
    ],
    debrief: 'The anomaly chorus is mapped, the listening post is breached, and the sector goes silent on your terms.',
    difficulty: 2,
    parTimeSec: 500,
    environment: {
      asteroids: 4,
      asteroidSpeed: 8,
      environmentSpeed: 19,
      hostileScale: { count: 0.85, damage: 0.85, durability: 0.95 },
      visibilityNote: 'Sparse dust and eerie signal bloom around the beacons.',
    },
    stages: [
      {
        kind: 'scan',
        label: 'Scan the anomaly beacons',
        beacons: 3,
        scanSeconds: 10,
        scanRadius: 11,
        maxScanSpeed: 18,
        spread: 360,
        ambushes: [
          { atSec: 0, roster: ['fighter', 'interceptor'] },
          { atSec: 18, roster: ['fighter', 'bomber'] },
        ],
      },
      {
        kind: 'stealth',
        label: 'Slip past the listening post net',
        sensors: 5,
        sensorRange: 160,
        targetRadius: 14,
        spread: 130,
        maxAlarms: 1,
        quietSpeed: 12,
        alarmRaid: [{ atSec: 0, roster: ['interceptor', 'interceptor', 'fighter'] }],
      },
    ],
    reward: { label: 'Signal veil deflectors', score: 350, upgrade: 'defense' },
  },
  {
    id: 'ch3',
    number: 3,
    title: 'Glass Harvest',
    codename: 'Derelict Wreck Field',
    homage: 'A salvage thriller among shattered hulls, drifting fires, and voices that no longer answer back.',
    briefing: [
      'A graveyard of broken freighters is venting intact data cores into the dark.',
      'Collect four cores, keep moving while raiders converge on the wreck field, then punch out through the extraction gate.',
    ],
    debrief: 'The cores are secured and the wreck field gives up one more secret before it goes cold.',
    difficulty: 3,
    parTimeSec: 420,
    environment: {
      asteroids: 10,
      asteroidSpeed: 9,
      environmentSpeed: 20,
      hostileScale: { count: 0.92, damage: 0.9, durability: 1.0 },
      visibilityNote: 'Shattered plating throws hard reflections across the debris cloud.',
    },
    stages: [
      {
        kind: 'retrieve',
        label: 'Recover the drifting data cores',
        artefacts: 4,
        pickupRadius: 9,
        spread: 210,
        gateRadius: 16,
        gateDistance: 280,
        raids: [
          { atSec: 0, roster: ['fighter', 'fighter'] },
          { atSec: 22, roster: ['interceptor', 'bomber'] },
        ],
      },
    ],
    reward: { label: 'Targeting uplink cache', score: 450, upgrade: 'attack' },
  },
  {
    id: 'ch4',
    number: 4,
    title: 'Relay at Dusk',
    codename: 'Convoy Bastion',
    homage: 'A hold-the-line siege where every second bought feels like a convoy brought home alive.',
    briefing: [
      'A battered relay tender is holding station while its convoy spools for a blind jump.',
      'Anchor near the tender, intercept the raid waves, and keep its hull together until the jump window opens.',
    ],
    debrief: 'The relay tender survives the gauntlet and the convoy disappears into safer dark.',
    difficulty: 4,
    parTimeSec: 230,
    environment: {
      asteroids: 8,
      asteroidSpeed: 10,
      environmentSpeed: 21,
      hostileScale: { count: 0.96, damage: 0.95, durability: 1.04 },
      visibilityNote: 'Ion wake from the convoy creates a bright defensive arena.',
    },
    stages: [
      {
        kind: 'defend',
        label: 'Hold the relay tender',
        durationSec: 180,
        assetHull: 840,
        assetName: 'Relay Tender Hearthlight',
        assetSpeed: 4,
        raids: [
          { atSec: 0, roster: ['fighter', 'fighter', 'interceptor'] },
          { atSec: 38, roster: ['fighter', 'bomber', 'interceptor'] },
          { atSec: 84, roster: ['fighter', 'fighter', 'bomber', 'interceptor'] },
          { atSec: 132, roster: ['interceptor', 'interceptor', 'bomber'] },
          { atSec: 162, roster: ['fighter', 'bomber', 'destroyer'] },
        ],
      },
    ],
    reward: { label: 'Layered bulkhead foams', score: 600, upgrade: 'hull' },
  },
  {
    id: 'ch5',
    number: 5,
    title: 'Stone Tempest',
    codename: 'Asteroid-Storm Run',
    homage: 'A white-knuckle corridor flight where the storm itself is the enemy and the clock is its wingman.',
    briefing: [
      'A storm front of dense rock is collapsing across the only safe vector through the belt.',
      'Thread the guidance gates at full confidence, miss nothing, and beat the wall of stone to open space.',
    ],
    debrief: 'You outran the collapsing belt and turned a death maze into a clean route.',
    difficulty: 5,
    parTimeSec: 88,
    environment: {
      asteroids: 26,
      asteroidSpeed: 16,
      environmentSpeed: 27,
      hostileScale: { count: 0.98, damage: 0.97, durability: 1.06 },
      visibilityNote: 'Rock density is extreme; visual contact flickers between impact shadows.',
    },
    stages: [
      {
        kind: 'navigate',
        label: 'Run the collapsing corridor',
        gates: 9,
        gateRadius: 13,
        spacing: 92,
        timeLimitSec: 44,
      },
    ],
    reward: { label: 'Vector screen ablatives', score: 725, upgrade: 'defense' },
  },
  {
    id: 'ch6',
    number: 6,
    title: 'Crown of Knives',
    codename: 'Ace Hunt',
    homage: 'A hunter-killer chapter about duels by callsign and escorts who know exactly how dangerous their leaders are.',
    briefing: [
      'Three elite raider aces are coordinating the frontier strikes from a mobile kill box.',
      'Cut through their escort screen, mark each ace by callsign, and leave none of them to regroup.',
    ],
    debrief: 'The ace wing is shattered and the frontier finally exhales.',
    difficulty: 6,
    parTimeSec: 360,
    environment: {
      asteroids: 14,
      asteroidSpeed: 12,
      environmentSpeed: 24,
      hostileScale: { count: 1.0, damage: 1.0, durability: 1.1 },
      visibilityNote: 'Fragments of old wreckage keep breaking target locks around the duel zone.',
    },
    stages: [
      {
        kind: 'hunt',
        label: 'Break the ace wing',
        aces: [
          { id: 'ace-ashen', callsign: 'Ashen Vane', shipClass: 'interceptor', durabilityMultiplier: 1.1, damageMultiplier: 1.05 },
          { id: 'ace-basilisk', callsign: 'Basilisk Choir', shipClass: 'fighter', durabilityMultiplier: 1.15, damageMultiplier: 1.05 },
          { id: 'ace-morrow', callsign: 'Morrow Thread', shipClass: 'bomber', durabilityMultiplier: 1.2, damageMultiplier: 1.1 },
        ],
        escort: ['fighter', 'fighter', 'bomber', 'shuttle'],
      },
    ],
    reward: { label: 'Predator fire-control cores', score: 900, upgrade: 'attack' },
  },
  {
    id: FINAL_CHAPTER_ID,
    number: FINAL_CHAPTER_NUMBER,
    title: 'Leviathan Falls',
    codename: 'Blockade Carrier',
    homage: 'A towering finale against a carrier that turns open space into a siege wall.',
    briefing: [
      'The blockade carrier known as The Leviathan is locking the lane and feeding endless fire into the frontier.',
      'Enter the engagement envelope, survive its batteries, and finish the giant when the opening appears.',
    ],
    debrief: 'The blockade breaks in flame and the route beyond it belongs to the living again.',
    difficulty: 7,
    parTimeSec: 540,
    environment: {
      asteroids: 18,
      asteroidSpeed: 11,
      environmentSpeed: 22,
      hostileScale: { count: 1.1, damage: 1.08, durability: 1.2 },
      visibilityNote: 'Carrier debris, tracer fire, and shield glare turn the lane into a furnace.',
    },
    stages: [
      {
        kind: 'boss',
        label: 'Destroy the blockade carrier',
        bossName: 'The Leviathan',
      },
    ],
    reward: { label: 'Citadel spine reinforcement', score: 1200, upgrade: 'hull' },
  },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function cloneVec3(vec: Vec3): Vec3 {
  return { x: vec.x, y: vec.y, z: vec.z };
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scaleVec3(vec: Vec3, factor: number): Vec3 {
  return { x: vec.x * factor, y: vec.y * factor, z: vec.z * factor };
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function lengthVec3(vec: Vec3): number {
  return Math.hypot(vec.x, vec.y, vec.z);
}

function normalizeVec3(vec: Vec3): Vec3 {
  const length = lengthVec3(vec);
  if (length <= 1e-9) return { x: 0, y: 0, z: 1 };
  return scaleVec3(vec, 1 / length);
}

function distanceVec3(a: Vec3, b: Vec3): number {
  return lengthVec3(subVec3(a, b));
}

function makeBasis(forward: Vec3): { forward: Vec3; right: Vec3; up: Vec3 } {
  const normalizedForward = normalizeVec3(forward);
  const reference = Math.abs(normalizedForward.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const right = normalizeVec3(crossVec3(reference, normalizedForward));
  const up = normalizeVec3(crossVec3(normalizedForward, right));
  return { forward: normalizedForward, right, up };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bestEffortSpherePoint(rand: () => number): Vec3 {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const x = rand() * 2 - 1;
    const y = rand() * 2 - 1;
    const z = rand() * 2 - 1;
    if (x * x + y * y + z * z <= 1) {
      return { x, y, z };
    }
  }
  return { x: 0, y: 0, z: 0 };
}

function sphereOffset(sample: Vec3, basis: { forward: Vec3; right: Vec3; up: Vec3 }, spread: number, forwardOnly: boolean): Vec3 {
  const localZ = forwardOnly ? Math.abs(sample.z) : sample.z;
  return addVec3(
    addVec3(scaleVec3(basis.right, sample.x * spread), scaleVec3(basis.up, sample.y * spread)),
    scaleVec3(basis.forward, localZ * spread),
  );
}

function stageSeed(seed: number, index: number): number {
  return (seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
}

function sortRaids(raids: readonly RaidSpec[] | undefined): RaidSpec[] {
  return [...(raids ?? [])].sort((a, b) => a.atSec - b.atSec).map((raid) => ({
    atSec: Math.max(0, raid.atSec),
    roster: [...raid.roster],
  }));
}

function createRaidState(raids: readonly RaidSpec[] | undefined, active: boolean): {
  advance(dt: number): void;
  activate(resetClock: boolean): void;
  consume(): RaidSpec[];
} {
  const scheduled = sortRaids(raids);
  let elapsed = 0;
  let nextIndex = 0;
  let enabled = active;
  return {
    advance(dt: number) {
      if (!enabled) return;
      elapsed += Math.max(0, dt);
    },
    activate(resetClock: boolean) {
      if (enabled) return;
      enabled = true;
      if (resetClock) elapsed = 0;
    },
    consume() {
      if (!enabled) return [];
      const ready: RaidSpec[] = [];
      while (nextIndex < scheduled.length && scheduled[nextIndex].atSec <= elapsed + 1e-9) {
        ready.push({
          atSec: scheduled[nextIndex].atSec,
          roster: [...scheduled[nextIndex].roster],
        });
        nextIndex += 1;
      }
      return ready;
    },
  };
}

function createFrozenPoints(points: Vec3[]): readonly Vec3[] {
  return Object.freeze(points.map((point) => Object.freeze({ ...point })));
}

function focusNearest(points: readonly Vec3[], indices: readonly number[], origin: Vec3): number | null {
  let nearestIndex: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const index of indices) {
    const distance = distanceVec3(points[index], origin);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

function snapshotResult(
  kind: ObjectiveKind,
  label: string,
  status: 'active' | 'complete' | 'failed',
  fraction: number,
  progressText: string,
  hint: string,
  focusIndex: number | null,
  timeRemainingSec: number | null,
  counters: Record<string, number>,
  failReason?: string,
  assetHull?: { current: number; max: number },
  detection?: number,
): StageSnapshot {
  return {
    kind,
    label,
    status,
    failReason,
    fraction: clamp(fraction, 0, 1),
    progressText,
    hint,
    focusIndex,
    timeRemainingSec: timeRemainingSec === null ? null : Math.max(0, timeRemainingSec),
    assetHull: assetHull ? { current: assetHull.current, max: assetHull.max } : undefined,
    detection: detection === undefined ? undefined : clamp(detection, 0, 1),
    counters: { ...counters },
  };
}

export interface StageInit {
  anchor: Vec3;
  forward: Vec3;
  seed: number;
  /** Optional play volume; stage layouts shrink toward their anchor until every point sits inside it. */
  bounds?: { center: Vec3; radius: number };
}

/** Scales offsets from the anchor (keeping the layout's shape) so all points land inside the sphere. */
export function fitPointsToBounds(points: readonly Vec3[], anchor: Vec3, bounds: { center: Vec3; radius: number }): Vec3[] {
  const place = (k: number) => points.map((point) => addVec3(anchor, scaleVec3(subVec3(point, anchor), k)));
  const fits = (candidate: Vec3[]) => candidate.every((point) => distanceVec3(point, bounds.center) <= bounds.radius);
  if (fits(place(1))) return place(1);
  let low = 0.25;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    if (fits(place(mid))) low = mid;
    else high = mid;
  }
  return place(low);
}

function buildStagePoints(stage: StageDef, init: StageInit): readonly Vec3[] {
  const raw = buildRawStagePoints(stage, init);
  return init.bounds ? createFrozenPoints(fitPointsToBounds(raw, init.anchor, init.bounds)) : raw;
}

function buildRawStagePoints(stage: StageDef, init: StageInit): readonly Vec3[] {
  switch (stage.kind) {
    case 'scan':
      return createFrozenPoints(
        layoutPoints(init.anchor, init.forward, stage.beacons, stage.spread, init.seed, {
          minSeparation: Math.max(stage.scanRadius * 3, stage.spread * 0.55),
          chain: true,
        }),
      );
    case 'retrieve': {
      const artefacts = layoutPoints(init.anchor, init.forward, stage.artefacts, stage.spread, init.seed, {
        minSeparation: Math.max(stage.pickupRadius * 2.5, 18),
      });
      const gate = addVec3(init.anchor, scaleVec3(normalizeVec3(init.forward), stage.gateDistance));
      return createFrozenPoints([...artefacts, gate]);
    }
    case 'navigate':
      return createFrozenPoints(
        layoutPoints(init.anchor, init.forward, stage.gates, stage.spacing, init.seed, {
          minSeparation: Math.max(stage.gateRadius * 2, stage.spacing * 0.65),
          chain: true,
        }),
      );
    case 'stealth':
      return createFrozenPoints(
        layoutPoints(init.anchor, init.forward, stage.sensors + 1, stage.spread, init.seed, {
          minSeparation: Math.max(stage.targetRadius * 2, stage.spread * 0.6),
          chain: true,
        }),
      );
    default:
      return createFrozenPoints([]);
  }
}

export function layoutPoints(
  anchor: Vec3,
  forward: Vec3,
  count: number,
  spread: number,
  seed: number,
  options?: { minSeparation?: number; chain?: boolean },
): Vec3[] {
  const total = Math.max(0, Math.floor(count));
  if (total === 0) return [];
  const basis = makeBasis(forward);
  const rand = mulberry32(seed >>> 0);
  const separation = Math.max(0, options?.minSeparation ?? 0);
  const points: Vec3[] = [];

  if (options?.chain) {
    let cursor = cloneVec3(anchor);
    for (let index = 0; index < total; index += 1) {
      const step = Math.max(separation, spread * (0.88 + rand() * 0.28));
      const lateral = (rand() * 2 - 1) * spread * 0.32;
      const vertical = (rand() * 2 - 1) * spread * 0.22;
      cursor = addVec3(
        cursor,
        addVec3(
          scaleVec3(basis.forward, step),
          addVec3(scaleVec3(basis.right, lateral), scaleVec3(basis.up, vertical)),
        ),
      );
      points.push(cursor);
    }
    return points;
  }

  const maxAttempts = 96;
  for (let index = 0; index < total; index += 1) {
    let candidate = addVec3(anchor, scaleVec3(basis.forward, spread * 0.5));
    let bestCandidate = candidate;
    let bestNearest = -1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const sample = bestEffortSpherePoint(rand);
      candidate = addVec3(anchor, sphereOffset(sample, basis, spread, true));
      let nearest = Number.POSITIVE_INFINITY;
      for (const point of points) {
        nearest = Math.min(nearest, distanceVec3(point, candidate));
      }
      if (points.length === 0) nearest = Number.POSITIVE_INFINITY;
      if (nearest > bestNearest) {
        bestNearest = nearest;
        bestCandidate = candidate;
      }
      if (nearest + 1e-9 >= separation) break;
    }
    points.push(bestNearest + 1e-9 >= separation ? candidate : bestCandidate);
  }

  return points;
}

export function createStageTracker(stage: StageDef, init: StageInit): StageTracker {
  const points = buildStagePoints(stage, init);

  if (stage.kind === 'eliminate') {
    const required = stage.roster.reduce((total, shipClass) => total + (isCombatShip(shipClass) ? 1 : 0), 0);
    let destroyed = 0;
    let status: 'active' | 'complete' | 'failed' = required === 0 ? 'complete' : 'active';
    return {
      kind: stage.kind,
      points,
      apply(event) {
        if (status !== 'active') return;
        if (event.type !== 'kill') return;
        if (!event.byPlayer || !isCombatShip(event.shipClass)) return;
        destroyed = Math.min(required, destroyed + 1);
        if (destroyed >= required) status = 'complete';
      },
      snapshot() {
        const fraction = required === 0 ? 1 : destroyed / required;
        return snapshotResult(
          stage.kind,
          stage.label,
          status,
          status === 'complete' ? 1 : fraction,
          `HOSTILES ${destroyed}/${required}`,
          status === 'complete' ? 'Sector clear.' : 'Eliminate the raider group.',
          null,
          null,
          { destroyed, required, bonus: stage.bonusRoster?.length ?? 0 },
        );
      },
      consumeRaids() {
        return [];
      },
    };
  }

  if (stage.kind === 'scan') {
    const raids = createRaidState(stage.ambushes, false);
    let currentIndex = 0;
    let currentProgress = 0;
    let scanned = 0;
    let status: 'active' | 'complete' | 'failed' = stage.beacons <= 0 ? 'complete' : 'active';
    let lastTooFast = false;
    let lastInRange = false;
    return {
      kind: stage.kind,
      points,
      apply(event) {
        if (status !== 'active') return;
        if (event.type !== 'tick') return;
        const dt = Math.max(0, event.dt);
        const raidsWereActive = scanned > 0;
        if (raidsWereActive) raids.advance(dt);
        const target = points[currentIndex];
        const inRange = distanceVec3(event.playerPos, target) <= stage.scanRadius;
        const tooFast = event.playerSpeed > stage.maxScanSpeed;
        lastInRange = inRange;
        lastTooFast = inRange && tooFast;
        if (inRange && !tooFast) {
          currentProgress = clamp(currentProgress + dt / stage.scanSeconds, 0, 1);
        } else {
          currentProgress = clamp(currentProgress - (dt / stage.scanSeconds) * 0.5, 0, 1);
        }
        if (currentProgress >= 1 - 1e-9) {
          scanned += 1;
          currentIndex += 1;
          currentProgress = 0;
          if (scanned === 1) raids.activate(true);
          if (currentIndex >= stage.beacons) {
            status = 'complete';
          }
        }
      },
      snapshot() {
        if (status === 'complete') {
          return snapshotResult(
            stage.kind,
            stage.label,
            status,
            1,
            `BEACONS ${stage.beacons}/${stage.beacons}`,
            'All anomalies recorded.',
            null,
            null,
            { scanned: stage.beacons, beacons: stage.beacons },
          );
        }
        const currentPct = Math.round(currentProgress * 100);
        const progressText = lastTooFast
          ? `BEACON ${currentIndex + 1}/${stage.beacons} · SLOW DOWN TO SCAN · ${currentPct}%`
          : lastInRange
            ? `BEACON ${currentIndex + 1}/${stage.beacons} · SCANNING ${currentPct}%`
            : `BEACON ${currentIndex + 1}/${stage.beacons} · MOVE TO RANGE · ${currentPct}%`;
        const hint = lastTooFast
          ? `Hold at ${stage.maxScanSpeed.toFixed(0)} km/s or slower inside the scan radius.`
          : lastInRange
            ? 'Maintain position until the beacon resolves.'
            : 'Fly to the highlighted beacon and settle into scan range.';
        return snapshotResult(
          stage.kind,
          stage.label,
          status,
          (scanned + currentProgress) / stage.beacons,
          progressText,
          hint,
          currentIndex,
          null,
          { scanned, beacons: stage.beacons, scanPercent: currentPct },
        );
      },
      consumeRaids() {
        return raids.consume();
      },
    };
  }

  if (stage.kind === 'retrieve') {
    const raids = createRaidState(stage.raids, false);
    const collected = new Set<number>();
    let status: 'active' | 'complete' | 'failed' = stage.artefacts <= 0 ? 'complete' : 'active';
    let lastPlayerPos = cloneVec3(init.anchor);
    const gateIndex = points.length - 1;
    return {
      kind: stage.kind,
      points,
      apply(event) {
        if (status !== 'active') return;
        if (event.type === 'tick') {
          const dt = Math.max(0, event.dt);
          lastPlayerPos = cloneVec3(event.playerPos);
          raids.advance(dt);
          if (collected.size === stage.artefacts && distanceVec3(event.playerPos, points[gateIndex]) <= stage.gateRadius) {
            status = 'complete';
          }
          return;
        }
        if (event.type !== 'pickup') return;
        const index = Math.trunc(event.index);
        if (index < 0 || index >= stage.artefacts || collected.has(index)) return;
        collected.add(index);
        if (collected.size === 1) raids.activate(true);
      },
      snapshot() {
        const allCollected = collected.size === stage.artefacts;
        const focusIndex = allCollected
          ? gateIndex
          : focusNearest(
              points,
              Array.from({ length: stage.artefacts }, (_, index) => index).filter((index) => !collected.has(index)),
              lastPlayerPos,
            );
        const fraction = status === 'complete'
          ? 1
          : allCollected
            ? stage.artefacts / (stage.artefacts + 1)
            : collected.size / (stage.artefacts + 1);
        const progressText = status === 'complete'
          ? `CORES ${stage.artefacts}/${stage.artefacts} · EXTRACTED`
          : allCollected
            ? `CORES ${collected.size}/${stage.artefacts} · REACH GATE`
            : `CORES ${collected.size}/${stage.artefacts}`;
        const hint = status === 'complete'
          ? 'Salvage secured.'
          : allCollected
            ? 'Fly to the extraction gate before the hunters close.'
            : 'Collect the remaining data cores in any order.';
        return snapshotResult(
          stage.kind,
          stage.label,
          status,
          fraction,
          progressText,
          hint,
          status === 'complete' ? null : focusIndex,
          null,
          { collected: collected.size, artefacts: stage.artefacts },
        );
      },
      consumeRaids() {
        return raids.consume();
      },
    };
  }

  if (stage.kind === 'defend') {
    const raids = createRaidState(stage.raids, true);
    let elapsed = 0;
    let hull = stage.assetHull;
    let assetPos = cloneVec3(init.anchor);
    let status: 'active' | 'complete' | 'failed' = 'active';
    let failReason: string | undefined;
    return {
      kind: stage.kind,
      points,
      apply(event) {
        if (status !== 'active') return;
        if (event.type === 'tick') {
          const dt = Math.max(0, event.dt);
          elapsed += dt;
          raids.advance(dt);
          if (elapsed >= stage.durationSec) {
            elapsed = stage.durationSec;
            status = hull > 0 ? 'complete' : 'failed';
            if (status === 'failed' && !failReason) failReason = `${stage.assetName.toUpperCase()} DESTROYED`;
          }
          return;
        }
        if (event.type === 'assetDamaged') {
          hull = Math.max(0, hull - Math.max(0, event.amount));
          if (hull <= 0) {
            status = 'failed';
            failReason = `${stage.assetName.toUpperCase()} DESTROYED`;
          }
          return;
        }
        if (event.type === 'assetPosition') {
          assetPos = cloneVec3(event.pos);
        }
      },
      snapshot() {
        const timeRemaining = stage.durationSec - elapsed;
        const progressText = status === 'failed'
          ? `${stage.assetName.toUpperCase()} LOST`
          : status === 'complete'
            ? `${stage.assetName.toUpperCase()} SECURE`
            : `${stage.assetName.toUpperCase()} ${Math.round((hull / stage.assetHull) * 100)}% · HOLD ${Math.ceil(timeRemaining)}s`;
        const hint = status === 'failed'
          ? 'Escort failed.'
          : status === 'complete'
            ? 'Jump window secured.'
            : `Protect ${stage.assetName} until the convoy can jump.`;
        return snapshotResult(
          stage.kind,
          stage.label,
          status,
          status === 'failed' ? elapsed / stage.durationSec : status === 'complete' ? 1 : elapsed / stage.durationSec,
          progressText,
          hint,
          null,
          timeRemaining,
          { elapsedSec: elapsed, durationSec: stage.durationSec, assetX: assetPos.x, assetY: assetPos.y, assetZ: assetPos.z },
          failReason,
          { current: hull, max: stage.assetHull },
        );
      },
      consumeRaids() {
        return raids.consume();
      },
    };
  }

  if (stage.kind === 'navigate') {
    let passed = 0;
    let remaining = stage.timeLimitSec;
    let status: 'active' | 'complete' | 'failed' = stage.gates <= 0 ? 'complete' : 'active';
    let failReason: string | undefined;
    return {
      kind: stage.kind,
      points,
      apply(event) {
        if (status !== 'active' || event.type !== 'tick') return;
        const dt = Math.max(0, event.dt);
        remaining = Math.max(0, remaining - dt);
        if (passed < stage.gates && distanceVec3(event.playerPos, points[passed]) <= stage.gateRadius) {
          passed += 1;
          if (passed >= stage.gates) {
            status = 'complete';
            return;
          }
        }
        if (remaining <= 0 && passed < stage.gates) {
          status = 'failed';
          failReason = 'TIME EXPIRED';
        }
      },
      snapshot() {
        const progressText = status === 'failed'
          ? 'TIME EXPIRED'
          : status === 'complete'
            ? `GATES ${stage.gates}/${stage.gates}`
            : `GATES ${passed}/${stage.gates} · ${Math.ceil(remaining)}s`;
        const hint = status === 'failed'
          ? 'The storm closed before the route was clear.'
          : status === 'complete'
            ? 'Storm run complete.'
            : 'Thread the next gate before the corridor collapses.';
        return snapshotResult(
          stage.kind,
          stage.label,
          status,
          status === 'complete' ? 1 : passed / stage.gates,
          progressText,
          hint,
          status === 'active' ? passed : null,
          remaining,
          { passed, gates: stage.gates },
          failReason,
        );
      },
      consumeRaids() {
        return [];
      },
    };
  }

  if (stage.kind === 'hunt') {
    const aceIds = new Set(stage.aces.map((ace) => ace.id));
    const defeatedAces = new Set<string>();
    const escortRequired = stage.escort.reduce((total, shipClass) => total + (isCombatShip(shipClass) ? 1 : 0), 0);
    let escortKills = 0;
    let status: 'active' | 'complete' | 'failed' = stage.aces.length === 0 && escortRequired === 0 ? 'complete' : 'active';
    return {
      kind: stage.kind,
      points,
      apply(event) {
        if (status !== 'active' || event.type !== 'kill') return;
        if (event.tag && aceIds.has(event.tag)) {
          defeatedAces.add(event.tag);
        } else if (!event.tag && isCombatShip(event.shipClass) && escortKills < escortRequired) {
          escortKills += 1;
        }
        if (defeatedAces.size === stage.aces.length && escortKills >= escortRequired) {
          status = 'complete';
        }
      },
      snapshot() {
        const totalTargets = stage.aces.length + escortRequired;
        const cleared = defeatedAces.size + escortKills;
        return snapshotResult(
          stage.kind,
          stage.label,
          status,
          totalTargets === 0 ? 1 : status === 'complete' ? 1 : cleared / totalTargets,
          `ACES ${defeatedAces.size}/${stage.aces.length} · ESCORT ${escortKills}/${escortRequired}`,
          status === 'complete' ? 'Ace wing broken.' : 'Destroy every ace and strip away their escort screen.',
          null,
          null,
          { aces: defeatedAces.size, aceTotal: stage.aces.length, escort: escortKills, escortTotal: escortRequired },
        );
      },
      consumeRaids() {
        return [];
      },
    };
  }

  if (stage.kind === 'stealth') {
    const targetIndex = stage.sensors;
    const targetPoint = points[targetIndex];
    const baseDistance = Math.max(distanceVec3(init.anchor, targetPoint), stage.targetRadius);
    let status: 'active' | 'complete' | 'failed' = targetPoint ? 'active' : 'complete';
    let failReason: string | undefined;
    let detection = 0;
    let alarms = 0;
    let queuedAlarms = 0;
    let dwellSec = 0;
    let lastPlayerPos = cloneVec3(init.anchor);
    let lastSensorsInRange = 0;
    let lastBoosting = false;
    let lastFiring = false;
    let lastRate = 0;
    let lastSpeed = 0;
    return {
      kind: stage.kind,
      points,
      apply(event) {
        if (status !== 'active' || event.type !== 'tick') return;
        const dt = Math.max(0, event.dt);
        lastPlayerPos = cloneVec3(event.playerPos);
        lastBoosting = !!event.boosting;
        lastFiring = !!event.firing;
        lastSpeed = Math.max(0, event.playerSpeed);
        let sensorsInRange = 0;
        let rate = 0;
        // Detection is the summed exposure from every nearby pylon: fast movement, boosting,
        // and firing spike the rate, while running at or below quietSpeed halves it.
        for (let index = 0; index < stage.sensors; index += 1) {
          const sensor = points[index];
          const sensorDistance = distanceVec3(event.playerPos, sensor);
          if (sensorDistance > stage.sensorRange) continue;
          sensorsInRange += 1;
          const proximityFactor = 1.6 - 1.2 * (sensorDistance / stage.sensorRange);
          let sensorRate = (0.03 + 0.5 * clamp(lastSpeed / (stage.quietSpeed * 3), 0, 1)) * proximityFactor;
          if (lastBoosting) sensorRate *= 2.2;
          if (lastFiring) sensorRate *= 3;
          if (lastSpeed <= stage.quietSpeed) sensorRate *= 0.2;
          rate += sensorRate;
        }
        lastSensorsInRange = sensorsInRange;
        lastRate = rate;
        const creeping = lastSpeed <= stage.quietSpeed && !lastBoosting && !lastFiring;
        detection = rate > 0 ? clamp(detection + (rate - (creeping ? 0.06 : 0)) * dt, 0, 1) : clamp(detection - 0.18 * dt, 0, 1);
        if (detection >= 1 - 1e-9) {
          alarms += 1;
          queuedAlarms += 1;
          detection = 0.45;
          if (alarms > stage.maxAlarms) {
            status = 'failed';
            failReason = 'INFILTRATION COMPROMISED';
            return;
          }
        }
        if (distanceVec3(event.playerPos, targetPoint) <= stage.targetRadius) {
          dwellSec += dt;
          if (dwellSec >= 2.5) status = 'complete';
        } else {
          dwellSec = 0;
        }
      },
      snapshot() {
        const targetDistance = distanceVec3(lastPlayerPos, targetPoint);
        const distanceProgress = clamp(1 - targetDistance / baseDistance, 0, 1);
        const dwellProgress = clamp(dwellSec / 2.5, 0, 1);
        const exposed = lastSensorsInRange > 0 && (lastRate > 0.35 || lastBoosting || lastFiring || lastSpeed > stage.quietSpeed || detection > 0.7);
        const progressText = status === 'failed'
          ? `${failReason} · ALARMS ${alarms}/${stage.maxAlarms}`
          : status === 'complete'
            ? `LISTENING POST BREACHED · ALARMS ${alarms}/${stage.maxAlarms}`
            : dwellSec > 0
              ? `LISTENING POST LINK ${Math.round(dwellProgress * 100)}% · DETECTION ${Math.round(detection * 100)}% · ALARMS ${alarms}/${stage.maxAlarms}`
              : exposed
                ? `EXPOSED — SLOW DOWN, NO BOOST/FIRE · DETECTION ${Math.round(detection * 100)}% · ALARMS ${alarms}/${stage.maxAlarms}`
                : `SILENT · DETECTION ${Math.round(detection * 100)}% · ALARMS ${alarms}/${stage.maxAlarms}`;
        const hint = status === 'failed'
          ? 'The post has the range; break contact.'
          : status === 'complete'
            ? 'The listening post is blind.'
            : dwellSec > 0
              ? 'Hold position inside the target envelope until the intrusion completes.'
              : 'CREEP TO THE LISTENING POST';
        return snapshotResult(
          stage.kind,
          stage.label,
          status,
          status === 'complete' ? 1 : 0.72 * distanceProgress + 0.28 * dwellProgress,
          progressText,
          hint,
          status === 'complete' ? null : targetIndex,
          null,
          { alarms, sensorsInRange: lastSensorsInRange, dwellPercent: Math.round(dwellProgress * 100) },
          failReason,
          undefined,
          detection,
        );
      },
      consumeRaids() {
        if (queuedAlarms <= 0) return [];
        const raids: RaidSpec[] = [];
        for (let count = 0; count < queuedAlarms; count += 1) {
          for (const raid of stage.alarmRaid) {
            raids.push({ atSec: raid.atSec, roster: [...raid.roster] });
          }
        }
        queuedAlarms = 0;
        return raids;
      },
    };
  }

  let status: 'active' | 'complete' | 'failed' = 'active';
  return {
    kind: stage.kind,
    points,
    apply(event) {
      if (status !== 'active') return;
      if (event.type === 'bossDefeated') status = 'complete';
    },
    snapshot() {
      return snapshotResult(
        stage.kind,
        stage.label,
        status,
        status === 'complete' ? 1 : 0,
        status === 'complete' ? `${stage.bossName.toUpperCase()} DESTROYED` : `ENGAGE ${stage.bossName.toUpperCase()}`,
        status === 'complete' ? 'Blockade shattered.' : `Destroy ${stage.bossName}.`,
        null,
        null,
        { defeated: status === 'complete' ? 1 : 0 },
      );
    },
    consumeRaids() {
      return [];
    },
  };
}

export function createChapterRun(chapter: ChapterDef, init: StageInit): ChapterRun {
  const stageCount = chapter.stages.length;
  let currentStageIndex = 0;
  let currentAnchor = cloneVec3(init.anchor);
  let currentTracker = createStageTracker(chapter.stages[0], {
    anchor: currentAnchor,
    forward: init.forward,
    seed: stageSeed(init.seed, 0),
    bounds: init.bounds,
  });
  let status: 'active' | 'complete' | 'failed' = stageCount === 0 ? 'complete' : 'active';
  let elapsedSec = 0;
  let pendingRaids = currentTracker.consumeRaids();

  function advanceStageIfNeeded(): void {
    const stageSnapshot = currentTracker.snapshot();
    if (stageSnapshot.status === 'failed') {
      status = 'failed';
      return;
    }
    if (stageSnapshot.status !== 'complete') return;
    if (currentStageIndex >= stageCount - 1) {
      status = 'complete';
      return;
    }
    currentAnchor = cloneVec3(currentTracker.points[currentTracker.points.length - 1] ?? currentAnchor);
    currentStageIndex += 1;
    // Late stages head back toward the middle of the play volume instead of drifting off its edge.
    const toCenter = init.bounds ? subVec3(init.bounds.center, currentAnchor) : null;
    const heading = toCenter && init.bounds && lengthVec3(toCenter) > init.bounds.radius * 0.35 ? normalizeVec3(toCenter) : init.forward;
    currentTracker = createStageTracker(chapter.stages[currentStageIndex], {
      anchor: currentAnchor,
      forward: heading,
      seed: stageSeed(init.seed, currentStageIndex),
      bounds: init.bounds,
    });
    pendingRaids = [...pendingRaids, ...currentTracker.consumeRaids()];
  }

  return {
    get chapter() {
      return chapter;
    },
    get stageIndex() {
      return currentStageIndex;
    },
    get currentTracker() {
      return currentTracker;
    },
    apply(event) {
      if (status !== 'active') return;
      if (event.type === 'tick') elapsedSec += Math.max(0, event.dt);
      currentTracker.apply(event);
      pendingRaids = [...pendingRaids, ...currentTracker.consumeRaids()];
      advanceStageIfNeeded();
    },
    snapshot() {
      const stage = currentTracker.snapshot();
      const completedStages = status === 'complete' ? stageCount : currentStageIndex;
      const overallFraction = stageCount === 0
        ? 1
        : status === 'complete'
          ? 1
          : clamp((completedStages + stage.fraction) / stageCount, 0, 1);
      return {
        chapterId: chapter.id,
        status,
        stageIndex: currentStageIndex,
        stageCount,
        stage,
        elapsedSec,
        overallFraction,
      };
    },
    consumeRaids() {
      const current = currentTracker.consumeRaids();
      const raids = [...pendingRaids, ...current];
      pendingRaids = [];
      return raids;
    },
  };
}

export function describeObjectiveHud(snapshot: ChapterSnapshot): { title: string; line: string; fraction: number; urgent: boolean } {
  const chapter = getChapter(snapshot.chapterId);
  const chapterNumber = chapter?.number ?? snapshot.stageIndex + 1;
  const chapterTitle = (chapter?.title ?? snapshot.chapterId).toUpperCase();
  const stageLabel = `STAGE ${Math.min(snapshot.stageIndex + 1, snapshot.stageCount)}/${snapshot.stageCount}`;
  const hullUrgent = snapshot.stage.assetHull ? snapshot.stage.assetHull.current / snapshot.stage.assetHull.max < 0.3 : false;
  const timerUrgent = snapshot.stage.timeRemainingSec !== null && snapshot.stage.timeRemainingSec < 20;
  const scanUrgent = snapshot.stage.kind === 'scan' && snapshot.stage.progressText.includes('SLOW DOWN TO SCAN');
  const detectionUrgent = (snapshot.stage.detection ?? 0) > 0.7;
  return {
    title: `CH ${chapterNumber} · ${chapterTitle} — ${stageLabel}`,
    line: snapshot.stage.progressText,
    fraction: snapshot.overallFraction,
    urgent: hullUrgent || timerUrgent || scanUrgent || detectionUrgent,
  };
}

export function getChapter(id: string): ChapterDef | undefined {
  return CHAPTERS.find((chapter) => chapter.id === id);
}

export function getChapterByNumber(number: number): ChapterDef | undefined {
  return CHAPTERS.find((chapter) => chapter.number === number);
}

export function createEmptyProgress(): CampaignProgress {
  return {
    version: 1,
    unlocked: 1,
    completed: {},
    rewardsClaimed: [],
  };
}

export function isChapterUnlocked(progress: CampaignProgress, number: number): boolean {
  return Math.max(1, Math.floor(number)) <= clamp(Math.floor(progress.unlocked), 1, FINAL_CHAPTER_NUMBER);
}

function isClearedRank(value: unknown): value is ClearedRank {
  return value === 'S' || value === 'A' || value === 'B' || value === 'C';
}

function betterRank(a: ClearedRank, b: ClearedRank): ClearedRank {
  return RANK_SCORE[a] >= RANK_SCORE[b] ? a : b;
}

/**
 * Rank blends pace, survivability and marksmanship.
 * S requires clearing at or under par, taking very little damage, and landing decent shots.
 */
export function getChapterRank(
  chapter: ChapterDef,
  result: { timeSec: number; damageTaken: number; maxDurability: number; accuracy: number },
): ClearedRank {
  const timeRatio = result.timeSec / Math.max(1, chapter.parTimeSec);
  const damageRatio = result.maxDurability > 0 ? result.damageTaken / result.maxDurability : 1;
  const accuracy = clamp(result.accuracy, 0, 1);
  let points = 0;

  if (timeRatio <= 1) points += 3;
  else if (timeRatio <= 1.15) points += 2;
  else if (timeRatio <= 1.35) points += 1;

  if (damageRatio <= 0.12) points += 3;
  else if (damageRatio <= 0.28) points += 2;
  else if (damageRatio <= 0.55) points += 1;

  if (accuracy >= 0.62) points += 2;
  else if (accuracy >= 0.44) points += 1;

  if (timeRatio <= 1 && damageRatio <= 0.12 && accuracy >= 0.55) return 'S';
  if (points >= 5) return 'A';
  if (points >= 3) return 'B';
  return 'C';
}

export function completeChapter(
  progress: CampaignProgress,
  chapter: ChapterDef,
  result: { timeSec: number; damageTaken: number; maxDurability: number; accuracy: number; score: number },
): {
  progress: CampaignProgress;
  newRank: boolean;
  newBestTime: boolean;
  firstClear: boolean;
  unlockedNext: boolean;
  rewardGranted: ChapterReward | null;
} {
  const rank = getChapterRank(chapter, result);
  const existing = progress.completed[chapter.id];
  const firstClear = !existing;
  const newBestTime = !existing || result.timeSec < existing.bestTimeSec;
  const newBestRank = !existing || betterRank(rank, existing.bestRank) !== existing.bestRank;
  const rewardGranted = firstClear && !progress.rewardsClaimed.includes(chapter.id) ? { ...chapter.reward } : null;
  const nextUnlocked = clamp(Math.max(progress.unlocked, chapter.number + 1), 1, FINAL_CHAPTER_NUMBER);
  const unlockedNext = nextUnlocked > progress.unlocked;
  const nextRecord: ChapterRecord = {
    bestTimeSec: newBestTime ? result.timeSec : existing.bestTimeSec,
    bestRank: existing ? betterRank(rank, existing.bestRank) : rank,
    bestScore: existing ? Math.max(existing.bestScore, result.score) : result.score,
    completions: (existing?.completions ?? 0) + 1,
  };

  return {
    progress: {
      version: 1,
      unlocked: nextUnlocked,
      completed: {
        ...progress.completed,
        [chapter.id]: nextRecord,
      },
      rewardsClaimed: rewardGranted ? [...progress.rewardsClaimed, chapter.id] : [...progress.rewardsClaimed],
    },
    newRank: newBestRank,
    newBestTime,
    firstClear,
    unlockedNext,
    rewardGranted,
  };
}

export function encodeProgress(progress: CampaignProgress): string {
  return JSON.stringify(progress);
}

export function decodeProgress(raw: string | null | undefined): CampaignProgress {
  if (!raw) return createEmptyProgress();
  try {
    const parsed = JSON.parse(raw) as Partial<CampaignProgress> | null;
    if (!parsed || parsed.version !== 1) return createEmptyProgress();
    const completed: Record<string, ChapterRecord> = {};
    for (const [chapterId, value] of Object.entries(parsed.completed ?? {})) {
      if (!getChapter(chapterId) || !value || typeof value !== 'object') continue;
      const record = value as Partial<ChapterRecord>;
      const bestRank: ClearedRank = isClearedRank(record.bestRank) ? record.bestRank : 'C';
      const bestTimeSec = isFiniteNumber(record.bestTimeSec)
        ? Math.max(1, record.bestTimeSec)
        : 1;
      const bestScore = isFiniteNumber(record.bestScore)
        ? Math.max(0, record.bestScore)
        : 0;
      const completions = isFiniteNumber(record.completions)
        ? Math.max(1, Math.floor(record.completions))
        : 1;
      completed[chapterId] = { bestTimeSec, bestRank, bestScore, completions };
    }
    const rewardsClaimed = Array.isArray(parsed.rewardsClaimed)
      ? parsed.rewardsClaimed.filter((value): value is string => typeof value === 'string' && !!getChapter(value))
      : [];
    return {
      version: 1,
      unlocked: clamp(Math.floor(isFiniteNumber(parsed.unlocked) ? parsed.unlocked : 1), 1, FINAL_CHAPTER_NUMBER),
      completed,
      rewardsClaimed: [...new Set(rewardsClaimed)],
    };
  } catch {
    return createEmptyProgress();
  }
}

export function loadProgress(
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null,
  key = DEFAULT_PROGRESS_KEY,
): CampaignProgress {
  if (!storage) return createEmptyProgress();
  try {
    return decodeProgress(storage.getItem(key));
  } catch {
    return createEmptyProgress();
  }
}

export function saveProgress(
  progress: CampaignProgress,
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null,
  key = DEFAULT_PROGRESS_KEY,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, encodeProgress(progress));
  } catch {
    // Persistence is optional for tests and headless environments.
  }
}
