import { beforeEach, expect, vi } from 'vitest';
import { collectPages, createPlaylistWithTracks } from './api';

vi.mock('../auth/pkce', () => ({ getAccessToken: vi.fn().mockResolvedValue('test-token') }));

describe('Spotify service', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('combines every pagination page', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ items: [1, 2], next: 'page-2' })
      .mockResolvedValueOnce({ items: [3], next: null });
    await expect(collectPages('page-1', load)).resolves.toEqual([1, 2, 3]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('exports playlist items in optimized order and keeps batch order', async () => {
    const responses = [
      new Response(JSON.stringify({ id: 'new-list', name: 'Source — Curved', external_urls: { spotify: 'https://open.spotify.com/playlist/new-list' } }), { status: 201 }),
      new Response(JSON.stringify({ snapshot_id: 'one' }), { status: 201 }),
      new Response(JSON.stringify({ snapshot_id: 'two' }), { status: 201 }),
    ];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(responses.shift() ?? new Response(null, { status: 500 })));
    const uris = Array.from({ length: 101 }, (_, index) => `spotify:track:${index}`);
    await createPlaylistWithTracks('Source — Curved', uris);
    const firstBatch = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { uris: string[] };
    const secondBatch = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as { uris: string[] };
    expect([...firstBatch.uris, ...secondBatch.uris]).toEqual(uris);
  });
});
