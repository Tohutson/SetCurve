import { ExternalLink, ListMusic, Music2 } from 'lucide-react';
import type { PlaylistSummary, Track } from '../domain/types';
import { formatDuration } from '../utils/format';

type PlaylistPanelProps = {
  playlists: PlaylistSummary[];
  selected?: PlaylistSummary;
  tracks: Track[];
  onSelect: (playlist: PlaylistSummary) => void;
  loading: boolean;
  connected: boolean;
  onConnect: () => void;
};

export function PlaylistPanel({ playlists, selected, tracks, onSelect, loading, connected, onConnect }: PlaylistPanelProps) {
  return (
    <aside className="playlist-panel" aria-label="Playlist context">
      <div className="section-heading">
        <span className="eyebrow">Source</span>
        <h2>Choose a playlist</h2>
      </div>
      <label className="select-label" htmlFor="playlist-select">Spotify playlist</label>
      <select id="playlist-select" value={selected?.id ?? ''} aria-disabled={!connected} onPointerDown={(event) => {
        if (!connected) {
          event.preventDefault();
          onConnect();
        }
      }} onKeyDown={(event) => {
        if (!connected && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
          event.preventDefault();
          onConnect();
        }
      }} onChange={(event) => {
        const playlist = playlists.find((item) => item.id === event.target.value);
        if (playlist) onSelect(playlist);
      }} disabled={loading}>
        <option value="">{connected ? 'Select a playlist' : 'Connect Spotify to choose'}</option>
        {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
      </select>
      {!connected && <button type="button" className="button button-secondary connect-inline" onClick={onConnect}>Connect Spotify</button>}
      {loading && <div className="inline-state"><span className="spinner" /> Loading playlist…</div>}
      {selected && (
        <>
          <div className="playlist-identity">
            {selected.imageUrl ? <img src={selected.imageUrl} alt="" /> : <div className="art-placeholder"><Music2 /></div>}
            <div>
              <h3>{selected.name}</h3>
              <p>{selected.ownerName} · {selected.trackCount} items</p>
              {selected.spotifyUrl && <a href={selected.spotifyUrl} target="_blank" rel="noreferrer">Open source <ExternalLink size={14} /></a>}
            </div>
          </div>
          <div className="source-list-heading"><ListMusic size={17} /><span>Eligible source tracks</span><strong>{tracks.length}</strong></div>
          <ol className="source-track-list">
            {tracks.slice(0, 12).map((track) => (
              <li key={`${track.id}-${track.originalIndex}`}>
                <span className="track-index">{track.originalIndex + 1}</span>
                <span><strong>{track.name}</strong><small>{track.artistNames.join(', ')}</small></span>
                <time>{formatDuration(track.durationMs)}</time>
              </li>
            ))}
          </ol>
          {tracks.length > 12 && <p className="more-tracks">+ {tracks.length - 12} more tracks</p>}
        </>
      )}
    </aside>
  );
}
