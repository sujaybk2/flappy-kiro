// main.js — the ES-module entry point that wires the whole game together.
//
// This is the top-level composition root (Req 1.1, 1.2). It is deliberately thin:
// it reads no game rules itself and reimplements nothing — it only constructs the
// effective config, resolves the canvas + 2D context, instantiates each adapter
// (AssetLoader, AudioManager, HighScoreStore, InputController, Renderer) and the
// GameLoop, wires input to the loop, and calls `start()`. All physics, scoring,
// rendering, audio, and persistence live in their own modules; this file is the
// only place that assembles them.
//
// Boot order (why it is this order):
//   1. Build the effective, validated config via `loadConfig` (optionally from
//      URL query params, a thin boundary). Everything downstream is sized/colored
//      from this single source of truth.
//   2. Resolve the canvas, size its backing store to the logical play area (once,
//      accounting for devicePixelRatio), and get the 2D context.
//   3. Kick off asset loading. `AssetLoader.load()` ALWAYS resolves — even if the
//      sprite fails — so we AWAIT it before building the audio manager (so the
//      loaded <audio> elements are ready) and the renderer (so `ghostLoaded` is
//      finalized). A sprite failure still proceeds to Ready (Req 1.4): the
//      renderer draws a placeholder. The play area still appears within 3 s
//      (Req 1.1) because the loop paints the boot frame immediately on `start()`.
//   4. Instantiate AudioManager (with the loaded audio elements), HighScoreStore,
//      Renderer, InputController (bound to the canvas), and the GameLoop with all
//      deps wired, then start the loop.
//
// Buildless ESM: this module is loaded via `<script type="module">` and imports
// the other `src/*.js` modules directly — no bundler. `main()` is exported so a
// test (jsdom) can call it explicitly, and auto-run is guarded so merely importing
// this module in a test environment does not kick off a RAF loop or crash.

import { loadConfig } from './config.js';
import { AssetLoader } from './assets.js';
import { AudioManager } from './audio.js';
import { HighScoreStore } from './storage.js';
import { InputController } from './input.js';
import { Renderer } from './render.js';
import { GameLoop } from './loop.js';

/** Default id looked for on the page's canvas element. */
export const CANVAS_ID = 'game';

/**
 * Parse the current URL's query string into a nested config-overrides object.
 *
 * This is a THIN I/O boundary (not property-tested): it only shuttles raw query
 * values into the shape `loadConfig` already validates and clamps. Supported keys
 * use dotted paths so a nested field can be set, e.g.
 * `?pipes.speed=220&pipes.gap.min=120&clouds.count.max=3`. Values are passed
 * through as numbers when they parse as finite numbers, else as the raw string;
 * `loadConfig` ignores anything malformed and keeps the default, so we do not
 * validate here. A missing/unavailable `location` yields no overrides.
 *
 * @param {string} [search] The query string (defaults to `location.search`).
 * @returns {object} A nested overrides object suitable for `loadConfig`.
 */
export function parseQueryOverrides(search) {
  const overrides = {};
  let query = search;
  if (query == null) {
    query = typeof location !== 'undefined' && location ? location.search : '';
  }
  if (!query || typeof query !== 'string') return overrides;

  let params;
  try {
    params = new URLSearchParams(query);
  } catch {
    return overrides;
  }

  for (const [key, rawValue] of params) {
    if (!key) continue;
    // Numbers win when the value parses cleanly; otherwise keep the raw string
    // (loadConfig ignores non-numeric values for numeric fields).
    const num = Number(rawValue);
    const value = rawValue !== '' && Number.isFinite(num) ? num : rawValue;

    // Walk/create the nested path (e.g. "pipes.gap.min") and set the leaf.
    const path = key.split('.');
    let node = overrides;
    for (let i = 0; i < path.length - 1; i += 1) {
      const seg = path[i];
      if (typeof node[seg] !== 'object' || node[seg] === null) node[seg] = {};
      node = node[seg];
    }
    node[path[path.length - 1]] = value;
  }

  return overrides;
}

/**
 * Resolve the canvas element to render into, sized to the logical play area.
 *
 * Resolution order: an element with id `CANVAS_ID`, else the first `<canvas>` on
 * the page, else a freshly created canvas appended to `<body>` (so opening a
 * bare page still runs). The backing-store resolution is set to the logical play
 * area multiplied by `devicePixelRatio` for crisp pixels, with the 2D context
 * scaled by the same ratio ONCE here (never per frame) so all downstream draws use
 * logical play-area coordinates. CSS sizing (fit-to-viewport) is left to
 * `style.css` (task 18.3); we only set the logical/backing dimensions.
 *
 * @param {object} config The effective config (for play-area dimensions).
 * @param {Document} [doc] The document to query (defaults to the global `document`).
 * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }}
 */
export function resolveCanvas(config, doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) {
    throw new Error('main: no document available to resolve a canvas');
  }

  let canvas =
    (typeof d.getElementById === 'function' && d.getElementById(CANVAS_ID)) || null;
  if (!canvas && typeof d.querySelector === 'function') {
    canvas = d.querySelector('canvas');
  }
  if (!canvas) {
    canvas = d.createElement('canvas');
    canvas.id = CANVAS_ID;
    if (d.body && typeof d.body.appendChild === 'function') {
      d.body.appendChild(canvas);
    }
  }

  const { width, height } = config.playArea;

  // devicePixelRatio applied once at setup for crisp pixels (visual-design std).
  const dpr =
    typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
      ? Math.max(1, window.devicePixelRatio)
      : 1;

  // Backing store resolution = logical size * dpr; logical drawing stays in
  // play-area px because we scale the context by dpr below.
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('main: could not get a 2D rendering context');
  }
  // Scale once so every draw call uses logical play-area coordinates (0..width,
  // 0..height) regardless of the dpr-inflated backing store.
  if (dpr !== 1 && typeof ctx.setTransform === 'function') {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return { canvas, ctx };
}

/**
 * Compose and start the game. Returns the live pieces so a caller/test can
 * inspect or stop them.
 *
 * The returned object exposes `loop` (the started GameLoop), plus the `renderer`,
 * `audio`, `store`, `input`, `assetLoader`, `config`, and `canvas` so a test can
 * assert on them or tear down (`loop.stop()`, `input.detach()`).
 *
 * @param {object} [options]
 * @param {Document} [options.document] Document to resolve the canvas from.
 * @param {object} [options.overrides] Explicit config overrides; when omitted,
 *   overrides are read from the URL query string.
 * @returns {Promise<{
 *   config: object, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D,
 *   assetLoader: AssetLoader, audio: AudioManager, store: HighScoreStore,
 *   renderer: Renderer, input: InputController, loop: GameLoop
 * }>}
 */
export async function main(options = {}) {
  const { document: doc, overrides } = options;

  // 1) Effective, validated config (optionally from URL query params).
  const effectiveOverrides =
    overrides !== undefined ? overrides : parseQueryOverrides();
  const config = loadConfig(effectiveOverrides);

  // 2) Canvas + 2D context, sized to the logical play area.
  const { canvas, ctx } = resolveCanvas(config, doc);

  // 3) Load assets. load() always resolves (even on sprite failure, Req 1.4), so
  //    awaiting it finalizes `ghostLoaded` and readies the <audio> elements
  //    before we build the audio manager and renderer.
  const assetLoader = new AssetLoader();
  await assetLoader.load();

  // 4) Adapters + loop, wired together.
  const audio = new AudioManager({
    jumpAudio: assetLoader.jumpSound,
    gameOverAudio: assetLoader.gameOverSound,
  });
  const store = new HighScoreStore(config);
  const renderer = new Renderer(ctx, config, assetLoader);

  const loop = new GameLoop({
    config,
    renderer,
    audio,
    store,
    rng: Math.random,
  });

  // Input binds to the canvas; every flap source normalizes to one FLAP intent
  // which we forward to the loop's buffered onFlap().
  const input = new InputController(canvas, () => loop.onFlap());

  // 5) Start the RAF loop (paints the boot frame immediately, Req 1.1).
  loop.start();

  return { config, canvas, ctx, assetLoader, audio, store, renderer, input, loop };
}

/**
 * Auto-run `main()` when loaded in a real browser, guarded so importing this
 * module under a test runner (jsdom) does NOT start a RAF loop or throw.
 *
 * We run only when a `document` exists AND a `window` is present (a browser or a
 * jsdom page that explicitly loads the module via a script), and we defer to
 * `DOMContentLoaded` if the DOM is still parsing so the canvas is available. Any
 * failure is logged, not thrown, so a boot error never produces an uncaught
 * module-load exception.
 */
function autoRun() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const boot = () => {
    Promise.resolve()
      .then(() => main())
      .catch((err) => {
        // Surface the error without throwing out of module evaluation.
        if (typeof console !== 'undefined' && console.error) {
          console.error('Flappy Kiro failed to start:', err);
        }
      });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}

// A test harness sets `globalThis.__FLAPPY_KIRO_NO_AUTORUN__ = true` BEFORE
// importing this module to opt out of the auto-run side effect and drive `main()`
// itself. In a normal browser load the flag is absent and the game boots.
if (typeof globalThis === 'undefined' || !globalThis.__FLAPPY_KIRO_NO_AUTORUN__) {
  autoRun();
}
