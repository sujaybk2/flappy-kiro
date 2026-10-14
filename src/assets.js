// assets.js — AssetLoader I/O adapter (Req 1.3, 1.4).
//
// This is a thin browser boundary: it is the ONLY place that touches the DOM
// `Image` and `Audio` constructors for the game's media. The pure simulation
// core never imports this module.
//
// Responsibilities:
//   - Load the Ghost sprite from `assets/ghosty.png` (Req 1.3). Expose it as an
//     `Image` and track a `ghostLoaded` boolean flag.
//   - `ghostLoaded` starts `false`, flips to `true` on the image's `onload`, and
//     STAYS `false` on `onerror` (Req 1.4) so the Renderer draws a placeholder
//     ghost shape instead of the sprite and the game still enters Ready.
//   - Load the audio clips `assets/jump.wav` and `assets/game_over.wav` and
//     expose the `Audio` elements for the AudioManager to play.
//   - `load()` returns a Promise that ALWAYS resolves — even when the sprite (or
//     an audio clip) fails to load — so asset loading never blocks the game from
//     reaching the Ready state (Req 1.4).
//
// Error-handling philosophy (matches the design's Error Handling table): a
// failed asset is contained here at the adapter boundary and never rejects or
// throws into the game loop. A sprite failure simply leaves `ghostLoaded = false`.

// Asset paths, relative to the page. Kept here (not in config) because they are
// adapter-local I/O details, consistent with the other adapters.
export const ASSET_PATHS = Object.freeze({
  ghostSprite: 'assets/ghosty.png',
  jumpSound: 'assets/jump.wav',
  gameOverSound: 'assets/game_over.wav',
});

/**
 * Loads and holds the game's media assets (sprite + audio), exposing them for
 * the Renderer and AudioManager. All failures are contained so the game always
 * reaches Ready.
 */
export class AssetLoader {
  /**
   * @param {object} [options] Optional injection points for testing.
   * @param {typeof Image} [options.ImageCtor] Image constructor (defaults to global `Image`).
   * @param {typeof Audio} [options.AudioCtor] Audio constructor (defaults to global `Audio`).
   * @param {object} [options.paths] Override asset paths (defaults to `ASSET_PATHS`).
   */
  constructor(options = {}) {
    const {
      ImageCtor = typeof Image !== 'undefined' ? Image : undefined,
      AudioCtor = typeof Audio !== 'undefined' ? Audio : undefined,
      paths = ASSET_PATHS,
    } = options;

    this._ImageCtor = ImageCtor;
    this._AudioCtor = AudioCtor;
    this._paths = paths;

    // The Ghost sprite Image. Created in `load()`; exposed for the Renderer.
    this.ghostSprite = null;

    // Starts false; becomes true only on a successful sprite `onload` (Req 1.4).
    this.ghostLoaded = false;

    // Audio elements for the AudioManager. Created in `load()`.
    this.jumpSound = null;
    this.gameOverSound = null;

    // Resolves once `load()` has settled (always resolves, never rejects).
    this._loadPromise = null;
  }

  /**
   * Begin loading all assets. Returns a Promise that ALWAYS resolves (never
   * rejects), even if the sprite or an audio clip fails to load, so the game can
   * proceed to Ready regardless (Req 1.4).
   *
   * The resolved value is this `AssetLoader` so callers can read `ghostLoaded`,
   * `ghostSprite`, and the audio elements directly.
   *
   * Idempotent: calling `load()` more than once returns the same Promise.
   *
   * @returns {Promise<AssetLoader>}
   */
  load() {
    if (this._loadPromise) return this._loadPromise;

    const spritePromise = this._loadSprite();
    // Audio is best-effort: kick off loading but never block or fail on it.
    this._loadAudio();

    // Resolve to `this` once the sprite settles (loaded or failed). We wait on
    // the sprite because `ghostLoaded` must be finalized before Ready so the
    // Renderer knows whether to draw the sprite or the placeholder.
    this._loadPromise = spritePromise.then(() => this);
    return this._loadPromise;
  }

  /**
   * Create the sprite Image and wire its load/error handlers. The returned
   * Promise resolves on success AND on error (it never rejects): on `onerror`
   * `ghostLoaded` is left false (Req 1.4).
   *
   * @returns {Promise<void>}
   */
  _loadSprite() {
    return new Promise((resolve) => {
      if (!this._ImageCtor) {
        // No Image available (non-browser env): treat as a failed sprite so the
        // Renderer falls back to the placeholder and the game still proceeds.
        this.ghostLoaded = false;
        resolve();
        return;
      }

      const img = new this._ImageCtor();
      this.ghostSprite = img;

      img.onload = () => {
        this.ghostLoaded = true;
        resolve();
      };

      img.onerror = () => {
        // Sprite failed to load: stay false so the Renderer draws a placeholder
        // and the game still enters Ready (Req 1.4). Do NOT reject.
        this.ghostLoaded = false;
        resolve();
      };

      // Assigning `src` kicks off the load; handlers above settle the Promise.
      img.src = this._paths.ghostSprite;
    });
  }

  /**
   * Create the audio elements. Audio loading is best-effort and never blocks the
   * game: any construction failure is swallowed and the element is left null so
   * the AudioManager (which wraps playback in try/catch) simply plays nothing.
   */
  _loadAudio() {
    this.jumpSound = this._createAudio(this._paths.jumpSound);
    this.gameOverSound = this._createAudio(this._paths.gameOverSound);
  }

  /**
   * Construct a single Audio element for `src`, returning null on any failure or
   * when no Audio constructor is available. The `preload` hint asks the browser
   * to fetch the clip ahead of the first play so a flap's Jump_Sound can start
   * within 100 ms (Req 2.5), but a failure here never interrupts the game.
   *
   * @param {string} src
   * @returns {HTMLAudioElement|null}
   */
  _createAudio(src) {
    if (!this._AudioCtor) return null;
    try {
      const audio = new this._AudioCtor();
      audio.preload = 'auto';
      audio.src = src;
      return audio;
    } catch {
      // Contain the failure at the boundary; the AudioManager tolerates a null.
      return null;
    }
  }
}
