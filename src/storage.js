// storage.js — HighScoreStore: the localStorage I/O adapter for the High_Score
// (Req 6.2, 6.3, 6.4, 6.5).
//
// This is the only module that touches `localStorage`. It keeps an in-memory
// High_Score so the game always has a usable value even when storage is
// unavailable (private mode, disabled cookies, quota exceeded). The pure
// parsing/clamping logic lives in `highscore.js`; this adapter simply feeds raw
// strings into `parseHighScore` on load and writes `String(n)` on save.
//
// Every storage access is wrapped in try/catch so a throwing `getItem` or
// `setItem` never propagates to the caller and never interrupts play — the
// in-memory value is retained instead (Req 6.3).

import { parseHighScore } from './highscore.js';

/**
 * Adapter around browser `localStorage` for persisting the High_Score.
 *
 * Construction takes the effective (already-validated) config so the storage
 * key and the inclusive max come from a single source of truth.
 */
export class HighScoreStore {
  /**
   * @param {object} config The effective config from `loadConfig`.
   */
  constructor(config) {
    this.key = config.storage.key;
    this.max = config.highScoreMax;
    // In-memory High_Score; retained verbatim when storage is unavailable.
    this.highScore = 0;
  }

  /**
   * Read the persisted High_Score from `localStorage`, parse it, and adopt it
   * as the in-memory value (Req 6.4, 6.5).
   *
   * Returns the parsed integer in [0, max]. A missing, non-numeric, fractional,
   * or out-of-range value — or any thrown storage error — yields 0 and leaves
   * the in-memory value at 0 (Req 6.5).
   *
   * @returns {number} The loaded High_Score in [0, max], or 0 when invalid.
   */
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      this.highScore = parseHighScore(raw, this.max);
    } catch {
      // Storage unavailable (disabled/private mode); keep the in-memory value.
      this.highScore = 0;
    }
    return this.highScore;
  }

  /**
   * Persist `n` as the new High_Score (Req 6.2).
   *
   * Updates the in-memory value first, then attempts to write `String(n)` to
   * `localStorage`. A throwing `setItem` (quota exceeded, storage disabled) is
   * swallowed so the in-memory value is retained and the error never reaches
   * the caller or interrupts play (Req 6.3).
   *
   * @param {number} n The High_Score to persist.
   */
  save(n) {
    this.highScore = n;
    try {
      localStorage.setItem(this.key, String(n));
    } catch {
      // Persist failed; the in-memory High_Score (already updated) is retained
      // and gameplay continues uninterrupted.
    }
  }
}
