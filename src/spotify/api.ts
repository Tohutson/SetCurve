import { getAccessToken } from '../auth/pkce';
import type { CreatedPlaylist, PlaylistSummary, Track, UserProfile } from '../domain/types';

const API_BASE_URL = 'https://api.spotify.com/v1';
const PLAYLIST_PAGE_SIZE = 50;
const ITEM_BATCH_SIZE = 100;

export class SpotifyApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

type Page<T> = { items: T[]; next: string | null };

export async function collectPages<T>(firstUrl: string, load: (url: string) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = firstUrl;
  while (next) {
    const page = await load(next);
    items.push(...page.items);
    next = page.next;
  }
  return items;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function spotifyFetch<T>(urlOrPath: string, init: RequestInit = {}, retry401 = true, retry429 = true): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new SpotifyApiError('The Spotify session expired. Connect again.', 401);
  const response = await fetch(urlOrPath.startsWith('http') ? urlOrPath : `${API_BASE_URL}${urlOrPath}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (response.status === 401 && retry401) {
    const refreshed = await getAccessToken(true);
    if (refreshed) return spotifyFetch<T>(urlOrPath, init, false, retry429);
  }
  if (response.status === 429 && retry429) {
    const retrySeconds = Number(response.headers.get('Retry-After') ?? '1');
    await wait(Math.min(Math.max(retrySeconds, 1), 30) * 1_000);
    return spotifyFetch<T>(urlOrPath, init, retry401, false);
  }
  if (!response.ok) {
    const message = response.status === 403
      ? 'Spotify denied this request. Check the app mode, allowlist, and granted scopes.'
      : `Spotify returned an error (${response.status}).`;
    throw new SpotifyApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

type SpotifyImage = { url: string };
type SpotifyOwner = { display_name?: string | null };
type SpotifyPlaylist = {
  id: string;
  name: string;
  owner: SpotifyOwner;
  images: SpotifyImage[];
  external_urls?: { spotify?: string };
  items?: { total: number };
  tracks?: { total: number };
};
type SpotifyArtist = { name: string };
type SpotifyTrack = {
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  is_local: boolean;
  type: string;
  artists: SpotifyArtist[];
  album: { images: SpotifyImage[] };
  external_urls?: { spotify?: string };
  restrictions?: { reason?: string };
};
type SpotifyPlaylistItem = { item?: SpotifyTrack | null; track?: SpotifyTrack | null; is_local?: boolean };

function mapPlaylist(playlist: SpotifyPlaylist): PlaylistSummary {
  return {
    id: playlist.id,
    name: playlist.name,
    ownerName: playlist.owner.display_name ?? 'Spotify user',
    imageUrl: playlist.images[0]?.url,
    spotifyUrl: playlist.external_urls?.spotify,
    trackCount: playlist.items?.total ?? playlist.tracks?.total ?? 0,
  };
}

export async function getCurrentUser(): Promise<UserProfile> {
  const user = await spotifyFetch<{ display_name?: string | null; images?: SpotifyImage[] }>('/me');
  return { displayName: user.display_name ?? 'Spotify user', imageUrl: user.images?.[0]?.url };
}

export async function getCurrentUserPlaylists(): Promise<PlaylistSummary[]> {
  const firstUrl = `${API_BASE_URL}/me/playlists?limit=${PLAYLIST_PAGE_SIZE}`;
  const playlists = await collectPages(firstUrl, (url) => spotifyFetch<Page<SpotifyPlaylist>>(url));
  return playlists.map(mapPlaylist);
}

export type LoadedTracks = { tracks: Track[]; excludedUnavailable: number };

export async function getPlaylistTracks(playlistId: string): Promise<LoadedTracks> {
  const firstUrl = `${API_BASE_URL}/playlists/${encodeURIComponent(playlistId)}/items?limit=${PLAYLIST_PAGE_SIZE}`;
  const items = await collectPages(firstUrl, (url) => spotifyFetch<Page<SpotifyPlaylistItem>>(url));
  const tracks: Track[] = [];
  let excludedUnavailable = 0;
  items.forEach((entry, originalIndex) => {
    const item = entry.item ?? entry.track;
    if (!item || !item.id || item.type !== 'track' || item.is_local || entry.is_local || item.restrictions) {
      excludedUnavailable += 1;
      return;
    }
    tracks.push({
      id: item.id,
      uri: item.uri,
      name: item.name,
      artistNames: item.artists.map((artist) => artist.name),
      durationMs: item.duration_ms,
      imageUrl: item.album.images[0]?.url,
      spotifyUrl: item.external_urls?.spotify,
      originalIndex,
    });
  });
  return { tracks, excludedUnavailable };
}

export async function createPlaylistWithTracks(name: string, uris: string[]): Promise<CreatedPlaylist> {
  const playlist = await spotifyFetch<{ id: string; name: string; external_urls?: { spotify?: string } }>('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, public: false, description: 'Created by SetCurve from an optimized source playlist order.' }),
  });
  for (let index = 0; index < uris.length; index += ITEM_BATCH_SIZE) {
    await spotifyFetch(`/playlists/${encodeURIComponent(playlist.id)}/items`, {
      method: 'POST',
      body: JSON.stringify({ uris: uris.slice(index, index + ITEM_BATCH_SIZE) }),
    });
  }
  return { id: playlist.id, name: playlist.name, spotifyUrl: playlist.external_urls?.spotify };
}
