// config.js — single source of truth for all tunable constants/parameters.
// Frozen and immutable; loadConfig(overrides) (added later) returns a NEW validated object.
// This file currently contains the fields the Ghost needs; it grows into the full Config.

export const Config = Object.freeze({
  // --- Play-area dimensions (logical px; canvas scaled to fit) ---
  playArea: { width: 480, height: 640 },
  ground:   { height: 80 },  // px; dark strip along the bottom
  ceilingY: 0,               // top boundary (y)

  // --- Physics ---
  physics: {
    gravity:      1600,  // px/s^2 (downward; y increases downward)
    flapVelocity: -420,  // px/s (fixed upward impulse; negative = up)
    maxFallSpeed: 700,   // px/s (terminal downward velocity cap)
  },

  // --- Ghost ---
  ghost: {
    width:      34,   // px (sprite/draw size)
    height:     24,   // px
    hitboxInset: 4,   // px shrink per side for forgiving collision (visual box > hitbox)
    startXRatio: 0.3, // start x as a fraction of play-area width
    startYRatio: 0.45,// start y as a fraction of play-area height
    maxTiltDeg:  25,  // cosmetic max tilt magnitude (deg), applied at draw time only
    tiltPerVy:   0.06,// deg of tilt per px/s of vy (cosmetic)
    bobAmplitude: 6,  // px vertical idle bob while Ready
    bobSpeed:     3,  // rad/s of the idle bob sine
  },

  // --- Pipe geometry / speed ---
  pipes: {
    speed:         180,                     // px/s  (within [100, 300], Req 3.1)
    width:         60,                      // px (horizontal thickness of each pipe)
    gap:           { min: 100, max: 200 },  // px vertical opening (within [100, 200], Req 3.2)
    spacing:       { min: 150, max: 400 },  // px horizontal distance between pairs (within [150, 400], Req 3.3)
    ceilingMargin: 50,                      // px; gap top kept >= this from Ceiling (>= 50, Req 3.5)
    groundMargin:  50,                      // px; gap bottom kept >= this from Ground (>= 50, Req 3.5)
  },

  // --- Cloud behavior ---
  clouds: {
    speeds: [40, 70],                       // px/s; >= 2 distinct values, each strictly < pipes.speed (Req 9.3, 9.4)
    count:  { min: 1, max: 5 },             // number of clouds present (within [1, 5], Req 9.1)
  },

  // --- Scoring ---
  scoring: {
    start:     0,                           // Score at session start (Req 4.1)
    increment: 1,                           // points added per passed Pipe_Pair (Req 4.2)
  },

  // --- Display (fonts / colors) ---
  display: {
    scoreFont:   '16px monospace',          // CSS font string for the Score_Display text
    scoreColor:  '#ffffff',                 // white Score_Display text (Req 9.8)
    groundColor: '#4a3b2a',                 // dark ground strip color (Req 9.7)
  },

  // --- Fallback fill colors for failed assets (Req 1.4, 9.9) ---
  fallbackColors: {
    sky:              '#87ceeb',            // sky blue (background fill)
    pipe:             '#2e8b2e',            // pipe green (pipe fill)
    ghostPlaceholder: '#ffffff',            // white ghost placeholder (sprite fallback)
  },

  // --- Storage ---
  storage: {
    key: 'flappyKiro.highScore',            // localStorage key for the persisted High_Score
  },

  // --- Timing ---
  timing: {
    restartDebounceMs: 300,                 // ms; flap discarded within this window after Game_Over (Req 8.6)
  },

  // --- Bounds ---
  highScoreMax: 999999,                     // max High_Score value (Req 6.1)
});

// ---------------------------------------------------------------------------
// loadConfig(overrides) — pure boundary function (Req 3.1, 3.2, 3.3, 3.5, 6.1,
// 9.1, 9.4). Deep-merges optional `overrides` onto the frozen default `Config`
// and returns a NEW, fully validated/clamped plain object. It never mutates the
// frozen default and shares no nested references with it (deep clone). The
// simulation core receives this already-validated config, so no core function
// re-checks ranges.
//
// Side-effect free: no DOM, no I/O. Malformed overrides (NaN, strings, null,
// undefined, wrong-typed values) are ignored and the default is retained.
// ---------------------------------------------------------------------------

// Clamp `value` into the inclusive range [lo, hi].
function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

// Return `value` only when it is a finite number; otherwise return `fallback`.
// Used to ignore non-numeric / malformed overrides (NaN, Infinity, strings,
// null, undefined, booleans, objects).
function asNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// Treat a value as a plain object suitable for merging overrides from.
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Produce an effective, validated Config by merging `overrides` onto the frozen
 * default. Returns a fresh plain object; the frozen default is never mutated.
 *
 * @param {object} [overrides] Optional partial config (e.g. parsed URL query).
 * @returns {object} A new, validated/clamped config object.
 */
export function loadConfig(overrides) {
  const o = isObject(overrides) ? overrides : {};

  const d = Config; // frozen default — read only, never mutated

  // Convenience accessors for a nested override section (always an object).
  const oPhysics = isObject(o.physics) ? o.physics : {};
  const oGhost = isObject(o.ghost) ? o.ghost : {};
  const oPipes = isObject(o.pipes) ? o.pipes : {};
  const oPipesGap = isObject(oPipes.gap) ? oPipes.gap : {};
  const oPipesSpacing = isObject(oPipes.spacing) ? oPipes.spacing : {};
  const oClouds = isObject(o.clouds) ? o.clouds : {};
  const oCloudsCount = isObject(oClouds.count) ? oClouds.count : {};
  const oScoring = isObject(o.scoring) ? o.scoring : {};
  const oDisplay = isObject(o.display) ? o.display : {};
  const oFallback = isObject(o.fallbackColors) ? o.fallbackColors : {};
  const oStorage = isObject(o.storage) ? o.storage : {};
  const oTiming = isObject(o.timing) ? o.timing : {};
  const oPlayArea = isObject(o.playArea) ? o.playArea : {};
  const oGround = isObject(o.ground) ? o.ground : {};

  // --- Pipe speed: clamp to [100, 300] (Req 3.1). Needed early because cloud
  //     speeds must be strictly less than it (Req 9.4). ---
  const pipeSpeed = clamp(asNumber(oPipes.speed, d.pipes.speed), 100, 300);

  // --- Gap min/max: each clamped to [100, 200] (Req 3.2). ---
  const gapMin = clamp(asNumber(oPipesGap.min, d.pipes.gap.min), 100, 200);
  const gapMax = clamp(asNumber(oPipesGap.max, d.pipes.gap.max), 100, 200);

  // --- Spacing min/max: each clamped to [150, 400] (Req 3.3). ---
  const spacingMin = clamp(asNumber(oPipesSpacing.min, d.pipes.spacing.min), 150, 400);
  const spacingMax = clamp(asNumber(oPipesSpacing.max, d.pipes.spacing.max), 150, 400);

  // --- Ceiling / ground margins: clamped to >= 50 (Req 3.5). ---
  const ceilingMargin = Math.max(50, asNumber(oPipes.ceilingMargin, d.pipes.ceilingMargin));
  const groundMargin = Math.max(50, asNumber(oPipes.groundMargin, d.pipes.groundMargin));

  // --- Cloud speeds: each strictly less than the (already-clamped) pipe speed,
  //     while preserving >= 2 DISTINCT values (Req 9.3, 9.4). ---
  const cloudSpeeds = resolveCloudSpeeds(oClouds.speeds, d.clouds.speeds, pipeSpeed);

  // --- Cloud count min/max: each clamped to [1, 5] (Req 9.1). ---
  const cloudCountMin = clamp(asNumber(oCloudsCount.min, d.clouds.count.min), 1, 5);
  const cloudCountMax = clamp(asNumber(oCloudsCount.max, d.clouds.count.max), 1, 5);

  // --- High-score max: clamped to 999999 (Req 6.1). ---
  const highScoreMax = clamp(asNumber(o.highScoreMax, d.highScoreMax), 0, 999999);

  // Pass-through numeric fields (no requirement-mandated range) still ignore
  // malformed overrides by falling back to the default.
  return {
    playArea: {
      width: asNumber(oPlayArea.width, d.playArea.width),
      height: asNumber(oPlayArea.height, d.playArea.height),
    },
    ground: { height: asNumber(oGround.height, d.ground.height) },
    ceilingY: asNumber(o.ceilingY, d.ceilingY),

    physics: {
      gravity: asNumber(oPhysics.gravity, d.physics.gravity),
      flapVelocity: asNumber(oPhysics.flapVelocity, d.physics.flapVelocity),
      maxFallSpeed: asNumber(oPhysics.maxFallSpeed, d.physics.maxFallSpeed),
    },

    ghost: {
      width: asNumber(oGhost.width, d.ghost.width),
      height: asNumber(oGhost.height, d.ghost.height),
      hitboxInset: asNumber(oGhost.hitboxInset, d.ghost.hitboxInset),
      startXRatio: asNumber(oGhost.startXRatio, d.ghost.startXRatio),
      startYRatio: asNumber(oGhost.startYRatio, d.ghost.startYRatio),
      maxTiltDeg: asNumber(oGhost.maxTiltDeg, d.ghost.maxTiltDeg),
      tiltPerVy: asNumber(oGhost.tiltPerVy, d.ghost.tiltPerVy),
      bobAmplitude: asNumber(oGhost.bobAmplitude, d.ghost.bobAmplitude),
      bobSpeed: asNumber(oGhost.bobSpeed, d.ghost.bobSpeed),
    },

    pipes: {
      speed: pipeSpeed,
      width: asNumber(oPipes.width, d.pipes.width),
      gap: { min: gapMin, max: gapMax },
      spacing: { min: spacingMin, max: spacingMax },
      ceilingMargin,
      groundMargin,
    },

    clouds: {
      speeds: cloudSpeeds,
      count: { min: cloudCountMin, max: cloudCountMax },
    },

    scoring: {
      start: asNumber(oScoring.start, d.scoring.start),
      increment: asNumber(oScoring.increment, d.scoring.increment),
    },

    display: {
      scoreFont: typeof oDisplay.scoreFont === 'string' ? oDisplay.scoreFont : d.display.scoreFont,
      scoreColor: typeof oDisplay.scoreColor === 'string' ? oDisplay.scoreColor : d.display.scoreColor,
      groundColor: typeof oDisplay.groundColor === 'string' ? oDisplay.groundColor : d.display.groundColor,
    },

    fallbackColors: {
      sky: typeof oFallback.sky === 'string' ? oFallback.sky : d.fallbackColors.sky,
      pipe: typeof oFallback.pipe === 'string' ? oFallback.pipe : d.fallbackColors.pipe,
      ghostPlaceholder:
        typeof oFallback.ghostPlaceholder === 'string'
          ? oFallback.ghostPlaceholder
          : d.fallbackColors.ghostPlaceholder,
    },

    storage: {
      key: typeof oStorage.key === 'string' ? oStorage.key : d.storage.key,
    },

    timing: {
      restartDebounceMs: asNumber(oTiming.restartDebounceMs, d.timing.restartDebounceMs),
    },

    highScoreMax,
  };
}

// Resolve the effective cloud speeds (Req 9.3, 9.4): start from overrides when
// they are a usable array, else the defaults; drop malformed entries; clamp
// every speed strictly below `pipeSpeed`; then guarantee >= 2 DISTINCT values.
// If clamping collapses the set to fewer than 2 distinct speeds, derive two
// distinct values below the pipe speed (fractions of pipe speed) so the
// parallax invariant always holds.
function resolveCloudSpeeds(overrideSpeeds, defaultSpeeds, pipeSpeed) {
  const source = Array.isArray(overrideSpeeds) ? overrideSpeeds : defaultSpeeds;

  // Largest representable value strictly below pipeSpeed is unbounded in the
  // reals, so we clamp into [1, pipeSpeed) using a small epsilon ceiling.
  const upper = pipeSpeed - 1; // strictly less than pipeSpeed; keeps integers clean

  const cleaned = [];
  for (const raw of source) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      // Keep speeds positive and strictly below the pipe speed.
      const clamped = clamp(raw, 1, Math.max(1, upper));
      cleaned.push(clamped);
    }
  }

  // Preserve order while collecting the distinct values.
  const distinct = [];
  for (const s of cleaned) {
    if (!distinct.includes(s)) distinct.push(s);
  }

  if (distinct.length >= 2) return distinct;

  // Fewer than two distinct values survived — derive two distinct fractions of
  // the pipe speed, both strictly below it (Req 9.3, 9.4). With pipeSpeed in
  // [100, 300] these are always distinct positive values below pipeSpeed.
  const slow = Math.max(1, pipeSpeed * 0.25);
  const fast = Math.max(slow + 1, pipeSpeed * 0.5);
  return [slow, fast];
}
