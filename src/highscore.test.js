// highscore.test.js — unit tests for the pure High_Score logic (Req 6.1, 6.4, 6.5).

import { describe, it, expect } from 'vitest';
import {
  parseHighScore,
  nextHighScore,
  HIGH_SCORE_MAX,
  HIGH_SCORE_MIN,
} from './highscore.js';

describe('parseHighScore', () => {
  it('returns a valid integer within range unchanged', () => {
    expect(parseHighScore(0)).toBe(0);
    expect(parseHighScore(1)).toBe(1);
    expect(parseHighScore(42)).toBe(42);
    expect(parseHighScore(999999)).toBe(999999);
  });

  it('parses canonical decimal integer strings (as read from localStorage)', () => {
    expect(parseHighScore('0')).toBe(0);
    expect(parseHighScore('7')).toBe(7);
    expect(parseHighScore('999999')).toBe(999999);
  });

  it('returns 0 for missing values', () => {
    expect(parseHighScore(undefined)).toBe(0);
    expect(parseHighScore(null)).toBe(0);
    expect(parseHighScore('')).toBe(0);
  });

  it('returns 0 for non-numeric values', () => {
    expect(parseHighScore('abc')).toBe(0);
    expect(parseHighScore(true)).toBe(0);
    expect(parseHighScore(false)).toBe(0);
    expect(parseHighScore({})).toBe(0);
    expect(parseHighScore([])).toBe(0);
    expect(parseHighScore([5])).toBe(0);
  });

  it('returns 0 for NaN and non-finite numbers', () => {
    expect(parseHighScore(NaN)).toBe(0);
    expect(parseHighScore(Infinity)).toBe(0);
    expect(parseHighScore(-Infinity)).toBe(0);
  });

  it('returns 0 for numbers with a fractional part', () => {
    expect(parseHighScore(1.5)).toBe(0);
    expect(parseHighScore(0.1)).toBe(0);
    expect(parseHighScore(999998.9)).toBe(0);
  });

  it('returns 0 for fractional / non-canonical strings', () => {
    expect(parseHighScore('1.0')).toBe(0);
    expect(parseHighScore('1.5')).toBe(0);
    expect(parseHighScore('1e3')).toBe(0);
    expect(parseHighScore('0x10')).toBe(0);
  });

  it('returns 0 for strings with leading/trailing junk or whitespace', () => {
    expect(parseHighScore(' 12')).toBe(0);
    expect(parseHighScore('12 ')).toBe(0);
    expect(parseHighScore('12px')).toBe(0);
    expect(parseHighScore('+5')).toBe(0);
    expect(parseHighScore('--5')).toBe(0);
  });

  it('returns 0 for out-of-range values (below 0 or above max)', () => {
    expect(parseHighScore(-1)).toBe(0);
    expect(parseHighScore('-1')).toBe(0);
    expect(parseHighScore(1000000)).toBe(0);
    expect(parseHighScore('1000000')).toBe(0);
    expect(parseHighScore(HIGH_SCORE_MAX + 1)).toBe(0);
  });

  it('respects an explicit max bound when provided', () => {
    expect(parseHighScore(100, 50)).toBe(0);
    expect(parseHighScore(50, 50)).toBe(50);
    expect(parseHighScore(49, 50)).toBe(49);
  });
});

describe('nextHighScore', () => {
  it('returns the greater of score and highScore', () => {
    expect(nextHighScore(5, 3)).toBe(5);
    expect(nextHighScore(3, 5)).toBe(5);
    expect(nextHighScore(7, 7)).toBe(7);
  });

  it('never decreases below the prior highScore', () => {
    expect(nextHighScore(0, 100)).toBe(100);
    expect(nextHighScore(99, 100)).toBe(100);
  });

  it('clamps the result into [0, max]', () => {
    expect(nextHighScore(1000000, 0)).toBe(HIGH_SCORE_MAX);
    expect(nextHighScore(0, 1000000)).toBe(HIGH_SCORE_MAX);
    expect(nextHighScore(-10, HIGH_SCORE_MIN)).toBe(0);
  });

  it('treats non-finite / non-number inputs as the minimum', () => {
    expect(nextHighScore(NaN, 10)).toBe(10);
    expect(nextHighScore(Infinity, 10)).toBe(10);
    expect(nextHighScore('abc', 10)).toBe(10);
    expect(nextHighScore(NaN, NaN)).toBe(0);
  });

  it('respects an explicit max bound when provided', () => {
    expect(nextHighScore(80, 20, 50)).toBe(50);
    expect(nextHighScore(30, 20, 50)).toBe(30);
  });
});
