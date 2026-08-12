import type { TrackMetric } from '../domain/types';
import type { TrackMetricProvider } from './provider';

export type RandomValueSource = () => number;

export class RandomIntensityProvider implements TrackMetricProvider {
  readonly metricName = 'simulated intensity';

  constructor(private readonly randomValue: RandomValueSource = Math.random) {}

  async getMetric(trackIds: string[]): Promise<TrackMetric[]> {
    return trackIds.map((trackId) => ({
      trackId,
      value: Math.min(1, Math.max(0, this.randomValue())),
    }));
  }
}
