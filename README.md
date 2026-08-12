# SetCurve

## Purpose

SetCurve is a client-side Spotify playlist tool.

The user selects one playlist. The user draws a target energy curve. SetCurve calculates a new track order. SetCurve creates a new private Spotify playlist.

SetCurve does not change the source playlist.

## Prerequisites

- Install Node.js 20.19 or a later supported version.
- Use a Spotify account that can access the Spotify Developer Dashboard.
- Use Spotify Premium for a new Development Mode app.
- Add each test user to the app allowlist.

## Spotify app setup

1. Open the Spotify Developer Dashboard.
2. Create an app.
3. Copy the client ID.
4. Do not create or use a client secret in this application.
5. Add the redirect URI from your environment file.

Spotify requires Authorization Code with Proof Key for Code Exchange (PKCE) for this browser application.

SetCurve requests these scopes:

- `playlist-read-private`
- `playlist-read-collaborative`
- `playlist-modify-private`

SetCurve creates a private playlist. This choice removes the need for the `playlist-modify-public` scope.

## Redirect URI setup

Use an exact redirect URI match.

Use this URI for the default local Vite server:

```text
http://127.0.0.1:5173/
```

Spotify permits HTTP for a loopback IP address. Spotify does not permit an HTTP `localhost` redirect URI.

Use HTTPS for a deployed application.

## Environment variables

Copy the example file:

```sh
cp .env.example .env.local
```

Set the public browser configuration:

```text
VITE_SPOTIFY_CLIENT_ID=your_client_id
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/
VITE_SPOTIFY_AUDIO_FEATURES_ENABLED=false
VITE_TEST_MODE=false
```

Do not put a Spotify client secret in an environment file.

Keep `VITE_SPOTIFY_AUDIO_FEATURES_ENABLED` set to `false` for a new Development Mode app.

Set it to `true` only if Spotify permits your app to call Audio Features. An eligible older Extended Quota Mode app can have this access.

## Test mode

Set this variable to enable test mode:

```text
VITE_TEST_MODE=true
```

Restart the development server after you change the variable.

Test mode assigns a random normalized intensity value to each track after Spotify loads the playlist. The values are from 0 to 1. The values change each time you load the playlist.

The interface labels these values as simulated intensity. Do not use test mode values as Spotify energy data.

## Local development

Install the packages:

```sh
npm install
```

Start the application:

```sh
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Tests

Run all tests:

```sh
npm test
```

Run the TypeScript check:

```sh
npm run typecheck
```

## Production build

Build the static application:

```sh
npm run build
```

The build output is in `dist/`.

## Architecture

The application uses React, TypeScript, and Vite.

The application has one primary page. The workspace is visible before Spotify connection. Spotify authorization starts from controls in the workspace. The application does not use a separate sign-in page.

The `src/auth/` directory contains the PKCE flow and token refresh logic.

The `src/spotify/` directory contains Spotify HTTP requests and response mapping.

The `src/metrics/` directory contains the metric provider boundary.

The `src/curve/` directory contains curve math. The curve math does not use the Document Object Model (DOM).

The `src/optimizer/` directory contains deterministic playlist optimization.

The `src/workers/` directory runs optimization in a Web Worker.

The `src/components/` directory contains the user interface.

The app stores Spotify tokens in browser local storage. The app stores the temporary PKCE verifier and OAuth state in session storage. The app validates OAuth state before it exchanges an authorization code.

## Optimizer

The first stage uses deterministic beam search. Each beam state contains a partial order, the unused tracks, elapsed time, and accumulated placement cost.

The search appends each unused track to each current beam state. The search ranks the generated states by accumulated cost. The search keeps only the best states for the next depth. The search does not use a future-cost heuristic.

SetCurve calculates beam width from playlist length:

```text
floor((2 * 200000) / (trackCount * (trackCount + 1)))
```

SetCurve clamps the value from 5 to 75. A longer playlist uses a narrower beam. The user interface does not expose this internal value.

The placement cost uses the track midpoint. The cost is the absolute difference between track energy and target energy.

The second stage starts from the beam result. It uses deterministic pairwise swaps. The implementation uses best-improvement search. Each pass evaluates all permitted pair swaps. The search applies the lowest-cost swap from the pass.

The search stops after a pass with no improvement. It also stops at the pass limit or evaluation limit.

Each source playlist item appears once in the optimized result. The total duration does not change.

## Graph lifecycle

The main page uses one graph for drawing and results.

The graph starts in an empty state. The user can connect Spotify and load a playlist without leaving the page. The user then draws one target curve.

After optimization, the target curve stays visible. SetCurve reveals the final track points in playlist order. Each point uses the track midpoint for its time position.

The reveal interval decreases for longer playlists. Use the **Skip animation** action to show all points immediately.

SetCurve reads the `prefers-reduced-motion` browser setting. SetCurve shows the complete result immediately when reduced motion is active.

Hover over a result point to inspect its track data. Focus a point with the keyboard to read its accessible label.

Redraw the curve to clear the old result. The loaded playlist stays available.

## Spotify connection behavior

The complete workspace is visible before Spotify connection. Use **Connect Spotify** in the header or playlist area.

An action that needs Spotify starts authorization or shows a requirement in the workspace. Errors stay on the main page. SetCurve preserves the selected playlist and curve when a retry is safe.

## Spotify energy limitation

Spotify removed Audio Features access for new Web API applications and Development Mode applications without eligible extended access on November 27, 2024.

SetCurve does not invent energy values. SetCurve does not use popularity as energy.

The default Spotify energy provider returns a clear blocked state. The curve and optimizer have test fixtures that do not require Spotify.

An eligible Extended Quota Mode app can enable the isolated legacy provider with `VITE_SPOTIFY_AUDIO_FEATURES_ENABLED=true`. Spotify can still reject the endpoint for the active app. SetCurve shows that failure.

See the [Spotify Web API change notice](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api) for the Audio Features restriction.

## Spotify access limits

New Development Mode apps require a Premium app owner. A Development Mode app has an authorized-user limit. Spotify can also apply request quotas and rate limits.

Playlist item access is limited to playlists that the current user owns or can edit as a collaborator under the current Development Mode rules.

SetCurve handles expired access tokens, one token refresh, HTTP 401, HTTP 403, HTTP 429, playlist pagination, null items, unavailable tracks, local tracks, and missing metrics.

## MVP limitations

- SetCurve optimizes only one scalar metric.
- The metric is energy.
- SetCurve does not play audio.
- SetCurve does not recommend or replace tracks.
- SetCurve does not use a server or database.
- SetCurve does not support accounts other than Spotify authorization.
- SetCurve does not modify the source playlist.
- SetCurve does not work with live Spotify energy data unless Spotify permits Audio Features for the active app.
