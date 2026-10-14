// render.js — Renderer I/O adapter (Canvas 2D).
//
// This is a thin browser boundary: the ONLY place that touches a Canvas 2D
// context to paint a frame. The pure simulation core never imports this module;
// the Renderer only READS the GameState the loop produces (it never mutates it)
// and draws it.
//
// Draw order per frame (design "Rendering order (per frame)" + task 16.1):
//   1. Blue sky fill across the full play area (Req 9.1; fallback blue, Req 9.9).
//   2. Clouds — 1–5 rounded white shapes, each 0 < alpha < 1, drawn back-to-front
//      (Req 9.1, 9.2).
//   3. Pipes — green fill for every visible pipe: a top pipe from y=0 to gapTop and
//      a bottom pipe from gapTop+gapHeight to the ground top (Req 9.6; fallback
//      green, Req 9.9).
//   4. Ground — a dark strip spanning the full width along the bottom (Req 9.7).
//   5. Ghost — the ghosty.png sprite when loaded, else a placeholder shape filled
//      with the ghost-placeholder fallback color (Req 1.3, 1.4, 9.9).
//   6. Score_Display — white "Score: N | High: M" text (via formatScoreDisplay),
//      textAlign center, horizontally centered and vertically over the Ground
//      strip, within play-area bounds for Score/High values 0..9999
//      (Req 4.4, 4.5, 6.6, 7.1, 7.2, 7.3, 9.8).
//
// Error-handling philosophy (Req 9.9): every asset-dependent draw step is wrapped
// so that a failure in one element (e.g. the sprite drawImage throwing) falls back
// to a solid fill and NEVER stops the remaining elements from rendering. All colors
// and fonts come from the effective `config` — no hardcoded values.
//
// Coordinate convention matches the pure core: logical play-area px, origin
// top-left, y increases downward.

import { formatScoreDisplay } from './display.js';

export class Renderer {
  /**
   * @param {CanvasRenderingContext2D} ctx  The Canvas 2D context to paint on.
   * @param {object} config  The effective (validated) config — single source of
   *   truth for play-area dimensions, colors, and fonts.
   * @param {object} assetLoader  The AssetLoader, exposing `ghostSprite` (an
   *   `Image`) and `ghostLoaded` (boolean). The renderer reads these to decide
   *   whether to draw the sprite or a placeholder.
   */
  constructor(ctx, config, assetLoader) {
    this.ctx = ctx;
    this.config = config;
    this.assetLoader = assetLoader;
  }

  /**
   * Draw one frame for the given GameState. Pure read of `state`; never mutates it.
   *
   * Each element is drawn in the fixed order above. Asset-dependent steps are
   * individually guarded so a single failure falls back and the remaining elements
   * still render (Req 9.9).
   *
   * @param {object} state  The GameState from `src/loop.js`:
   *   `{ mode, ghost, pipes, clouds, score, highScore, assets }`.
   */
  draw(state) {
    const { ctx, config } = this;
    const { width, height } = config.playArea;

    // 1) Blue sky fill across the full play area (Req 9.1; fallback blue, Req 9.9).
    this._safe(() => {
      ctx.fillStyle = config.fallbackColors.sky;
      ctx.fillRect(0, 0, width, height);
    });

    // 2) Clouds — back-to-front: slower (smaller speed, "farther") clouds first so
    //    faster, nearer clouds paint over them. Each is a rounded white shape with
    //    its own 0 < alpha < 1 (Req 9.1, 9.2). globalAlpha is always reset to 1.
    this._drawClouds(Array.isArray(state.clouds) ? state.clouds : []);

    // 3) Pipes — green top + bottom pipes for every visible pair (Req 9.6, 9.9).
    this._drawPipes(Array.isArray(state.pipes) ? state.pipes : []);

    // 4) Ground — dark full-width strip along the bottom (Req 9.7).
    this._safe(() => {
      const groundHeight = config.ground.height;
      ctx.fillStyle = config.display.groundColor;
      ctx.fillRect(0, height - groundHeight, width, groundHeight);
    });

    // 5) Ghost — sprite when loaded, else a placeholder shape (Req 1.3, 1.4, 9.9).
    this._drawGhost(state.ghost, state.assets);

    // 6) Score_Display — white centered text over the ground (Req 7.1, 7.2, 9.8).
    this._drawScore(state.score, state.highScore);
  }

  // --- Element draws ------------------------------------------------------

  /**
   * Draw the parallax clouds back-to-front. Slower clouds (lower speed) are drawn
   * first so faster/nearer clouds overlay them, reinforcing the depth effect. Each
   * cloud paints at its own semi-transparent alpha (Req 9.2); globalAlpha is reset
   * to 1 afterward so later draws are fully opaque.
   *
   * @param {Array<{x:number,y:number,width:number,height:number,speed:number,alpha:number}>} clouds
   */
  _drawClouds(clouds) {
    const { ctx, config } = this;

    // Back-to-front: ascending speed (slowest/"farthest" first). Sort a copy so
    // the source state array is never mutated.
    const ordered = clouds
      .slice()
      .sort((a, b) => (a.speed || 0) - (b.speed || 0));

    for (const cloud of ordered) {
      // Guard each cloud independently so one bad cloud never stops the rest.
      this._safe(() => {
        // Clamp alpha into the semi-transparent open interval (0, 1) defensively.
        const alpha = typeof cloud.alpha === 'number' ? cloud.alpha : 0.5;
        ctx.globalAlpha = Math.max(0.01, Math.min(0.99, alpha));
        ctx.fillStyle = '#ffffff'; // white clouds (Req 9.1)
        this._roundedCloud(cloud.x, cloud.y, cloud.width, cloud.height);
      });
    }

    // Always restore full opacity for subsequent elements (Req 9.9 robustness).
    ctx.globalAlpha = 1;
    void config;
  }

  /**
   * Draw a soft rounded-edge white cloud as a cluster of overlapping circles within
   * the cloud's bounding box. Uses the current fillStyle/globalAlpha set by caller.
   *
   * @param {number} x  Left edge of the cloud bounding box.
   * @param {number} y  Top edge of the cloud bounding box.
   * @param {number} w  Cloud width.
   * @param {number} h  Cloud height.
   */
  _roundedCloud(x, y, w, h) {
    const ctx = this.ctx;
    const r = Math.max(1, h / 2); // puff radius ~ half the cloud height
    const cy = y + h / 2;

    ctx.beginPath();
    // A row of overlapping puffs spanning the width gives soft rounded edges.
    ctx.arc(x + r, cy, r, 0, Math.PI * 2);
    ctx.arc(x + w / 2, y + r, Math.max(1, r * 1.1), 0, Math.PI * 2);
    ctx.arc(x + w - r, cy, r, 0, Math.PI * 2);
    // Fill the central body so the puffs read as one blob.
    ctx.rect(x + r, y + h * 0.25, Math.max(0, w - 2 * r), Math.max(0, h * 0.5));
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw every pipe pair in green (Req 9.6). For each pair: the top pipe runs from
   * y=0 down to `gapTop`; the bottom pipe runs from `gapTop + gapHeight` down to the
   * top of the ground strip. Each pipe is `config.pipes.width` wide. A per-pair
   * guard keeps one bad pair from stopping the rest (Req 9.9).
   *
   * @param {Array<{x:number,width:number,gapTop:number,gapHeight:number}>} pipes
   */
  _drawPipes(pipes) {
    const { ctx, config } = this;
    const groundTop = config.playArea.height - config.ground.height;

    for (const pair of pipes) {
      this._safe(() => {
        ctx.fillStyle = config.fallbackColors.pipe; // green (Req 9.6, 9.9)
        const w = typeof pair.width === 'number' ? pair.width : config.pipes.width;
        const x = pair.x;
        const gapTop = pair.gapTop;
        const gapBottom = pair.gapTop + pair.gapHeight;

        // Top pipe: from the ceiling (y=0) down to the top of the gap.
        if (gapTop > 0) {
          ctx.fillRect(x, 0, w, gapTop);
        }
        // Bottom pipe: from the bottom of the gap down to the ground top.
        if (gapBottom < groundTop) {
          ctx.fillRect(x, gapBottom, w, groundTop - gapBottom);
        }
      });
    }
  }

  /**
   * Draw the ghost: the loaded sprite via drawImage (Req 1.3), or a placeholder
   * shape filled with the ghost-placeholder fallback color when the sprite is not
   * loaded or drawing it fails (Req 1.4, 9.9). Reads `ghostLoaded` from the state's
   * assets flag when present, else from the AssetLoader.
   *
   * @param {{x:number,y:number,width:number,height:number}} ghost
   * @param {{ghostLoaded?:boolean}} [assets]
   */
  _drawGhost(ghost, assets) {
    const { ctx, config, assetLoader } = this;
    if (!ghost) return;

    const loaded =
      assets && typeof assets.ghostLoaded === 'boolean'
        ? assets.ghostLoaded
        : !!(assetLoader && assetLoader.ghostLoaded);

    const sprite = assetLoader ? assetLoader.ghostSprite : null;

    const drewSprite =
      loaded && sprite
        ? this._safe(() => {
            ctx.drawImage(sprite, ghost.x, ghost.y, ghost.width, ghost.height);
          })
        : false;

    // Fallback placeholder shape when the sprite is unavailable or drawing failed.
    if (!drewSprite) {
      this._safe(() => {
        ctx.fillStyle = config.fallbackColors.ghostPlaceholder;
        const r = Math.min(ghost.width, ghost.height) / 2;
        const cx = ghost.x + ghost.width / 2;
        const cy = ghost.y + ghost.height / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      });
    }
  }

  /**
   * Draw the Score_Display: white "Score: N | High: M" text (via
   * formatScoreDisplay), horizontally centered and vertically positioned over the
   * Ground strip (Req 7.1, 7.2, 7.3, 9.8). Reflects `score`/`highScore` each frame
   * (Req 4.5, 7.3). textAlign center keeps the text centered for values 0..9999 so
   * it stays within the play-area bounds (Req 7.2).
   *
   * @param {number} score
   * @param {number} highScore
   */
  _drawScore(score, highScore) {
    const { ctx, config } = this;

    this._safe(() => {
      const text = formatScoreDisplay(score, highScore);

      ctx.fillStyle = config.display.scoreColor; // white (Req 9.8)
      ctx.font = config.display.scoreFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Horizontal center of the play area.
      const cx = config.playArea.width / 2;
      // Vertical center of the ground strip (text sits over the Ground, Req 7.2).
      const groundTop = config.playArea.height - config.ground.height;
      const cy = groundTop + config.ground.height / 2;

      ctx.fillText(text, cx, cy);
    });
  }

  // --- Robustness helper --------------------------------------------------

  /**
   * Run a single draw step, swallowing any error so one failed element never stops
   * the remaining draws (Req 9.9). Returns true if the step completed without
   * throwing, false if it was contained — used by the ghost draw to decide whether
   * the sprite path succeeded or the placeholder is needed.
   *
   * @param {() => void} fn  The draw step.
   * @returns {boolean} Whether the step ran to completion.
   */
  _safe(fn) {
    try {
      fn();
      return true;
    } catch {
      // Contain the failure at the renderer boundary; keep rendering other elements.
      return false;
    }
  }
}
