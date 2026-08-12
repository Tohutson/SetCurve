import type { CurvePoint, TrackWithMetric } from '../domain/types';
import type { TrackPlacement } from '../optimizer/optimizer';
import { formatDuration } from '../utils/format';

export const GRAPH_WIDTH = 800;
export const GRAPH_HEIGHT = 340;
export const GRAPH_PADDING = { top: 24, right: 24, bottom: 44, left: 58 };

const plotWidth = GRAPH_WIDTH - GRAPH_PADDING.left - GRAPH_PADDING.right;
const plotHeight = GRAPH_HEIGHT - GRAPH_PADDING.top - GRAPH_PADDING.bottom;

export function graphX(x: number): number {
  return GRAPH_PADDING.left + x * plotWidth;
}

export function graphY(y: number): number {
  return GRAPH_PADDING.top + (1 - y) * plotHeight;
}

export function curvePath(points: CurvePoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${graphX(point.x)} ${graphY(point.y)}`).join(' ');
}

type CurveGraphProps = {
  curve: CurvePoint[];
  placements?: TrackPlacement[];
  placementTracks?: TrackWithMetric[];
  featuredPlacementIndex?: number | null;
  durationLabel: string;
  metricLabel?: string;
  children?: React.ReactNode;
  className?: string;
};

export function CurveGraph({
  curve,
  placements = [],
  placementTracks = [],
  featuredPlacementIndex = null,
  durationLabel,
  metricLabel = 'Energy',
  children,
  className,
}: CurveGraphProps) {
  const actualPath = placements
    .map((placement, index) => `${index === 0 ? 'M' : 'L'} ${graphX(placement.normalizedMidpoint)} ${graphY(placement.metric)}`)
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
      className={className}
      role="img"
      aria-label={`${metricLabel} target curve over the playlist duration`}
    >
      <rect x={GRAPH_PADDING.left} y={GRAPH_PADDING.top} width={plotWidth} height={plotHeight} className="graph-plot" />
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
        <g key={tick}>
          <line x1={GRAPH_PADDING.left} x2={GRAPH_WIDTH - GRAPH_PADDING.right} y1={graphY(tick)} y2={graphY(tick)} className="graph-grid" />
          <text x={GRAPH_PADDING.left - 14} y={graphY(tick) + 4} textAnchor="end" className="graph-label">{tick.toFixed(tick === 0 || tick === 1 ? 0 : 2)}</text>
        </g>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
        <line key={tick} x1={graphX(tick)} x2={graphX(tick)} y1={GRAPH_PADDING.top} y2={GRAPH_HEIGHT - GRAPH_PADDING.bottom} className="graph-grid graph-grid-vertical" />
      ))}
      <text x={GRAPH_PADDING.left} y={GRAPH_HEIGHT - 14} textAnchor="start" className="graph-label">0:00</text>
      <text x={GRAPH_WIDTH - GRAPH_PADDING.right} y={GRAPH_HEIGHT - 14} textAnchor="end" className="graph-label">{durationLabel}</text>
      <text transform={`translate(16 ${GRAPH_HEIGHT / 2}) rotate(-90)`} textAnchor="middle" className="graph-axis-title">{metricLabel}</text>
      <text x={GRAPH_WIDTH / 2} y={GRAPH_HEIGHT - 12} textAnchor="middle" className="graph-axis-title">Playlist time</text>
      {children}
      {curve.length > 0 && <path d={curvePath(curve)} className="target-line" />}
      {actualPath && <path d={actualPath} className="actual-line" />}
      {placements.map((placement, index) => {
        const track = placementTracks[index];
        const label = track
          ? `${track.name} by ${track.artistNames.join(', ')}. ${metricLabel} ${placement.metric.toFixed(2)} at ${formatDuration(placement.midpointMs)}.`
          : `${metricLabel} ${placement.metric.toFixed(2)} at ${formatDuration(placement.midpointMs)}.`;
        return (
          <circle
            key={`${placement.trackId}-${placement.midpointMs}-${index}`}
            cx={graphX(placement.normalizedMidpoint)}
            cy={graphY(placement.metric)}
            r="5"
            className="actual-point result-point-enter"
            tabIndex={0}
            aria-label={label}
          >
            <title>{label}</title>
          </circle>
        );
      })}
      <FeaturedTrackCallout
        placement={featuredPlacementIndex === null ? undefined : placements[featuredPlacementIndex]}
        track={featuredPlacementIndex === null ? undefined : placementTracks[featuredPlacementIndex]}
        animationKey={featuredPlacementIndex}
      />
    </svg>
  );
}

type FeaturedTrackCalloutProps = {
  placement?: TrackPlacement;
  track?: TrackWithMetric;
  animationKey: number | null;
};

function FeaturedTrackCallout({ placement, track, animationKey }: FeaturedTrackCalloutProps) {
  if (!placement || !track || animationKey === null) return null;
  const width = 210;
  const height = 62;
  const pointX = graphX(placement.normalizedMidpoint);
  const pointY = graphY(placement.metric);
  const x = Math.max(GRAPH_PADDING.left, Math.min(GRAPH_WIDTH - GRAPH_PADDING.right - width, pointX - width / 2));
  const showBelow = pointY < GRAPH_PADDING.top + height + 18;
  const y = showBelow ? pointY + 14 : pointY - height - 14;
  const leaderY = showBelow ? y : y + height;

  return (
    <g key={`featured-${animationKey}`} className="point-flash-group" aria-hidden="true">
      <line x1={pointX} y1={pointY} x2={pointX} y2={leaderY} className="point-flash-leader" />
      <foreignObject x={x} y={y} width={width} height={height} className="point-flash-object">
        <div className="point-flash-card">
          {track.imageUrl ? <img src={track.imageUrl} alt="" /> : <span className="point-flash-art" />}
          <span className="point-flash-copy">
            <strong>{track.name}</strong>
            <small>{track.artistNames.join(', ')}</small>
          </span>
        </div>
      </foreignObject>
    </g>
  );
}
