import { evaluateCurve } from '../curve/math';
import type { CurvePoint, TrackWithMetric } from '../domain/types';

export const MIN_BEAM_WIDTH = 5;
export const MAX_BEAM_WIDTH = 75;
export const BEAM_EXPANSION_BUDGET = 200_000;
export const MAX_SWAP_PASSES = 25;
export const MAX_SWAP_EVALUATIONS = 20_000;
const COST_EPSILON = 1e-10;

type BeamState = {
  orderedIndices: number[];
  unusedIndices: number[];
  elapsedMs: number;
  cost: number;
};

export type TrackPlacement = {
  trackId: string;
  midpointMs: number;
  normalizedMidpoint: number;
  metric: number;
  target: number;
  error: number;
};

export type OptimizationResult = {
  beamOrder: TrackWithMetric[];
  beamCost: number;
  finalOrder: TrackWithMetric[];
  finalCost: number;
  beamWidth: number;
  acceptedSwaps: number;
  placements: TrackPlacement[];
};

export function playlistDuration(tracks: TrackWithMetric[]): number {
  return tracks.reduce((total, track) => total + track.durationMs, 0);
}

export function placementError(
  track: TrackWithMetric,
  elapsedMs: number,
  totalDurationMs: number,
  curve: CurvePoint[],
): number {
  if (totalDurationMs <= 0) throw new Error('The playlist duration must be greater than zero.');
  const normalizedMidpoint = (elapsedMs + track.durationMs / 2) / totalDurationMs;
  return Math.abs(track.metric - evaluateCurve(curve, normalizedMidpoint));
}

function compareTrackOrder(left: TrackWithMetric, right: TrackWithMetric): number {
  return left.originalIndex - right.originalIndex || left.id.localeCompare(right.id);
}

export function calculateBeamWidth(trackCount: number): number {
  if (trackCount <= 0) return MAX_BEAM_WIDTH;
  const estimated = Math.floor(
    (2 * BEAM_EXPANSION_BUDGET) /
    (trackCount * (trackCount + 1)),
  );
  return Math.max(MIN_BEAM_WIDTH, Math.min(MAX_BEAM_WIDTH, estimated));
}

function compareBeamStates(left: BeamState, right: BeamState, tracks: TrackWithMetric[]): number {
  if (Math.abs(left.cost - right.cost) > COST_EPSILON) return left.cost - right.cost;
  const length = Math.min(left.orderedIndices.length, right.orderedIndices.length);
  for (let index = 0; index < length; index += 1) {
    const leftTrack = tracks[left.orderedIndices[index] ?? -1];
    const rightTrack = tracks[right.orderedIndices[index] ?? -1];
    if (!leftTrack || !rightTrack) continue;
    const comparison = compareTrackOrder(leftTrack, rightTrack);
    if (comparison !== 0) return comparison;
  }
  return left.orderedIndices.length - right.orderedIndices.length;
}

export function buildBeamOrder(
  tracks: TrackWithMetric[],
  curve: CurvePoint[],
  beamWidth = calculateBeamWidth(tracks.length),
): TrackWithMetric[] {
  if (tracks.length === 0) return [];
  const totalDurationMs = playlistDuration(tracks);
  let beam: BeamState[] = [{
    orderedIndices: [],
    unusedIndices: tracks.map((_, index) => index),
    elapsedMs: 0,
    cost: 0,
  }];

  for (let depth = 0; depth < tracks.length; depth += 1) {
    const candidates: BeamState[] = [];
    for (const state of beam) {
      for (const trackIndex of state.unusedIndices) {
        const track = tracks[trackIndex];
        if (!track) continue;
        candidates.push({
          orderedIndices: [...state.orderedIndices, trackIndex],
          unusedIndices: state.unusedIndices.filter((unusedIndex) => unusedIndex !== trackIndex),
          elapsedMs: state.elapsedMs + track.durationMs,
          cost: state.cost + placementError(track, state.elapsedMs, totalDurationMs, curve),
        });
      }
    }
    candidates.sort((left, right) => compareBeamStates(left, right, tracks));
    beam = candidates.slice(0, beamWidth);
  }

  const best = beam[0];
  if (!best) throw new Error('Beam search could not create a complete order.');
  return best.orderedIndices.flatMap((index) => tracks[index] ?? []);
}

export function getPlacements(order: TrackWithMetric[], curve: CurvePoint[]): TrackPlacement[] {
  const totalDurationMs = playlistDuration(order);
  let elapsedMs = 0;
  return order.map((track) => {
    const midpointMs = elapsedMs + track.durationMs / 2;
    const normalizedMidpoint = midpointMs / totalDurationMs;
    const target = evaluateCurve(curve, normalizedMidpoint);
    const placement = {
      trackId: track.id,
      midpointMs,
      normalizedMidpoint,
      metric: track.metric,
      target,
      error: Math.abs(track.metric - target),
    };
    elapsedMs += track.durationMs;
    return placement;
  });
}

export function totalPlaylistCost(order: TrackWithMetric[], curve: CurvePoint[]): number {
  return getPlacements(order, curve).reduce((total, placement) => total + placement.error, 0);
}

export function improveWithSwaps(
  initialOrder: TrackWithMetric[],
  curve: CurvePoint[],
  maxPasses = MAX_SWAP_PASSES,
  maxEvaluations = MAX_SWAP_EVALUATIONS,
): { order: TrackWithMetric[]; cost: number; acceptedSwaps: number } {
  const order = [...initialOrder];
  let cost = totalPlaylistCost(order, curve);
  let acceptedSwaps = 0;
  let evaluations = 0;

  // Best-improvement search applies the lowest-cost swap from each complete pass.
  for (let pass = 0; pass < maxPasses && evaluations < maxEvaluations; pass += 1) {
    let bestOrder: TrackWithMetric[] | null = null;
    let bestCost = cost;
    outer: for (let left = 0; left < order.length - 1; left += 1) {
      for (let right = left + 1; right < order.length; right += 1) {
        if (evaluations >= maxEvaluations) break outer;
        evaluations += 1;
        const candidate = [...order];
        const leftTrack = candidate[left];
        const rightTrack = candidate[right];
        if (!leftTrack || !rightTrack) continue;
        candidate[left] = rightTrack;
        candidate[right] = leftTrack;
        const candidateCost = totalPlaylistCost(candidate, curve);
        if (candidateCost < bestCost - COST_EPSILON) {
          bestOrder = candidate;
          bestCost = candidateCost;
        }
      }
    }
    if (!bestOrder) break;
    order.splice(0, order.length, ...bestOrder);
    cost = bestCost;
    acceptedSwaps += 1;
  }

  return { order, cost, acceptedSwaps };
}

export function optimizePlaylist(tracks: TrackWithMetric[], curve: CurvePoint[]): OptimizationResult {
  if (tracks.length === 0) throw new Error('The optimizer requires at least one track.');
  const beamWidth = calculateBeamWidth(tracks.length);
  const beamOrder = buildBeamOrder(tracks, curve, beamWidth);
  const beamCost = totalPlaylistCost(beamOrder, curve);
  const improved = improveWithSwaps(beamOrder, curve);
  return {
    beamOrder,
    beamCost,
    finalOrder: improved.order,
    finalCost: improved.cost,
    beamWidth,
    acceptedSwaps: improved.acceptedSwaps,
    placements: getPlacements(improved.order, curve),
  };
}
