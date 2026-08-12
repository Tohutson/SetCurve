import { getRevealDelay } from './reveal';

describe('getRevealDelay', () => {
  it('uses shorter intervals for longer playlists', () => {
    expect(getRevealDelay(25)).toBe(100);
    expect(getRevealDelay(50)).toBe(65);
    expect(getRevealDelay(100)).toBe(35);
    expect(getRevealDelay(101)).toBe(20);
  });
});
