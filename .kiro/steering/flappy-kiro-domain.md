---
inclusion: fileMatch
fileMatchPattern: '*.{js,mjs}'
---

# Flappy Kiro Domain Standards

These standards capture the game-specific domain rules for Flappy Kiro: how game state is managed,
how the high score persists, and how difficulty may progress. They build on the design — a pure
simulation core, thin I/O adapters, and all tunable values sourced from `config.js`. The three
game modes are the exact strings `'Ready'`, `'Playing'`, and `'Game_Over'`.

## 1. Game State Management

- **Single authoritative `GameState`.** One plain object holds `mode`, `ghost`, `pipes`, `clouds`,
  `score`, `highScore`, `gameOverAtMs`, `gameOverSoundPlayed`, and `assets`. The loop advances it;
  the renderer reads it. No other module keeps a parallel copy of game truth.
- **Explicit state machine.** Transitions are the only legal way to change `mode`:
  - `Ready -> Playing` on the first flap (apply one impulse, set `score = 0`).
  - `Playing -> Game_Over` on any collision (pipe, ground, ceiling).
  - `Game_Over -> Ready` on a restart flap, only after the debounce window elapses.
  - `Game_Over -> Game_Over` for a flap inside the debounce window (discarded).
- **Centralize transitions.** Put mode changes in one place (e.g. `transition(state, to)`), set any
  entry bookkeeping there (`gameOverAtMs`, resetting `gameOverSoundPlayed`), and never flip `mode`
  ad hoc from scattered code.
- **Mode gates behavior.** Each simulation step branches on `mode`:
  - Ready: clouds drift (parallax); ghost idles; no pipes spawn or scroll; score shown as 0.
  - Playing: gravity + flap, pipe spawn/scroll/score/cull, collision checks, clouds slower than pipes.
  - Game_Over: pipes frozen and generation halted within one frame; game-over sound once; high score
    updated/persisted if beaten; input debounced.
- **Edge-triggered side effects.** Audio and persistence fire on transitions, not continuously.
  Use flags (`gameOverSoundPlayed`) and return side-effect markers (`flapApplied`,
  `enteredGameOver`) from `simulateStep` so the loop triggers I/O exactly once per edge.
- **Deterministic resets.** A reset produces a fresh session state from config: `score = 0`, empty
  `pipes`, ghost at its start position/velocity, `mode = 'Ready'`, `highScore` preserved. Build
  resets from config defaults rather than mutating fields piecemeal.
- **Purity.** State transitions and per-step updates live in the pure core: inputs are
  `(state, intent, dt, config, rng)`; outputs are the next state plus side-effect markers. No DOM,
  storage, audio, `Date.now()`, or `Math.random()` inside the core (pass `now`/`rng` in).

## 2. Score & High-Score Persistence

- **Score is session-scoped.** `score` starts at 0 each session, increments by exactly one per
  uncollided pipe pair passed, is monotonic non-decreasing within a session, and resets on restart.
- **High score is cross-session.** `highScore` is an integer in `[0, config.highScoreMax]`
  (999999). It only ever increases: `nextHighScore(score, highScore) = clamp(max(score, highScore))`.
- **Update timing.** On entering Game_Over, if `score > highScore`, set `highScore = score` and
  persist. Compute this once per transition, not per frame.
- **Persistence is an adapter concern.** Only `HighScoreStore` (`storage.js`) touches
  `localStorage`, under `config.storage.key`. The core computes the value; the adapter writes it.
- **Validate on load.** `parseHighScore(raw)` returns the integer only if `raw` is a valid integer
  in range; otherwise returns 0. Missing, non-numeric, or out-of-range values all collapse to 0.
- **Fail soft.** Wrap reads and writes in try/catch. If a write throws (quota, disabled storage),
  keep the in-memory `highScore` and continue play uninterrupted. If a read throws, treat it as
  absent and use 0.
- **Display tolerance.** If the high score cannot be read at display time, show `High: 0` and keep
  showing the current score. Rebuild the `"Score: N | High: M"` string only when a value changes.
- **Single key, versionable.** Keep one storage key in config. If the stored shape ever changes,
  bump the key name in config rather than silently reinterpreting old data.

## 3. Difficulty Progression Patterns

Difficulty progression is OPTIONAL and not currently in the requirements. If added, it must obey
these rules so it never violates a requirement-mandated range and stays deterministic and testable.

- **Config-driven, clamped to requirement ranges.** Any ramp adjusts values only within their
  mandated bounds: pipe speed stays in `[100, 300]`, gap height in `[100, 200]`, spacing in
  `[150, 400]`, margins >= 50, cloud speeds strictly below pipe speed. The effective config must
  always pass the config-validation property; run progression through the same clamp used by
  `loadConfig`.
- **Pure function of score (or pairs passed).** Model difficulty as
  `difficultyFor(score, config) -> { pipeSpeed, gapHeight, spacing }`, a pure function with no
  internal state. Given the same score and config it yields the same tuning — keeping it
  reproducible under property tests.
- **Smooth, monotonic ramp.** Difficulty should rise gently and never decrease within a session:
  e.g. interpolate pipe speed from a base toward a cap, and shrink the gap from max toward a floor,
  as score climbs. Use a configurable curve (linear or eased) with a defined start, step, and cap
  in a `config.difficulty` section.
- **Apply only to newly spawned pipes.** Changing speed/gap/spacing affects pairs generated after
  the change; do not retroactively mutate pipes already on screen (that would feel unfair and could
  teleport hazards). The world speed may ramp globally, but gap/spacing changes attach at spawn.
- **Deterministic with the seeded rng.** Any randomized variety within the ramp draws from the
  injected `rng`, never `Math.random()`, so difficulty-dependent generation stays reproducible.
- **Keep it off by default unless specced.** Gate progression behind a `config.difficulty.enabled`
  flag defaulting to the current fixed-difficulty behavior, so enabling it is a deliberate,
  testable change rather than a silent default shift. If progression becomes a real requirement,
  update the spec (requirements + design) first, then implement.
