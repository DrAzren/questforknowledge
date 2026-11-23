/**
 * Unified input: keyboard on desktop, virtual joystick + buttons on touch screens.
 * The game reads one small state object, so gameplay code never cares which
 * device the child is using.
 */

export interface InputState {
  /** Stick/keys: x is right(+)/left(-), y is forward(+)/back(-). Length 0..1. */
  moveX: number;
  moveY: number;
  run: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  actionPressed: boolean;
}

const KEY_MAP: Record<string, string> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyE: 'action', Enter: 'action',
};

export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;
  private actionQueued = false;
  private stickX = 0;
  private stickY = 0;
  private touchJump = false;
  private touchRun = false;
  private stickPointer: number | null = null;
  private stickEl: HTMLElement | null = null;
  private knobEl: HTMLElement | null = null;
  isTouch = false;
  /** Number-key answers (1-4) are forwarded here for quiz panels. */
  onNumberKey: ((n: number) => void) | null = null;
  onPauseKey: (() => void) | null = null;
  /** R replays the spoken question. */
  onReplayKey: (() => void) | null = null;

  constructor(private root: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.buildTouchControls();
    this.setTouchVisible(this.isTouch);
    // If a touch arrives on a device we thought was desktop, show the controls.
    window.addEventListener('touchstart', () => {
      if (!this.isTouch) {
        this.isTouch = true;
        this.setTouchVisible(true);
      }
    }, { passive: true });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const k = KEY_MAP[e.code];
    if (k) {
      if (k === 'jump' && !this.keys.has('jump')) this.jumpQueued = true;
      if (k === 'action' && !this.keys.has('action')) this.actionQueued = true;
      this.keys.add(k);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    }
    if (/^(Digit|Numpad)[1-4]$/.test(e.code) && this.onNumberKey) {
      this.onNumberKey(Number(e.code.slice(-1)));
    }
    if ((e.code === 'Escape' || e.code === 'KeyP') && this.onPauseKey) this.onPauseKey();
    if (e.code === 'KeyR' && !e.repeat && this.onReplayKey) this.onReplayKey();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const k = KEY_MAP[e.code];
    if (k) this.keys.delete(k);
  };

  private buildTouchControls(): void {
    const wrap = document.createElement('div');
    wrap.id = 'touch-controls';
    wrap.innerHTML = `
      <div id="stick" aria-label="Kayu bedik"><div id="stick-knob"></div></div>
      <button id="btn-run" class="touch-btn small" aria-label="Lari">🏃</button>
      <button id="btn-jump" class="touch-btn" aria-label="Lompat">⬆</button>`;
    this.root.appendChild(wrap);
    this.stickEl = wrap.querySelector('#stick');
    this.knobEl = wrap.querySelector('#stick-knob');
    const stick = this.stickEl!;

    const updateStick = (e: PointerEvent): void => {
      const rect = stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const max = rect.width / 2;
      let dx = (e.clientX - cx) / max;
      let dy = (e.clientY - cy) / max;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.stickX = dx;
      this.stickY = -dy;
      if (this.knobEl) this.knobEl.style.transform = `translate(${dx * max * 0.55}px, ${dy * max * 0.55}px)`;
    };
    const releaseStick = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.stickX = this.stickY = 0;
      if (this.knobEl) this.knobEl.style.transform = 'translate(0px, 0px)';
    };
    stick.addEventListener('pointerdown', (e) => {
      this.stickPointer = e.pointerId;
      try {
        stick.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; the stick still works without it */
      }
      updateStick(e);
      e.preventDefault();
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickPointer) updateStick(e);
    });
    stick.addEventListener('pointerup', releaseStick);
    stick.addEventListener('pointercancel', releaseStick);

    const jump = wrap.querySelector<HTMLElement>('#btn-jump')!;
    jump.addEventListener('pointerdown', (e) => {
      this.touchJump = true;
      this.jumpQueued = true;
      e.preventDefault();
    });
    const jumpUp = (): void => { this.touchJump = false; };
    jump.addEventListener('pointerup', jumpUp);
    jump.addEventListener('pointercancel', jumpUp);
    jump.addEventListener('pointerleave', jumpUp);

    const run = wrap.querySelector<HTMLElement>('#btn-run')!;
    run.addEventListener('pointerdown', (e) => {
      // Run is a toggle on touch: holding two buttons plus a stick is too hard for small hands.
      this.touchRun = !this.touchRun;
      run.classList.toggle('on', this.touchRun);
      e.preventDefault();
    });
  }

  setTouchVisible(v: boolean): void {
    const el = document.getElementById('touch-controls');
    if (el) el.style.display = v ? 'block' : 'none';
  }

  /** Read and consume the one-shot presses. Call once per frame. */
  read(): InputState {
    let x = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0);
    let y = (this.keys.has('up') ? 1 : 0) - (this.keys.has('down') ? 1 : 0);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    if (x === 0 && y === 0) {
      x = this.stickX;
      y = this.stickY;
      const len = Math.hypot(x, y);
      // Dead zone so a resting thumb does not make Affan creep.
      if (len < 0.18) { x = 0; y = 0; }
    }
    const state: InputState = {
      moveX: x,
      moveY: y,
      run: this.keys.has('run') || this.touchRun,
      jumpPressed: this.jumpQueued,
      jumpHeld: this.keys.has('jump') || this.touchJump,
      actionPressed: this.actionQueued,
    };
    this.jumpQueued = false;
    this.actionQueued = false;
    return state;
  }

  /** Test hook: simulate a held key by logical name. */
  setKey(name: string, down: boolean): void {
    if (down) {
      if (name === 'jump' && !this.keys.has('jump')) this.jumpQueued = true;
      this.keys.add(name);
    } else {
      this.keys.delete(name);
    }
  }
}
