// audio.js — AudioManager I/O adapter for the game's sound effects.
//
// This is an I/O ADAPTER at the browser boundary: it owns the two
// HTMLAudioElement instances (Jump_Sound and Game_Over_Sound) and performs the
// only Audio/DOM access in the sound path. Audio/DOM access here is expected —
// the pure simulation core never touches it. The game loop fires these methods
// on the edge flags it returns (flap applied, entered Game_Over).
//
// Design contract (see design.md "AudioManager" and Reqs 2.5, 2.6, 5.4, 5.7):
//
//   - playJump():     restarts `assets/jump.wav` from the beginning (currentTime
//                     reset to 0) so rapid flaps retrigger the sound, and starts
//                     playback immediately (well within the 100 ms budget, Req
//                     2.5). Any failure is swallowed so the flap and all other
//                     gameplay continue uninterrupted (Req 2.6).
//
//   - playGameOver(): plays `assets/game_over.wav`. The "exactly once per
//                     transition" guarantee (Req 5.4) is enforced upstream by
//                     the loop's edge flag — the loop only calls this on the
//                     Playing → Game_Over transition, not on subsequent frames —
//                     so this method just plays the clip. Any failure is
//                     swallowed so the Game_Over transition still completes
//                     (Req 5.7).
//
// Both methods wrap all audio access in try/catch and never throw: a missing,
// blocked, or un-loadable clip must never stall gameplay. Note that
// HTMLAudioElement.play() may return a rejected Promise (e.g. autoplay policy),
// so we also attach a no-op rejection handler to avoid unhandled rejections.

// Default asset paths, relative to the page that loads the game. Kept here so a
// caller can simply `new AudioManager()` and get the shipped clips, while tests
// (and alternate hosting setups) can inject their own elements.
export const DEFAULT_JUMP_SRC = 'assets/jump.wav';
export const DEFAULT_GAME_OVER_SRC = 'assets/game_over.wav';

/**
 * Owns and plays the game's sound effects behind a fail-safe boundary.
 *
 * The constructor accepts either explicit HTMLAudioElement instances (handy for
 * tests and dependency injection) or source paths/URLs it uses to build the
 * elements itself. If neither is provided it falls back to the shipped asset
 * paths. Element construction is itself wrapped so a non-browser or
 * Audio-less environment degrades to a no-op manager rather than throwing.
 *
 * @param {object} [options]
 * @param {HTMLAudioElement} [options.jumpAudio]     Pre-built Jump_Sound element.
 * @param {HTMLAudioElement} [options.gameOverAudio] Pre-built Game_Over_Sound element.
 * @param {string} [options.jumpSrc]     Source path/URL for the Jump_Sound.
 * @param {string} [options.gameOverSrc] Source path/URL for the Game_Over_Sound.
 */
export class AudioManager {
  constructor(options = {}) {
    const {
      jumpAudio,
      gameOverAudio,
      jumpSrc = DEFAULT_JUMP_SRC,
      gameOverSrc = DEFAULT_GAME_OVER_SRC,
    } = options || {};

    this.jumpAudio = jumpAudio != null ? jumpAudio : createAudio(jumpSrc);
    this.gameOverAudio = gameOverAudio != null ? gameOverAudio : createAudio(gameOverSrc);
  }

  /**
   * Play the Jump_Sound for a flap (Req 2.5, 2.6).
   *
   * Resets playback to the start so an already-playing clip retriggers from the
   * beginning, then plays immediately. All access is wrapped so a failure is
   * swallowed and the flap continues (Req 2.6). Returns nothing.
   */
  playJump() {
    safePlayFromStart(this.jumpAudio);
  }

  /**
   * Play the Game_Over_Sound for a Playing → Game_Over transition (Req 5.4, 5.7).
   *
   * The once-per-transition guarantee is handled by the loop's edge flag, so
   * this simply plays the clip from the start. Any failure is swallowed so the
   * transition still completes without the sound (Req 5.7). Returns nothing.
   */
  playGameOver() {
    safePlayFromStart(this.gameOverAudio);
  }
}

// Build an HTMLAudioElement from a source path/URL, swallowing any failure
// (e.g. no Audio constructor outside a browser) and returning null so the
// manager degrades to a silent no-op rather than throwing at construction.
function createAudio(src) {
  try {
    if (typeof Audio === 'function') {
      return new Audio(src);
    }
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const el = document.createElement('audio');
      el.src = src;
      return el;
    }
  } catch {
    // fall through to null — a missing/invalid audio element must never throw
  }
  return null;
}

// Reset an audio element to the start and begin playback, swallowing every
// possible failure (null element, throwing currentTime setter, throwing play(),
// or a rejected play() Promise). Never throws (Req 2.6, 5.7).
function safePlayFromStart(audio) {
  if (audio == null) return;
  try {
    // Restart from the beginning so a rapid retrigger plays again (Req 2.5).
    audio.currentTime = 0;
    const result = audio.play();
    // play() may return a Promise that rejects under autoplay policies; attach a
    // no-op catch so a rejection never surfaces as an unhandled rejection.
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch {
    // Swallow: audio is best-effort and must never interrupt gameplay.
  }
}
