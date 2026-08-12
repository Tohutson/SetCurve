export function getRevealDelay(trackCount: number): number {
  if (trackCount <= 25) return 100;
  if (trackCount <= 50) return 65;
  if (trackCount <= 100) return 35;
  return 20;
}
