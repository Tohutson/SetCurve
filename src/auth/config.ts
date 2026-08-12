export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
] as const;

export type SpotifyConfig = {
  clientId: string;
  redirectUri: string;
};

export function getSpotifyConfig(): SpotifyConfig {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim();
  const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim();
  if (!clientId || !redirectUri) {
    throw new Error('Add VITE_SPOTIFY_CLIENT_ID and VITE_SPOTIFY_REDIRECT_URI to the environment.');
  }
  return { clientId, redirectUri };
}
