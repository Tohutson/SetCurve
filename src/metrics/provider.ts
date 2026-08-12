import type { TrackMetric } from '../domain/types';

export interface TrackMetricProvider {
  readonly metricName: string;
  getMetric(trackIds: string[]): Promise<TrackMetric[]>;
}

export class MetricAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetricAccessError';
  }
}
