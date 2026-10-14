// ghost.js — the Ghosty player character's COSMETIC layer.
//
// Per the task 3.1 reconciliation (see the header of `src/physics.js` for the full
// decision), this module no longer owns physics or collision math. Those live once,
// purely, in `src/physics.js` (gravity + terminal velocity, flap) and
// `src/collision.js` (hitbox inset, AABB overlap, pipe/ground/ceiling tests).
//
// What stays here are COSMETIC concerns only:
//   - animation state (idle / rising / falling / dead),
//   - the idle bob while Ready,
//   - the draw-time tilt derived from velocity,
//   - start-position helpers.
//
// This class holds a plain `Ghost` data object — `{ x, y, width, height, vy }`, the
// exact shape the design's Data Models and the pure core expect — on `this.data`, and
// delegates all physics/collision operations to the pure functions. Cosmetic tilt and
// bob never touch that data's collision box or velocity-driven physics.
//
// Standards followed:
// - All constants come from config (no hardcoded numbers).
// - Physics stays in floats in the pure core; rounding happens only at draw time.
// - Animation state is cosmetic only and NEVER affects the collision box.
// - No DOM / audio / storage / Date.now() / Math.random() in here (deterministic).
//
// Coordinate convention: logical play-area px, origin top-left, y increases downward,
// so vy > 0 is downward and a flap sets vy to a negative (upward) value.

import { applyGravity, applyFlap } from './physics.js';
import {
  ghostHitbox,
  aabbOverlap,
  ghostHitsPipe,
  ghostHitsBounds,
} from './collision.js';

// Cosmetic animation states. These drive rendering (tilt, bob, sprite choice) only.
export const GhostAnim = Object.freeze({
  IDLE:    'idle',     // Ready: gentle bob, no gravity
  RISING:  'rising',   // vy < 0 just after a flap
  FALLING: 'falling',  // vy >= 0 under gravity
  DEAD:    'dead',     // Game_Over: frozen pose
});

/**
 * Build a plain `Ghost` data object at the configured start position.
 * This is the shape the pure physics/collision core operates on.
 *
 * @param {object} config The effective (validated) config.
 * @returns {{x:number,y:number,width:number,height:number,vy:number}}
 */
export function createGhostData(config) {
  const { playArea } = config;
  const g = config.ghost;
  return {
    x: playArea.width * g.startXRatio,
    y: playArea.height * g.startYRatio,
    width: g.width,
    height: g.height,
    vy: 0,
  };
}

export class Ghost {
  /**
   * @param {object} config The frozen/effective Config object (single source of truth).
   */
  constructor(config) {
    this.config = config;
    const g = config.ghost;

    // Start position derived from config ratios (cosmetic bob returns here).
    this.startX = config.playArea.width * g.startXRatio;
    this.startY = config.playArea.height * g.startYRatio;

    // The plain Ghost data object the pure core operates on.
    this.data = createGhostData(config);

    // Previous position for render-time interpolation.
    this.prevX = this.data.x;
    this.prevY = this.data.y;

    // Cosmetic animation state.
    this.anim = GhostAnim.IDLE;
    this.animClock = 0; // seconds, advances for idle bob (cosmetic)
  }

  // --- Convenience accessors onto the plain data object -------------------
  get x() { return this.data.x; }
  get y() { return this.data.y; }
  get vy() { return this.data.vy; }
  get width() { return this.data.width; }
  get height() { return this.data.height; }

  /** Reset to the configured start pose for a fresh session. */
  reset() {
    this.data = createGhostData(this.config);
    this.prevX = this.data.x;
    this.prevY = this.data.y;
    this.anim = GhostAnim.IDLE;
    this.animClock = 0;
  }

  /** Snapshot current position as previous (call at the start of each fixed step). */
  savePrev() {
    this.prevX = this.data.x;
    this.prevY = this.data.y;
  }

  /**
   * Apply gravity for one fixed step while Playing. Delegates to the pure core.
   * @param {number} dt fixed timestep in seconds (e.g. 1/60).
   */
  applyGravity(dt) {
    this.data = applyGravity(this.data, this.config.physics.gravity, dt, this.config);
    this._updateAnimFromVelocity();
  }

  /**
   * Flap: reset vertical velocity to the fixed upward value. Delegates to the pure
   * core so key/mouse/touch feel identical.
   */
  flap() {
    this.data = applyFlap(this.data, this.config.physics.flapVelocity);
    this.anim = GhostAnim.RISING;
  }

  /**
   * Advance the cosmetic idle bob while Ready. Does not touch x/vy physics; purely
   * visual. Writes the bobbed y back onto the data object so the renderer reads it.
   * @param {number} dt seconds.
   */
  updateIdle(dt) {
    this.anim = GhostAnim.IDLE;
    this.animClock += dt;
    const { bobAmplitude, bobSpeed } = this.config.ghost;
    // Bob around the start Y; render reads data.y, physics does not run in Ready.
    this.data.y = this.startY + Math.sin(this.animClock * bobSpeed) * bobAmplitude;
  }

  /** Mark the ghost dead (cosmetic pose) on Game_Over. */
  markDead() {
    this.anim = GhostAnim.DEAD;
  }

  _updateAnimFromVelocity() {
    if (this.anim === GhostAnim.DEAD) return;
    this.anim = this.data.vy < 0 ? GhostAnim.RISING : GhostAnim.FALLING;
  }

  /**
   * The collision box — delegates to the pure core so the inset is defined once.
   * Cosmetic tilt/bob never change this box.
   * @returns {{x:number,y:number,width:number,height:number}}
   */
  hitbox() {
    return ghostHitbox(this.data, this.config);
  }

  /** AABB overlap test against another rectangle. Delegates to the pure core. */
  intersects(rect) {
    return aabbOverlap(this.hitbox(), rect);
  }

  /** True if the ghost hits either pipe of the given pipe pair. Delegates to the pure core. */
  hitsPipePair(pair) {
    return ghostHitsPipe(this.data, [pair], this.config);
  }

  /** True if the ghost reaches/exceeds the ceiling or touches the ground. */
  hitsBounds() {
    return ghostHitsBounds(this.data, this.config);
  }

  /**
   * Cosmetic tilt angle in radians, derived from velocity and clamped to maxTiltDeg.
   * Used by the renderer only; has no effect on physics or collision.
   */
  tiltRadians() {
    const { maxTiltDeg, tiltPerVy } = this.config.ghost;
    const deg = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, this.data.vy * tiltPerVy));
    return (deg * Math.PI) / 180;
  }
}
