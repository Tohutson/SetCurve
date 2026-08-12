/// <reference lib="webworker" />

import type { CurvePoint, TrackWithMetric } from '../domain/types';
import { optimizePlaylist } from '../optimizer/optimizer';

type OptimizeMessage = { tracks: TrackWithMetric[]; curve: CurvePoint[] };

self.onmessage = (event: MessageEvent<OptimizeMessage>) => {
  self.postMessage(optimizePlaylist(event.data.tracks, event.data.curve));
};

export {};
