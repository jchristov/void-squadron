export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface HeroPose {
  offset: Vec3Like;
  yaw: number;
  pitch: number;
  roll: number;
}

const TAU = Math.PI * 2;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Extra roll (radians) of a slow barrel roll that starts every `period` seconds and lasts `duration`. */
export function barrelRollAngle(elapsed: number, period = 17, duration = 2.6, firstAt = 9): number {
  const shifted = elapsed - firstAt;
  if (shifted < 0) return 0;
  const cycle = shifted % period;
  if (cycle >= duration) return 0;
  return TAU * easeInOut(cycle / duration);
}

/**
 * Layered, incommensurate sine motion so the preview craft never visibly loops: slow hover, lateral drift,
 * banking that follows the drift, plus a faint high-frequency engine shiver.
 */
export function heroPose(elapsed: number): HeroPose {
  const drift = Math.sin(elapsed * 0.23) * 0.7 + Math.sin(elapsed * 0.071 + 1.3) * 0.5;
  const driftRate = Math.cos(elapsed * 0.23) * 0.23 * 0.7 + Math.cos(elapsed * 0.071 + 1.3) * 0.071 * 0.5;
  return {
    offset: {
      x: drift,
      y: Math.sin(elapsed * 1.1) * 0.32 + Math.sin(elapsed * 0.37 + 1) * 0.26 + Math.sin(elapsed * 2.9) * 0.025,
      z: Math.sin(elapsed * 0.19 + 0.6) * 0.9,
    },
    yaw: Math.sin(elapsed * 0.31) * 0.17 + Math.sin(elapsed * 0.83 + 2) * 0.045,
    pitch: Math.sin(elapsed * 0.47 + 0.4) * 0.065 + Math.sin(elapsed * 1.3) * 0.015,
    roll: -driftRate * 1.6 + Math.sin(elapsed * 0.52) * 0.1 + Math.sin(elapsed * 1.7) * 0.012 + barrelRollAngle(elapsed),
  };
}

export interface EnterState {
  offset: Vec3Like;
  yaw: number;
  roll: number;
  /** 1 at the instant of arrival, fading to 0; drives the arrival flash and engine flare. */
  flash: number;
  done: boolean;
}

/** Swoop-in when you pick a different craft: slides in from the side, levels out and settles. */
export function enterState(age: number, duration = 1.15): EnterState {
  const t = Math.min(1, Math.max(0, age / duration));
  const e = easeOutCubic(t);
  const remaining = 1 - e;
  return {
    offset: { x: 15 * remaining, y: 3.2 * remaining * remaining + Math.sin(t * Math.PI) * 0.9, z: -9 * remaining || 0 },
    yaw: -0.9 * remaining || 0,
    roll: 0.8 * remaining * Math.cos(t * 5) || 0,
    flash: Math.pow(Math.max(0, 1 - t * 2.2), 2),
    done: t >= 1,
  };
}

/** Parametric patrol paths (station-relative) for the background traffic; incommensurate speeds avoid sync. */
export function escortPosition(index: number, elapsed: number): Vec3Like {
  const table = [
    { cx: -30, cy: 8, cz: -80, ax: 46, ay: 9, az: 22, speed: 0.1, phase: 0 },
    { cx: 36, cy: 24, cz: -70, ax: 38, ay: 6, az: 30, speed: -0.13, phase: 1.9 },
    { cx: 4, cy: -4, cz: -52, ax: 56, ay: 5, az: 14, speed: 0.082, phase: 3.7 },
    { cx: 60, cy: -6, cz: -100, ax: 34, ay: 11, az: 26, speed: 0.115, phase: 5.2 },
  ];
  const spec = table[((index % table.length) + table.length) % table.length];
  const angle = elapsed * spec.speed + spec.phase;
  return {
    x: spec.cx + Math.cos(angle) * spec.ax,
    y: spec.cy + Math.sin(angle * 1.7) * spec.ay,
    z: spec.cz + Math.sin(angle) * spec.az,
  };
}

/** Gentle camera sway so the whole hangar view has parallax life. */
export function cameraSway(elapsed: number): Vec3Like {
  return {
    x: Math.sin(elapsed * 0.17) * 0.9 + Math.sin(elapsed * 0.051) * 0.6,
    y: Math.sin(elapsed * 0.23 + 1) * 0.35,
    z: Math.sin(elapsed * 0.11) * 0.8,
  };
}
