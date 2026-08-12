import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Headphones, LogOut, RotateCcw } from 'lucide-react';
import { clearSpotifySession, completeSpotifyLogin, hasSpotifySession, startSpotifyLogin } from './auth/pkce';
import { CurveEditor } from './components/CurveEditor';
import { PlaylistPanel } from './components/PlaylistPanel';
import { Results } from './components/Results';
import { getRevealDelay } from './components/reveal';
import { isFullDomainCurve } from './curve/math';
import type { CreatedPlaylist, CurvePoint, PlaylistSummary, Track, TrackWithMetric, UserProfile } from './domain/types';
import { MetricAccessError, type TrackMetricProvider } from './metrics/provider';
import { RandomIntensityProvider } from './metrics/randomIntensity';
import { SpotifyEnergyProvider } from './metrics/spotifyEnergy';
import type { OptimizationResult } from './optimizer/optimizer';
import { playlistDuration } from './optimizer/optimizer';
import { createPlaylistWithTracks, getCurrentUser, getCurrentUserPlaylists, getPlaylistTracks } from './spotify/api';
import { formatDuration } from './utils/format';
import { optimizeInWorker } from './workers/optimize';

export type AppStage =
  | 'disconnected'
  | 'playlist-ready'
  | 'drawing'
  | 'curve-ready'
  | 'optimizing'
  | 'revealing-result'
  | 'result-ready'
  | 'creating-playlist';

type LoadState = 'idle' | 'loading' | 'ready';

const testMode = import.meta.env.VITE_TEST_MODE === 'true';
const metricProvider: TrackMetricProvider = testMode ? new RandomIntensityProvider() : new SpotifyEnergyProvider();
const metricLabel = testMode ? 'Simulated intensity' : 'Energy';

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return reducedMotion;
}

export default function App() {
  const initialSession = useMemo(() => hasSpotifySession(), []);
  const [connected, setConnected] = useState(initialSession);
  const [stage, setStage] = useState<AppStage>(initialSession ? 'playlist-ready' : 'disconnected');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selected, setSelected] = useState<PlaylistSummary>();
  const [sourceTracks, setSourceTracks] = useState<Track[]>([]);
  const [eligibleTracks, setEligibleTracks] = useState<TrackWithMetric[]>([]);
  const [excludedCount, setExcludedCount] = useState(0);
  const [curve, setCurve] = useState<CurvePoint[]>([]);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [created, setCreated] = useState<CreatedPlaylist | null>(null);
  const [playlistState, setPlaylistState] = useState<LoadState>('idle');
  const [trackState, setTrackState] = useState<LoadState>('idle');
  const [metricError, setMetricError] = useState('');
  const [message, setMessage] = useState('');
  const reducedMotion = useReducedMotion();

  const loadAccount = useCallback(async () => {
    setPlaylistState('loading');
    setMessage('');
    try {
      const [user, loadedPlaylists] = await Promise.all([getCurrentUser(), getCurrentUserPlaylists()]);
      setProfile(user);
      setPlaylists(loadedPlaylists);
      setPlaylistState('ready');
      setConnected(true);
      setStage('playlist-ready');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Spotify could not load the account.');
      setPlaylistState('idle');
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const completed = await completeSpotifyLogin();
        if (!active) return;
        if (completed) setConnected(true);
        if (completed || initialSession) await loadAccount();
      } catch (reason) {
        if (!active) return;
        setConnected(false);
        setStage('disconnected');
        setMessage(reason instanceof Error ? reason.message : 'Spotify authorization failed.');
      }
    }
    void initialize();
    return () => { active = false; };
  }, [initialSession, loadAccount]);

  useEffect(() => {
    if (stage !== 'revealing-result' || !result) return;
    if (reducedMotion) {
      setRevealedCount(result.placements.length);
      setStage('result-ready');
      return;
    }
    if (revealedCount >= result.placements.length) {
      setStage('result-ready');
      return;
    }
    const timer = window.setTimeout(
      () => setRevealedCount((count) => Math.min(count + 1, result.placements.length)),
      getRevealDelay(result.placements.length),
    );
    return () => window.clearTimeout(timer);
  }, [reducedMotion, result, revealedCount, stage]);

  async function connect() {
    setMessage('');
    try {
      await startSpotifyLogin();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Spotify authorization could not start.');
    }
  }

  async function selectPlaylist(playlist: PlaylistSummary) {
    if (!connected) {
      await connect();
      return;
    }
    setSelected(playlist);
    setSourceTracks([]);
    setEligibleTracks([]);
    setExcludedCount(0);
    setCurve([]);
    setResult(null);
    setRevealedCount(0);
    setCreated(null);
    setMetricError('');
    setMessage('');
    setStage('playlist-ready');
    setTrackState('loading');
    try {
      const loaded = await getPlaylistTracks(playlist.id);
      setSourceTracks(loaded.tracks);
      try {
        const metrics = await metricProvider.getMetric(loaded.tracks.map((track) => track.id));
        const byTrackId = new Map(metrics.map((metric) => [metric.trackId, metric.value]));
        const eligible = loaded.tracks.flatMap((track) => {
          const metric = byTrackId.get(track.id);
          return metric === undefined ? [] : [{ ...track, metric }];
        });
        const missingMetrics = loaded.tracks.length - eligible.length;
        setEligibleTracks(eligible);
        setExcludedCount(loaded.excludedUnavailable + missingMetrics);
        if (eligible.length === 0) {
          setMetricError('No eligible tracks have a metric value. Optimization cannot run.');
          setStage('playlist-ready');
        } else {
          setStage('drawing');
        }
      } catch (reason) {
        if (reason instanceof MetricAccessError) {
          setMetricError(reason.message);
          setExcludedCount(loaded.excludedUnavailable);
          setStage('playlist-ready');
        } else {
          throw reason;
        }
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Spotify could not load this playlist.');
      setStage('playlist-ready');
    } finally {
      setTrackState('ready');
    }
  }

  function changeCurve(nextCurve: CurvePoint[]) {
    setCurve(nextCurve);
    setResult(null);
    setRevealedCount(0);
    setCreated(null);
    setStage(isFullDomainCurve(nextCurve) ? 'curve-ready' : 'drawing');
  }

  function requireDrawingContext() {
    if (!connected) {
      void connect();
      return;
    }
    setMessage('Choose a Spotify playlist before you draw a curve.');
  }

  async function optimize() {
    if (!connected) {
      await connect();
      return;
    }
    if (!selected || eligibleTracks.length === 0) {
      setMessage('Choose a playlist with available metric values before optimization.');
      return;
    }
    if (!isFullDomainCurve(curve)) {
      setMessage('Complete the target curve before optimization.');
      return;
    }
    setStage('optimizing');
    setMessage('');
    setCreated(null);
    try {
      const nextResult = await optimizeInWorker(eligibleTracks, curve);
      setResult(nextResult);
      if (reducedMotion) {
        setRevealedCount(nextResult.placements.length);
        setStage('result-ready');
      } else {
        setRevealedCount(0);
        setStage('revealing-result');
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'The optimizer stopped.');
      setStage('curve-ready');
    }
  }

  async function createPlaylist() {
    if (!connected) {
      await connect();
      return;
    }
    if (!selected || !result || stage === 'revealing-result') {
      setMessage('Complete optimization before you create the playlist.');
      return;
    }
    setStage('creating-playlist');
    setMessage('');
    try {
      setCreated(await createPlaylistWithTracks(`${selected.name} — Curved`, result.finalOrder.map((track) => track.uri)));
      setStage('result-ready');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Spotify could not create the playlist.');
      setStage('result-ready');
    }
  }

  function signOut() {
    clearSpotifySession();
    setConnected(false);
    setStage('disconnected');
    setProfile(null);
    setPlaylists([]);
    setSelected(undefined);
    setSourceTracks([]);
    setEligibleTracks([]);
    setCurve([]);
    setResult(null);
    setRevealedCount(0);
    setCreated(null);
  }

  const durationMs = useMemo(() => playlistDuration(eligibleTracks), [eligibleTracks]);
  const durationLabel = durationMs > 0 ? formatDuration(durationMs) : '0:00';
  const graphMode = getGraphMode(stage, selected, eligibleTracks.length);
  const canDraw = connected && eligibleTracks.length > 0 && !['optimizing', 'revealing-result', 'creating-playlist'].includes(stage);
  const visiblePlacements = result?.placements.slice(0, revealedCount) ?? [];
  const visibleTracks = result?.finalOrder.slice(0, revealedCount) ?? [];
  const actionBusy = stage === 'optimizing' || stage === 'revealing-result' || stage === 'creating-playlist';

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand" aria-label="SetCurve home"><span className="brand-mark"><Headphones size={19} /></span><span>SETCURVE</span></a>
        {testMode && <span className="test-mode-badge">Test mode · random values</span>}
        {connected ? (
          <div className="account">
            {profile?.imageUrl && <img src={profile.imageUrl} alt="" />}
            <span>{profile?.displayName ?? 'Spotify account'}</span>
            <button type="button" onClick={signOut} aria-label="Disconnect Spotify"><LogOut size={17} /></button>
          </div>
        ) : <button className="button button-primary" type="button" onClick={() => void connect()}>Connect Spotify</button>}
      </header>

      <main className="main-page">
        <div className="page-heading">
          <div><span className="eyebrow">Playlist curve editor</span><h1>Shape the sequence.</h1></div>
          <p>Draw one target curve. SetCurve orders every eligible track and creates a new Spotify playlist. The source playlist stays unchanged.</p>
        </div>

        {message && <div className="workspace-error" role="alert"><AlertCircle size={18} /><span>{message}</span><button type="button" onClick={() => setMessage('')} aria-label="Dismiss message">×</button></div>}

        <div className="workspace">
          <PlaylistPanel
            playlists={playlists}
            selected={selected}
            tracks={sourceTracks}
            onSelect={(playlist) => void selectPlaylist(playlist)}
            loading={playlistState === 'loading' || trackState === 'loading'}
            connected={connected}
            onConnect={() => void connect()}
          />
          <section className="curve-workspace" aria-labelledby="curve-title">
            <div className="workspace-heading">
              <div><span className="eyebrow">Target and result</span><h2 id="curve-title">Draw your {metricLabel.toLowerCase()} curve</h2><p>The same graph shows the final track positions after optimization.</p></div>
              <div className="duration-stat"><span>Duration</span><strong>{durationLabel}</strong></div>
            </div>
            {metricError && <div className="metric-error" role="status"><AlertCircle size={18} /><span>{metricError} Spotify values are not replaced unless test mode is enabled.</span></div>}
            {testMode && <div className="test-mode-notice" role="status">Each track has a random simulated intensity value. Values change when you load the playlist again.</div>}
            <CurveEditor
              points={curve}
              onChange={changeCurve}
              durationLabel={durationLabel}
              metricLabel={metricLabel}
              placements={visiblePlacements}
              placementTracks={visibleTracks}
              mode={graphMode}
              canDraw={canDraw}
              onDrawBlocked={requireDrawingContext}
              onSkipAnimation={() => {
                if (!result) return;
                setRevealedCount(result.placements.length);
                setStage('result-ready');
              }}
            />
            <div className="primary-actions">
              <button type="button" className="button button-secondary" onClick={() => changeCurve([])} disabled={curve.length === 0 || actionBusy}><RotateCcw size={16} /> Clear curve</button>
              <span className="track-readiness">{eligibleTracks.length > 0 ? `${eligibleTracks.length} tracks ready` : connected ? 'Choose a playlist to begin' : 'Spotify is not connected'}</span>
              <button type="button" className="button button-primary" onClick={() => void optimize()} disabled={actionBusy}>{stage === 'optimizing' ? 'Optimizing…' : 'Optimize order'}</button>
              <button type="button" className="button button-secondary" onClick={() => void createPlaylist()} disabled={stage === 'creating-playlist' || stage === 'revealing-result'}>
                {created ? <Check size={16} /> : null}{stage === 'creating-playlist' ? 'Creating…' : created ? 'Playlist created' : 'Create playlist'}
              </button>
            </div>
            {excludedCount > 0 && <p className="excluded-note">{excludedCount} unavailable or missing-metric items are excluded.</p>}
          </section>
        </div>

        {result && stage !== 'revealing-result' && stage !== 'optimizing' && (
          <Results result={result} sourceCount={eligibleTracks.length + excludedCount} excludedCount={excludedCount} created={created} />
        )}
      </main>
      <footer><span>SetCurve is an independent tool.</span><span>Music data and artwork are provided by Spotify.</span></footer>
    </div>
  );
}

function getGraphMode(
  stage: AppStage,
  selected: PlaylistSummary | undefined,
  eligibleTrackCount: number,
): 'empty' | 'drawing' | 'curve-ready' | 'optimizing' | 'revealing-result' | 'result-ready' {
  if (!selected || eligibleTrackCount === 0 || stage === 'disconnected' || stage === 'playlist-ready') return 'empty';
  if (stage === 'creating-playlist') return 'result-ready';
  return stage;
}
