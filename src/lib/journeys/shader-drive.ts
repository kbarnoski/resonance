/**
 * Pure helpers for the shader stack's audio drive and crossfade
 * scheduling (glitch RCA 2026-10-06: "sometimes a shader kind of moves
 * in a glitch maybe from sound to no sound").
 *
 * Three mechanisms lived in visualizer.tsx:
 *  1. Drive flags (band focus, drive-only, smooth motion, tempo flow) were
 *     global per-journey props, so an OUTGOING shader still on screen
 *     changed its clock rate / scale / uniforms the instant the journey
 *     changed (Snowflake -> Realized -> Ghost: a 1.7-2.1 % zoom snap).
 *     Now each layer latches its flags when its shader lands, and only
 *     adopts new ones while parked or after the handoff window.
 *  2. The band drive measured deviation from a ~0.4 s running mean, so
 *     silence braked every clock to its floor and the first note after
 *     silence surged it to its ceiling. Now silence freezes the running
 *     means and parks the drive at neutral, and a shared envelope eases
 *     the drive out (~1.5 s) whenever playback stops or a handoff is open
 *     and back in (~3 s) after.
 *  3. A crossfade re-targeted mid-flight snapped its opacities (a hard
 *     cut). Now the new target waits until the running fade completes.
 */

/** Per-frame smoothing constants were tuned at 60 fps. Convert one to the
 *  equivalent alpha for an arbitrary frame delta, so the 30 fps handoff
 *  brake (and 120 Hz panels) keep the same time constants. */
export function frameAlpha(kAt60: number, dtSec: number): number {
  if (kAt60 >= 1) return 1;
  if (kAt60 <= 0 || dtSec <= 0) return 0;
  return 1 - Math.pow(1 - kAt60, dtSec * 60);
}

/** Below this mean byte level (0..1) the analyser is hearing silence
 *  (the track ended, paused, or the inter-journey breath). Byte data
 *  bottoms out at 0 at the analyser's -100 dB floor. */
export const SILENCE_LEVEL = 0.006;

export function isSilentLevel(rawAmplitude: number): boolean {
  return !(rawAmplitude >= SILENCE_LEVEL);
}

/** Drive envelope durations: out fast-ish when the music stops (the
 *  visuals must not keep pumping to audio nobody hears), back in slowly. */
export const DRIVE_FALL_SEC = 1.5;
export const DRIVE_RISE_SEC = 3;

/** Linear slew of the envelope's raw value toward 1 (active) or 0. */
export function stepDriveEnvelope(value: number, active: boolean, dtSec: number): number {
  // linear slew: a long unread stretch simply saturates
  const dt = Math.max(0, Math.min(10, dtSec));
  return active
    ? Math.min(1, value + dt / DRIVE_RISE_SEC)
    : Math.max(0, value - dt / DRIVE_FALL_SEC);
}

/** Eased envelope (smoothstep) — what the drive is multiplied by. */
export function easedEnvelope(value: number): number {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

/** The band-EQ target level for one frame. Silence (or a closed
 *  envelope) returns the neutral 0.5 — the layer's resting pace. */
export function driveTarget(raw: number, slowEma: number, gain: number, envelope: number, silent: boolean): number {
  if (silent) return 0.5;
  const dev = (raw - slowEma) * gain * 0.45 * Math.max(0, Math.min(1, envelope));
  return Math.min(1, Math.max(0.05, 0.5 + dev));
}

/** Shared (module-level) envelope: one value for every shader layer, so
 *  A/B crossfade partners and the dual/tertiary layers ease together. */
const sharedEnvelope = { value: 1, lastMs: -1 };

export function readSharedDriveEnvelope(nowMs: number, active: boolean): number {
  if (sharedEnvelope.lastMs < 0) sharedEnvelope.lastMs = nowMs;
  const dt = (nowMs - sharedEnvelope.lastMs) / 1000;
  if (dt > 0) {
    sharedEnvelope.value = stepDriveEnvelope(sharedEnvelope.value, active, dt);
    sharedEnvelope.lastMs = nowMs;
  }
  return easedEnvelope(sharedEnvelope.value);
}

/** test hook */
export function __resetSharedDriveEnvelope(value = 1): void {
  sharedEnvelope.value = value;
  sharedEnvelope.lastMs = -1;
}

// ── per-layer drive flags ──────────────────────────────────────────────────

export type DriveFlags = {
  smoothMotion: boolean;
  tempoFlow: boolean;
  bandFocus: "bass" | "mid" | "treble" | undefined;
  bandDriveOnly: boolean;
};

export function sameDriveFlags(a: DriveFlags, b: DriveFlags): boolean {
  return a.smoothMotion === b.smoothMotion && a.tempoFlow === b.tempoFlow && a.bandFocus === b.bandFocus && a.bandDriveOnly === b.bandDriveOnly;
}

/** A layer keeps the flags its shader landed with. It adopts the current
 *  journey's flags only while parked (invisible) or once the journey
 *  handoff window has closed — and the adoption itself is eased by the
 *  renderer (rate / scale / uniform mixes slew), never stepped. */
export function shouldRelatchDriveFlags(latched: DriveFlags, current: DriveFlags, parked: boolean, inHandoff: boolean): boolean {
  if (sameDriveFlags(latched, current)) return false;
  return parked || !inHandoff;
}

// ── crossfade re-target scheduling ─────────────────────────────────────────

export type RetargetDecision = "noop" | "start" | "queue";

/** A new target for an A/B layer pair. While a fade is visibly in flight
 *  the target is QUEUED (snapping the half-faded pair was a hard cut);
 *  otherwise (idle, or still compiling at opacity 0) it starts now. */
export function crossfadeRetarget(target: string | null, landedOrLanding: string | null, fading: boolean): RetargetDecision {
  if (fading) return "queue";
  if (target === landedOrLanding) return "noop";
  return "start";
}

/** When a fade completes: the queued target (if any) that must start next. */
export function dequeueAfterFade(queued: string | null | undefined, landed: string | null): { start: boolean; target: string | null } {
  if (queued === undefined) return { start: false, target: landed };
  if (queued === landed) return { start: false, target: landed };
  return { start: true, target: queued };
}

/** The single tertiary layer: what to do for the wanted mode given what is
 *  mounted and how visible it is. It never swaps a visible shader — it
 *  fades it out first and re-evaluates when that fade completes. */
export type TertiaryPhase = "idle" | "waiting" | "in" | "shown" | "out";
export type TertiaryAction = "none" | "fade-out" | "unmount" | "load";

export function tertiaryStep(want: string | null, mounted: string | null, opacity: number, phase: TertiaryPhase): TertiaryAction {
  if (phase === "out") return "none"; // completion re-evaluates
  if (want === mounted) {
    if (want === null) return "none";
    // fading in / shown / compiling the right shader: nothing to do
    return "none";
  }
  if (mounted === null) return want === null ? "none" : "load";
  // something else is mounted
  if (opacity > 0.001) return "fade-out";
  return want === null ? "unmount" : "load";
}
