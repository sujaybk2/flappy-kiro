// scoring.js — the single, pure home for pass detection and scoring.
//
// Part of the simulation core (see the header of `src/physics.js` for the overall
// pure-function decision). This module owns Requirement 4's scoring rules: the Ghost
// earns exactly one point for each Pipe_Pair whose trailing gap edge it passes,
// provided it did not collide with that pair.
//
// It is pure and DOM-free: `updateScore` returns a NEW pipes array and the new score,
// never mutating its inputs. It sources no constants of its own — scoring is purely a
// function of positions and the per-pair `passed` / `collided` flags already carried
// by each PipePair (see the Data Models in design.md).
//
// Coordinate convention matches pipes.js / collision.js: logical play-area px, origin
// top-left, y increases downward, x increases rightward. Pipes scroll leftward, so a
// pair's x (its left edge) decreases over time and the Ghost "passes" a pair once the
// pair's right edge has moved left of the Ghost's x.
//
// Scoring definitions (Req 4.2, 4.3):
//   - trailing gap edge = pair.x + pair.width  (the pair's rightmost edge)
//   - a pair is "passed" by the Ghost when that trailing edge is strictly left of the
//     Ghost's x: (pair.x + pair.width) < ghost.x
//   - a pair is scored only if it was not already `passed` and was never `collided`.
//
// Idempotence: the `passed` flag is set to true the moment a pair is scored, so
// re-running `updateScore` on the returned state never counts the same pair twice.
// A `collided` pair is never scored, no matter how far the Ghost travels past it.

/**
 * @typedef {{ x:number, width:number, gapTop:number, gapHeight:number, passed:boolean, collided:boolean }} PipePair
 * @typedef {{ x:number, y:number, width:number, height:number, vy:number }} Ghost
 * @typedef {{ ghost:Ghost, pipes:PipePair[], score:number }} ScoringState
 */

/**
 * Update the Score for any Pipe_Pairs the Ghost has just passed.
 *
 * For each pair not yet marked `passed` whose trailing gap edge (`pair.x + pair.width`)
 * is now strictly left of the Ghost's x, and which the Ghost did not collide with
 * (`collided === false`), mark the pair `passed` and increment the Score by one
 * (Req 4.2). A pair that is `collided` is never scored (Req 4.3). Already-`passed`
 * pairs are left untouched, so the function is idempotent per pair.
 *
 * Pure: returns a NEW pipes array (with newly-passed pairs replaced by new objects)
 * and the new score. The input `state`, its `pipes` array, and each PipePair are
 * never mutated.
 *
 * @param {ScoringState} state  The current game state; uses `ghost`, `pipes`, `score`.
 * @returns {{ score:number, pipes:PipePair[] }} The new score and new pipes array.
 */
export function updateScore(state) {
  const { ghost, pipes, score } = state;
  const ghostX = ghost.x;

  let newScore = score;
  const newPipes = pipes.map((pair) => {
    // Already scored, or disqualified by a collision: leave unchanged.
    if (pair.passed || pair.collided) return pair;

    // Trailing (rightmost) edge of the pair's gap.
    const trailingEdge = pair.x + pair.width;

    // Not yet fully passed by the Ghost: leave unchanged.
    if (trailingEdge >= ghostX) return pair;

    // Newly passed and uncollided: score it once and mark it passed.
    newScore += 1;
    return { ...pair, passed: true };
  });

  return { score: newScore, pipes: newPipes };
}
