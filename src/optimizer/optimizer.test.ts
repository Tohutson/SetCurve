import type { CurvePoint, TrackWithMetric } from '../domain/types';
import {
  buildBeamOrder,
  calculateBeamWidth,
  improveWithSwaps,
  optimizePlaylist,
  placementError,
  playlistDuration,
  totalPlaylistCost,
} from './optimizer';

const risingCurve: CurvePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

function track(id: string, metric: number, durationMs: number, originalIndex: number): TrackWithMetric {
  return { id, uri: `spotify:track:${id}`, name: id, artistNames: ['Artist'], metric, durationMs, originalIndex };
}

describe('playlist optimizer', () => {
  it('uses duration and midpoint for placement error', () => {
    const short = track('short', 0.5, 100, 0);
    const long = track('long', 0.5, 500, 1);
    expect(placementError(short, 0, 1_000, risingCurve)).toBeCloseTo(0.45);
    expect(placementError(long, 0, 1_000, risingCurve)).toBeCloseTo(0.25);
  });

  it('clamps beam width to the maximum for short playlists', () => {
    expect(calculateBeamWidth(1)).toBe(94);
  });

  it('clamps beam width to the minimum for long playlists', () => {
    expect(calculateBeamWidth(1_000)).toBe(6);
  });

  it('decreases beam width as playlist length increases', () => {
    expect(calculateBeamWidth(100)).toBeLessThan(calculateBeamWidth(10));
  });

  it('uses the increased proportional search budget', () => {
    expect(calculateBeamWidth(75)).toBe(87);
    expect(calculateBeamWidth(100)).toBe(49);
    expect(calculateBeamWidth(200)).toBe(12);
  });

  it('returns a deterministic beam order', () => {
    const flat: CurvePoint[] = [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }];
    const tracks = [track('z', 0.5, 100, 1), track('b', 0.5, 100, 0), track('a', 0.5, 100, 0)];
    expect(buildBeamOrder(tracks, flat).map((item) => item.id)).toEqual(['a', 'b', 'z']);
    expect(buildBeamOrder(tracks, flat).map((item) => item.id)).toEqual(['a', 'b', 'z']);
  });

  it('uses every eligible track exactly once', () => {
    const tracks = [track('a', 0.2, 100, 0), track('b', 0.5, 200, 1), track('c', 0.9, 300, 2)];
    const result = optimizePlaylist(tracks, risingCurve);
    expect(result.beamOrder.map((item) => item.id).sort()).toEqual(['a', 'b', 'c']);
    expect(new Set(result.beamOrder.map((item) => item.id)).size).toBe(3);
    expect(result.finalOrder.map((item) => item.id).sort()).toEqual(['a', 'b', 'c']);
    expect(new Set(result.finalOrder.map((item) => item.id)).size).toBe(3);
  });

  it('reports a beam cost that matches the complete cost function', () => {
    const tracks = [track('a', 0.2, 100, 0), track('b', 0.8, 300, 1)];
    const result = optimizePlaylist(tracks, risingCurve);
    expect(result.beamCost).toBeCloseTo(totalPlaylistCost(result.beamOrder, risingCurve));
  });

  it('never increases cost during swap optimization', () => {
    const input = [track('high', 0.9, 100, 0), track('low', 0.1, 100, 1)];
    const before = totalPlaylistCost(input, risingCurve);
    expect(improveWithSwaps(input, risingCurve).cost).toBeLessThanOrEqual(before);
  });

  it('selects the lowest-cost pair swap from a complete pass', () => {
    const input = [
      track('highest', 0.95, 100, 0),
      track('high', 0.75, 100, 1),
      track('low', 0.25, 100, 2),
      track('lowest', 0.05, 100, 3),
    ];
    const swapCosts: number[] = [];
    for (let left = 0; left < input.length - 1; left += 1) {
      for (let right = left + 1; right < input.length; right += 1) {
        const candidate = [...input];
        const leftTrack = candidate[left];
        const rightTrack = candidate[right];
        if (!leftTrack || !rightTrack) continue;
        candidate[left] = rightTrack;
        candidate[right] = leftTrack;
        swapCosts.push(totalPlaylistCost(candidate, risingCurve));
      }
    }

    expect(improveWithSwaps(input, risingCurve, 1).cost).toBeCloseTo(Math.min(...swapCosts));
  });

  it('keeps the total duration unchanged', () => {
    const tracks = [track('a', 0.2, 111, 0), track('b', 0.8, 333, 1)];
    const result = optimizePlaylist(tracks, risingCurve);
    expect(playlistDuration(result.beamOrder)).toBe(playlistDuration(tracks));
    expect(playlistDuration(result.finalOrder)).toBe(playlistDuration(tracks));
  });

  it('never returns a final cost above the beam result', () => {
    const tracks = [track('high', 0.9, 100, 0), track('low', 0.1, 100, 1)];
    const result = optimizePlaylist(tracks, risingCurve);
    expect(result.finalCost).toBeLessThanOrEqual(result.beamCost);
  });
});
