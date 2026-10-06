import * as THREE from 'three';

export interface SteerInput {
  yaw: number;
  pitch: number;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Converts a direction in ship-local space (forward = -Z) into yaw/pitch stick inputs in [-1, 1].
 * The turn follows the great circle to the target: stick direction is proportional to the target's lateral
 * offset and stick magnitude to the remaining angle, so large turns are not distorted by separate yaw/pitch errors.
 */
export function steeringInputs(local: Readonly<THREE.Vector3>, gain = 5): SteerInput {
  if (local.lengthSq() < 1e-9) return { yaw: 0, pitch: 0 };
  const dir = local.clone().normalize();
  const angle = Math.acos(Math.max(-1, Math.min(1, -dir.z)));
  const lateral = Math.hypot(dir.x, dir.y);
  const magnitude = Math.max(0, Math.min(1, angle * gain));
  if (lateral < 0.02) {
    // Dead ahead: nothing to do. Dead astern: commit to a side instead of dithering.
    return -dir.z < 0 ? { yaw: 1, pitch: 0 } : { yaw: 0, pitch: 0 };
  }
  return { yaw: (dir.x / lateral) * magnitude, pitch: (dir.y / lateral) * magnitude };
}

/** Roll stick that levels the wings (right vector horizontal); sign verified against applyOrientationInput in tests. */
export function rollLevelInput(right: Readonly<THREE.Vector3>, gain = 1.4): number {
  return Math.max(-1, Math.min(1, right.y * gain));
}

export interface CollisionThreat {
  /** Direction to steer toward (unit length) when the threat is real; zero vector otherwise. */
  escape: THREE.Vector3;
  /** 0..1 urgency: 1 means impact is imminent. */
  urgency: number;
  timeToImpact: number;
}

/**
 * Closest-point-of-approach test: only reacts when the current relative motion will bring the two spheres
 * together within `horizon` seconds, and steers away from where the other body will be at that moment.
 */
export function predictCollision(
  position: Readonly<THREE.Vector3>,
  velocity: Readonly<THREE.Vector3>,
  otherPosition: Readonly<THREE.Vector3>,
  otherVelocity: Readonly<THREE.Vector3>,
  combinedRadius: number,
  horizon: number,
  clearance = 4,
): CollisionThreat {
  const none: CollisionThreat = { escape: new THREE.Vector3(), urgency: 0, timeToImpact: Number.POSITIVE_INFINITY };
  const relative = otherPosition.clone().sub(position);
  const closing = velocity.clone().sub(otherVelocity);
  const speedSq = closing.lengthSq();
  const safe = combinedRadius + clearance;
  const distance = relative.length();
  if (distance < safe) {
    // Already overlapping the safety bubble: leave radially.
    return { escape: relative.lengthSq() > 1e-9 ? relative.clone().normalize().multiplyScalar(-1) : new THREE.Vector3(0, 1, 0), urgency: 1, timeToImpact: 0 };
  }
  if (speedSq < 1e-6) return none;
  const tClosest = relative.dot(closing) / speedSq;
  if (tClosest <= 0 || tClosest > horizon) return none;
  const miss = relative.clone().addScaledVector(closing, -tClosest);
  if (miss.length() >= safe) return none;
  const escape = miss.lengthSq() > 1e-6 ? miss.clone().normalize().multiplyScalar(-1) : new THREE.Vector3().crossVectors(closing, WORLD_UP).normalize();
  if (escape.lengthSq() < 1e-9) escape.set(1, 0, 0);
  return { escape, urgency: clamp01(1 - tClosest / horizon), timeToImpact: tClosest };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Retreat latch with hysteresis so the pilot does not flip-flop around the threshold. */
export function nextRetreatState(durabilityRatio: number, retreating: boolean, low = 0.45, high = 0.8): boolean {
  if (retreating) return durabilityRatio < high;
  return durabilityRatio < low;
}

export function bearingDegrees(local: Readonly<THREE.Vector3>): { yaw: number; pitch: number } {
  const dir = local.clone().normalize();
  return {
    yaw: THREE.MathUtils.radToDeg(Math.atan2(dir.x, -dir.z)),
    pitch: THREE.MathUtils.radToDeg(Math.atan2(dir.y, Math.hypot(dir.x, dir.z))),
  };
}

/** Human readable turn instruction, e.g. "RIGHT 34° · UP 12°"; "AHEAD" when nearly on boresight. */
export function describeBearing(yawDeg: number, pitchDeg: number): string {
  if (Math.abs(yawDeg) < 4 && Math.abs(pitchDeg) < 4) return 'AHEAD';
  const parts: string[] = [];
  if (Math.abs(yawDeg) >= 4) parts.push(Math.abs(yawDeg) > 150 ? 'BEHIND' : `${yawDeg > 0 ? 'RIGHT' : 'LEFT'} ${Math.round(Math.abs(yawDeg))}°`);
  if (Math.abs(pitchDeg) >= 4) parts.push(`${pitchDeg > 0 ? 'UP' : 'DOWN'} ${Math.round(Math.abs(pitchDeg))}°`);
  return parts.join(' · ');
}

export interface BossObjectiveCandidate {
  id: string;
  type: 'bridge' | 'shield_generator' | 'hangar_bay';
  destroyed: boolean;
  distance: number;
}

/** Shield domes first (nearest), then the bridge once the domes are down, then whatever is left. */
export function pickBossObjective<T extends BossObjectiveCandidate>(subsystems: readonly T[]): T | null {
  const alive = subsystems.filter((sub) => !sub.destroyed);
  const domes = alive.filter((sub) => sub.type === 'shield_generator').sort((a, b) => a.distance - b.distance);
  if (domes[0]) return domes[0];
  const bridge = alive.find((sub) => sub.type === 'bridge');
  if (bridge) return bridge;
  return alive.sort((a, b) => a.distance - b.distance)[0] ?? null;
}

/** Perpendicular escape direction used to break off an attack run. */
export function breakoutDirection(toTarget: Readonly<THREE.Vector3>, sign: number, lift: number): THREE.Vector3 {
  const away = toTarget.clone().normalize().multiplyScalar(-0.45);
  const side = new THREE.Vector3().crossVectors(toTarget, WORLD_UP);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize().multiplyScalar(sign);
  return away.add(side).add(WORLD_UP.clone().multiplyScalar(lift)).normalize();
}
