import { useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { acceptCurveSample, beginCurve, finishCurve } from '../curve/math';
import type { CurvePoint } from '../domain/types';
import type { TrackWithMetric } from '../domain/types';
import type { TrackPlacement } from '../optimizer/optimizer';
import { CurveGraph, GRAPH_HEIGHT, GRAPH_PADDING, GRAPH_WIDTH } from './CurveGraph';

type CurveEditorProps = {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  durationLabel: string;
  metricLabel?: string;
  placements?: TrackPlacement[];
  placementTracks?: TrackWithMetric[];
  featuredPlacementIndex?: number | null;
  mode: 'empty' | 'drawing' | 'curve-ready' | 'optimizing' | 'revealing-result' | 'result-ready';
  canDraw: boolean;
  onDrawBlocked: () => void;
  onSkipAnimation?: () => void;
};

const controlX = [0, 0.25, 0.5, 0.75, 1];

export function CurveEditor({
  points,
  onChange,
  durationLabel,
  metricLabel,
  placements = [],
  placementTracks = [],
  featuredPlacementIndex = null,
  mode,
  canDraw,
  onDrawBlocked,
  onSkipAnimation,
}: CurveEditorProps) {
  const activePointer = useRef<number | null>(null);
  const [showControls, setShowControls] = useState(false);

  function pointerValue(event: React.PointerEvent<SVGRectElement>): { x: number; y: number } {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = 1 - (event.clientY - bounds.top) / bounds.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function handlePointerDown(event: React.PointerEvent<SVGRectElement>) {
    if (!canDraw) {
      onDrawBlocked();
      return;
    }
    activePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange(beginCurve(pointerValue(event).y));
  }

  function handlePointerMove(event: React.PointerEvent<SVGRectElement>) {
    if (!canDraw || activePointer.current !== event.pointerId) return;
    const value = pointerValue(event);
    onChange(acceptCurveSample(points, value.x, value.y));
  }

  function handlePointerEnd(event: React.PointerEvent<SVGRectElement>) {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    onChange(finishCurve(points));
  }

  function enableControls() {
    setShowControls(true);
    if (points.length === 0) onChange(controlX.map((x) => ({ x, y: 0.5 })));
  }

  function updateControl(index: number, value: number) {
    const current = controlX.map((x) => ({ x, y: points.length ? sampleExisting(x) : 0.5 }));
    const selected = current[index];
    if (selected) selected.y = value;
    onChange(current);
  }

  function sampleExisting(x: number): number {
    if (points.length === 0) return 0.5;
    const rightIndex = points.findIndex((point) => point.x >= x);
    if (rightIndex <= 0) return points[0]?.y ?? 0.5;
    const right = points[rightIndex];
    const left = points[rightIndex - 1];
    if (!left || !right) return points.at(-1)?.y ?? 0.5;
    const ratio = (x - left.x) / (right.x - left.x);
    return left.y + (right.y - left.y) * ratio;
  }

  return (
    <div className={`curve-editor graph-mode-${mode}`}>
      <CurveGraph curve={points} placements={placements} placementTracks={placementTracks} featuredPlacementIndex={featuredPlacementIndex} durationLabel={durationLabel} metricLabel={metricLabel} className="curve-svg" >
        <rect
          x={GRAPH_PADDING.left}
          y={GRAPH_PADDING.top}
          width={GRAPH_WIDTH - GRAPH_PADDING.left - GRAPH_PADDING.right}
          height={GRAPH_HEIGHT - GRAPH_PADDING.top - GRAPH_PADDING.bottom}
          className="pointer-capture"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        />
      </CurveGraph>
      <div className="curve-actions">
        <p>{graphMessage(mode, points.length)}</p>
        <div className="button-row">
          {mode === 'revealing-result' && onSkipAnimation && <button type="button" className="button button-quiet" onClick={onSkipAnimation}>Skip animation</button>}
          <button type="button" className="button button-quiet" onClick={enableControls} disabled={!canDraw}>
            <SlidersHorizontal size={16} /> Edit control points
          </button>
        </div>
      </div>
      {showControls && (
        <fieldset className="control-points">
          <legend>Keyboard curve controls</legend>
          {controlX.map((x, index) => (
            <label key={x}>
              <span>{Math.round(x * 100)}%</span>
              <input type="range" min="0" max="1" step="0.05" value={sampleExisting(x)} onChange={(event) => updateControl(index, Number(event.target.value))} disabled={!canDraw} />
              <output>{sampleExisting(x).toFixed(2)}</output>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

function graphMessage(mode: CurveEditorProps['mode'], pointCount: number): string {
  if (mode === 'empty') return 'Connect Spotify and load a playlist. The graph stays ready here.';
  if (mode === 'optimizing') return 'Calculating the beam order and pairwise swap improvements.';
  if (mode === 'revealing-result') return 'Revealing optimized tracks in playlist order.';
  if (mode === 'result-ready') return 'Result complete. Redraw the curve to optimize again.';
  return pointCount === 0
    ? 'Draw from left to right. The final value extends to the end when you release.'
    : 'The curve covers the full playlist time.';
}
