import { RandomIntensityProvider } from './randomIntensity';

describe('RandomIntensityProvider', () => {
  it('assigns one normalized simulated value to each track', async () => {
    const values = [0.15, 0.65, 0.95];
    const provider = new RandomIntensityProvider(() => values.shift() ?? 0);

    await expect(provider.getMetric(['a', 'b', 'c'])).resolves.toEqual([
      { trackId: 'a', value: 0.15 },
      { trackId: 'b', value: 0.65 },
      { trackId: 'c', value: 0.95 },
    ]);
  });

  it('clamps injected values to the normalized range', async () => {
    const values = [-1, 2];
    const provider = new RandomIntensityProvider(() => values.shift() ?? 0);

    await expect(provider.getMetric(['low', 'high'])).resolves.toEqual([
      { trackId: 'low', value: 0 },
      { trackId: 'high', value: 1 },
    ]);
  });
});
