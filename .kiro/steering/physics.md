---
inclusion: fileMatch
fileMatchPattern: '*.{js,mjs}'
---

# Flappy Kiro Physics Standards

These standards govern motion, collision, and animation for the Flappy Kiro game. They build on
the design: a fixed-timestep simulation core of pure functions, a variable-rate render pass, and
all tunable values sourced from `config.js`. Keep physics in floats; round only at draw time.

Coordinate convention: logical play-area pixels, origin at top-left, `y` increases downward.
Therefore downward velocity is positive, and a flap sets velocity to a negative (upward) value.

## 1. Timestep & Integration

- **Fixed timestep for simulation.** Advance physics by exactly `FIXED_DT = 1/60` second per step,
  driven by an accumulator. Never integrate using the raw `requestAnimationFrame` delta — that
  makes motion and collision frame-rate dependent and non-reproducible.
- **Clamp the frame delta.** Before adding to the accumulator, clamp the real delta to
  `MAX_FRAME_DELTA` (e.g. 250 ms) so a backgrounded tab cannot fast-forward the simulation.
- **Semi-implicit (symplectic) Euler.** Update velocity first, then position with the new
  velocity. This is stable for constant gravity and keeps the feel predictable:

  ```javascript
  // physics.js — pure, deterministic
  export function applyGravity(ghost, gravity, dt) {
    ghost.vy += gravity * dt;   // velocity first
    ghost.y  += ghost.vy * dt;  // then position with updated velocity
    return ghost;
  }
  ```

- **Determinism.** Physics functions take `dt`, config values, and (where needed) a seeded `rng`.
  No `Date.now()`, no `Math.random()` inside the core.

## 2. Momentum & Flap Impulse

- **Gravity is a constant acceleration** (`config.physics.gravity`, px/s^2), applied every fixed
  step while Playing. It accumulates into `vy`, producing a natural falling arc.
- **Flap is a velocity reset, not an additive impulse.** Every flap — spacebar, mouse, or touch —
  sets `vy` to the same fixed upward value `config.physics.flapVelocity` (negative), regardless of
  current velocity. This matches the design's "fixed upward value" and guarantees identical feel
  across input sources.

  ```javascript
  export function applyFlap(ghost, flapVelocity) {
    ghost.vy = flapVelocity; // reset, not vy += ...
    return ghost;
  }
  ```

- **Optional terminal velocity.** If falling feels too fast, clamp `vy` to a configurable
  `maxFallSpeed` (add to `config.physics` if introduced). Clamp symmetrically only if needed;
  the upward cap is naturally the flap value.
- **No horizontal ghost momentum.** The ghost holds a fixed x; the world scrolls past it. Pipe and
  cloud momentum is positional: `x -= speed * dt` each step (pipes at `config.pipes.speed`, clouds
  strictly slower, per the parallax rule).

## 3. Precise Collision Boundaries

- **Axis-aligned bounding boxes (AABB).** The ghost, each pipe, the ground, and the ceiling are
  rectangles. Use half-open intervals so edge-touching is defined consistently: boxes overlap when
  `a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y`.

  ```javascript
  export function aabbOverlap(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
  }
  ```

- **Three collision classes, checked every fixed step while Playing:**
  - **Pipe:** overlap of the ghost box with the top pipe box OR the bottom pipe box of any pair.
  - **Ground:** `ghost.y + ghost.height >= groundTop`, where
    `groundTop = playArea.height - ground.height`.
  - **Ceiling:** `ghost.y <= ceilingY` (reaching or exceeding the top boundary counts).
- **Collision ends the game within one frame.** When any class triggers during Playing, the next
  simulation step sets `mode = 'Game_Over'`. Mark the offending pair `collided = true` so scoring
  cannot credit it.
- **Keep collision slightly forgiving.** The visible sprite may be larger than the collision box.
  Prefer a collision box a few pixels smaller than the sprite (a `hitboxInset` in config) so near
  misses feel fair. Keep the inset in config, not hardcoded.
- **Check only nearby pipes.** Skip pairs whose box is entirely left or right of the ghost's x
  span before running the overlap test.
- **Collision uses post-integration positions.** Run collision after `applyGravity`/`applyFlap`
  and after pipes have scrolled for that step, so the test reflects the frame the player sees.

## 4. Scoring Geometry

- A pair scores when the ghost's x passes the trailing (right) edge of the pair's gap and the pair
  is not `collided`. Mark `passed = true` on first credit so the point is counted exactly once.
- Scoring is evaluated after the step's position updates, consistent with collision ordering.

## 5. Smooth Animation Interpolation

Simulation runs at a fixed 60 Hz, but displays may refresh higher or the accumulator may leave a
fractional step of time unconsumed. Interpolate at render time for smooth motion without making
physics frame-dependent.

- **Carry previous and current positions.** Each step, before overwriting, keep the prior
  position. At render time compute the blend factor `alpha = accumulator / FIXED_DT` (0..1) and
  draw at `prev + (curr - prev) * alpha`.

  ```javascript
  // render.js — interpolate between the two most recent simulated states
  function lerp(prev, curr, alpha) {
    return prev + (curr - prev) * alpha;
  }
  const drawY = lerp(ghost.prevY, ghost.y, alpha);
  const drawX = lerp(pipe.prevX, pipe.x, alpha);
  ```

- **Interpolate render only.** Never feed interpolated values back into the simulation; collision
  and scoring always use the authoritative fixed-step positions.
- **Round at the last moment.** Interpolate in floats, then round to integer pixels for
  `drawImage`/`fillRect` to keep the retro look crisp. Keep physics state unrounded.
- **Optional cosmetic easing.** The ghost may tilt toward its velocity (rotate down as it falls,
  up on a flap) for feel. Tilt is a pure function of `vy` applied at draw time only; it must not
  affect the collision box.
- **Parallax is linear.** Cloud layers move at distinct constant speeds (all slower than pipes);
  no easing on clouds. Wrap by repositioning the same object beyond the right edge.
- **Decouple from render rate.** With fixed-step + interpolation, motion looks smooth at 30, 60,
  or 144 Hz, and the simulation result is identical. Do not tie any physics constant to the
  display refresh rate.
