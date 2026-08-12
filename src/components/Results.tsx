import { Check, ExternalLink, Music2 } from 'lucide-react';
import type { CreatedPlaylist, TrackWithMetric } from '../domain/types';
import type { OptimizationResult } from '../optimizer/optimizer';
import { formatDuration, formatNumber } from '../utils/format';

type ResultsProps = {
  result: OptimizationResult;
  sourceCount: number;
  excludedCount: number;
  created: CreatedPlaylist | null;
};

function improvement(result: OptimizationResult): string {
  if (result.beamCost <= 0) return '—';
  return `${Math.max(0, ((result.beamCost - result.finalCost) / result.beamCost) * 100).toFixed(1)}%`;
}

export function Results({ result, sourceCount, excludedCount, created }: ResultsProps) {
  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results-header">
        <div>
          <span className="eyebrow">Final order</span>
          <h2 id="results-title">Optimized track order</h2>
          <p>Every eligible source track appears exactly once.</p>
        </div>
      </div>
      <dl className="summary-grid">
        <div><dt>Source</dt><dd>{sourceCount}</dd></div>
        <div><dt>Optimized</dt><dd>{result.finalOrder.length}</dd></div>
        <div><dt>Excluded</dt><dd>{excludedCount}</dd></div>
        <div><dt>Beam cost</dt><dd>{formatNumber(result.beamCost)}</dd></div>
        <div><dt>Final cost</dt><dd>{formatNumber(result.finalCost)}</dd></div>
        <div><dt>Swap gain</dt><dd>{improvement(result)}</dd></div>
      </dl>
      {created && (
        <div className="success-state" role="status">
          <Check size={20} />
          <div><strong>{created.name}</strong><span>The new playlist keeps the optimized order.</span></div>
          {created.spotifyUrl && <a href={created.spotifyUrl} target="_blank" rel="noreferrer">Open in Spotify <ExternalLink size={15} /></a>}
        </div>
      )}
      <ol className="optimized-list">
        {result.finalOrder.map((track: TrackWithMetric, index) => (
          <li key={`${track.id}-${track.originalIndex}`}>
            <span className="result-index">{String(index + 1).padStart(2, '0')}</span>
            {track.imageUrl ? <img src={track.imageUrl} alt="" /> : <span className="small-art"><Music2 size={18} /></span>}
            <span className="result-track"><strong>{track.name}</strong><small>{track.artistNames.join(', ')}</small></span>
            <time>{formatDuration(track.durationMs)}</time>
            <span className="metric-pill"><i style={{ width: `${track.metric * 100}%` }} /><span>{track.metric.toFixed(2)}</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}
