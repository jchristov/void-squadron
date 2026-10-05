import * as THREE from 'three';

import { SHIPS, getDifficultyTuning, type Difficulty, type ShipClass } from './rules.ts';

export interface OrientationRates {
  yawRate: number;
  pitchRate: number;
  rollRate: number;
}

export interface MotionConfig {
  acceleration: number;
  driftDamping: number;
  softBoundaryRadius: number;
  hardBoundaryRadius: number;
  boundaryGuidance: number;
}

export interface ChaseCameraConfig {
  distance: number;
  height: number;
  lookAhead: number;
  lookLift?: number;
}

export interface FlightProfile extends OrientationRates {
  acceleration: number;
  driftDamping: number;
  projectileSpeed: number;
  projectileLifetime: number;
  projectileRange: number;
  cameraDistance: number;
  cameraHeight: number;
  cameraLookAhead: number;
  cameraResponsiveness: number;
  aiTurnRate: number;
  aiCruiseMultiplier: number;
  aiAttackDistance: number;
}

export interface EnemyPursuitProfile {
  role: ShipClass;
  combat: boolean;
  preferredDistance: number;
  attackDistance: number;
  retreatDistance: number;
  maxPursuitDistance: number;
  leashDistance: number;
  reengageDistance: number;
  returnRadius: number;
  patrolSpeedMultiplier: number;
  attackSpeedMultiplier: number;
  disengageSpeedMultiplier: number;
  fleeSpeedMultiplier: number;
  despawnDistance: number;
  despawnDelay: number;
}

export type EnemyDirective = 'attack' | 'evade' | 'attack-pass' | 'standoff' | 'guard' | 'disengage' | 'return' | 'flee';

export interface SteeringInput {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface BasisVectors {
  forward: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
}

export interface MotionResult {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  boundaryFactor: number;
}

export interface CameraFrame {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
}

export interface InterceptSolution {
  aimPoint: THREE.Vector3;
  direction: THREE.Vector3;
  time: number;
  direct: boolean;
}

export interface SweptCollision {
  time: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  startedInside: boolean;
}

const EPSILON = 1e-6;
const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
export const WORLD_UP = new THREE.Vector3(0, 1, 0);

const FLIGHT_PROFILE_OVERRIDES: Record<ShipClass, Omit<FlightProfile, 'projectileRange'>> = {
  fighter: {
    yawRate: 1.9,
    pitchRate: 1.78,
    rollRate: 2.6,
    acceleration: 4.4,
    driftDamping: 2.45,
    projectileSpeed: 124,
    projectileLifetime: 2.8,
    cameraDistance: 13.5,
    cameraHeight: 3.6,
    cameraLookAhead: 19,
    cameraResponsiveness: 7.2,
    aiTurnRate: 1.52,
    aiCruiseMultiplier: 0.9,
    aiAttackDistance: 126,
  },
  interceptor: {
    yawRate: 2.45,
    pitchRate: 2.25,
    rollRate: 3.45,
    acceleration: 5.9,
    driftDamping: 2.95,
    projectileSpeed: 142,
    projectileLifetime: 2.7,
    cameraDistance: 12.4,
    cameraHeight: 3.1,
    cameraLookAhead: 21,
    cameraResponsiveness: 8.2,
    aiTurnRate: 2.3,
    aiCruiseMultiplier: 1.02,
    aiAttackDistance: 118,
  },
  bomber: {
    yawRate: 1.12,
    pitchRate: 1.0,
    rollRate: 1.5,
    acceleration: 3.35,
    driftDamping: 2.08,
    projectileSpeed: 112,
    projectileLifetime: 3.25,
    cameraDistance: 14.7,
    cameraHeight: 4.1,
    cameraLookAhead: 18,
    cameraResponsiveness: 6.2,
    aiTurnRate: 1.0,
    aiCruiseMultiplier: 0.78,
    aiAttackDistance: 168,
  },
  shuttle: {
    yawRate: 1.38,
    pitchRate: 1.28,
    rollRate: 1.86,
    acceleration: 3.95,
    driftDamping: 2.4,
    projectileSpeed: 118,
    projectileLifetime: 2.85,
    cameraDistance: 14.3,
    cameraHeight: 4,
    cameraLookAhead: 18,
    cameraResponsiveness: 6.4,
    aiTurnRate: 1.34,
    aiCruiseMultiplier: 0.92,
    aiAttackDistance: 0,
  },
  freighter: {
    yawRate: 0.94,
    pitchRate: 0.86,
    rollRate: 1.2,
    acceleration: 3.0,
    driftDamping: 1.9,
    projectileSpeed: 108,
    projectileLifetime: 3.2,
    cameraDistance: 16.2,
    cameraHeight: 4.5,
    cameraLookAhead: 17,
    cameraResponsiveness: 5.8,
    aiTurnRate: 0.84,
    aiCruiseMultiplier: 0.72,
    aiAttackDistance: 0,
  },
  destroyer: {
    yawRate: 0.66,
    pitchRate: 0.6,
    rollRate: 0.92,
    acceleration: 2.55,
    driftDamping: 1.62,
    projectileSpeed: 102,
    projectileLifetime: 3.7,
    cameraDistance: 18,
    cameraHeight: 5.1,
    cameraLookAhead: 16,
    cameraResponsiveness: 5.1,
    aiTurnRate: 0.62,
    aiCruiseMultiplier: 0.66,
    aiAttackDistance: 154,
  },
};

const ENEMY_PURSUIT_PROFILES: Record<ShipClass, EnemyPursuitProfile> = Object.freeze({
  fighter: {
    role: 'fighter',
    combat: true,
    preferredDistance: 102,
    attackDistance: 132,
    retreatDistance: 42,
    maxPursuitDistance: 210,
    leashDistance: 210,
    reengageDistance: 168,
    returnRadius: 18,
    patrolSpeedMultiplier: 0.86,
    attackSpeedMultiplier: 1.06,
    disengageSpeedMultiplier: 0.92,
    fleeSpeedMultiplier: 1.18,
    despawnDistance: 420,
    despawnDelay: 12,
  },
  interceptor: {
    role: 'interceptor',
    combat: true,
    preferredDistance: 82,
    attackDistance: 122,
    retreatDistance: 34,
    maxPursuitDistance: 248,
    leashDistance: 232,
    reengageDistance: 188,
    returnRadius: 20,
    patrolSpeedMultiplier: 0.92,
    attackSpeedMultiplier: 1.18,
    disengageSpeedMultiplier: 1.08,
    fleeSpeedMultiplier: 1.28,
    despawnDistance: 440,
    despawnDelay: 10,
  },
  bomber: {
    role: 'bomber',
    combat: true,
    preferredDistance: 148,
    attackDistance: 178,
    retreatDistance: 78,
    maxPursuitDistance: 228,
    leashDistance: 208,
    reengageDistance: 182,
    returnRadius: 20,
    patrolSpeedMultiplier: 0.74,
    attackSpeedMultiplier: 0.88,
    disengageSpeedMultiplier: 0.82,
    fleeSpeedMultiplier: 0.96,
    despawnDistance: 420,
    despawnDelay: 12,
  },
  shuttle: {
    role: 'shuttle',
    combat: false,
    preferredDistance: 170,
    attackDistance: 0,
    retreatDistance: 120,
    maxPursuitDistance: 180,
    leashDistance: 168,
    reengageDistance: 0,
    returnRadius: 22,
    patrolSpeedMultiplier: 0.88,
    attackSpeedMultiplier: 0,
    disengageSpeedMultiplier: 1.04,
    fleeSpeedMultiplier: 1.28,
    despawnDistance: 430,
    despawnDelay: 8,
  },
  freighter: {
    role: 'freighter',
    combat: false,
    preferredDistance: 184,
    attackDistance: 0,
    retreatDistance: 138,
    maxPursuitDistance: 190,
    leashDistance: 176,
    reengageDistance: 0,
    returnRadius: 26,
    patrolSpeedMultiplier: 0.72,
    attackSpeedMultiplier: 0,
    disengageSpeedMultiplier: 0.92,
    fleeSpeedMultiplier: 1.1,
    despawnDistance: 420,
    despawnDelay: 9,
  },
  destroyer: {
    role: 'destroyer',
    combat: true,
    preferredDistance: 152,
    attackDistance: 164,
    retreatDistance: 84,
    maxPursuitDistance: 176,
    leashDistance: 160,
    reengageDistance: 134,
    returnRadius: 18,
    patrolSpeedMultiplier: 0.62,
    attackSpeedMultiplier: 0.72,
    disengageSpeedMultiplier: 0.64,
    fleeSpeedMultiplier: 0.74,
    despawnDistance: 400,
    despawnDelay: 14,
  },
});

export const FLIGHT_PROFILES: Record<ShipClass, FlightProfile> = Object.freeze(
  Object.fromEntries(
    (Object.keys(FLIGHT_PROFILE_OVERRIDES) as ShipClass[]).map((shipClass) => {
      const stats = SHIPS[shipClass];
      const profile = FLIGHT_PROFILE_OVERRIDES[shipClass];
      return [
        shipClass,
        {
          ...profile,
          projectileRange: profile.projectileSpeed * profile.projectileLifetime + stats.speed * 0.45,
        },
      ];
    }),
  ) as Record<ShipClass, FlightProfile>,
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function expBlend(rate: number, dt: number): number {
  return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
}

function safeUpHint(direction: THREE.Vector3, upHint?: THREE.Vector3): THREE.Vector3 {
  const candidate = (upHint ?? WORLD_UP).clone().normalize();
  if (Math.abs(candidate.dot(direction)) < 0.98) {
    return candidate;
  }
  const fallback = Math.abs(direction.y) < 0.98 ? WORLD_UP.clone() : LOCAL_RIGHT.clone();
  if (Math.abs(fallback.dot(direction)) < 0.98) {
    return fallback.normalize();
  }
  return LOCAL_UP.clone();
}

export function getEnemyPursuitProfile(shipClass: ShipClass): Readonly<EnemyPursuitProfile> {
  return ENEMY_PURSUIT_PROFILES[shipClass];
}

export function getDifficultyAdjustedEnemyPursuitProfile(
  shipClass: ShipClass,
  difficulty: Difficulty = 'standard',
): Readonly<EnemyPursuitProfile> {
  const profile = getEnemyPursuitProfile(shipClass);
  const tuning = getDifficultyTuning(difficulty);
  const rangeScale = tuning.pursuitRangeMultiplier;
  const retreatScale = clamp(1 - (rangeScale - 1) * 0.8, 0.82, 1.2);
  return Object.freeze({
    ...profile,
    preferredDistance: Math.round(profile.preferredDistance * rangeScale),
    attackDistance: Math.round(profile.attackDistance * rangeScale),
    retreatDistance: Math.round(profile.retreatDistance * retreatScale),
    maxPursuitDistance: Math.round(profile.maxPursuitDistance * rangeScale),
    leashDistance: Math.round(profile.leashDistance * rangeScale),
    reengageDistance: Math.round(profile.reengageDistance * rangeScale),
    returnRadius: Math.max(12, Math.round(profile.returnRadius * rangeScale)),
    despawnDistance: Math.round(profile.despawnDistance * rangeScale),
  });
}

export function getDifficultyAdjustedEnemyTurnRate(shipClass: ShipClass, difficulty: Difficulty = 'standard'): number {
  return Math.round(FLIGHT_PROFILES[shipClass].aiTurnRate * getDifficultyTuning(difficulty).enemyAgilityMultiplier * 1000) / 1000;
}

export function getEnemyPursuitDirective(
  shipClass: ShipClass,
  distanceToPlayer: number,
  distanceFromOrigin: number,
  alignment: number,
  profileOverride?: Readonly<EnemyPursuitProfile>,
): EnemyDirective {
  const profile = profileOverride ?? getEnemyPursuitProfile(shipClass);
  if (!profile.combat) {
    return distanceToPlayer <= profile.preferredDistance || distanceFromOrigin > profile.leashDistance ? 'flee' : 'return';
  }
  if (distanceFromOrigin > profile.leashDistance) {
    return 'return';
  }
  if (distanceToPlayer > profile.maxPursuitDistance) {
    return 'disengage';
  }
  switch (shipClass) {
    case 'interceptor':
      return distanceToPlayer < profile.retreatDistance ? 'evade' : 'attack';
    case 'fighter':
      return alignment > 0.86 && distanceToPlayer < profile.preferredDistance ? 'attack-pass' : 'attack';
    case 'bomber':
      if (distanceToPlayer < profile.retreatDistance) return 'evade';
      return distanceToPlayer > profile.preferredDistance * 1.12 ? 'attack' : 'standoff';
    case 'destroyer':
      if (distanceToPlayer < profile.retreatDistance) return 'evade';
      return distanceToPlayer > profile.attackDistance ? 'guard' : 'standoff';
    default:
      return 'attack';
  }
}

export function getBasisVectors(orientation: Readonly<THREE.Quaternion>): BasisVectors {
  return {
    forward: LOCAL_FORWARD.clone().applyQuaternion(orientation).normalize(),
    up: LOCAL_UP.clone().applyQuaternion(orientation).normalize(),
    right: LOCAL_RIGHT.clone().applyQuaternion(orientation).normalize(),
  };
}

export function applyOrientationInput(
  orientation: Readonly<THREE.Quaternion>,
  input: SteeringInput,
  rates: OrientationRates,
  dt: number,
): THREE.Quaternion {
  const next = orientation.clone();
  if (Math.abs(input.yaw) > EPSILON) {
    next.multiply(new THREE.Quaternion().setFromAxisAngle(LOCAL_UP, -input.yaw * rates.yawRate * dt));
  }
  if (Math.abs(input.pitch) > EPSILON) {
    next.multiply(new THREE.Quaternion().setFromAxisAngle(LOCAL_RIGHT, input.pitch * rates.pitchRate * dt));
  }
  if (Math.abs(input.roll) > EPSILON) {
    next.multiply(new THREE.Quaternion().setFromAxisAngle(LOCAL_FORWARD, -input.roll * rates.rollRate * dt));
  }
  return next.normalize();
}

export function integrateFlightMotion(
  position: Readonly<THREE.Vector3>,
  velocity: Readonly<THREE.Vector3>,
  orientation: Readonly<THREE.Quaternion>,
  targetSpeed: number,
  dt: number,
  config: MotionConfig,
): MotionResult {
  const { forward } = getBasisVectors(orientation);
  const desiredVelocity = forward.multiplyScalar(Math.max(0, targetSpeed));
  const nextVelocity = velocity.clone().lerp(desiredVelocity, expBlend(config.acceleration, dt));

  const currentForward = desiredVelocity.lengthSq() > EPSILON ? desiredVelocity.clone().normalize() : LOCAL_FORWARD.clone();
  const forwardComponent = currentForward.clone().multiplyScalar(nextVelocity.dot(currentForward));
  const lateral = nextVelocity.clone().sub(forwardComponent);
  nextVelocity.addScaledVector(lateral, -clamp(config.driftDamping * dt, 0, 1));

  const distance = position.length();
  let boundaryFactor = 0;
  if (config.hardBoundaryRadius > config.softBoundaryRadius && distance > config.softBoundaryRadius) {
    boundaryFactor = clamp(
      (distance - config.softBoundaryRadius) / (config.hardBoundaryRadius - config.softBoundaryRadius),
      0,
      1,
    );
    if (distance > EPSILON) {
      const guidance = position.clone().normalize().multiplyScalar(-config.boundaryGuidance * boundaryFactor * dt);
      nextVelocity.add(guidance);
    }
  }

  return {
    position: position.clone().addScaledVector(nextVelocity, dt),
    velocity: nextVelocity,
    boundaryFactor,
  };
}

export function relativeVelocityMagnitude(a: Readonly<THREE.Vector3>, b: Readonly<THREE.Vector3>): number {
  return a.distanceTo(b);
}

export function solveInterceptCourse(
  shooterPosition: Readonly<THREE.Vector3>,
  targetPosition: Readonly<THREE.Vector3>,
  targetVelocity: Readonly<THREE.Vector3>,
  projectileSpeed: number,
): InterceptSolution {
  const toTarget = targetPosition.clone().sub(shooterPosition);
  const speed = Math.max(EPSILON, projectileSpeed);
  const a = targetVelocity.lengthSq() - speed * speed;
  const b = 2 * toTarget.dot(targetVelocity);
  const c = toTarget.lengthSq();

  let interceptTime = 0;
  let direct = false;

  if (Math.abs(a) < EPSILON) {
    interceptTime = Math.abs(b) < EPSILON ? 0 : -c / b;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const t1 = (-b - root) / (2 * a);
      const t2 = (-b + root) / (2 * a);
      const candidates = [t1, t2].filter((value) => value > EPSILON).sort((left, right) => left - right);
      interceptTime = candidates[0] ?? 0;
    }
  }

  if (!(interceptTime > EPSILON) || !Number.isFinite(interceptTime)) {
    direct = true;
    interceptTime = toTarget.length() / speed;
  }

  const aimPoint = targetPosition.clone().addScaledVector(targetVelocity, interceptTime);
  const direction = aimPoint.clone().sub(shooterPosition).normalize();
  return {
    aimPoint,
    direction: direction.lengthSq() > EPSILON ? direction : toTarget.normalize(),
    time: Math.max(0, interceptTime),
    direct,
  };
}

export function turnTowardsDirection(
  orientation: Readonly<THREE.Quaternion>,
  desiredDirection: Readonly<THREE.Vector3>,
  maxTurnRate: number,
  dt: number,
  upHint?: Readonly<THREE.Vector3>,
): THREE.Quaternion {
  const direction = desiredDirection.clone();
  if (direction.lengthSq() < EPSILON) {
    return orientation.clone();
  }
  direction.normalize();

  const matrix = new THREE.Matrix4().lookAt(
    new THREE.Vector3(),
    direction,
    safeUpHint(direction, upHint ? upHint.clone() : undefined),
  );
  const target = new THREE.Quaternion().setFromRotationMatrix(matrix);
  const angle = 2 * Math.acos(clamp(Math.abs(orientation.dot(target)), -1, 1));
  if (angle <= EPSILON) {
    return target.normalize();
  }
  const t = clamp((Math.max(0, maxTurnRate) * Math.max(0, dt)) / angle, 0, 1);
  return orientation.clone().slerp(target, t).normalize();
}

export function segmentSphereIntersection(
  start: Readonly<THREE.Vector3>,
  end: Readonly<THREE.Vector3>,
  center: Readonly<THREE.Vector3>,
  radius: number,
): number | null {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq < EPSILON) {
    return start.distanceToSquared(center) <= radius * radius ? 0 : null;
  }

  const t = clamp(center.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  const closest = start.clone().addScaledVector(segment, t);
  return closest.distanceToSquared(center) <= radius * radius ? t : null;
}

export function sweepSphereAgainstSphere(
  start: Readonly<THREE.Vector3>,
  end: Readonly<THREE.Vector3>,
  center: Readonly<THREE.Vector3>,
  targetRadius: number,
  movingRadius: number,
): SweptCollision | null {
  const expandedRadius = Math.max(0, targetRadius) + Math.max(0, movingRadius);
  const offset = start.clone().sub(center);
  const startDistanceSq = offset.lengthSq();
  if (startDistanceSq <= expandedRadius * expandedRadius) {
    const normal = startDistanceSq > EPSILON ? offset.normalize() : end.clone().sub(center);
    if (normal.lengthSq() > EPSILON) {
      normal.normalize();
    }
    if (normal.lengthSq() < EPSILON) {
      normal.copy(LOCAL_RIGHT);
    }
    return {
      time: 0,
      position: center.clone().addScaledVector(normal, expandedRadius + EPSILON),
      normal,
      startedInside: true,
    };
  }

  const delta = end.clone().sub(start);
  const a = delta.lengthSq();
  if (a < EPSILON) {
    return null;
  }
  const b = 2 * offset.dot(delta);
  const c = startDistanceSq - expandedRadius * expandedRadius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return null;
  }

  const root = Math.sqrt(discriminant);
  const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter((value) => value >= 0 && value <= 1).sort((left, right) => left - right);
  const time = candidates[0];
  if (time === undefined) {
    return null;
  }

  const contactPoint = start.clone().addScaledVector(delta, time);
  const normal = contactPoint.clone().sub(center).normalize();
  if (normal.lengthSq() < EPSILON) {
    normal.copy(delta).normalize();
  }
  return {
    time,
    position: center.clone().addScaledVector(normal, expandedRadius + EPSILON),
    normal,
    startedInside: false,
  };
}

export function sweepSphereAgainstBox(
  start: Readonly<THREE.Vector3>,
  end: Readonly<THREE.Vector3>,
  box: Readonly<THREE.Box3>,
  movingRadius: number,
): SweptCollision | null {
  const expanded = box.clone().expandByScalar(Math.max(0, movingRadius));
  if (expanded.containsPoint(start)) {
    const distances = [
      { distance: start.x - expanded.min.x, normal: new THREE.Vector3(-1, 0, 0), position: new THREE.Vector3(expanded.min.x - EPSILON, start.y, start.z) },
      { distance: expanded.max.x - start.x, normal: new THREE.Vector3(1, 0, 0), position: new THREE.Vector3(expanded.max.x + EPSILON, start.y, start.z) },
      { distance: start.y - expanded.min.y, normal: new THREE.Vector3(0, -1, 0), position: new THREE.Vector3(start.x, expanded.min.y - EPSILON, start.z) },
      { distance: expanded.max.y - start.y, normal: new THREE.Vector3(0, 1, 0), position: new THREE.Vector3(start.x, expanded.max.y + EPSILON, start.z) },
      { distance: start.z - expanded.min.z, normal: new THREE.Vector3(0, 0, -1), position: new THREE.Vector3(start.x, start.y, expanded.min.z - EPSILON) },
      { distance: expanded.max.z - start.z, normal: new THREE.Vector3(0, 0, 1), position: new THREE.Vector3(start.x, start.y, expanded.max.z + EPSILON) },
    ].sort((left, right) => left.distance - right.distance);
    const nearest = distances[0];
    return {
      time: 0,
      position: nearest.position,
      normal: nearest.normal,
      startedInside: true,
    };
  }

  const delta = end.clone().sub(start);
  let timeMin = 0;
  let timeMax = 1;
  const hitNormal = new THREE.Vector3();

  const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
  for (const axis of axes) {
    const origin = start[axis];
    const direction = delta[axis];
    const min = expanded.min[axis];
    const max = expanded.max[axis];

    if (Math.abs(direction) < EPSILON) {
      if (origin < min || origin > max) {
        return null;
      }
      continue;
    }

    const axisNormal = new THREE.Vector3();
    let near = 0;
    let far = 0;
    if (direction > 0) {
      near = (min - origin) / direction;
      far = (max - origin) / direction;
      axisNormal[axis] = -1;
    } else {
      near = (max - origin) / direction;
      far = (min - origin) / direction;
      axisNormal[axis] = 1;
    }

    if (near > timeMin) {
      timeMin = near;
      hitNormal.copy(axisNormal);
    }
    timeMax = Math.min(timeMax, far);
    if (timeMin > timeMax) {
      return null;
    }
  }

  if (timeMin < 0 || timeMin > 1) {
    return null;
  }

  return {
    time: timeMin,
    position: start.clone().addScaledVector(delta, timeMin).addScaledVector(hitNormal, EPSILON),
    normal: hitNormal,
    startedInside: false,
  };
}

export function getChaseCameraFrame(
  position: Readonly<THREE.Vector3>,
  orientation: Readonly<THREE.Quaternion>,
  velocity: Readonly<THREE.Vector3>,
  config: ChaseCameraConfig,
): CameraFrame {
  const { forward, up, right } = getBasisVectors(orientation);
  const speed = velocity.length();
  const distance = config.distance + Math.min(8, speed * 0.04);
  const height = config.height + Math.min(2, speed * 0.01);
  return {
    position: position
      .clone()
      .addScaledVector(forward, -distance)
      .addScaledVector(up, height),
    lookAt: position
      .clone()
      .addScaledVector(forward, config.lookAhead + Math.min(14, speed * 0.08))
      .addScaledVector(up, config.lookLift ?? 1.4),
    up: up.clone().lerp(WORLD_UP, 0.2).normalize(),
    forward,
    right,
  };
}

export function getBankAngle(orientation: Readonly<THREE.Quaternion>): number {
  const { forward, up } = getBasisVectors(orientation);
  const horizonRight = new THREE.Vector3().crossVectors(WORLD_UP, forward);
  if (horizonRight.lengthSq() < EPSILON) {
    return 0;
  }
  horizonRight.normalize();
  const horizonUp = new THREE.Vector3().crossVectors(forward, horizonRight).normalize();
  return Math.atan2(up.dot(horizonRight), up.dot(horizonUp));
}

export function getHeadingDegrees(forward: Readonly<THREE.Vector3>): number {
  const heading = THREE.MathUtils.radToDeg(Math.atan2(forward.x, -forward.z));
  return (heading + 360) % 360;
}
