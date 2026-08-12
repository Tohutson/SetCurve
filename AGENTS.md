# AGENTS.md

## Project goal

Build a client-side web application that lets a user:

1. Sign in with Spotify.
2. Select one of their Spotify playlists.
3. Draw a continuous target curve over playlist time.
4. Reorder the tracks so that the selected track metric follows the curve as closely as practical.
5. Create a new Spotify playlist with the optimized track order.

The MVP must stay narrow. Do not add social features, accounts, recommendations, playback controls, AI chat, analytics dashboards, collaborative editing, or a backend.

## Product scope

### Required MVP features

- Spotify authentication with Authorization Code with PKCE.
- Load playlists that the signed-in user can access.
- Load all tracks for the selected playlist, including pagination.
- Load the track metric needed by the optimizer.
- Default optimization metric: energy.
- Design the metric layer so BPM or another scalar metric can be added later.
- Display playlist duration on the x-axis.
- Display a normalized metric on the y-axis.
- Let the user draw one target curve.
- Enforce that the curve is a function of time.
- Optimize the playlist order with:
  1. greedy selection with one-step lookahead;
  2. swap-based local optimization.
- Preview the optimized order.
- Create a new Spotify playlist.
- Add the optimized tracks to the new playlist in the chosen order.
- Never modify the source playlist.

### Out of scope

Do not implement:

- a server or database;
- Spotify playback;
- the Spotify Web Playback SDK unless it becomes strictly necessary for a required feature;
- user-created accounts;
- payments;
- ads;
- playlist collaboration;
- song recommendations;
- automatic replacement of songs;
- repeated songs before every eligible source track has been used;
- multi-metric optimization in the MVP;
- machine learning;
- generative AI features.

## Architecture

Use a client-side architecture.

Recommended stack:

- React
- TypeScript
- Vite
- React Router only if routing materially improves the application
- Vitest
- React Testing Library
- a lightweight, established icon library such as Lucide
- native browser APIs where practical

Do not introduce a global state library unless normal React state becomes difficult to maintain.

Keep domain logic independent from React.

Use this conceptual structure:

```text
src/
  auth/
  spotify/
  metrics/
  optimizer/
  curve/
  components/
  pages/
  workers/
  styles/
  test/
```

The optimizer and curve logic must be pure TypeScript modules where practical.

If optimization work can block the main thread on realistic playlist sizes, run it in a Web Worker.

## Spotify integration

Use Spotify's current official browser authorization guidance.

- Use Authorization Code with PKCE.
- Never use or ship a client secret.
- Read the client ID and redirect URI from public build-time environment variables.
- Keep token handling client-side.
- Implement token refresh according to Spotify's current PKCE guidance.
- Request only the scopes that the MVP needs.
- Handle 401, 403, 429, pagination, expired tokens, unavailable tracks, local tracks, null playlist items, and removed tracks.
- Respect Spotify rate limits.
- Do not download or alter Spotify audio.
- Do not crop, cover, or modify Spotify album artwork.

The application must create a new playlist instead of mutating the source playlist.

Use a deterministic default name such as:

`<Original Playlist Name> — Curved`

If that name already exists, the app may still create another playlist with that name unless a simple non-invasive suffix is easy to add.

### Spotify data abstraction

Do not couple optimization logic directly to Spotify response objects.

Create application models such as:

```ts
type Track = {
  id: string;
  uri: string;
  name: string;
  artistNames: string[];
  durationMs: number;
  imageUrl?: string;
};

type TrackMetric = {
  trackId: string;
  value: number;
};
```

Create a metric provider abstraction:

```ts
interface TrackMetricProvider {
  getMetric(trackIds: string[]): Promise<TrackMetric[]>;
}
```

The optimizer must only receive normalized scalar values and durations.

Spotify has changed access to some audio-feature endpoints over time. Keep the metric provider isolated. If the selected Spotify metric endpoint is unavailable to the current app, fail clearly and do not invent metric values.

## Target curve

The target curve is the central interaction.

### Coordinate system

- x-axis: elapsed playlist time.
- y-axis: normalized target value from `0` to `1`.
- The x-axis spans the total duration of all eligible tracks.
- The y-axis defaults to energy.

### Drawing rules

The user must draw a continuous single-valued function `y = f(x)`.

The drawing interaction must enforce the vertical line test by construction.

The user must not be able to:

- move backward in x while drawing;
- loop backward over an earlier x position;
- create multiple y values for one x value;
- create disconnected curve segments;
- create self-overlap that violates the function constraint.

Preferred interaction:

1. Pointer-down begins at the first x position.
2. Pointer movement records points only when x is greater than or equal to the last accepted x.
3. Ignore or clamp pointer samples that move backward in x.
4. Interpolate between accepted points.
5. Continue until the right edge is reached or the user releases the pointer.
6. Normalize samples into a consistent internal representation.

The curve must cover the full playlist domain before optimization can run.

If the user releases early, choose one clear behavior and document it. Preferred behavior: extend the final y value horizontally to the right edge.

Allow the user to clear and redraw the curve.

Do not use freehand drawing logic that permits arbitrary two-dimensional paths.

### Curve representation

Do not store thousands of raw pointer events.

Resample or simplify the curve into a stable representation, for example:

```ts
type CurvePoint = {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
};
```

Provide a pure function:

```ts
evaluateCurve(points: CurvePoint[], normalizedTime: number): number
```

Use interpolation between neighboring points.

The UI curve and optimizer must use the same curve representation.

## Optimization model

Each source track can appear exactly once in the optimized playlist.

Do not reuse a track while another eligible source track remains unused.

The total playlist duration is fixed. Track order changes the time intervals occupied by each track.

### Track placement value

Represent a track by its normalized scalar metric, such as energy.

For a candidate track starting at elapsed time `t`, compare the track value with the target curve at a representative point in the track interval.

For the MVP, use the track midpoint:

```text
midpoint = t + duration / 2
```

Normalize midpoint by total playlist duration before evaluating the curve.

Base placement error:

```text
placementError =
  abs(trackMetric - targetCurve(midpoint))
```

Keep this cost function isolated so it can be changed later.

## Greedy one-step lookahead

Build the initial ordering with greedy one-step lookahead.

At each position:

1. Consider each unused track `i`.
2. Compute the current placement error for `i`.
3. Compute the elapsed time after `i`.
4. For every other unused track `j`, compute the placement error of `j` at the next position.
5. Keep the lowest possible next placement error.
6. Score candidate `i` as:

```text
score(i) =
  currentPlacementError(i)
  + LOOKAHEAD_WEIGHT * bestNextPlacementErrorAfter(i)
```

7. Select the candidate with the lowest score.
8. Remove it from the unused set.
9. Advance time by its duration.
10. Repeat.

For the final track, the next-placement term is zero.

Default:

```text
LOOKAHEAD_WEIGHT = 0.5
```

Define the value as a named constant.

Use deterministic tie-breaking. Prefer original playlist order, then Spotify track ID.

Do not use random tie-breaking in the MVP.

## Swap optimization

After greedy one-step lookahead creates a full ordering, improve it with swap-based local search.

### Objective

Evaluate the complete playlist:

```text
totalCost =
  sum(
    abs(trackMetric - targetCurve(trackMidpoint))
  )
```

Track midpoint depends on all preceding track durations.

### Search

Use pairwise swaps.

Basic algorithm:

1. Start with the greedy ordering.
2. Compute its total cost.
3. Consider swaps `(i, j)`.
4. Recompute the cost after the swap.
5. Accept the swap if it decreases total cost.
6. Continue until a complete pass finds no improving swap, or a safety limit is reached.

Use a clear maximum pass or evaluation limit so the browser cannot loop indefinitely.

A first-improvement or best-improvement strategy is acceptable. Document which one is used.

Favor clarity and deterministic behavior over cleverness.

If performance becomes poor, optimize cost recalculation only after tests prove correctness.

Do not add simulated annealing, beam search, genetic algorithms, or other search methods to the MVP.

## Correctness requirements

Add tests for at least:

- curve evaluation;
- monotonically non-decreasing x samples;
- attempted backward pointer movement;
- early pointer release behavior;
- duration-sensitive placement cost;
- one-step lookahead choosing a different song from plain greedy in a constructed case;
- no duplicate track usage;
- every eligible track appears exactly once;
- deterministic tie-breaking;
- swap optimization never returns a higher-cost order than its input;
- playlist duration stays unchanged;
- playlist export preserves the optimized order;
- Spotify pagination.

Include small hand-verifiable optimizer fixtures.

## User interface

The interface should feel related to Spotify without copying Spotify's product UI.

### Visual direction

Use Spotify's general visual language:

- very dark neutral backgrounds;
- high-contrast white and gray text;
- one solid green brand accent inspired by Spotify;
- rounded controls used with restraint;
- album art as strong visual anchors;
- compact utility-focused layout.

Do not claim the application is made by Spotify.

Include appropriate attribution where Spotify policy requires it.

### Anti-vibe-coded rules

These rules are mandatory.

#### No gradient hero

- Do not use blue/purple glow blobs.
- Do not use neon gradients.
- Do not use decorative background gradients.
- Use solid neutral surfaces.
- Use one solid, purposeful accent color.

#### Typography

- Do not rely on default Inter styling.
- Use a clear typographic hierarchy.
- Use distinct sizes for page title, section heading, body, metadata, and control labels.
- Use tighter tracking for large headings where appropriate.
- Use high-contrast text.
- Do not make every label the same weight or size.
- Prefer a deliberate system-font stack or one carefully selected web font. Do not add multiple decorative fonts.

#### Layout

- Do not center every section.
- Do not use one narrow centered column for the whole product.
- Left-align body copy.
- Use structured grids.
- Use asymmetry where it improves hierarchy.
- Align major content to shared edges.
- On desktop, prefer a layout such as playlist context on one side and curve/optimization workspace on the other.
- Adapt cleanly to mobile.

#### Icons

- Do not use emoji as interface icons.
- Use one consistent icon library.
- Keep icon stroke weight and sizing consistent.
- Use text labels for actions when an icon alone is ambiguous.

### Interaction

The main workflow must be obvious:

```text
Connect Spotify
→ Choose playlist
→ Draw curve
→ Optimize
→ Review
→ Create new playlist
```

Do not overwhelm the first screen with configuration.

Show useful states for:

- unauthenticated;
- loading playlists;
- loading tracks;
- missing metrics;
- drawing;
- optimizing;
- optimization complete;
- playlist creation in progress;
- success;
- Spotify API error.

## Accessibility

- Use semantic HTML.
- Provide keyboard-accessible controls.
- Provide visible focus states.
- Meet reasonable WCAG contrast.
- Do not rely on color alone for status.
- Give icons accessible labels when necessary.
- Make the curve editor understandable to assistive technology.
- Add a non-pointer fallback for the target curve if practical. A small set of editable control points is acceptable.

## Documentation language

All project documentation must follow ASD-STE100 Simplified Technical English as closely as practical.

This requirement applies to:

- README files;
- architecture notes;
- setup instructions;
- code comments that explain behavior;
- user-facing technical help text;
- developer notes.

Documentation rules:

- Use short sentences.
- Use one instruction per sentence.
- Prefer active voice.
- Use consistent technical terms.
- Do not use different words for the same component.
- Avoid idioms.
- Avoid jokes in technical documentation.
- Avoid unnecessary adverbs.
- Avoid vague pronouns when the noun is clearer.
- Define abbreviations before repeated use.
- Use imperative verbs for procedures.
- Keep warnings and limitations explicit.

Code identifiers do not need to follow Simplified Technical English vocabulary.

## Code quality

- Use strict TypeScript.
- Avoid `any`.
- Prefer small pure functions.
- Keep React components focused on presentation and orchestration.
- Keep Spotify HTTP code outside UI components.
- Keep optimizer code independent from Spotify.
- Keep curve math independent from DOM event handling.
- Use named constants instead of unexplained numeric literals.
- Remove dead code.
- Do not leave placeholder TODO features unless they block a required Spotify configuration step.
- Do not create abstractions before there is a clear need.

## Error handling

Never silently fake success.

If Spotify returns an error:

- show a concise message;
- preserve user work when practical;
- provide a retry action when retry is safe.

If metric data is missing for a track, use one documented policy.

Preferred MVP policy:

- exclude tracks that do not have the required metric;
- tell the user how many tracks were excluded;
- never invent a metric.

If zero eligible tracks remain, stop optimization and explain the problem.

## Security

- Never commit secrets.
- Never use a Spotify client secret in the browser.
- Never log access tokens.
- Never put access tokens in URLs.
- Validate OAuth state.
- Use PKCE correctly.
- Keep environment examples limited to public client configuration.
- Do not introduce third-party analytics in the MVP.

## Definition of done

The MVP is done when a developer can:

1. Clone the repository.
2. Add the Spotify client ID and redirect URI.
3. Run the app locally.
4. Sign in with an allowlisted Spotify account.
5. Select a playlist.
6. Draw a valid target energy curve.
7. Run the optimizer.
8. See a reordered track list and the fitted track values against the target.
9. Create a new Spotify playlist.
10. Open the new playlist in Spotify and confirm the track order.

The source playlist must remain unchanged.
