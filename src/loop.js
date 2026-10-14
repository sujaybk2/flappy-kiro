// loop.js — the game's state machine and fixed-timestep step function.
//
// This file owns the `GameState` model (the design's plain object the renderer draws
// and the loop advances) and the PURE `simulateStep` function that advances the
// simulation by exactly one fixed timestep.
//
// =========================================================================
// SCOPE OF THIS TASK (12.1) — read before extending this file.
// =========================================================================
// This task defines ONLY:
//   - `createGameState(config)` — the GameState factory/model.
//   - `simulateStep(state, intent, dt, config, rng)` — one pure fixed step covering
//     the Ready / Playing / Game_Over transitions (flap-to-start, gravity/flap,
//     pipe scroll+spawn+cull, cloud move+wrap, scoring, collision → Game_Over,
//     and frozen pipes while Game_Over).
//
// Added by task 12.5 (builds on this file):
//   - `handleRestart(state, intent, now, config)` — the PURE 300 ms restart
//     debounce + session reset for the Game_Over mode (Req 8.1–8.6).
//   - `simulateStep` now accepts an OPTIONAL `now` (wall-clock ms) so the
//     Playing→Game_Over transition can stamp `gameOverAtMs = now` for the
//     debounce. See the "Restart / debounce integration" note below.
//
// Added by task 18.1 (the impure driver at the end of this file):
//   - `GameLoop` — the `requestAnimationFrame` loop with delta clamping, a
//     fixed-timestep accumulator, audio edges, and high-score persistence. This
//     is the ONLY impure part of this file (RAF, wall clock, audio, storage are
//     OK here — it is the loop boundary, not the pure core). The pure functions
//     above (`simulateStep` / `handleRestart`) remain untouched by it.
//
// PURITY CONTRACT for `simulateStep`:
//   - No DOM, no `requestAnimationFrame`, no audio, no storage.
//   - No `Date.now()` / wall-clock reads — elapsed time arrives via `dt` (seconds),
//     and the wall-clock instant (for the restart debounce) arrives via an explicit
//     `now` argument. Nothing in this file ever reads the clock itself.
//   - No `Math.random()` — all randomness comes through the injected `rng`
//     (a function returning a float in [0, 1)), so steps are deterministic and
//     property-testable.
//   - It never mutates `state` or its nested objects/arrays; it returns a NEW
//     GameState. This mirrors the pure core (physics/pipes/clouds/scoring), which
//     all return fresh values.
//
// All physics, pipe geometry, cloud parallax, scoring, and collision logic is
// imported from the pure core — this file only orchestrates and owns the state
// machine; it never reimplements that logic.
//
// -------------------------------------------------------------------------
// RETURN SHAPE (documented here because tasks 12.5 and 18.1 build on it)
// -------------------------------------------------------------------------
// `simulateStep(...)` returns:
//
//   {
//     state: GameState,          // the NEXT game state (never the same reference)
//     flags: {
//       flapApplied:    boolean, // a flap impulse was applied THIS step
//                                 //   (Ready→Playing start impulse, or an in-Playing
//                                 //    flap). The loop uses this to play Jump_Sound.
//       enteredGameOver: boolean // this step transitioned Playing→Game_Over.
//                                 //   The loop uses this to play Game_Over_Sound once.
//     }
//   }
//
// The flags describe EDGES that occurred during this single step so the RAF loop
// (task 18.1) can fire audio side effects without inspecting state deltas itself.
// `intent` is a single input value for the step: `'FLAP'` or `null`.
//
// -------------------------------------------------------------------------
// RESTART / DEBOUNCE INTEGRATION (task 12.5) — how the loop (task 18.1) wires it
// -------------------------------------------------------------------------
// The restart flow is split into two pure pieces that stay DOM/clock-free:
//
//   1. Stamping `gameOverAtMs`. The debounce window is measured from the instant
//      Game_Over was entered. `simulateStep` accepts an OPTIONAL `now` (wall-clock
//      ms); when the Playing→Game_Over transition fires AND `now` is a finite
//      number, the returned state carries `gameOverAtMs = now`. When `now` is
//      omitted (e.g. the pure property tests for the Playing step), `gameOverAtMs`
//      is left null and the LOOP is responsible for stamping it on the
//      `enteredGameOver` edge instead. Either way the clock is read OUTSIDE this
//      file and injected — the purity contract is preserved.
//
//   2. Handling the restart intent. A FLAP while Game_Over is the restart request
//      (Req 8.1). The loop routes that through `handleRestart(state, intent, now,
//      config)` (NOT through `simulateStep`, whose Game_Over step only freezes
//      pipes and drifts clouds). `handleRestart` applies the 300 ms debounce
//      (Req 8.6) and, when the window has elapsed, performs the session reset
//      (Req 8.2–8.5). It returns the SAME `{ state, flags }` shape as
//      `simulateStep` so the loop can treat both uniformly.
//
// Suggested loop ordering per fixed step while in Game_Over:
//   - If the intent is FLAP, call `handleRestart(state, intent, now, config)`
//     first; if it transitioned to Ready, use that state and skip the frozen
//     Game_Over `simulateStep` for this step. Otherwise (discarded within the
//     window, or no flap) run `simulateStep` so clouds keep drifting.

import { applyGravity, applyFlap } from './physics.js';
import { scrollPipes, cullOffscreen, maybeSpawn } from './pipes.js';
import { ghostHitsPipe, ghostHitsBounds } from './collision.js';
import { updateScore } from './scoring.js';
import { moveClouds, wrapClouds } from './clouds.js';
import { createGhostData } from './ghost.js';
import { nextHighScore } from './highscore.js';

/** The three Game_State modes. */
export const Mode = Object.freeze({
  READY: 'Ready',
  PLAYING: 'Playing',
  GAME_OVER: 'Game_Over',
});

/** The single input intent the step understands (besides `null`). */
export const Intent = Object.freeze({
  FLAP: 'FLAP',
});

/**
 * A GameState as defined in the design's Data Models — a plain object the loop
 * advances and the renderer draws. All coordinates are logical play-area px.
 *
 * @typedef {object} GameState
 * @property {'Ready'|'Playing'|'Game_Over'} mode  Current Game_State.
 * @property {{x:number,y:number,width:number,height:number,vy:number}} ghost  Plain ghost data object.
 * @property {Array<{x:number,width:number,gapTop:number,gapHeight:number,passed:boolean,collided:boolean}>} pipes
 * @property {Array<{x:number,y:number,width:number,height:number,speed:number,alpha:number}>} clouds
 * @property {number} score  Non-negative integer (Req 4).
 * @property {number} highScore  Integer in [0, 999999] (Req 6).
 * @property {number|null} gameOverAtMs  Wall-clock ms when Game_Over was entered (debounce, Req 8.6); set by the loop, not by simulateStep.
 * @property {boolean} gameOverSoundPlayed  Ensures the Game_Over_Sound plays once per transition (Req 5.4).
 * @property {{ghostLoaded:boolean}} assets  Asset-load flags for the renderer.
 */

/**
 * Build a fresh GameState in the Ready mode with Score 0.
 *
 * The ghost is placed at its configured start position (via the pure
 * `createGhostData`), pipes start empty (none scroll/generate in Ready), and clouds
 * default to an empty array — the loop/boot (task 18.x) seeds the initial cloud set.
 * `highScore` is 0 here; the loop overwrites it with the persisted value at boot.
 *
 * @param {object} config  The effective (validated) config.
 * @param {object} [initial]  Optional overrides for `clouds`, `highScore`, `assets`.
 * @returns {GameState}
 */
export function createGameState(config, initial = {}) {
  return {
    mode: Mode.READY,
    ghost: createGhostData(config),
    pipes: [],
    clouds: Array.isArray(initial.clouds) ? initial.clouds : [],
    score: config.scoring.start,
    highScore: Number.isFinite(initial.highScore) ? initial.highScore : 0,
    gameOverAtMs: null,
    gameOverSoundPlayed: false,
    assets: initial.assets || { ghostLoaded: false },
  };
}

/** The flat flags object returned when no edge side-effect occurred this step. */
function noFlags() {
  return { flapApplied: false, enteredGameOver: false };
}

/**
 * Advance the simulation by exactly one fixed timestep.
 *
 * Behavior per mode:
 *
 * - Ready: clouds drift (parallax, Req 9.3) and the ghost holds its start pose. A
 *   `'FLAP'` intent transitions to Playing, sets Score to 0 (Req 4.1), and applies a
 *   single flap impulse (Req 2.7) — reported via `flapApplied`. With no flap, the
 *   state is unchanged except for the moved clouds.
 *
 * - Playing: apply flap-or-gravity to the ghost, scroll+cull+maybe-spawn pipes
 *   (Req 3.1, 3.3, 3.4), move+wrap clouds slower than pipes (Req 9.4, 9.5), then
 *   score newly-passed uncollided pairs (Req 4.2, 4.3). Collision against any pipe
 *   or the ground/ceiling (Req 5.1, 5.2, 5.3) transitions to Game_Over this step:
 *   the hit pairs are marked `collided` (so scoring never credits them), `mode`
 *   becomes 'Game_Over', and `enteredGameOver` is reported true.
 *
 * - Game_Over: pipes are FROZEN — neither scrolled nor culled nor spawned (Req 5.5,
 *   5.6). Clouds may continue to drift. Flap intents here are the restart request,
 *   handled by the debounce/reset in task 12.5; this step leaves the mode unchanged.
 *
 * Pure: returns a brand-new GameState and never mutates `state`. See the file header
 * for the full return shape and purity contract.
 *
 * @param {GameState} state  The current game state.
 * @param {'FLAP'|null} intent  The input intent for this step.
 * @param {number} dt  Fixed timestep in seconds (e.g. 1/60).
 * @param {object} config  The effective (validated) config.
 * @param {() => number} rng  Float-in-[0,1) source for deterministic spawn/wrap.
 * @param {number} [now]  Optional wall-clock ms. When provided and this step
 *   transitions Playing→Game_Over, the returned state stamps `gameOverAtMs = now`
 *   so the restart debounce (task 12.5 / Req 8.6) can measure from this instant.
 *   When omitted, `gameOverAtMs` is left null and the loop stamps it (see the
 *   "Restart / debounce integration" note in the file header).
 * @returns {{ state: GameState, flags: { flapApplied: boolean, enteredGameOver: boolean } }}
 */
export function simulateStep(state, intent, dt, config, rng, now) {
  const isFlap = intent === Intent.FLAP;

  switch (state.mode) {
    case Mode.READY:
      return stepReady(state, isFlap, dt, config);
    case Mode.PLAYING:
      return stepPlaying(state, isFlap, dt, config, rng, now);
    case Mode.GAME_OVER:
      return stepGameOver(state, dt);
    default:
      // Unknown mode: advance clouds only and keep everything else intact.
      return { state: { ...state, clouds: moveClouds(state.clouds, dt) }, flags: noFlags() };
  }
}

/**
 * Ready step: clouds drift; a flap starts the game with one impulse and Score 0.
 */
function stepReady(state, isFlap, dt, config) {
  const clouds = moveClouds(state.clouds, dt);

  if (!isFlap) {
    // No input: only the parallax clouds advance (Req 9.3). Ghost holds its pose.
    return { state: { ...state, clouds }, flags: noFlags() };
  }

  // First flap of the session: Ready → Playing, Score 0, single upward impulse.
  const ghost = applyFlap(state.ghost, config.physics.flapVelocity);
  const next = {
    ...state,
    mode: Mode.PLAYING,
    ghost,
    pipes: [],
    clouds,
    score: config.scoring.start, // Req 4.1: Score is 0 at the start of a session.
    gameOverSoundPlayed: false,
  };
  return { state: next, flags: { flapApplied: true, enteredGameOver: false } };
}

/**
 * Playing step: physics, pipes, clouds, scoring, then collision → Game_Over.
 *
 * `now` is the optional wall-clock ms used ONLY to stamp `gameOverAtMs` on the
 * Playing→Game_Over transition (for the restart debounce, Req 8.6). When it is not
 * a finite number the stamp is left null and the loop sets it on the edge instead.
 */
function stepPlaying(state, isFlap, dt, config, rng, now) {
  // --- Ghost physics: a flap this step resets vy; otherwise gravity applies. ---
  const ghost = isFlap
    ? applyFlap(state.ghost, config.physics.flapVelocity)
    : applyGravity(state.ghost, config.physics.gravity, dt, config);

  // --- Pipes: scroll left, cull fully-offscreen pairs, then maybe spawn a new one. ---
  let pipes = scrollPipes(state.pipes, config.pipes.speed, dt);
  pipes = cullOffscreen(pipes, config.playArea);
  pipes = maybeSpawn(pipes, config, rng, config.playArea);

  // --- Clouds: parallax drift (each slower than pipes), then wrap recycled ones. ---
  let clouds = moveClouds(state.clouds, dt);
  clouds = wrapClouds(clouds, config.playArea, rng);

  // --- Scoring: credit newly-passed, uncollided pairs exactly once (Req 4.2, 4.3). ---
  const scored = updateScore({ ghost, pipes, score: state.score });
  pipes = scored.pipes;
  const score = scored.score;

  // --- Collision: pipes first (to mark the hit pairs), then ground/ceiling. ---
  const hitPipe = ghostHitsPipe(ghost, pipes, config);
  const hitBounds = ghostHitsBounds(ghost, config);

  if (hitPipe || hitBounds) {
    // Mark every pair the ghost currently overlaps as `collided` so scoring never
    // credits them (Req 4.3). Only matters when the collision is a pipe hit.
    const markedPipes = hitPipe
      ? pipes.map((pair) =>
          ghostHitsPipe(ghost, [pair], config) ? { ...pair, collided: true } : pair
        )
      : pipes;

    const next = {
      ...state,
      mode: Mode.GAME_OVER,
      ghost,
      pipes: markedPipes,
      clouds,
      score,
      // Stamp when Game_Over was entered so the restart debounce (Req 8.6) can
      // measure from this instant. Only when `now` was injected; otherwise the
      // loop stamps it on the `enteredGameOver` edge (see file header note).
      gameOverAtMs: Number.isFinite(now) ? now : state.gameOverAtMs,
    };
    return {
      state: next,
      flags: { flapApplied: isFlap, enteredGameOver: true },
    };
  }

  // No collision: advance normally and stay in Playing.
  const next = { ...state, ghost, pipes, clouds, score };
  return { state: next, flags: { flapApplied: isFlap, enteredGameOver: false } };
}

/**
 * Game_Over step: pipes frozen (no scroll/cull/spawn), clouds may drift.
 *
 * The restart intent (a flap) and its 300 ms debounce + session reset live in the
 * PURE `handleRestart` below; the loop calls that directly on a Game_Over flap
 * rather than routing it through this step. This step only freezes pipes and halts
 * generation per Req 5.5 and 5.6, letting clouds keep drifting.
 */
function stepGameOver(state, dt) {
  // Clouds continue to drift; pipes and ghost are frozen in place.
  const clouds = moveClouds(state.clouds, dt);
  return { state: { ...state, clouds }, flags: noFlags() };
}

/**
 * Handle a restart intent while in the Game_Over mode — the pure 300 ms debounce
 * plus the session reset (Req 8.1–8.6).
 *
 * Behavior:
 *
 * - A non-FLAP intent, or a call made while NOT in Game_Over, is a no-op: the state
 *   is returned unchanged with empty flags. The loop should only call this for a
 *   Game_Over flap, but guarding here keeps the function total and safe to compose.
 *
 * - A FLAP while Game_Over is the restart request (Req 8.1). It is DISCARDED with no
 *   buffering when `now - gameOverAtMs < config.timing.restartDebounceMs` (Req 8.6):
 *   the mode stays Game_Over and nothing about the state changes, so the ignored
 *   input can never later trigger a restart on its own. If `gameOverAtMs` is null
 *   (never stamped), the debounce cannot be evaluated, so the flap is treated as
 *   outside the window and the reset proceeds.
 *
 * - Once at least `restartDebounceMs` has elapsed, the session RESETS (Req 8.2–8.5):
 *   Score → 0, all Pipe_Pairs removed, the ghost repositioned to its configured
 *   start pose (via the pure `createGhostData`), and the mode → Ready. The
 *   High_Score is carried over UNCHANGED (Req 8.5). `gameOverAtMs` is cleared and
 *   `gameOverSoundPlayed` reset so the next Game_Over behaves fresh.
 *
 * Pure: returns a brand-new GameState and never mutates `state`. The wall clock is
 * injected via `now` (ms) — this function never reads it. The returned shape matches
 * `simulateStep` so the loop can treat both uniformly; `flags` are always false here
 * because a restart drives no audio edge (the next flap-to-start does).
 *
 * @param {GameState} state  The current game state (expected to be Game_Over).
 * @param {'FLAP'|null} intent  The input intent for this step.
 * @param {number} now  Wall-clock ms, injected by the loop (no clock read here).
 * @param {object} config  The effective (validated) config.
 * @returns {{ state: GameState, flags: { flapApplied: boolean, enteredGameOver: boolean } }}
 */
export function handleRestart(state, intent, now, config) {
  const isFlap = intent === Intent.FLAP;

  // Only a flap while Game_Over is a restart request; anything else is a no-op.
  if (!isFlap || state.mode !== Mode.GAME_OVER) {
    return { state, flags: noFlags() };
  }

  // Debounce (Req 8.6): discard flaps inside the window with NO buffering. When
  // `gameOverAtMs` was never stamped we cannot measure elapsed time, so we do not
  // discard — the reset proceeds rather than wedging the game in Game_Over.
  const debounceMs = config.timing.restartDebounceMs;
  if (
    Number.isFinite(state.gameOverAtMs) &&
    Number.isFinite(now) &&
    now - state.gameOverAtMs < debounceMs
  ) {
    // Discarded: remain Game_Over, store nothing (no buffered input).
    return { state, flags: noFlags() };
  }

  // Valid restart (Req 8.1–8.5): reset the session, keep the High_Score.
  const next = {
    ...state,
    mode: Mode.READY,
    ghost: createGhostData(config), // Req 8.4: ghost back at its start location.
    pipes: [], // Req 8.3: remove all Pipe_Pairs.
    score: config.scoring.start, // Req 8.2: Score reset to 0.
    highScore: state.highScore, // Req 8.5: High_Score retained unchanged.
    gameOverAtMs: null,
    gameOverSoundPlayed: false,
  };
  return { state: next, flags: noFlags() };
}

// =========================================================================
// GAME LOOP (task 18.1) — the impure fixed-timestep driver.
// =========================================================================
// Everything below is the one impure boundary in this file. It reads the wall
// clock, drives `requestAnimationFrame`, fires audio side effects, and persists
// the High_Score — all the things the pure core above deliberately avoids. The
// pure `simulateStep` / `handleRestart` are called unchanged; this driver only
// orchestrates them, feeds them a buffered intent and an injected `now`, and
// reacts to the edge flags they return.

/**
 * The fixed simulation timestep, in seconds. Each `simulateStep` advances the
 * world by exactly this much so physics/scoring/collision are deterministic and
 * frame-rate independent (design: "Game loop (fixed timestep)").
 */
export const FIXED_DT = 1 / 60;

/**
 * The maximum real frame delta (seconds) folded into the accumulator per frame.
 * A long pause (e.g. a backgrounded tab) is clamped to this so the simulation
 * never fast-forwards through hundreds of steps at once ("spiral of death").
 * See the design's Error Handling row "Long frame delta (tab backgrounded)".
 */
export const MAX_FRAME_DT = 0.25; // 250 ms

/**
 * Seed the initial Ready-state clouds from config (count + distinct speeds).
 *
 * The pure cloud module (`moveClouds` / `wrapClouds`) never creates clouds — it
 * only moves and recycles an existing set — so the loop seeds them at boot. We
 * place `clouds.count.max` clouds spread across the configured parallax speeds
 * (round-robin so at least two distinct layers are present, Req 9.3), staggered
 * horizontally across the play area, with a fixed semi-transparent alpha so the
 * invariant `0 < alpha < 1` holds (Req 9.1, 9.2). `rng` keeps placement
 * deterministic and testable.
 *
 * @param {object} config The effective (validated) config.
 * @param {() => number} rng Float-in-[0,1) source for staggered placement.
 * @returns {Array<{x:number,y:number,width:number,height:number,speed:number,alpha:number}>}
 */
export function seedClouds(config, rng = Math.random) {
  const { playArea, clouds } = config;
  const speeds = Array.isArray(clouds.speeds) && clouds.speeds.length ? clouds.speeds : [40, 70];
  // Seed the configured maximum so the sky looks full; clamped into [1, 5] by
  // config, and never below the configured minimum.
  const count = Math.max(clouds.count.min, clouds.count.max);

  const rand = () => {
    const r = typeof rng === 'function' ? rng() : Math.random();
    return Number.isFinite(r) ? Math.min(0.999999, Math.max(0, r)) : 0;
  };

  const seeded = [];
  for (let i = 0; i < count; i += 1) {
    const width = 60 + Math.round(rand() * 40); // 60..100 px
    const height = 24 + Math.round(rand() * 16); // 24..40 px
    seeded.push({
      // Spread across the play area width so clouds are already present on boot.
      x: Math.round(rand() * playArea.width),
      // Keep clouds in the upper portion of the sky, clear of the ground.
      y: Math.round(rand() * (playArea.height * 0.4)),
      width,
      height,
      speed: speeds[i % speeds.length], // round-robin => >= 2 distinct layers
      alpha: 0.6, // 0 < alpha < 1 (Req 9.2)
    });
  }
  return seeded;
}

/**
 * The impure game-loop driver: a `requestAnimationFrame` tick with a clamped
 * fixed-timestep accumulator, audio edge side effects, high-score persistence,
 * and one render per frame.
 *
 * All browser/wall-clock dependencies are INJECTED so the loop is testable
 * without a real browser:
 *
 *   - `config`   — the effective (validated) config.
 *   - `renderer` — object with `draw(state)`; called once per animation frame.
 *   - `audio`    — AudioManager-like `{ playJump(), playGameOver() }`.
 *   - `store`    — HighScoreStore-like `{ load(): number, save(n): void }`.
 *   - `input`    — optional InputController-like object; the loop subscribes by
 *                  passing its `onFlap` handler, or callers can wire the handler
 *                  themselves and call `loop.onFlap()` directly.
 *   - `rng`      — float-in-[0,1) source for deterministic spawn/wrap/seed.
 *   - `now`      — `() => number` wall-clock ms (defaults to performance.now /
 *                  Date.now); the ONLY clock read, injectable for tests.
 *   - `raf`      — `(cb) => id` frame scheduler (defaults to global
 *                  requestAnimationFrame); injectable for tests.
 *   - `cancelRaf`— `(id) => void` to cancel a scheduled frame (defaults to
 *                  global cancelAnimationFrame).
 */
export class GameLoop {
  /**
   * @param {object} deps Injected dependencies (see class docstring).
   */
  constructor(deps = {}) {
    const {
      config,
      renderer,
      audio,
      store,
      input,
      rng,
      now,
      raf,
      cancelRaf,
    } = deps;

    if (!config) throw new Error('GameLoop requires a config');

    this.config = config;
    this.renderer = renderer || { draw() {} };
    this.audio = audio || { playJump() {}, playGameOver() {} };
    this.store = store || { load: () => 0, save: () => {} };
    this.rng = typeof rng === 'function' ? rng : Math.random;

    // Clock: injectable, defaults to the highest-resolution source available.
    this.now =
      typeof now === 'function'
        ? now
        : typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? () => performance.now()
          : () => Date.now();

    // Frame scheduler: injectable, defaults to the global RAF pair.
    this.raf =
      typeof raf === 'function'
        ? raf
        : typeof requestAnimationFrame === 'function'
          ? (cb) => requestAnimationFrame(cb)
          : (cb) => setTimeout(() => cb(this.now()), 16);
    this.cancelRaf =
      typeof cancelRaf === 'function'
        ? cancelRaf
        : typeof cancelAnimationFrame === 'function'
          ? (id) => cancelAnimationFrame(id)
          : (id) => clearTimeout(id);

    // --- Loop runtime state ---
    this.running = false;
    this.rafId = null;
    this.accumulator = 0; // seconds of unspent real time
    this.lastTime = null; // wall-clock ms of the previous frame
    // Latest buffered FLAP intent for the NEXT fixed step. One intent per step:
    // it is consumed (cleared) by the first step of a frame so a single flap can
    // never apply to more than one fixed step (Req 2.7 — a single impulse).
    this.pendingFlap = false;

    // --- Boot: load persisted High_Score and enter Ready with Score 0. ---
    // The store's load() already parses/clamps into [0, highScoreMax] (Req 6.4,
    // 6.5); a boot in Ready with Score 0 satisfies Req 1.2.
    const highScore = this.store.load();
    this.state = createGameState(config, {
      highScore,
      clouds: seedClouds(config, this.rng),
    });

    // If an InputController was provided, subscribe to its flaps. (It emits a
    // single 'FLAP' intent for keyboard/mouse/touch; we only need to be told a
    // flap happened.) Callers can also drive `onFlap()` directly.
    this.input = input || null;
    this._boundOnFlap = () => this.onFlap();
    if (this.input && typeof this.input === 'object') {
      // Prefer re-pointing the controller's handler at us if it exposes one.
      if (typeof this.input.onFlap === 'function' || 'onFlap' in this.input) {
        this.input.onFlap = this._boundOnFlap;
      }
    }
  }

  /**
   * Record a flap input for the next fixed step. Called by the InputController
   * (or directly). Buffers at most one pending flap; repeated flaps within the
   * same frame collapse to a single intent so one input yields one impulse.
   */
  onFlap() {
    this.pendingFlap = true;
  }

  /** True while the RAF loop is active. */
  isRunning() {
    return this.running;
  }

  /**
   * Begin the `requestAnimationFrame` loop. Idempotent — a second call while
   * already running is a no-op. Renders the initial Ready frame immediately so
   * the play area is visible without waiting a full tick (Req 1.1).
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.now();
    this.accumulator = 0;

    // Paint the boot frame right away (sky/ground/ghost/Score_Display, Req 1.1).
    this._safeDraw();

    const tick = (/* rafTimestamp */) => {
      if (!this.running) return;
      this._frame();
      this.rafId = this.raf(tick);
    };
    this.rafId = this.raf(tick);
  }

  /**
   * Stop the loop and cancel any pending frame. Idempotent. Leaves `state`
   * intact so a subsequent `start()` resumes rendering the same world.
   */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.rafId != null) {
      this.cancelRaf(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Advance one animation frame: compute+clamp the real delta, accumulate, run
   * as many fixed steps as the accumulator affords, then draw once.
   *
   * Separated from the RAF callback so tests can pump frames deterministically.
   */
  _frame() {
    const current = this.now();
    const prev = Number.isFinite(this.lastTime) ? this.lastTime : current;
    this.lastTime = current;

    // Real delta in seconds, clamped so a long pause cannot fast-forward the
    // simulation (spiral-of-death guard, design Error Handling).
    let deltaSec = (current - prev) / 1000;
    if (!Number.isFinite(deltaSec) || deltaSec < 0) deltaSec = 0;
    if (deltaSec > MAX_FRAME_DT) deltaSec = MAX_FRAME_DT;

    this.accumulator += deltaSec;

    // Drain the accumulator one FIXED_DT at a time.
    while (this.accumulator >= FIXED_DT) {
      this._step(current);
      this.accumulator -= FIXED_DT;
    }

    this._safeDraw();
  }

  /**
   * Run exactly one fixed simulation step, consuming at most one buffered flap
   * and reacting to the returned edge flags (audio + high-score persistence).
   *
   * @param {number} now Wall-clock ms for this frame (stamps gameOverAtMs).
   */
  _step(now) {
    // Consume the buffered intent: one flap applies to a single fixed step only.
    const intent = this.pendingFlap ? Intent.FLAP : null;
    this.pendingFlap = false;

    let result;
    if (this.state.mode === Mode.GAME_OVER && intent === Intent.FLAP) {
      // A flap while Game_Over is a restart request: route it through the pure
      // debounce/reset. If still inside the window it is discarded (unchanged
      // state); clouds should keep drifting either way, so when the restart did
      // NOT fire we fall through to a frozen Game_Over step.
      const restart = handleRestart(this.state, intent, now, this.config);
      if (restart.state.mode === Mode.READY) {
        result = restart; // reset fired; skip the frozen Game_Over step.
      } else {
        // Discarded within the window: advance clouds via the normal step with
        // no intent so a buffered flap can never resurrect the restart later.
        result = simulateStep(this.state, null, FIXED_DT, this.config, this.rng, now);
      }
    } else {
      result = simulateStep(this.state, intent, FIXED_DT, this.config, this.rng, now);
    }

    let nextState = result.state;
    const flags = result.flags || {};

    // --- Audio edge: a flap impulse was applied this step (Req 2.5). ---
    if (flags.flapApplied) {
      this._safeAudio(() => this.audio.playJump());
    }

    // --- Audio + persistence edge: entered Game_Over this step. ---
    if (flags.enteredGameOver) {
      // Stamp gameOverAtMs here if simulateStep left it unset (it stamps it when
      // `now` is finite, which it is above — but guard anyway for safety).
      if (!Number.isFinite(nextState.gameOverAtMs)) {
        nextState = { ...nextState, gameOverAtMs: now };
      }

      // Game_Over_Sound exactly once per transition (Req 5.4): the edge flag
      // fires once, and we also latch gameOverSoundPlayed to make it explicit.
      if (!nextState.gameOverSoundPlayed) {
        this._safeAudio(() => this.audio.playGameOver());
        nextState = { ...nextState, gameOverSoundPlayed: true };
      }

      // High_Score persistence (Req 6.1, 6.2): if the final Score beats the
      // stored High_Score, raise and persist it. nextHighScore is monotonic and
      // clamped, so this never lowers the High_Score.
      const raised = nextHighScore(nextState.score, nextState.highScore, this.config.highScoreMax);
      if (raised > nextState.highScore) {
        nextState = { ...nextState, highScore: raised };
        this._safeStore(() => this.store.save(raised));
      }
    }

    this.state = nextState;
  }

  /** Draw the current state, never letting a render error stop the loop. */
  _safeDraw() {
    try {
      this.renderer.draw(this.state);
    } catch {
      // A render failure must not kill the loop; the next frame tries again.
    }
  }

  /** Run an audio side effect, swallowing failures (Req 2.6, 5.7). */
  _safeAudio(fn) {
    try {
      fn();
    } catch {
      // Audio is best-effort; a failure never interrupts gameplay.
    }
  }

  /** Run a storage side effect, swallowing failures (Req 6.3). */
  _safeStore(fn) {
    try {
      fn();
    } catch {
      // Persistence is best-effort; the in-memory High_Score is retained.
    }
  }
}

/**
 * Convenience factory mirroring `new GameLoop(deps)` for callers that prefer a
 * function form. Returns the constructed loop (not yet started).
 *
 * @param {object} deps Injected dependencies (see `GameLoop`).
 * @returns {GameLoop}
 */
export function createGameLoop(deps) {
  return new GameLoop(deps);
}
