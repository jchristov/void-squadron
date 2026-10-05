export interface RadarVector { x: number; y: number; z: number }
export interface RadarOrientation extends RadarVector { w: number }
export function relativeRadarPosition(position: RadarVector, player: RadarVector, orientation: RadarOrientation): RadarVector {
  const x = position.x - player.x, y = position.y - player.y, z = position.z - player.z;
  const qx = -orientation.x, qy = -orientation.y, qz = -orientation.z, qw = orientation.w;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return { x: x + qw * tx + qy * tz - qz * ty, y: y + qw * ty + qz * tx - qx * tz, z: -(z + qw * tz + qx * ty - qy * tx) };
}
export function projectRadarContact(local: RadarVector, range = 1000): { x: number; y: number; edge: boolean; distance: number } {
  const distance = Math.hypot(local.x, local.y, local.z);
  const planar = Math.hypot(local.x, local.z);
  const factor = planar > range ? range / planar : 1;
  return { x: local.x * factor / range, y: -local.z * factor / range, edge: distance > range, distance };
}
