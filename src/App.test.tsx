import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { OptimizationResult } from './optimizer/optimizer';
import App from './App';

const mocks = vi.hoisted(() => ({
  hasSession: vi.fn(),
  completeLogin: vi.fn(),
  startLogin: vi.fn(),
  clearSession: vi.fn(),
  getUser: vi.fn(),
  getPlaylists: vi.fn(),
  getTracks: vi.fn(),
  createPlaylist: vi.fn(),
  getMetric: vi.fn(),
  optimize: vi.fn(),
}));

vi.mock('./auth/pkce', () => ({
  clearSpotifySession: mocks.clearSession,
  completeSpotifyLogin: mocks.completeLogin,
  hasSpotifySession: mocks.hasSession,
  startSpotifyLogin: mocks.startLogin,
}));

vi.mock('./spotify/api', () => ({
  createPlaylistWithTracks: mocks.createPlaylist,
  getCurrentUser: mocks.getUser,
  getCurrentUserPlaylists: mocks.getPlaylists,
  getPlaylistTracks: mocks.getTracks,
}));

vi.mock('./metrics/spotifyEnergy', () => ({
  SpotifyEnergyProvider: class {
    readonly metricName = 'energy';
    getMetric = mocks.getMetric;
  },
}));

vi.mock('./workers/optimize', () => ({ optimizeInWorker: mocks.optimize }));

const testTrack = {
  id: 'track-1',
  uri: 'spotify:track:track-1',
  name: 'Test Track',
  artistNames: ['Test Artist'],
  durationMs: 180_000,
  imageUrl: 'https://example.com/test-cover.jpg',
  originalIndex: 0,
};

describe('main workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    mocks.hasSession.mockReturnValue(false);
    mocks.completeLogin.mockResolvedValue(false);
  });

  it('starts with one clear Spotify connection action', async () => {
    render(<App />);
    expect((await screen.findAllByRole('button', { name: /connect spotify/i }))[0]).toBeVisible();
    expect(screen.getByText(/source playlist stays unchanged/i)).toBeVisible();
    expect(screen.getByRole('img', { name: /target curve over the playlist duration/i })).toBeVisible();
    expect(screen.getByLabelText('Spotify playlist')).toBeVisible();
  });

  it('starts Spotify connection when drawing is attempted while disconnected', () => {
    const { container } = render(<App />);
    const captureArea = container.querySelector('.pointer-capture');
    expect(captureArea).not.toBeNull();
    fireEvent.pointerDown(captureArea as Element, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(mocks.startLogin).toHaveBeenCalledOnce();
  });

  it('completes the mocked choose, draw, optimize, and create workflow', async () => {
    mocks.hasSession.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({ displayName: 'Listener' });
    mocks.getPlaylists.mockResolvedValue([{ id: 'playlist-1', name: 'Source', ownerName: 'Listener', trackCount: 1 }]);
    mocks.getTracks.mockResolvedValue({ tracks: [testTrack], excludedUnavailable: 0 });
    mocks.getMetric.mockResolvedValue([{ trackId: 'track-1', value: 0.6 }]);
    const optimizedTrack = { ...testTrack, metric: 0.6 };
    const result: OptimizationResult = {
      beamOrder: [optimizedTrack],
      beamCost: 0.1,
      finalOrder: [optimizedTrack],
      finalCost: 0.1,
      beamWidth: 75,
      acceptedSwaps: 0,
      placements: [{ trackId: 'track-1', midpointMs: 90_000, normalizedMidpoint: 0.5, metric: 0.6, target: 0.5, error: 0.1 }],
    };
    mocks.optimize.mockResolvedValue(result);
    mocks.createPlaylist.mockResolvedValue({ id: 'created', name: 'Source — Curved', spotifyUrl: 'https://open.spotify.com/playlist/created' });

    render(<App />);
    const select = await screen.findByLabelText('Spotify playlist');
    fireEvent.change(select, { target: { value: 'playlist-1' } });
    fireEvent.click(await screen.findByRole('button', { name: /edit control points/i }));
    fireEvent.click(screen.getByRole('button', { name: /optimize order/i }));
    expect(await screen.findByRole('heading', { name: /optimized track order/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /skip animation/i })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.actual-point')).toHaveLength(1);
    expect(screen.getAllByRole('img', { name: /target curve over the playlist duration/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^create playlist$/i }));

    await waitFor(() => expect(mocks.createPlaylist).toHaveBeenCalledWith('Source — Curved', ['spotify:track:track-1']));
    expect(await screen.findByText('The new playlist keeps the optimized order.')).toBeVisible();
  });

  it('reveals final points in order and provides a skip action', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    mocks.hasSession.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({ displayName: 'Listener' });
    mocks.getPlaylists.mockResolvedValue([{ id: 'playlist-1', name: 'Source', ownerName: 'Listener', trackCount: 2 }]);
    const secondTrack = { ...testTrack, id: 'track-2', uri: 'spotify:track:track-2', name: 'Second Track', originalIndex: 1 };
    mocks.getTracks.mockResolvedValue({ tracks: [testTrack, secondTrack], excludedUnavailable: 0 });
    const firstMetricTrack = { ...testTrack, metric: 0.3 };
    const secondMetricTrack = { ...secondTrack, metric: 0.7 };
    mocks.optimize.mockResolvedValue({
      beamOrder: [firstMetricTrack, secondMetricTrack],
      beamCost: 0.2,
      finalOrder: [firstMetricTrack, secondMetricTrack],
      finalCost: 0.2,
      beamWidth: 75,
      acceptedSwaps: 0,
      placements: [
        { trackId: 'track-1', midpointMs: 90_000, normalizedMidpoint: 0.25, metric: 0.3, target: 0.3, error: 0 },
        { trackId: 'track-2', midpointMs: 270_000, normalizedMidpoint: 0.75, metric: 0.7, target: 0.7, error: 0 },
      ],
    } satisfies OptimizationResult);

    render(<App />);
    fireEvent.change(await screen.findByLabelText('Spotify playlist'), { target: { value: 'playlist-1' } });
    fireEvent.click(await screen.findByRole('button', { name: /edit control points/i }));
    fireEvent.click(screen.getByRole('button', { name: /optimize order/i }));

    expect(await screen.findByRole('button', { name: /skip animation/i })).toBeVisible();
    expect(document.querySelectorAll('.actual-point')).toHaveLength(0);
    await waitFor(() => expect(document.querySelectorAll('.actual-point')).toHaveLength(1), { timeout: 2_000 });
    const pointCallout = document.querySelector('.point-flash-card');
    expect(pointCallout).not.toBeNull();
    expect(pointCallout?.textContent).toContain('Test Track');
    expect(pointCallout?.textContent).toContain('Test Artist');
    expect(pointCallout?.querySelector('img')).toHaveAttribute('src', 'https://example.com/test-cover.jpg');
    fireEvent.click(screen.getByRole('button', { name: /skip animation/i }));
    expect(document.querySelectorAll('.actual-point')).toHaveLength(2);
    expect(document.querySelector('.point-flash-card')).toBeNull();
    expect(screen.getByRole('heading', { name: /optimized track order/i })).toBeVisible();
  });
});
