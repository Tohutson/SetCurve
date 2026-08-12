import { acceptCurveSample, beginCurve, evaluateCurve, finishCurve, isFullDomainCurve } from './math';

describe('curve math', () => {
  it('interpolates between curve points', () => {
    expect(evaluateCurve([{ x: 0, y: 0.2 }, { x: 1, y: 0.8 }], 0.5)).toBeCloseTo(0.5);
  });

  it('keeps accepted x samples increasing', () => {
    const points = acceptCurveSample(acceptCurveSample(beginCurve(0.2), 0.3, 0.4), 0.8, 0.9);
    expect(points.map((point) => point.x)).toEqual([0, 0.3, 0.8]);
    expect(isFullDomainCurve(finishCurve(points))).toBe(true);
  });

  it('ignores backward pointer movement', () => {
    const forward = acceptCurveSample(beginCurve(0.2), 0.5, 0.7);
    expect(acceptCurveSample(forward, 0.3, 0.1)).toBe(forward);
  });

  it('extends an early release to the right edge', () => {
    const result = finishCurve(acceptCurveSample(beginCurve(0.4), 0.35, 0.6));
    expect(result.at(-1)).toEqual({ x: 1, y: 0.6 });
    expect(evaluateCurve(result, 0.9)).toBe(0.6);
  });
});
