import type { CurvePoint } from '../domain/types';

const MIN_POINT_DISTANCE = 0.006;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function evaluateCurve(points: CurvePoint[], normalizedTime: number): number {
  if (points.length === 0) {
    throw new Error('The target curve has no points.');
  }

  const time = clamp01(normalizedTime);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    throw new Error('The target curve has no points.');
  }
  if (time <= first.x) return first.y;
  if (time >= last.x) return last.y;

  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    const left = points[index - 1];
    if (!left || !right || time > right.x) continue;
    const width = right.x - left.x;
    if (width <= 0) return right.y;
    const ratio = (time - left.x) / width;
    return left.y + (right.y - left.y) * ratio;
  }

  return last.y;
}

export function beginCurve(y: number): CurvePoint[] {
  return [{ x: 0, y: clamp01(y) }];
}

export function acceptCurveSample(points: CurvePoint[], x: number, y: number): CurvePoint[] {
  const sample = { x: clamp01(x), y: clamp01(y) };
  const last = points[points.length - 1];
  if (!last) return beginCurve(sample.y);
  if (sample.x <= last.x) return points;
  if (sample.x - last.x < MIN_POINT_DISTANCE && sample.x < 1) return points;
  return [...points, sample];
}

export function finishCurve(points: CurvePoint[]): CurvePoint[] {
  const last = points[points.length - 1];
  if (!last) return [];
  if (last.x === 1) return points;
  return [...points, { x: 1, y: last.y }];
}

export function isFullDomainCurve(points: CurvePoint[]): boolean {
  if (points.length < 2 || points[0]?.x !== 0 || points[points.length - 1]?.x !== 1) return false;
  return points.every((point, index) => {
    const previous = points[index - 1];
    return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 && (!previous || point.x > previous.x);
  });
}
