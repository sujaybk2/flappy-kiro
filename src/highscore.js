// highscore.js — pure, DOM-free High_Score logic (Req 6.1, 6.4, 6.5).
//
// This module is the single home for the two pure High_Score computations:
//
//   - parseHighScore(raw): coerces a persisted/raw value into a valid High_Score,
//     returning 0 for anything missing, non-numeric, fractional, or out of range.
//   - nextHighScore(score, highScore): the monotonic, clamped running maximum.
//
// Both functions are side-effect free: no DOM, no I/O, no storage access. The
// adapters (HighScoreStore / Renderer) handle localStorage reads/writes and
// rendering; they feed raw values in here and act on the clamped integers out.
//
// Coordinate convention does not apply; these operate purely on scalars.

// The inclusive upper bound for a High_Score (Req 6.1). Kept as a documented
// module constant so these functions stay pure and usable without importing the
// full Config. Mirrors `Config.highScoreMax` (999999); callers may also pass an
// explicit bound where a configured value is preferred.
export const HIGH_SCORE_MAX = 999999;

// The inclusive lower bound for a High_Score.
export const HIGH_SCORE_MIN = 0;

/**
 * Parse a raw (e.g. persisted) value into a valid High_Score integer.
 *
 * Returns the integer when `raw` represents a whole number in [0, max];
 * otherwise returns 0 (Req 6.4, 6.5). Rejected inputs include: missing
 * (null/undefined), non-numeric values, NaN/Infinity, numbers with a
 * fractional part, out-of-range values, and strings with leading/trailing
 * junk (e.g. " 12", "12px", "0x10", "1e3").
 *
 * Accepts either a number or a plain decimal integer string, since values
 * read back from localStorage arrive as strings.
 *
 * @param {*} raw The value to parse (number, string, or anything).
 * @param {number} [max=HIGH_SCORE_MAX] Inclusive upper bound.
 * @returns {number} A valid integer in [0, max], or 0 when `raw` is invalid.
 */
export function parseHighScore(raw, max = HIGH_SCORE_MAX) {
  let n;

  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string') {
    // Only accept a canonical, optionally sign-prefixed decimal integer with no
    // surrounding whitespace or trailing junk. This rejects " 12", "12px",
    // "0x10", "1e3", "1.0", "", and "+5"? — we allow an optional leading '-'
    // (negatives are then rejected by the range check) but no '+'.
    if (!/^-?\d+$/.test(raw)) return 0;
    n = Number(raw);
  } else {
    // null, undefined, boolean, object, array, symbol, bigint, etc.
    return 0;
  }

  // Reject NaN, ±Infinity, and any value with a fractional component.
  if (!Number.isInteger(n)) return 0;

  // Reject out-of-range values (Req 6.5).
  if (n < HIGH_SCORE_MIN || n > max) return 0;

  return n;
}

/**
 * Compute the next High_Score as the clamped running maximum (Req 6.1).
 *
 * Returns `max(score, highScore)` clamped to [0, max]. The result is never less
 * than a valid prior `highScore`, so the High_Score never decreases. Invalid
 * inputs (NaN, non-finite, non-numbers) are treated as the minimum (0) so a
 * garbage reading can never drag the High_Score down.
 *
 * @param {number} score The current Score.
 * @param {number} highScore The stored High_Score.
 * @param {number} [max=HIGH_SCORE_MAX] Inclusive upper bound.
 * @returns {number} The clamped maximum in [0, max].
 */
export function nextHighScore(score, highScore, max = HIGH_SCORE_MAX) {
  const s = toSafe(score);
  const h = toSafe(highScore);
  const best = Math.max(s, h);
  return clamp(best, HIGH_SCORE_MIN, max);
}

// Coerce a value to a finite number, treating anything non-finite as 0 so it
// cannot lower the running maximum.
function toSafe(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : HIGH_SCORE_MIN;
}

// Clamp `value` into the inclusive range [lo, hi].
function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}
