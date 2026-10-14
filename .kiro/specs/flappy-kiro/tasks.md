# Implementation Plan: Flappy Kiro

## Overview

This plan builds Flappy Kiro as a dependency-light vanilla stack: a single `index.html`, one
`style.css`, and ES modules of plain JavaScript rendered onto an HTML5 Canvas 2D context, runnable by
opening `index.html` with no build step.

The work proceeds from the inside out: first the central `config.js` (extended from the existing frozen
object) and the `loadConfig` boundary, then the pure simulation core (physics, pipes, scoring, collision,
clouds, highscore, display formatter) with property-based tests for each of the design's 18 correctness
properties, then the I/O adapters (input, audio, storage, assets, renderer) with example and integration
tests, and finally the fixed-timestep game loop and state machine that wire everything into a runnable
game.

An early task explicitly reconciles the two models of the ghost: the design specifies the simulation
core as **pure functions** (`physics.js`, `collision.js`) operating on a plain `Ghost` data object,
whereas the existing `src/ghost.js` is a `Ghost` **class** that already contains float physics
(`applyGravity`, `flap`, terminal velocity), cosmetic animation state, and AABB collision
(`hitbox`, `intersects`, `hitsPipePair`, `hitsCeiling`, `hitsGround`). The reconciliation task decides a
single home for physics/collision so the logic is never duplicated across the class and the pure core.

Test tasks use [fast-check](https://github.com/dubzzz/fast-check) with Vitest. Property tests run a
minimum of 100 iterations (`fc.assert(..., { numRuns: 100 })`) and are tagged with a comment in the
format `Feature: flappy-kiro, Property {number}: {property_text}`.

## Tasks

- [x] 1. Set up project tooling and the test harness
  - [x] 1.1 Add Node test tooling for the pure core
    - Create a minimal `package.json` with `vitest` and `fast-check` as devDependencies and a `test` script (`vitest --run`).
    - Add a `vitest.config.js` configured so `src/**` ES modules import cleanly under Node and so a jsdom environment is available for adapter/render tests.
    - Keep the game itself buildless: these dev dependencies are for tests only and are not imported by the runtime game code.
    - _Requirements: all (test infrastructure)_

- [x] 2. Extend the central config and add the validation boundary
  - [x] 2.1 Extend the frozen `Config` object in `src/config.js`
    - Starting from the existing frozen `Config` (which already has `playArea`, `ground`, `ceilingY`, `physics`, and `ghost`), add the remaining design sections without recreating the file: `pipes` (speed, width, gap min/max, spacing min/max, ceilingMargin, groundMargin), `clouds` (speeds with ≥2 distinct values each < pipe speed, count min/max), `scoring` (start, increment), `display` (scoreFont, scoreColor, groundColor), `fallbackColors` (sky, pipe, ghostPlaceholder), `storage` (key), `timing` (restartDebounceMs), and `highScoreMax`.
    - Keep the whole object `Object.freeze`d and keep every existing field intact so `src/ghost.js` continues to work.
    - Document each value's unit and, where mandated, its valid range in comments.
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 6.1, 8.6, 9.1, 9.3, 9.4, 9.7, 9.8, 9.9_

  - [x] 2.2 Implement `loadConfig(overrides)` in `src/config.js`
    - Add a pure boundary function that deep-merges optional `overrides` onto the frozen default and returns a NEW validated object, never mutating the default.
    - Clamp pipe speed to `[100, 300]`; gap min/max to `[100, 200]`; spacing min/max to `[150, 400]`; ceiling/ground margins to `>= 50`; every cloud speed to strictly less than the clamped pipe speed while preserving ≥2 distinct cloud speeds; cloud count min/max to `[1, 5]`; high-score max to `999999`.
    - Ignore non-numeric / malformed overrides and retain the default for those fields.
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 6.1, 9.1, 9.4_

  - [ ]* 2.3 Write property test for effective config ranges
    - **Property 18: Effective config always satisfies requirement ranges**
    - Generate arbitrary overrides (including out-of-range, non-numeric, malformed) and assert every effective value lies within its mandated range.
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 9.1, 9.4, 6.1**

  - [ ]* 2.4 Write example test for the URL-query override boundary
    - Assert that reading URL query parameters produces an overrides object that `loadConfig` then validates (thin I/O boundary, not property-tested).
    - _Requirements: config boundary_

- [x] 3. Reconcile the ghost model with the pure simulation core
  - [x] 3.1 Decide and establish the single home for ghost physics and collision
    - Reconcile the existing `Ghost` class in `src/ghost.js` with the design's pure-function core so physics and collision logic exist in exactly ONE place (no duplication).
    - Create `src/physics.js` and `src/collision.js` as the pure, DOM-free home for the logic, operating on a plain `Ghost` data object (`{ x, y, width, height, vy }`) per the design's Data Models.
    - Either (a) refactor the float physics (gravity + terminal velocity, flap) and AABB logic (hitbox inset, intersects, pipe/ground/ceiling tests) out of the class into these pure functions and have `src/ghost.js` keep only cosmetic concerns (anim state, idle bob, tilt, start-position helpers) delegating to the pure core, or (b) remove the class in favor of the pure data object plus cosmetic helpers — choosing one approach so the physics/collision constants and math are defined once and sourced from `config`.
    - Document the chosen approach at the top of `src/physics.js` so the rest of the implementation follows it.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3_

- [x] 4. Implement the pure physics module
  - [x] 4.1 Implement `applyGravity` and `applyFlap` in `src/physics.js`
    - `applyGravity(ghost, gravity, dt)` returns a ghost with `vy += gravity*dt` (respecting the configured terminal cap) and `y += vy*dt`.
    - `applyFlap(ghost, flapVelocity)` returns a ghost with `vy = flapVelocity` (fixed upward/negative value), identical for keyboard/mouse/touch.
    - Keep both pure and sourcing constants from the effective config.
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 4.2 Write property test for gravity
    - **Property 1: Gravity accelerates the ghost downward**
    - **Validates: Requirements 2.1**

  - [ ]* 4.3 Write property test for flap velocity
    - **Property 2: Flap sets the same fixed upward velocity for every input source**
    - **Validates: Requirements 2.2, 2.3, 2.4**

- [x] 5. Implement the pure pipes module
  - [x] 5.1 Implement pipe generation and clamping in `src/pipes.js`
    - `clampGapTop(gapTop, gapHeight, config)` maps any proposed gap top into `[ceilingY + ceilingMargin, playArea.height - ground.height - groundMargin - gapHeight]`.
    - `generatePipePair(x, config, rng)` chooses `gapHeight ∈ [gap.min, gap.max]` and a gap top, then clamps via `clampGapTop`; the pair is always kept.
    - _Requirements: 3.2, 3.5, 3.6_

  - [ ]* 5.2 Write property test for gap clamping
    - **Property 5: Generated gaps are always within the clamped valid range**
    - **Validates: Requirements 3.2, 3.5, 3.6**

  - [x] 5.3 Implement pipe scroll, cull, and spawn in `src/pipes.js`
    - `scrollPipes(pipes, speed, dt)` moves each pair left by `speed*dt`.
    - `cullOffscreen(pipes, playArea)` removes pairs whose right edge `< 0`.
    - `maybeSpawn(pipes, config, rng, playArea)` appends a new pair at the right edge when the last pair is `>= spacing` from the right edge, keeping at least one pair present during play.
    - _Requirements: 3.1, 3.3, 3.4_

  - [ ]* 5.4 Write property test for pipe scrolling
    - **Property 4: Pipes scroll left at constant speed**
    - **Validates: Requirements 3.1**

  - [ ]* 5.5 Write property test for spawn spacing and presence
    - **Property 6: Pipes spawn at valid spacing and at least one is always present during play**
    - **Validates: Requirements 3.3**

  - [ ]* 5.6 Write property test for offscreen culling
    - **Property 7: Offscreen pipes are culled**
    - **Validates: Requirements 3.4**

- [x] 6. Implement the pure collision module
  - [x] 6.1 Implement AABB collision in `src/collision.js`
    - `aabbOverlap(a, b)` axis-aligned overlap test (half-open intervals).
    - `ghostHitsPipe(ghost, pipes)` true if the ghost box overlaps any top or bottom pipe box.
    - `ghostHitsBounds(ghost, playArea)` true if the ghost box overlaps the Ground or reaches/exceeds the Ceiling.
    - Reuse the reconciled hitbox-inset logic from task 3.1; do not duplicate it.
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 6.2 Write property test for collision detection
    - **Property 9: Collision is detected exactly on bounding-box overlap or boundary contact**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 7. Checkpoint - core geometry
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement the pure scoring module
  - [x] 8.1 Implement `updateScore` in `src/scoring.js`
    - For each pair not yet `passed` whose trailing gap edge is left of the ghost's x and which the ghost did not collide with, mark it `passed` and increment Score by one; never score a `collided` pair; idempotent per pair.
    - _Requirements: 4.2, 4.3_

  - [ ]* 8.2 Write property test for scoring
    - **Property 8: Scoring is monotonic and counts each uncollided pass exactly once**
    - **Validates: Requirements 4.2, 4.3**

- [x] 9. Implement the pure clouds module
  - [x] 9.1 Implement cloud movement and wrapping in `src/clouds.js`
    - `moveClouds(clouds, dt)` moves each cloud left by its own `speed*dt`; clouds carry ≥2 distinct speeds, each slower than pipe speed.
    - `wrapClouds(clouds, playArea, rng)` repositions a cloud beyond the right edge once its right edge passes the left edge, keeping 1–5 clouds present with `0 < alpha < 1`.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 9.2 Write property test for cloud invariants
    - **Property 16: Clouds stay semi-transparent, bounded in count, and slower than pipes**
    - **Validates: Requirements 9.1, 9.2, 9.4**

  - [ ]* 9.3 Write property test for cloud parallax and wrap
    - **Property 17: Clouds move with parallax and wrap to stay continuously present**
    - **Validates: Requirements 9.3, 9.5**

- [x] 10. Implement the pure highscore and display formatter
  - [x] 10.1 Implement `parseHighScore` and `nextHighScore` in `src/highscore.js`
    - `parseHighScore(raw)` returns the integer if `raw` is a valid integer in `[0, 999999]`, else `0`.
    - `nextHighScore(score, highScore)` returns `max(score, highScore)` clamped to `[0, 999999]`, never decreasing.
    - _Requirements: 6.1, 6.4, 6.5_

  - [ ]* 10.2 Write property test for high-score update
    - **Property 11: High score equals the clamped maximum and never decreases**
    - **Validates: Requirements 6.1**

  - [ ]* 10.3 Write property test for high-score parsing
    - **Property 12: High-score parsing accepts valid integers and rejects everything else**
    - **Validates: Requirements 6.4, 6.5**

  - [x] 10.4 Implement `formatScoreDisplay` in `src/display.js`
    - Return `"Score: N | High: M"` with N and M as base-10 integers, no leading zeros; present High as `0` when unavailable.
    - _Requirements: 7.1, 7.4_

  - [ ]* 10.5 Write property test for the score display format
    - **Property 13: Score display is formatted exactly as specified**
    - **Validates: Requirements 7.1**

- [x] 11. Checkpoint - pure core complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement the state machine and fixed-timestep step function
  - [x] 12.1 Define the `GameState` model and `simulateStep` in `src/loop.js`
    - Model `GameState` as the design's plain object (`mode`, `ghost`, `pipes`, `clouds`, `score`, `highScore`, `gameOverAtMs`, `gameOverSoundPlayed`, `assets`).
    - Implement `simulateStep(state, intent, dt, config, rng)`: in Ready, a flap transitions to Playing with Score 0 and one impulse; in Playing, apply gravity/flap, scroll+spawn+cull pipes, move+wrap clouds, update score, and on collision transition to Game_Over; in Game_Over, freeze pipes and halt generation.
    - Return side-effect flags (`flapApplied`, `enteredGameOver`) for the loop to drive audio.
    - _Requirements: 2.7, 4.1, 5.1, 5.2, 5.3, 5.5, 5.6, 9.3, 9.4_

  - [ ]* 12.2 Write property test for flap-while-Ready
    - **Property 3: A flap while Ready starts the game with a single impulse**
    - **Validates: Requirements 2.7**

  - [ ]* 12.3 Write property test for frozen pipes in Game_Over
    - **Property 10: Pipes are frozen while in Game_Over**
    - **Validates: Requirements 5.5, 5.6**

  - [ ]* 12.4 Write example test for session start sets Score 0
    - Assert transition to Playing at session start sets Score to 0.
    - _Requirements: 4.1_

  - [x] 12.5 Implement the restart debounce and reset in `src/loop.js`
    - On a restart intent while Game_Over, discard without buffering if `now - gameOverAtMs < restartDebounceMs`; otherwise reset Score to 0, clear pipes, reposition the ghost to start, transition to Ready, and keep High_Score.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 12.6 Write property test for debounce discard
    - **Property 14: A flap within the debounce window is discarded without buffering**
    - **Validates: Requirements 8.6**

  - [ ]* 12.7 Write property test for valid restart
    - **Property 15: A valid restart resets the session and preserves the high score**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

- [x] 13. Implement the storage adapter
  - [x] 13.1 Implement `HighScoreStore` in `src/storage.js`
    - `load()` reads `localStorage` by `config.storage.key`; `save(n)` writes it; both wrapped in try/catch so a failure retains the in-memory value and never interrupts play.
    - Use `parseHighScore` on load.
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [ ]* 13.2 Write example/integration tests for storage
    - `save` is called with the new High_Score when it increases (6.2); a throwing `setItem` retains the in-memory value (6.3).
    - _Requirements: 6.2, 6.3_

- [x] 14. Implement the audio adapter
  - [x] 14.1 Implement `AudioManager` in `src/audio.js`
    - `playJump()` restarts `assets/jump.wav` from the start (reset `currentTime`) and plays within 100 ms; `playGameOver()` plays `assets/game_over.wav` once per transition. Both wrap playback in try/catch and swallow failures.
    - _Requirements: 2.5, 2.6, 5.4, 5.7_

  - [ ]* 14.2 Write example/integration tests for audio
    - Jump resets `currentTime` to 0 and calls `play()` (2.5); a throwing jump does not block the flap (2.6); Game_Over plays once and not on later frames (5.4); a throwing Game_Over sound still completes the transition (5.7).
    - _Requirements: 2.5, 2.6, 5.4, 5.7_

- [x] 15. Implement the asset loader and input adapters
  - [x] 15.1 Implement `AssetLoader` in `src/assets.js`
    - Load `assets/ghosty.png` and the audio clips; on sprite error set `ghostLoaded = false` so the renderer draws a placeholder and the game still enters Ready.
    - _Requirements: 1.3, 1.4_

  - [ ]* 15.2 Write example test for the sprite-fallback path
    - Sprite-load failure still reaches Ready and signals a placeholder draw.
    - _Requirements: 1.4_

  - [x] 15.3 Implement `InputController` in `src/input.js`
    - Bind `keydown` (Space), `mousedown` (primary button in play area), and `touchstart` (tap in play area); normalize all three into a single `FLAP` intent emitted to the loop.
    - _Requirements: 2.2, 2.3, 2.4, 2.7, 8.1_

- [x] 16. Implement the renderer
  - [x] 16.1 Implement `Renderer.draw(state)` in `src/render.js`
    - Draw per frame in order: blue sky fill, 1–5 semi-transparent rounded white clouds (back-to-front), green pipes, dark full-width bottom ground strip, ghost sprite (or placeholder shape if `ghostLoaded` is false), and the white `"Score: N | High: M"` text centered over the ground.
    - Use `config.fallbackColors` for any failed asset (blue sky, green pipe, placeholder ghost); render all remaining elements without interruption.
    - Keep the Score_Display within play-area bounds for Score/High values 0..9999, and reflect state each frame.
    - _Requirements: 1.3, 1.4, 4.4, 4.5, 6.6, 7.1, 7.2, 7.3, 9.1, 9.2, 9.6, 9.7, 9.8, 9.9_

  - [ ]* 16.2 Write integration/render tests for the renderer
    - Using jsdom + a stubbed 2D context: sky/ground/ghost/Score_Display render on boot (1.1); sprite drawn via `drawImage` when loaded (1.3); Score_Display reflects state each frame (4.5, 7.3); score text fits bounds at 0 and 9999 (7.2); pipes green (9.6); ground dark full-width strip (9.7); score text white (9.8); each visual fallback renders without interruption (9.9).
    - _Requirements: 1.1, 1.3, 4.5, 7.2, 7.3, 9.6, 9.7, 9.8, 9.9_

- [x] 17. Checkpoint - adapters complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Build the game loop and wire everything together
  - [x] 18.1 Implement the RAF loop and audio edges in `src/loop.js`
    - Implement `start()`: `requestAnimationFrame` tick, compute the real delta clamped to a max (e.g. 250 ms), accumulate, run `simulateStep` for each `FIXED_DT = 1/60` s, fire `AudioManager.playJump()`/`playGameOver()` on the returned edge flags, call `HighScoreStore.save` when High_Score increases, and call `Renderer.draw(state)` once per frame.
    - Load the persisted High_Score at boot via `HighScoreStore.load()` and enter Ready with Score 0.
    - _Requirements: 1.1, 1.2, 2.5, 5.4, 6.2_

  - [x] 18.2 Create `src/main.js` entry module
    - Build the effective config via `loadConfig`, construct the canvas context, instantiate `AssetLoader`, `AudioManager`, `HighScoreStore`, `InputController`, `Renderer`, and the loop, then call `start()`.
    - _Requirements: 1.1, 1.2_

  - [x] 18.3 Create `index.html` and `style.css`
    - `index.html` includes the canvas and loads `src/main.js` as an ES module (`type="module"`); `style.css` scales the fixed logical canvas to fit while preserving aspect ratio.
    - Ensure the page renders the play area within 3 seconds of load with no build step.
    - _Requirements: 1.1, 1.2_

  - [ ]* 18.4 Write a boot smoke integration test
    - With jsdom, mounting `index.html`/`main.js` reaches Ready, Score 0, and performs an initial draw of sky, ground, ghost, and Score_Display.
    - _Requirements: 1.1, 1.2_

- [x] 19. Final checkpoint - full game runnable
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core
  implementation tasks are never optional.
- Each task references the specific requirements and/or design correctness properties it implements.
- Property tests use fast-check with a minimum of 100 iterations and are tagged
  `Feature: flappy-kiro, Property {number}: {property_text}` per the design's testing strategy.
- The pure simulation core (`physics`, `pipes`, `scoring`, `collision`, `clouds`, `highscore`,
  `config`/`loadConfig`, display formatter) is covered by property-based tests; the I/O adapters
  (`input`, `audio`, `storage`, `assets`, `render`) are covered by example and integration tests.
- Task 3.1 reconciles the existing `Ghost` class with the pure core so physics and collision are
  defined once; later core tasks reuse that reconciled logic rather than duplicating it.
- The runtime game remains buildless (opened via `index.html`); fast-check and Vitest are test-only
  dev dependencies and are not imported by runtime code.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "4.1", "5.1", "9.1", "10.1", "10.4"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5.2", "5.3", "6.1", "8.1", "9.2", "9.3", "10.2", "10.3", "10.5", "13.1", "14.1", "15.1", "15.3"] },
    { "id": 4, "tasks": ["5.4", "5.5", "5.6", "6.2", "8.2", "12.1", "13.2", "14.2", "15.2", "16.1"] },
    { "id": 5, "tasks": ["12.2", "12.3", "12.4", "12.5", "16.2"] },
    { "id": 6, "tasks": ["12.6", "12.7", "18.1"] },
    { "id": 7, "tasks": ["18.2"] },
    { "id": 8, "tasks": ["18.3"] },
    { "id": 9, "tasks": ["18.4"] }
  ]
}
```
