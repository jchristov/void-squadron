export interface MissionSummary {
  durationSec: number;
  shotsFired: number;
  shotsHit: number;
  accuracy: number;
  kills: number;
  damageTaken: number;
  maxDurability: number;
  bossEngaged: boolean;
  bossTimeSec: number | null;
  bossHullPct: number | null;
  subsystemsDestroyed: number;
  subsystemsTotal: number;
}

export type MissionRank = 'S' | 'A' | 'B' | 'C' | '—';

export function computeAccuracy(shotsFired: number, shotsHit: number): number {
  if (shotsFired <= 0) return 0;
  return Math.min(1, Math.max(0, shotsHit / shotsFired));
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Rank rewards precision, durability, speed and thoroughness; defeats are unranked. */
export function getMissionRank(summary: MissionSummary, victory: boolean): MissionRank {
  if (!victory) return '—';
  let points = 0;
  if (summary.accuracy >= 0.5) points += 2;
  else if (summary.accuracy >= 0.3) points += 1;
  const lostRatio = summary.maxDurability > 0 ? summary.damageTaken / summary.maxDurability : 1;
  if (lostRatio <= 0.25) points += 2;
  else if (lostRatio <= 0.6) points += 1;
  if (summary.bossTimeSec !== null) {
    if (summary.bossTimeSec <= 60) points += 2;
    else if (summary.bossTimeSec <= 120) points += 1;
  }
  if (summary.subsystemsTotal > 0 && summary.subsystemsDestroyed === summary.subsystemsTotal) points += 1;
  return points >= 6 ? 'S' : points >= 4 ? 'A' : points >= 2 ? 'B' : 'C';
}
