import type { CurvePoint, TrackWithMetric } from '../domain/types';
import type { OptimizationResult } from '../optimizer/optimizer';

export function optimizeInWorker(tracks: TrackWithMetric[], curve: CurvePoint[]): Promise<OptimizationResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<OptimizationResult>) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = () => {
      reject(new Error('The optimizer worker stopped. Try the optimization again.'));
      worker.terminate();
    };
    worker.postMessage({ tracks, curve });
  });
}
