export interface RadarVector { x: number; y: number; z: number }
export interface RadarOrientation extends RadarVector { w: number }
export function relativeRadarPosition(position: RadarVector, player: RadarVector, orientation: RadarOrientation): RadarVector {
  const x = position.x - player.x, y = position.y - player.y, z = position.z - player.z;
  const qx = -orientation.x, qy = -orientation.y, qz = -orientation.z, qw = orientation.w;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return { x: x + qw * tx + qy * tz - qz * ty, y: y + qw * ty + qz * tx - qx * tz, z: -(z + qw * tz + qx * ty - qy * tx) };
}
/**
 * Maps a ship-relative contact to radar space. `curve` < 1 compresses distance (radius ~ distance^curve) so close
 * contacts spread out while the edge still means "at or beyond range"; curve 1 is a plain linear scale.
 */
export function projectRadarContact(local: RadarVector, range = 1000, curve = 1): { x: number; y: number; edge: boolean; distance: number } {
  const distance = Math.hypot(local.x, local.y, local.z);
  const planar = Math.hypot(local.x, local.z);
  const factor = planar > range ? range / planar : 1;
  const x = local.x * factor / range, y = -local.z * factor / range;
  if (curve === 1) return { x, y, edge: distance > range, distance };
  const u = Math.hypot(x, y);
  const k = u < 1e-9 ? 0 : Math.pow(u, curve) / u;
  return { x: x * k, y: y * k, edge: distance > range, distance };
}

/** Real distance represented by a ring at `fraction` of the radar radius for the given curve. */
export function radarRingDistance(fraction: number, range: number, curve = 1): number {
  return range * Math.pow(fraction, 1 / curve);
}
