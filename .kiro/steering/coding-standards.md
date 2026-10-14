---
inclusion: fileMatch
fileMatchPattern: '*.{js,mjs,html,css}'
---

# Flappy Kiro Coding Standards

These standards apply to the Flappy Kiro browser game. The project is a dependency-light
vanilla stack: a single `index.html`, one `style.css`, and ES modules of plain JavaScript
rendered onto an HTML5 Canvas 2D context. There is no build step, bundler, or framework.

The architecture splits into a **pure simulation core** (physics, pipes, scoring, collision,
clouds, highscore, config) and thin **I/O adapters** (input, audio, storage, assets, renderer).
These standards exist to protect that split, keep the core testable, and keep the game loop fast.

## 1. Architecture & Module Patterns

- **Keep the simulation core pure.** Core modules (`physics.js`, `pipes.js`, `scoring.js`,
  `collision.js`, `clouds.js`, `highscore.js`, `config.js`) MUST NOT import from the DOM,
  `window`, `document`, `localStorage`, audio, timers, or `Math.random` directly. They take
  state and inputs and return new/updated state.
- **Inject randomness and time.** Pass a seeded `rng` and the timestep `dt` into core functions.
  Never call `Math.random()` or `Date.now()` inside the core; that keeps property tests
  deterministic and reproducible.
- **Isolate I/O in adapters.** Only adapter modules (`input.js`, `audio.js`, `storage.js`,
  `assets.js`, `render.js`) touch browser APIs. Every browser call that can throw (audio
  `play()`, `localStorage` access) is wrapped in try/catch and fails soft so gameplay continues.
- **One source of truth for constants.** All tunable values live in `config.js`. No other module
  hardcodes numbers for speed, gravity, gap sizes, colors, keys, or timings. Import them.
- **ES modules only.** Use `import`/`export`. One cohesive responsibility per file. No globals on
  `window` except the single bootstrap entry point.
- **Prefer pure functions over mutation.** Core transforms return results; where per-frame
  allocation matters (see Performance), mutate in place but keep the function free of external
  side effects.

## 2. Naming Conventions

- **Classes / constructors / type-like factories:** `PascalCase` — `GameLoop`, `Renderer`,
  `AudioManager`, `HighScoreStore`, `InputController`, `AssetLoader`.
- **Data-model object shapes:** `PascalCase` — `GameState`, `Ghost`, `PipePair`, `Cloud`, `Config`.
- **Functions and methods:** `camelCase`, verb-first — `applyGravity`, `generatePipePair`,
  `scrollPipes`, `cullOffscreen`, `updateScore`, `loadConfig`, `wrapClouds`.
- **Variables and parameters:** `camelCase` — `gapHeight`, `flapVelocity`, `pipeSpeed`, `rng`, `dt`.
- **Constants / config leaf values:** `camelCase` within the `Config` object; module-level true
  constants in `SCREAMING_SNAKE_CASE` — `FIXED_DT`, `MAX_FRAME_DELTA`.
- **Game states:** the three modes are the exact strings `'Ready'`, `'Playing'`, `'Game_Over'`.
- **Booleans:** prefix with `is`/`has`/`should` — `isPlaying`, `hasCollided`, `ghostLoaded`,
  `passed`, `collided`.
- **Files:** lowercase, one module concept per file — `physics.js`, `pipes.js`, `render.js`.
- **Private helpers:** prefix with `_` only inside a class/module when not exported.

### Class pattern

Use `class` for the stateful adapters that own browser resources (loop, renderer, audio, store,
input, asset loader). Keep the pure core as exported functions, not classes.

```javascript
// Adapter: owns a browser resource, lives at the I/O boundary.
export class AudioManager {
  constructor(config) {
    this._config = config;
    this._jump = null;
    this._gameOver = null;
  }

  playJump() {
    try {
      if (!this._jump) return;
      this._jump.currentTime = 0; // restart if already playing
      this._jump.play();
    } catch {
      // fail soft: gameplay must continue even if audio fails
    }
  }
}
```

```javascript
// Core: pure, no I/O, deterministic.
export function applyGravity(ghost, gravity, dt) {
  ghost.vy += gravity * dt;
  ghost.y += ghost.vy * dt;
  return ghost;
}
```

## 3. Performance Optimization Guidelines

The game runs a per-frame loop at ~60 fps. The budget per frame is roughly 16 ms, so the hot
path (simulate + render) must avoid waste.

- **Decouple update from render.** Simulate with a fixed timestep (`FIXED_DT = 1/60`) via an
  accumulator; render once per `requestAnimationFrame`. Clamp the real frame delta
  (`MAX_FRAME_DELTA`, e.g. 250 ms) before accumulating to avoid a spiral of death after the tab
  is backgrounded.
- **Avoid per-frame allocation in the hot path.** Do not create arrays, objects, or closures
  inside the update/draw loop. Reuse pipe/cloud objects; recycle offscreen pipes rather than
  `new`-ing fresh ones. Avoid `map`/`filter`/`spread` in the hot path — they allocate; prefer
  indexed `for` loops with in-place updates.
- **Pool and recycle entities.** Maintain object pools for `PipePair` and `Cloud`. When a pipe
  scrolls offscreen, return it to the pool; when a cloud passes the left edge, reposition the
  same object rather than allocating.
- **Cache canvas state.** Set `fillStyle`, `font`, and `globalAlpha` only when they change; group
  draws by style. Restore `globalAlpha` to `1` after drawing semi-transparent clouds. Minimize
  `save()`/`restore()` pairs.
- **Use integer-aligned coordinates for crisp pixels.** Round positions before `drawImage`/`fillRect`
  where sub-pixel blur hurts the retro look; keep physics in floats, round only at draw time.
- **Size the canvas once.** Set the canvas backing resolution to the logical play area and scale
  via CSS. Account for `devicePixelRatio` once at setup, not per frame.
- **Load assets once, up front.** Decode the sprite and audio during boot. Never load inside the
  loop. Keep a `ghostLoaded` flag so the renderer can draw the placeholder without branching on a
  failed network call each frame.
- **Collision is cheap AABB.** Use axis-aligned bounding-box tests. Only test pipes near the
  ghost's x; skip pairs fully left or right of the ghost.
- **No layout thrash.** Do not read DOM layout (`offsetWidth`, `getBoundingClientRect`) inside the
  loop. Read input via event listeners that set flags/intents the loop consumes.
- **Keep garbage low.** Prefer primitives and reused buffers. Watch for hidden allocations from
  string concatenation each frame (e.g. the score text) — only rebuild the score string when the
  score actually changes.

## 4. Formatting & Style

- 2-space indentation, semicolons, single quotes, `const`/`let` (never `var`).
- Strict equality (`===`/`!==`) only.
- Small, single-purpose functions; early returns over deep nesting.
- Comment the *why*, not the *what*. In tests, tag each property test with its design property in
  the format `Feature: flappy-kiro, Property {number}: {property_text}`.
