export function formatSpaceDistance(kilometers: number): string {
  if (!Number.isFinite(kilometers)) return '—';
  return `${Math.max(0, kilometers).toLocaleString('en-US', { maximumFractionDigits: kilometers < 10 ? 1 : 0 })} KM`;
}
