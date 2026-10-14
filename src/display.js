// display.js — pure, DOM-free Score_Display text formatter.
//
// The renderer draws the Score_Display, but the exact text content is produced
// here as a pure function so it can be property-tested in isolation. No DOM, no
// canvas, no I/O.

// Coerce a value to a non-negative base-10 integer with no leading zeros,
// falling back to `fallback` when the value is unavailable or not a usable
// integer. `String(n)` for a safe integer never emits leading zeros.
function toDisplayInteger(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  // Truncate toward zero and never render a negative score/high value.
  const n = Math.trunc(value);
  return n < 0 ? fallback : n;
}

/**
 * Build the Score_Display text in the exact mandated format
 * `"Score: N | High: M"` (Req 7.1), where N is the current Score and M is the
 * High_Score, each rendered as a base-10 integer with no leading zeros.
 *
 * When the High_Score is unavailable or cannot be read (null, undefined, NaN,
 * non-numeric, or otherwise invalid), M is presented as 0 while the current
 * Score continues to display (Req 7.4).
 *
 * @param {number} score     The current Score (non-negative integer).
 * @param {number} highScore The High_Score, or an unavailable/invalid value.
 * @returns {string} The formatted `"Score: N | High: M"` string.
 */
export function formatScoreDisplay(score, highScore) {
  const n = toDisplayInteger(score, 0);
  const m = toDisplayInteger(highScore, 0);
  return `Score: ${n} | High: ${m}`;
}
