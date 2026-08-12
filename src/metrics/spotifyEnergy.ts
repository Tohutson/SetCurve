import type { TrackMetric } from '../domain/types';
import { SpotifyApiError, spotifyFetch } from '../spotify/api';
import { MetricAccessError, type TrackMetricProvider } from './provider';

const AUDIO_FEATURE_BATCH_SIZE = 100;

type AudioFeature = { id: string; energy: number };

export class SpotifyEnergyProvider implements TrackMetricProvider {
  readonly metricName = 'energy';

  async getMetric(trackIds: string[]): Promise<TrackMetric[]> {
    if (import.meta.env.VITE_SPOTIFY_AUDIO_FEATURES_ENABLED !== 'true') {
      throw new MetricAccessError(
        'Spotify does not provide Audio Features to new Development Mode apps. This app cannot load energy for this playlist.',
      );
    }
    const metrics: TrackMetric[] = [];
    for (let index = 0; index < trackIds.length; index += AUDIO_FEATURE_BATCH_SIZE) {
      const ids = trackIds.slice(index, index + AUDIO_FEATURE_BATCH_SIZE);
      let data: { audio_features: Array<AudioFeature | null> };
      try {
        data = await spotifyFetch(`/audio-features?ids=${encodeURIComponent(ids.join(','))}`);
      } catch (reason) {
        if (reason instanceof SpotifyApiError && (reason.status === 403 || reason.status === 404)) {
          throw new MetricAccessError('This Spotify app cannot access Audio Features. Energy optimization is blocked.');
        }
        throw new MetricAccessError(reason instanceof Error ? reason.message : 'Spotify could not load energy values.');
      }
      for (const feature of data.audio_features) {
        if (feature && Number.isFinite(feature.energy) && feature.energy >= 0 && feature.energy <= 1) {
          metrics.push({ trackId: feature.id, value: feature.energy });
        }
      }
    }
    return metrics;
  }
}
