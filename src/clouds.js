// clouds.js — the pure parallax-cloud layer of the background.
//
// Clouds are soft, semi-transparent decorative shapes that drift from right to
// left behind the pipes. Spreading them across at least two distinct speeds
// (each strictly slower than the pipe scroll speed) produces a parallax depth
// effect: nearer clouds slide past faster than farther ones (Req 9.3, 9.4).
//
// This module is DOM-free, audio-free, storage-free, and deterministic. The only
// source of randomness is the injected `rng` function (a float in [0, 1)), so
// wrapping behavior is fully reproducible in tests.
//
// Both exported functions are PURE: they never mutate their inputs. They return
// a brand-new array of brand-new Cloud objects, so the caller's previous frame
// state is left untouched.
//
// Cloud data model (per the design's Data Models):
//   { x, y, width, height, speed, alpha }
//     - x, y          logical play-area px of the cloud's top-left corner
//     - width, height logical px of the cloud's bounding box
//     - speed         px/s, one of Config.clouds.speeds (a distinct parallax layer)
//     - alpha         opacity, strictly 0 < alpha < 1 (semi-transparent, Req 9.2)
//
// Coordinate convention: logical play-area px, origin top-left, x increases to
// the right. A cloud occupies the horizontal span [x, x + width]; its right edge
// is `x + width` and its left edge is `x`.

// Shallow-copy a single Cloud into a fresh object. Centralized so every returned
// Cloud carries exactly the data-model fields and no caller reference leaks out.
function copyCloud(cloud) {
  return {
    x: cloud.x,
    y: cloud.y,
    width: cloud.width,
    height: cloud.height,
    speed: cloud.speed,
    alpha: cloud.alpha,
  };
}

/**
 * Advance every cloud left by its own `speed * dt` (Req 9.3, 9.4).
 *
 * Each cloud moves independently at its own layer speed, so clouds that carry
 * distinct speeds spread apart over time — that difference is the parallax
 * effect. Movement is right-to-left, so x strictly decreases for any positive
 * `dt` and any positive speed.
 *
 * Pure: returns a NEW array of NEW cloud objects; `clouds` is never mutated.
 *
 * @param {Array<{x:number,y:number,width:number,height:number,speed:number,alpha:number}>} clouds
 * @param {number} dt Elapsed simulation time in seconds (expected >= 0).
 * @returns {Array} A new array of moved clouds.
 */
export function moveClouds(clouds, dt) {
  if (!Array.isArray(clouds)) return [];

  return clouds.map((cloud) => {
    const moved = copyCloud(cloud);
    moved.x = cloud.x - cloud.speed * dt;
    return moved;
  });
}

/**
 * Recycle clouds that have scrolled fully off the left edge (Req 9.5, 9.1).
 *
 * A cloud is "fully past the left edge" once its right edge (`x + width`) is at
 * or below the play area's left edge (x = 0) — i.e. none of it is visible any
 * more. Such a cloud is repositioned just beyond the right edge so the sky stays
 * continuously populated; the total number of clouds is preserved (no cloud is
 * ever added or removed), which keeps the count within the configured 1–5 range
 * as long as it started there.
 *
 * The new x is placed at `playArea.width` plus a small randomized horizontal
 * offset (driven by `rng`) so recycled clouds re-enter staggered rather than all
 * at the same column. speed, size, y, and alpha are preserved, so the invariant
 * `0 < alpha < 1` holds across the wrap exactly as it held before.
 *
 * Pure: returns a NEW array of NEW cloud objects; `clouds` is never mutated and
 * `rng` is the sole source of nondeterminism.
 *
 * @param {Array<{x:number,y:number,width:number,height:number,speed:number,alpha:number}>} clouds
 * @param {{width:number,height:number}} playArea Logical play-area dimensions.
 * @param {() => number} rng Returns a float in [0, 1); used to stagger re-entry.
 * @returns {Array} A new array with off-screen clouds repositioned to the right.
 */
export function wrapClouds(clouds, playArea, rng) {
  if (!Array.isArray(clouds)) return [];

  const width = playArea && Number.isFinite(playArea.width) ? playArea.width : 0;
  const randomFloat =
    typeof rng === 'function'
      ? () => {
          const r = rng();
          // Guard against a misbehaving rng; keep offset in [0, 1).
          return Number.isFinite(r) ? Math.min(0.999999, Math.max(0, r)) : 0;
        }
      : () => 0;

  return clouds.map((cloud) => {
    const next = copyCloud(cloud);
    const rightEdge = cloud.x + cloud.width;

    // Fully past the left edge: nothing of the cloud remains visible.
    if (rightEdge <= 0) {
      // Re-enter just beyond the right edge, staggered by up to one play-area
      // width so recycled clouds do not line up in a single column.
      next.x = width + randomFloat() * width;
    }

    return next;
  });
}
