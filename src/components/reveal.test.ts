import { getRevealDelay } from './reveal';

describe('getRevealDelay', () => {
  it('gives each track a one-second reveal', () => {
    expect(getRevealDelay(1)).toBe(1_000);
    expect(getRevealDelay(25)).toBe(1_000);
    expect(getRevealDelay(100)).toBe(1_000);
  });
});
