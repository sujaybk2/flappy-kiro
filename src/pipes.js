// pipes.js — the single, pure home for pipe generation and clamping.
//
// Part of the simulation core (see the header of `src/physics.js` for the overall
// pure-function decision). This module owns the geometry of a Pipe_Pair: choosing a
// gap height and gap-top position, and clamping that gap-top into the valid vertical
// window so the Ghost can always pass without touching the Ceiling or Ground.
//
// It is pure and DOM-free: every function returns a NEW value, never mutates its
// inputs, and sources every constant (gap min/max, ceiling/ground margins, pipe
// width, play-area height, ground height, ceiling y) from the already-validated
// effective `config` (the output of `loadConfig`, or the frozen default) — never a
// hardcoded number.
//
// Coordinate convention matches physics.js / collision.js: logical play-area px,
// origin top-left, y increases downward. `gapTop` is the y of the top edge of the
// gap (equivalently, the bottom edge of the top pipe); the gap bottom is
// `gapTop + gapHeight`.
//
// Randomness: `rng` is a function returning a float in [0, 1), injected for
// determinism and testability. Pure callers pass a seeded generator so pipe
// placement is reproducible.

/**
 * A pipe pair as defined in the design's Data Models.
 * @typedef {{ x:number, width:number, gapTop:number, gapHeight:number, passed:boolean, collided:boolean }} PipePair
 */

/**
 * Clamp a proposed gap-top into the valid vertical window so the gap stays at least
 * `ceilingMargin` from the Ceiling and its bottom stays at least `groundMargin` from
 * the Ground (Req 3.5, 3.6).
 *
 * The window is:
 *   lowest  = ceilingY + ceilingMargin
 *   highest = playArea.height - ground.height - groundMargin - gapHeight
 *
 * The config ranges guarantee this window is non-empty (e.g. height 640, ground 80,
 * margins 50/50, max gap 200 → window [50, 310]). The gap is always clamped and kept,
 * never rejected or regenerated.
 *
 * @param {number} gapTop  The proposed y of the gap's top edge.
 * @param {number} gapHeight  The gap's vertical opening in px.
 * @param {object} config  The effective (validated) config.
 * @returns {number} The clamped gap-top within [lowest, highest].
 */
export function clampGapTop(gapTop, gapHeight, config) {
  const lowest = config.ceilingY + config.pipes.ceilingMargin;
  const highest =
    config.playArea.height -
    config.ground.height -
    config.pipes.groundMargin -
    gapHeight;

  if (gapTop < lowest) return lowest;
  if (gapTop > highest) return highest;
  return gapTop;
}

/**
 * Generate a single Pipe_Pair at horizontal position `x`.
 *
 * Chooses a gap height uniformly in `[gap.min, gap.max]` (Req 3.2) and a proposed gap
 * top spanning the full play-area height, then clamps the gap top via `clampGapTop`
 * (Req 3.5, 3.6). The pair is ALWAYS kept — never rejected or regenerated — because
 * clamping guarantees a valid placement.
 *
 * Returns a new PipePair matching the design's Data Model, with `passed` and
 * `collided` initialized to false. Pure: no mutation, no DOM, no I/O.
 *
 * @param {number} x  The left edge of the pair (logical px).
 * @param {object} config  The effective (validated) config.
 * @param {() => number} rng  A function returning a float in [0, 1) for determinism.
 * @returns {PipePair} The generated, clamped pipe pair.
 */
export function generatePipePair(x, config, rng) {
  const { min: gapMin, max: gapMax } = config.pipes.gap;

  // Uniform gap height within [gap.min, gap.max] (Req 3.2).
  const gapHeight = gapMin + rng() * (gapMax - gapMin);

  // Propose a gap top anywhere down the play area, then clamp into the valid window.
  const proposedGapTop = rng() * config.playArea.height;
  const gapTop = clampGapTop(proposedGapTop, gapHeight, config);

  return {
    x,
    width: config.pipes.width,
    gapTop,
    gapHeight,
    passed: false,
    collided: false,
  };
}

/**
 * Scroll every Pipe_Pair left by `speed * dt` (Req 3.1).
 *
 * Pure: returns a NEW array of NEW pair objects, never mutating the input array
 * or its elements. Only `x` changes; all other fields (`width`, `gapTop`,
 * `gapHeight`, `passed`, `collided`) are carried forward unchanged. The caller
 * sources `speed` from `config.pipes.speed` (already clamped to [100, 300]).
 *
 * @param {PipePair[]} pipes  The current pipe pairs.
 * @param {number} speed  Horizontal scroll speed in px/s (leftward).
 * @param {number} dt  The timestep in seconds.
 * @returns {PipePair[]} A new array with each pair's `x` decreased by `speed*dt`.
 */
export function scrollPipes(pipes, speed, dt) {
  return pipes.map((pair) => ({ ...pair, x: pair.x - speed * dt }));
}

/**
 * Remove every Pipe_Pair whose right edge has crossed the left edge of the play
 * area, i.e. whose right edge (`x + width`) is `< 0` (Req 3.4).
 *
 * Pure: returns a NEW array containing only the still-visible pairs (same object
 * references, no mutation). `playArea` is accepted for signature consistency with
 * the design even though the left edge is fixed at x = 0.
 *
 * @param {PipePair[]} pipes  The current pipe pairs.
 * @param {object} playArea  The play-area dimensions (unused; left edge is 0).
 * @returns {PipePair[]} A new array without pairs that have fully exited on the left.
 */
export function cullOffscreen(pipes, playArea) {
  return pipes.filter((pair) => pair.x + pair.width >= 0);
}

/**
 * Append a new Pipe_Pair at the right edge of the play area when the last pair is
 * far enough from that edge, keeping at least one pair present during play
 * (Req 3.3).
 *
 * A fresh spacing is chosen uniformly in `[spacing.min, spacing.max]`. Spawn when
 * the last pair's left edge is at least `spacing` from the right edge — equivalently
 * when `playArea.width - lastPair.x >= spacing`. When there are no pipes at all, one
 * is always spawned so the field is never empty during play.
 *
 * The new pair is placed at `x = playArea.width` (just entering from the right) and
 * generated via `generatePipePair`, which chooses and clamps its gap. Pure: returns
 * a NEW array (the existing pairs plus the appended one) and never mutates the input.
 * Returns the input array unchanged (a new array copy) when no spawn is due.
 *
 * @param {PipePair[]} pipes  The current pipe pairs (ordered oldest-first).
 * @param {object} config  The effective (validated) config.
 * @param {() => number} rng  A function returning a float in [0, 1) for determinism.
 * @param {object} playArea  The play-area dimensions; `playArea.width` is the right edge.
 * @returns {PipePair[]} A new array, with a new pair appended when a spawn is due.
 */
export function maybeSpawn(pipes, config, rng, playArea) {
  const { min: spacingMin, max: spacingMax } = config.pipes.spacing;

  // Fresh spacing uniformly within [spacing.min, spacing.max] (Req 3.3).
  const spacing = spacingMin + rng() * (spacingMax - spacingMin);

  // No pipes present: always spawn one so at least one pair is on screen (Req 3.3).
  if (pipes.length === 0) {
    return [generatePipePair(playArea.width, config, rng)];
  }

  // Spawn once the newest (last) pair is >= spacing from the right edge.
  const lastPair = pipes[pipes.length - 1];
  if (playArea.width - lastPair.x >= spacing) {
    return [...pipes, generatePipePair(playArea.width, config, rng)];
  }

  // Not time to spawn yet — return a new array copy without mutating the input.
  return [...pipes];
}
