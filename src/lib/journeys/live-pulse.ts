// LIVE PULSE (Karel 2026-10-16: "if there is no sound coming to mic it stays
// where it is and then sound engages it. i want it to breathe and respond to
// sound dynamically"). Plain live mode (the mic) no longer changes worlds on a
// wall-clock timer:
//  - SILENCE holds the world — the scene clock only runs while there is sound.
//  - SOUND: after LIVE_PULSE.ACTIVE_MS of real sound the next world comes in.
//  - A SURGE (the playing swells hard — short level well above the recent
//    level) brings the next world at once, if this one has had MIN_SCENE_MS.
// "Sound" is measured against the room's own noise floor (the laptop mic
// reads ~0.08-0.09 in a quiet room at preamp 6), learned as a slow-rising
// minimum. Pure — tested in live-pulse.test.ts.

export const LIVE_PULSE = {
  /** seconds of real sound per world (Joseph's sections average about this) */
  ACTIVE_MS: 60_000,
  /** a surge never cuts a world shorter than this */
  MIN_SCENE_MS: 25_000,
  /** sound = level above floor × this + MARGIN */
  FLOOR_X: 1.35,
  MARGIN: 0.02,
  /** surge = short level ≥ long level × this, and clearly sound */
  SURGE_X: 1.7,
  /** short / long level time constants (ms) */
  SHORT_MS: 1_500,
  LONG_MS: 20_000,
  /** the room's floor = the quietest 1-s average over this many seconds */
  FLOOR_WINDOW_S: 90,
  /** readings below this are "the mic isn't live yet", never the room */
  LIVE_MIN: 0.005,
} as const;

export interface PulseState {
  floor: number;
  /** 1-second level averages, newest last (the floor = their minimum over FLOOR_WINDOW_S) */
  secs: number[];
  /** the second being averaged */
  accSum: number;
  accMs: number;
  short: number;
  long: number;
  /** ms of sound heard in this world */
  activeMs: number;
  /** ms since this world began */
  sceneMs: number;
}

export function newPulse(level = 0): PulseState {
  return { floor: level, secs: [], accSum: 0, accMs: 0, short: level, long: level, activeMs: 0, sceneMs: 0 };
}

/** A new world began: its sound count starts over (the levels carry on). */
export function resetScene(s: PulseState): PulseState {
  return { ...s, activeMs: 0, sceneMs: 0 };
}

export function soundPresent(s: PulseState, level: number): boolean {
  return level > s.floor * LIVE_PULSE.FLOOR_X + LIVE_PULSE.MARGIN;
}

/** One sample (`level` 0-1, `dtMs` since the last). `change` = time for the next world. */
export function stepPulse(s: PulseState, level: number, dtMs: number): { state: PulseState; change: "sound" | "surge" | null; sound: boolean } {
  const dt = Math.max(0, Math.min(5_000, dtMs));
  const a = (tau: number) => 1 - Math.exp(-dt / tau);
  // THE ROOM'S FLOOR = the quietest second of the last ~90 s: a steady hum is
  // its own quietest second, while a voice or playing always leaves quieter
  // gaps. Readings ≈0 (the mic not yet live) are ignored — a 0 floor once made
  // the room's hum read as loud sound (kiosk 2026-10-16: 0.84 in a quiet room).
  let { secs, accSum, accMs } = s;
  let floor = s.floor;
  if (level >= LIVE_PULSE.LIVE_MIN) {
    accSum += level * dt;
    accMs += dt;
    if (accMs >= 1000) {
      secs = [...secs, accSum / accMs].slice(-LIVE_PULSE.FLOOR_WINDOW_S);
      accSum = 0;
      accMs = 0;
      floor = Math.min(...secs);
    } else if (secs.length === 0) floor = Math.min(floor > 0 ? floor : level, level);
  }
  const short = s.short + (level - s.short) * a(LIVE_PULSE.SHORT_MS);
  const long = s.long + (level - s.long) * a(LIVE_PULSE.LONG_MS);
  const sound = soundPresent({ ...s, floor }, level);
  const next: PulseState = { floor, secs, accSum, accMs, short, long, activeMs: s.activeMs + (sound ? dt : 0), sceneMs: s.sceneMs + dt };
  let change: "sound" | "surge" | null = null;
  if (next.activeMs >= LIVE_PULSE.ACTIVE_MS) change = "sound";
  else if (next.sceneMs >= LIVE_PULSE.MIN_SCENE_MS && short >= long * LIVE_PULSE.SURGE_X && soundPresent({ ...s, floor }, short)) change = "surge";
  return { state: next, change, sound };
}

/** The live conductor's target (0-1): how far the SHORT level stands above the
 *  room — 0 at the room's hum, 1 at a strong voice / full playing. */
export const LIVE_CONDUCT_SPAN = 0.12;
export function conductTarget(s: PulseState): number {
  const over = s.short - (s.floor * LIVE_PULSE.FLOOR_X + LIVE_PULSE.MARGIN * 0.5);
  return Math.max(0, Math.min(1, over / LIVE_CONDUCT_SPAN));
}
/** Smooth toward the target: rises fast (~0.4 s), settles slower (~2.5 s). */
export function conductStep(cur: number, target: number, dtMs: number): number {
  const tau = target > cur ? 400 : 2_500;
  return cur + (target - cur) * (1 - Math.exp(-Math.max(0, dtMs) / tau));
}
