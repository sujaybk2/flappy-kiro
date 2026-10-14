// collision.js — the single, pure home for AABB collision logic.
//
// Part of the task 3.1 reconciliation (see the header of `src/physics.js` for the
// full decision). This module is the ONE place that owns the ghost's collision
// math: the forgiving hitbox inset, the axis-aligned bounding-box overlap test, and
// the pipe / ground / ceiling checks. It is pure and DOM-free, operates on the plain
// `Ghost` data object (`{ x, y, width, height, vy }`), and sources every constant
// (hitbox inset, ground height, ceiling y, play-area height) from the already-
// validated effective `config`. Cosmetic tilt/bob in `src/ghost.js` never change the
// box computed here.
//
// Coordinate convention matches physics.js: logical px, origin top-left, y down.

/**
 * @typedef {{ x:number, y:number, width:number, height:number, vy:number }} Ghost
 * @typedef {{ x:number, y:number, width:number, height:number }} Rect
 */

/**
 * The ghost's collision box: the sprite rectangle inset by `config.ghost.hitboxInset`
 * on every side so near misses feel fair. This is the ONLY box used for collision;
 * the sprite drawn by the renderer may be larger. Exposed so other modules reuse this
 * single definition rather than recomputing the inset.
 *
 * @param {Ghost} ghost  The ghost data object.
 * @param {object} config  The effective (validated) config; supplies hitboxInset.
 * @returns {Rect} The inset hitbox rectangle.
 */
export function ghostHitbox(ghost, config) {
  const inset = config.ghost.hitboxInset;
  return {
    x: ghost.x + inset,
    y: ghost.y + inset,
    width: ghost.width - inset * 2,
    height: ghost.height - inset * 2,
  };
}

/**
 * Axis-aligned bounding-box overlap test using half-open intervals so that
 * edge-touching is handled consistently (a shared edge does not count as overlap).
 *
 * @param {Rect} a
 * @param {Rect} b
 * @returns {boolean} True if the two rectangles overlap.
 */
export function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Build the top and bottom pipe rectangles for a pipe pair, given the play area.
 * @param {{x:number,width:number,gapTop:number,gapHeight:number}} pair
 * @param {object} config
 * @returns {{top:Rect, bottom:Rect}}
 */
function pipeRects(pair, config) {
  const top = {
    x: pair.x,
    y: 0,
    width: pair.width,
    height: pair.gapTop,
  };
  const bottomY = pair.gapTop + pair.gapHeight;
  const bottom = {
    x: pair.x,
    y: bottomY,
    width: pair.width,
    height: config.playArea.height - bottomY,
  };
  return { top, bottom };
}

/**
 * True if the ghost's hitbox overlaps either pipe of any pair in the list.
 *
 * @param {Ghost} ghost
 * @param {Array<{x:number,width:number,gapTop:number,gapHeight:number}>} pipes
 * @param {object} config
 * @returns {boolean}
 */
export function ghostHitsPipe(ghost, pipes, config) {
  const box = ghostHitbox(ghost, config);
  for (const pair of pipes) {
    const { top, bottom } = pipeRects(pair, config);
    if (aabbOverlap(box, top) || aabbOverlap(box, bottom)) return true;
  }
  return false;
}

/**
 * True if the ghost overlaps the Ground boundary (Req 5.2) or its position reaches
 * or exceeds the Ceiling boundary (Req 5.3).
 *
 * @param {Ghost} ghost
 * @param {object} config  Supplies playArea.height, ground.height, ceilingY, hitboxInset.
 * @returns {boolean}
 */
export function ghostHitsBounds(ghost, config) {
  const box = ghostHitbox(ghost, config);
  // Ceiling: top of the hitbox reaches or passes the ceiling y.
  if (box.y <= config.ceilingY) return true;
  // Ground: bottom of the hitbox reaches or overlaps the top of the ground strip.
  const groundTop = config.playArea.height - config.ground.height;
  if (box.y + box.height >= groundTop) return true;
  return false;
}
