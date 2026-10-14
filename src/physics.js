// physics.js — the single, pure home for the ghost's float physics.
//
// =========================================================================
// RECONCILIATION DECISION (task 3.1) — read this before touching the core.
// =========================================================================
// The design specifies the simulation core as PURE, side-effect-free functions
// operating on a plain `Ghost` data object (`{ x, y, width, height, vy }`), while
// the project historically had a `Ghost` CLASS in `src/ghost.js` that also carried
// float physics (gravity + terminal velocity, flap) and AABB collision.
//
// To avoid two divergent copies of the same math, we picked **approach (a)**:
//
//   - `src/physics.js` (this file) and `src/collision.js` are the ONE home for the
//     physics and collision logic. They are pure, DOM-free functions that take a
//     plain `Ghost` data object plus the already-validated effective `config`
//     (never raw constants), and return a NEW ghost / a boolean. They never mutate
//     their inputs and never read a hardcoded number — every constant comes from
//     `config` (which is `loadConfig`'s validated output, or the frozen default).
//
//   - `src/ghost.js` is reduced to COSMETIC concerns only: animation state, the
//     idle bob while Ready, the draw-time tilt, and start-position helpers. It owns
//     a plain `Ghost` data object (the exact shape above) and delegates every
//     physics/collision operation here instead of reimplementing it. Cosmetic tilt
//     and bob never influence the hitbox or the physics step.
//
// Consequence for the rest of the implementation: all later core tasks
// (physics 4.1, collision 6.1, the loop's `simulateStep` 12.x) import from
// `physics.js` / `collision.js` and operate on the plain `Ghost` data object.
// The physics/collision constants and math are defined here exactly once.
//
// -------------------------------------------------------------------------
// Conventions
// -------------------------------------------------------------------------
// Coordinate convention: logical play-area px, origin top-left, y increases
// downward. So vy > 0 is downward and a flap sets vy to a negative (upward) value.
//
// Integration: semi-implicit (symplectic) Euler — velocity is updated first, then
// position uses the new velocity. Physics stays in floats; rounding happens only at
// draw time in the renderer, never here.
//
// Purity: these functions return a NEW ghost object and never mutate the input, so
// they are safe for property-based testing and deterministic replay.

/**
 * A plain ghost data object as defined in the design's Data Models.
 * @typedef {{ x:number, y:number, width:number, height:number, vy:number }} Ghost
 */

/**
 * Apply one fixed step of gravity to the ghost (semi-implicit Euler).
 *
 * Velocity is increased by `gravity * dt` and capped at the configured terminal
 * fall speed (`config.physics.maxFallSpeed`), then position advances by the new
 * velocity. Returns a NEW ghost; the input is left untouched.
 *
 * @param {Ghost} ghost  The current ghost data object.
 * @param {number} gravity  Downward acceleration in px/s^2 (from config.physics.gravity).
 * @param {number} dt  Fixed timestep in seconds (e.g. 1/60).
 * @param {object} config  The effective (validated) config; supplies the terminal cap.
 * @returns {Ghost} A new ghost with updated vy and y.
 */
export function applyGravity(ghost, gravity, dt, config) {
  const maxFallSpeed = config.physics.maxFallSpeed;
  let vy = ghost.vy + gravity * dt;
  if (vy > maxFallSpeed) vy = maxFallSpeed; // terminal velocity cap
  const y = ghost.y + vy * dt;
  return { ...ghost, vy, y };
}

/**
 * Apply a flap: reset the ghost's vertical velocity to the fixed upward value.
 *
 * This is a RESET (not an additive impulse), so the feel is identical regardless
 * of the input source — spacebar, mouse click, or touch tap all land here with the
 * same `flapVelocity` (a negative, i.e. upward, value). Returns a NEW ghost.
 *
 * @param {Ghost} ghost  The current ghost data object.
 * @param {number} flapVelocity  Fixed upward velocity in px/s (from config.physics.flapVelocity).
 * @returns {Ghost} A new ghost with vy set to flapVelocity.
 */
export function applyFlap(ghost, flapVelocity) {
  return { ...ghost, vy: flapVelocity };
}
