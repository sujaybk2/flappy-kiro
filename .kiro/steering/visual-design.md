---
inclusion: fileMatch
fileMatchPattern: '*.{js,mjs,css}'
---

# Flappy Kiro Visual Design Standards

These standards govern how Flappy Kiro draws to the screen. They build on the design: an HTML5
Canvas 2D renderer that draws from the authoritative `GameState`, interpolated at render time,
with every color, font, and dimension sourced from `config.js`. Rendering is an I/O adapter — it
reads state and draws; it never mutates simulation state.

Coordinate convention: logical play-area pixels, origin at top-left, `y` increases downward.
Keep positions in floats through interpolation, then round to integers at draw time for crisp
retro pixels.

## 1. Canvas Setup & Draw Order

- **Fixed logical resolution, CSS-scaled.** Set the canvas backing store to `config.playArea`
  dimensions; scale to the viewport with CSS. Apply `devicePixelRatio` once at setup, never per
  frame.
- **Clear or fully repaint each frame.** The sky fill covers the whole play area, so an explicit
  `clearRect` is optional, but never rely on stale pixels.
- **Strict back-to-front draw order (per the design):**
  1. Blue sky fill across the full play area.
  2. Clouds — semi-transparent, parallax, back layer first.
  3. Pipes — green, every visible pair.
  4. Ground — dark strip spanning the full width along the bottom.
  5. Ghost — sprite or placeholder.
  6. Score_Display — white text centered over the ground.
- **Group draws by style.** Set `fillStyle`/`font`/`globalAlpha` only when the value changes; draw
  all items sharing a style together to minimize state churn. Always restore `globalAlpha = 1`
  after translucent passes.
- **Minimize save/restore.** Only wrap `save()`/`restore()` around transformed or alpha-adjusted
  draws (clouds, a tilted ghost); avoid them for flat fills.

## 2. Sprite Rendering Patterns

- **Load once, draw many.** Decode `ghosty.png` during boot via `AssetLoader`; never load inside
  the loop. Hold a `ghostLoaded` flag on state.
- **Draw by bounding box.** Render the ghost at its interpolated top-left with its configured
  width/height. Round coordinates at the final step:

  ```javascript
  // render.js — sprite with graceful fallback
  function drawGhost(ctx, ghost, assets, config, alpha) {
    const x = Math.round(lerp(ghost.prevX, ghost.x, alpha));
    const y = Math.round(lerp(ghost.prevY, ghost.y, alpha));
    if (assets.ghostLoaded) {
      ctx.drawImage(assets.ghost, x, y, ghost.width, ghost.height);
    } else {
      ctx.fillStyle = config.fallbackColors.ghostPlaceholder;
      ctx.fillRect(x, y, ghost.width, ghost.height); // placeholder shape
    }
  }
  ```

- **Fallback for every asset.** If a visual asset fails, draw a solid fill that approximates it
  (sky blue, pipe green, white ghost placeholder) and keep rendering everything else. Fallback
  colors come from `config.fallbackColors`.
- **Crisp pixels.** For a pixel-art look, set `ctx.imageSmoothingEnabled = false` once at setup.
  Keep sprite dimensions integer-aligned.
- **Visual box may exceed hitbox.** The drawn sprite can be a few pixels larger than the collision
  box (see physics `hitboxInset`); rendering uses the sprite size, collision uses the inset box.
  Never let a cosmetic transform change the collision box.

## 3. Animation Systems

- **Render-time interpolation only.** Draw at `prev + (curr - prev) * alpha` where
  `alpha = accumulator / FIXED_DT`. Interpolated values are never fed back into simulation.
- **Ghost tilt (cosmetic).** Rotate the ghost toward its velocity — nose-up on a flap, nose-down
  as it falls — as a pure function of `vy`, clamped to a configured max angle. Apply with
  `translate` to the sprite center, `rotate`, draw, then `restore`. Tilt never affects physics or
  collision.
- **Idle bob in Ready.** While Ready, apply a small sine-based vertical bob for life, driven by an
  accumulated animation clock, not by physics. It stops the instant Playing begins.
- **Parallax clouds.** Cloud layers move at distinct constant speeds, all strictly slower than
  pipe speed, drawn with `0 < globalAlpha < 1`. Motion is linear (no easing). Wrap by repositioning
  the same cloud object beyond the right edge; keep 1-5 clouds present.
- **Keep animation data on state.** Store `prevX/prevY`, animation clocks, and tilt inputs on the
  model so the renderer stays a pure function of state + alpha. No hidden renderer-local timers
  that could desync from the fixed step.
- **Score pop (optional).** On score increase, a brief scale pulse on the score text is allowed,
  driven by a decaying animation timer on state; rebuild the score string only when the score
  changes.

## 4. Particle Effect Guidelines

Particles are purely cosmetic. They must never affect physics, scoring, collision, or the
authoritative `GameState` used for those systems.

- **Separate, capped pool.** Keep particles in their own fixed-size pool (e.g. a few dozen max),
  pre-allocated at setup and recycled. Never allocate particles inside the loop; when the pool is
  full, skip spawning rather than growing it.
- **Simple kinematics.** Each particle has position, velocity, lifetime, size, color, and alpha.
  Update with the same `FIXED_DT` step as the sim for consistency, but in a cosmetic layer that
  can be skipped entirely without changing gameplay.
- **Suggested effects (all optional):**
  - Flap puff: 2-4 small translucent particles trailing below the ghost on each flap.
  - Collision burst: a short one-shot burst at the impact point when entering Game_Over.
  - Score sparkle: a tiny twinkle near the score when a point is earned.
- **Fade and die.** Decrease `alpha` over `lifetime`; return the particle to the pool when
  lifetime reaches zero. Draw with additive-free standard alpha to match the soft retro look.
- **Draw layer.** Render particles above pipes and the ghost but below the Score_Display, unless
  an effect is explicitly tied to the score (then just under the text). Restore `globalAlpha = 1`
  after the particle pass.
- **Config-driven and disableable.** Particle counts, lifetimes, sizes, and colors live in
  `config.js` (e.g. a `particles` section). Gate the whole system behind a `config` flag so it can
  be turned off for performance or testing without touching gameplay code.
- **Performance budget.** Particles are the first thing to cut if the frame budget is tight. Use
  `fillRect` or a single cached small shape; avoid per-particle gradients, shadows, or `save`/
  `restore` churn.

## 5. Color & Typography

- **All colors from config.** Sky blue, pipe green, dark ground, white score text, and all
  fallback colors live in `config.display` / `config.fallbackColors`. No hardcoded hex in render
  code.
- **Score text.** White, centered horizontally, positioned over the ground strip, format
  `"Score: N | High: M"`. Must stay within play-area bounds for values 0-9999. Set `textAlign`
  and `font` from config.
- **Readability over flourish.** Keep the retro aesthetic from the reference screenshot: soft
  rounded clouds, flat green pipes, simple ground. Avoid heavy shadows or gradients that fight the
  flat look or cost frame time.
