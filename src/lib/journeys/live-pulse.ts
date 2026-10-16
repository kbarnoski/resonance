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
  /** how fast the learned floor may rise toward the level (per second) — in a
   *  quiet stretch; while there is sound it barely moves (FLOOR_RISE_SOUND), so
   *  long continuous playing is never learned as "the room" */
  FLOOR_RISE: 0.01,
  FLOOR_RISE_SOUND: 0.0003,
} as const;

export interface PulseState {
  floor: number;
  short: number;
  long: number;
  /** ms of sound heard in this world */
  activeMs: number;
  /** ms since this world began */
  sceneMs: number;
}

export function newPulse(level = 0): PulseState {
  return { floor: level, short: level, long: level, activeMs: 0, sceneMs: 0 };
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
  // the floor: drops at once to a quieter level, creeps up slowly (never learns the playing)
  const rise = soundPresent(s, level) ? LIVE_PULSE.FLOOR_RISE_SOUND : LIVE_PULSE.FLOOR_RISE;
  const floor = level < s.floor ? level : s.floor + (level - s.floor) * Math.min(1, rise * (dt / 1000));
  const short = s.short + (level - s.short) * a(LIVE_PULSE.SHORT_MS);
  const long = s.long + (level - s.long) * a(LIVE_PULSE.LONG_MS);
  const sound = soundPresent({ ...s, floor }, level);
  const next: PulseState = { floor, short, long, activeMs: s.activeMs + (sound ? dt : 0), sceneMs: s.sceneMs + dt };
  let change: "sound" | "surge" | null = null;
  if (next.activeMs >= LIVE_PULSE.ACTIVE_MS) change = "sound";
  else if (next.sceneMs >= LIVE_PULSE.MIN_SCENE_MS && short >= long * LIVE_PULSE.SURGE_X && soundPresent({ ...s, floor }, short)) change = "surge";
  return { state: next, change, sound };
}
