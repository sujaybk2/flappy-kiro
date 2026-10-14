// input.js — InputController I/O adapter (Req 2.2, 2.3, 2.4, 2.7, 8.1).
//
// This is a thin I/O boundary: it is the ONE place that touches DOM input events.
// It binds three input sources on a target element (the canvas) and normalizes
// every one of them into a single, source-agnostic `FLAP` intent that it hands to
// the loop:
//
//   - keydown  — the spacebar (`' '` or `'Space'`); preventDefault stops the page
//     from scrolling on space (Req 2.2).
//   - mousedown — the PRIMARY mouse button only (`button === 0`) within the play
//     area (Req 2.3).
//   - touchstart — a tap within the play area; preventDefault suppresses the
//     synthetic mousedown/scroll that a touch would otherwise generate, so a tap
//     is not counted twice (Req 2.4).
//
// All three collapse to the same intent because the three input sources are
// behaviorally identical (Req 2.2–2.4). The controller does NOT interpret the
// intent — the loop decides, by Game_State, whether a FLAP means "start" (Ready,
// Req 2.7), "flap" (Playing), or "restart" (Game_Over, Req 8.1). Keeping that
// decision in the loop is why this adapter emits one undifferentiated intent.
//
// No simulation logic, no audio, no storage here — just DOM binding and
// normalization. Listeners are attached on construction and can be fully removed
// via `detach()` so the controller leaves no handlers behind.

// The single normalized input intent emitted for every input source.
export const FLAP = 'FLAP';

/**
 * Binds keyboard, mouse, and touch inputs on a target element and normalizes
 * them into a single `FLAP` intent delivered to the supplied handler.
 *
 * Usage:
 *   const input = new InputController(canvas, () => loop.onFlap());
 *   // ...later, when tearing down:
 *   input.detach();
 */
export class InputController {
  /**
   * @param {EventTarget} target  The element to bind to (typically the canvas).
   *   keydown is bound on `window` so the spacebar works regardless of focus;
   *   mousedown and touchstart are bound on `target` so clicks/taps only count
   *   within the play area.
   * @param {(intent: string) => void} onFlap  Called with `FLAP` for each flap
   *   input (keyboard space, primary mouse button, or touch tap).
   */
  constructor(target, onFlap) {
    this.target = target;
    this.onFlap = typeof onFlap === 'function' ? onFlap : () => {};
    this.attached = false;

    // Bind handlers once so the same references can be removed in detach().
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);

    this.attach();
  }

  /** Emit a single normalized FLAP intent to the loop. */
  _emitFlap() {
    this.onFlap(FLAP);
  }

  /**
   * keydown: fire only for the spacebar. `event.key` is `' '` on modern browsers
   * and `event.code` is `'Space'`; accept either. preventDefault stops the page
   * from scrolling down when space is pressed (Req 2.2).
   */
  _handleKeyDown(event) {
    if (event.key === ' ' || event.code === 'Space') {
      // Ignore auto-repeat so holding space does not spray flaps every frame.
      if (event.repeat) return;
      event.preventDefault();
      this._emitFlap();
    }
  }

  /**
   * mousedown: fire only for the PRIMARY button (`button === 0`) within the play
   * area. Secondary/middle buttons are ignored (Req 2.3).
   */
  _handleMouseDown(event) {
    if (event.button === 0) {
      this._emitFlap();
    }
  }

  /**
   * touchstart: a tap within the play area. preventDefault suppresses the
   * synthetic mouse event and scrolling a touch would otherwise trigger, so one
   * tap yields exactly one FLAP rather than a touch + a duplicate click (Req 2.4).
   */
  _handleTouchStart(event) {
    // Guard preventDefault: some environments mark touch listeners passive.
    if (typeof event.preventDefault === 'function' && event.cancelable !== false) {
      event.preventDefault();
    }
    this._emitFlap();
  }

  /** Attach all listeners. Idempotent — a second call is a no-op. */
  attach() {
    if (this.attached) return;

    // Keyboard is global so the spacebar works without the canvas being focused.
    const keyTarget =
      (this.target && this.target.ownerDocument && this.target.ownerDocument.defaultView) ||
      (typeof window !== 'undefined' ? window : this.target);
    this._keyTarget = keyTarget;

    if (keyTarget && typeof keyTarget.addEventListener === 'function') {
      keyTarget.addEventListener('keydown', this._onKeyDown);
    }
    if (this.target && typeof this.target.addEventListener === 'function') {
      this.target.addEventListener('mousedown', this._onMouseDown);
      // touchstart must be non-passive so preventDefault can suppress the
      // synthetic mouse/scroll (Req 2.4).
      this.target.addEventListener('touchstart', this._onTouchStart, { passive: false });
    }

    this.attached = true;
  }

  /**
   * Remove every listener this controller added. Idempotent and safe to call
   * even if the target changed. Leaves no handlers bound after it returns.
   */
  detach() {
    if (!this.attached) return;

    if (this._keyTarget && typeof this._keyTarget.removeEventListener === 'function') {
      this._keyTarget.removeEventListener('keydown', this._onKeyDown);
    }
    if (this.target && typeof this.target.removeEventListener === 'function') {
      this.target.removeEventListener('mousedown', this._onMouseDown);
      this.target.removeEventListener('touchstart', this._onTouchStart, { passive: false });
    }

    this.attached = false;
  }
}
