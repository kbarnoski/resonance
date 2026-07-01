// ─────────────────────────────────────────────────────────────────────────────
// input.ts — steer the infall.
//
//   Primary input: DeviceOrientation (tilt your phone). beta (front-back) and
//   gamma (left-right) map to a steering vector in [-1,1] per axis. On iOS this
//   requires a user-gesture permission grant (DeviceOrientationEvent
//   .requestPermission). Desktop fallback: arrow keys / WASD. If neither yields
//   input, the caller drives an autonomous slow spiral so it still plays.
// ─────────────────────────────────────────────────────────────────────────────

export type InputMode = "tilt" | "keyboard" | "auto";

export interface SteerInput {
  /** current steer vector, each axis in [-1,1]. */
  readonly x: number;
  readonly y: number;
  /** which mode is actually feeding the vector right now. */
  readonly mode: InputMode;
  stop(): void;
}

interface OrientEvt extends DeviceOrientationEvent {
  beta: number | null;
  gamma: number | null;
}

// Some iOS builds expose requestPermission on the constructor.
type PermCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** True if the current platform gates orientation behind requestPermission. */
export function orientationNeedsPermission(): boolean {
  return (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof (DeviceOrientationEvent as PermCtor).requestPermission === "function"
  );
}

/** Ask for the iOS orientation permission from inside a user gesture. Returns
 *  true if granted (or if no permission is required on this platform). */
export async function requestTiltPermission(): Promise<boolean> {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  const ctor = DeviceOrientationEvent as PermCtor;
  if (typeof ctor.requestPermission !== "function") return true; // no gate here
  try {
    const res = await ctor.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

/**
 * Begin listening. `allowTilt` should be the result of requestTiltPermission().
 * Keyboard always listens as a fallback. If a tilt event ever arrives, mode
 * flips to "tilt"; if a key is pressed, mode flips to "keyboard".
 */
export function startInput(allowTilt: boolean): SteerInput {
  const state = { x: 0, y: 0, mode: "auto" as InputMode };
  const keys = new Set<string>();
  let gotTilt = false;

  const onOrient = (e: Event) => {
    const o = e as OrientEvt;
    if (o.beta == null || o.gamma == null) return;
    gotTilt = true;
    if (state.mode !== "keyboard") state.mode = "tilt";
    // gamma: -90..90 left-right → x ; beta: 0..90ish front tilt → y
    const gx = Math.max(-45, Math.min(45, o.gamma)) / 45;
    const gy = Math.max(-45, Math.min(45, (o.beta ?? 0) - 40)) / 45;
    // Only drive from tilt when it's the active mode.
    if (state.mode === "tilt") {
      state.x = gx;
      state.y = gy;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (
      k === "arrowleft" ||
      k === "arrowright" ||
      k === "arrowup" ||
      k === "arrowdown" ||
      k === "w" ||
      k === "a" ||
      k === "s" ||
      k === "d"
    ) {
      keys.add(k);
      state.mode = "keyboard";
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
  };

  // Keyboard axis is integrated toward the held direction each frame via rAF.
  let raf = 0;
  const tick = () => {
    if (state.mode === "keyboard") {
      const left = keys.has("arrowleft") || keys.has("a");
      const right = keys.has("arrowright") || keys.has("d");
      const up = keys.has("arrowup") || keys.has("w");
      const down = keys.has("arrowdown") || keys.has("s");
      const tx = (right ? 1 : 0) - (left ? 1 : 0);
      const ty = (down ? 1 : 0) - (up ? 1 : 0);
      state.x += (tx - state.x) * 0.12;
      state.y += (ty - state.y) * 0.12;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  if (allowTilt && typeof window !== "undefined") {
    window.addEventListener("deviceorientation", onOrient, true);
  }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // If no tilt data arrives within ~1.5s and no keys pressed, we stay in "auto"
  // and the caller supplies the autonomous spiral.
  const autoCheck = window.setTimeout(() => {
    if (!gotTilt && state.mode !== "keyboard") state.mode = "auto";
  }, 1500);

  return {
    get x() {
      return state.x;
    },
    get y() {
      return state.y;
    },
    get mode() {
      return state.mode;
    },
    stop() {
      cancelAnimationFrame(raf);
      window.clearTimeout(autoCheck);
      window.removeEventListener("deviceorientation", onOrient, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
