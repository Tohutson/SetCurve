import { getSpotifyConfig, SPOTIFY_SCOPES } from './config';

const AUTHORIZATION_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const TOKEN_KEY = 'setcurve.spotify.tokens';
const VERIFIER_KEY = 'setcurve.spotify.verifier';
const STATE_KEY = 'setcurve.spotify.state';

type TokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
};

type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

function randomString(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function createChallenge(verifier: string): Promise<string> {
  return base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

function storeTokens(response: TokenResponse, previousRefreshToken = ''): StoredTokens {
  const tokens = {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + response.expires_in * 1_000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  return tokens;
}

function readTokens(): StoredTokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null &&
      'accessToken' in parsed && typeof parsed.accessToken === 'string' &&
      'refreshToken' in parsed && typeof parsed.refreshToken === 'string' &&
      'expiresAt' in parsed && typeof parsed.expiresAt === 'number'
    ) return parsed as StoredTokens;
  } catch {
    localStorage.removeItem(TOKEN_KEY);
  }
  return null;
}

export async function startSpotifyLogin(): Promise<void> {
  const { clientId, redirectUri } = getSpotifyConfig();
  const verifier = randomString(64);
  const state = randomString(32);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: await createChallenge(verifier),
    state,
  });
  window.location.assign(`${AUTHORIZATION_URL}?${params.toString()}`);
}

export async function completeSpotifyLogin(url = window.location.href): Promise<boolean> {
  const parsedUrl = new URL(url);
  const code = parsedUrl.searchParams.get('code');
  if (!code) return false;
  const returnedState = parsedUrl.searchParams.get('state');
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!returnedState || !expectedState || returnedState !== expectedState || !verifier) {
    throw new Error('Spotify returned an invalid authorization state. Connect again.');
  }
  const { clientId, redirectUri } = getSpotifyConfig();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error('Spotify did not complete authorization. Connect again.');
  storeTokens(await response.json() as TokenResponse);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  parsedUrl.searchParams.delete('code');
  parsedUrl.searchParams.delete('state');
  parsedUrl.searchParams.delete('error');
  window.history.replaceState({}, '', `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`);
  return true;
}

export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;
  if (!forceRefresh && Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) return null;
  const { clientId } = getSpotifyConfig();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: clientId }),
  });
  if (!response.ok) {
    clearSpotifySession();
    return null;
  }
  return storeTokens(await response.json() as TokenResponse, tokens.refreshToken).accessToken;
}

export function hasSpotifySession(): boolean {
  return readTokens() !== null;
}

export function clearSpotifySession(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
}
