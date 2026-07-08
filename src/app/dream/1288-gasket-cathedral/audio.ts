// 1288-gasket-cathedral — audio.ts (OUTPUT ONLY, no mic)
//
// The cathedral IS a chord, spatialised. A sphere's curvature (bend) maps to
// PITCH — the big nave-spanning bells (small bend) sound low, the tiny deep
// bells (large bend) sound high — quantised to a 5-limit just-intonation
// pentatonic so every strike harmonises (the same idea as 1285's 2D gasket,
// lifted into 3D). Each struck bell is played through a Web Audio PannerNode
// with the HRTF panning model placed at the sphere's 3D WORLD position, and the
// AudioListener is driven by the first-person camera — so a bell above-left of
// you is heard above-left. Underneath sits a low ROOT + FIFTH drone bed so the
// cathedral always rests on a chord.
//
//   spatial voices + drone bed → void reverb → limiter → master (≤0.3) → out.
//   Full teardown on stop().

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

const MASTER_PEAK = 0.3;
const ROOT_HZ = 130.81; // ~C3

// 5-limit just-intonation pentatonic — pure, consonant, no wolf intervals.
const JI = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

/** Bend → frequency. Bigger bell (small bend) → lower tone. Quantised to the
 *  JI pentatonic across octaves so every struck bell harmonises. */
export function bendToFreq(bend: number): number {
  const b = Math.max(1, Math.abs(bend));
  // ~3 pentatonic steps per doubling of bend; seed bells sit near the root.
  const step = Math.max(0, Math.min(24, Math.round(Math.log2(b) * 3)));
  const oct = Math.floor(step / JI.length);
  const deg = ((step % JI.length) + JI.length) % JI.length;
  return ROOT_HZ * Math.pow(2, oct) * JI[deg];
}

export interface AudioEngine {
  /** Sound a struck bell at a world position: bend → pitch, size → loudness. */
  strikeAt(bend: number, size: number, x: number, y: number, z: number): void;
  /** Point the HRTF listener from the first-person camera each frame. */
  updateListener(
    px: number,
    py: number,
    pz: number,
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number,
  ): void;
  /** Gentle drone swell driven by strike activity (0..1). */
  setActivity(a: number): void;
  stop(): void;
}

const MAX_ACTIVE_VOICES = 24;

/** Set an AudioParam-or-legacy position/orientation triple. */
function set3(
  ctx: AudioContext,
  a: AudioParam | undefined,
  b: AudioParam | undefined,
  c: AudioParam | undefined,
  x: number,
  y: number,
  z: number,
): boolean {
  if (a && b && c) {
    const t = ctx.currentTime;
    a.setTargetAtTime(x, t, 0.02);
    b.setTargetAtTime(y, t, 0.02);
    c.setTargetAtTime(z, t, 0.02);
    return true;
  }
  return false;
}

export async function startAudio(): Promise<AudioEngine> {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();

  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 1.8);
  master.connect(ctx.destination);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-12, now);
  limiter.knee.setValueAtTime(8, now);
  limiter.ratio.setValueAtTime(16, now);
  limiter.attack.setValueAtTime(0.003, now);
  limiter.release.setValueAtTime(0.25, now);
  limiter.connect(master);

  // A large, cistern-like nave reverb.
  const reverb: VoidReverb = createVoidReverb(ctx, { seconds: 6, decay: 2.4, wet: 0.5 });
  reverb.output.connect(limiter);

  // Low root + fifth bed so the cathedral always sits on a chord.
  const drone: DroneBank = startDroneBank(ctx, reverb.input, {
    root: ROOT_HZ / 2,
    ratios: [1, 3 / 2, 2],
    cutoffLow: 80,
    cutoffHigh: 760,
    peakGain: 0.1,
  });
  drone.setDrive(0.06);

  // Spatial voices route into a soft bus (a touch of dry for onset clarity).
  const voiceBus = ctx.createGain();
  voiceBus.gain.setValueAtTime(1, now);
  const voiceTone = ctx.createBiquadFilter();
  voiceTone.type = "lowpass";
  voiceTone.frequency.setValueAtTime(3400, now);
  voiceTone.Q.setValueAtTime(0.4, now);
  voiceBus.connect(voiceTone);
  voiceTone.connect(reverb.input);
  voiceTone.connect(limiter);

  const listener = ctx.listener;

  let activeVoices = 0;
  let stopped = false;
  let activity = 0;
  let lastActivityT = now;

  return {
    strikeAt(bend: number, size: number, x: number, y: number, z: number) {
      if (stopped) return;
      if (activeVoices >= MAX_ACTIVE_VOICES) return; // graceful polyphony cap
      const t = ctx.currentTime;
      const s = Math.max(0, Math.min(1, size));
      const freq = bendToFreq(bend);

      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 2.5;
      panner.maxDistance = 60;
      panner.rolloffFactor = 0.9;
      if (!set3(ctx, panner.positionX, panner.positionY, panner.positionZ, x, y, z)) {
        // Legacy Safari fallback.
        (panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(
          x,
          y,
          z,
        );
      }

      // A pearlescent bell: two detuned partials, soft attack, size-scaled ring.
      const gain = ctx.createGain();
      const peak = 0.06 + 0.16 * s;
      const attack = 0.006 + 0.03 * s;
      const release = 1.6 + 3.0 * s;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peak, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
      gain.connect(panner);
      panner.connect(voiceBus);

      const oscA = ctx.createOscillator();
      oscA.type = "sine";
      oscA.frequency.setValueAtTime(freq, t);
      oscA.connect(gain);
      const oscB = ctx.createOscillator();
      oscB.type = "triangle";
      oscB.frequency.setValueAtTime(freq, t);
      oscB.detune.setValueAtTime(4, t);
      const gainB = ctx.createGain();
      gainB.gain.setValueAtTime(0.4, t);
      oscB.connect(gainB);
      gainB.connect(gain);

      const endAt = t + attack + release;
      activeVoices++;
      const cleanup = () => {
        activeVoices = Math.max(0, activeVoices - 1);
        try {
          gain.disconnect();
          panner.disconnect();
          gainB.disconnect();
        } catch {
          /* already gone */
        }
      };
      oscA.onended = cleanup;
      oscA.start(t);
      oscB.start(t);
      oscA.stop(endAt);
      oscB.stop(endAt);

      // Relax accumulated activity, then add this strike.
      activity = Math.max(0, activity - (t - lastActivityT) * 0.4);
      activity = Math.min(1, activity + 0.1);
      lastActivityT = t;
      drone.setDrive(0.06 + 0.34 * activity);
    },

    updateListener(px, py, pz, fx, fy, fz, ux, uy, uz) {
      if (stopped) return;
      if (
        !set3(ctx, listener.positionX, listener.positionY, listener.positionZ, px, py, pz)
      ) {
        (
          listener as unknown as { setPosition(x: number, y: number, z: number): void }
        ).setPosition(px, py, pz);
      }
      if (
        !set3(
          ctx,
          listener.forwardX,
          listener.forwardY,
          listener.forwardZ,
          fx,
          fy,
          fz,
        )
      ) {
        (
          listener as unknown as {
            setOrientation(
              fx: number,
              fy: number,
              fz: number,
              ux: number,
              uy: number,
              uz: number,
            ): void;
          }
        ).setOrientation(fx, fy, fz, ux, uy, uz);
        return;
      }
      set3(ctx, listener.upX, listener.upY, listener.upZ, ux, uy, uz);
    },

    setActivity(a: number) {
      if (stopped) return;
      activity = Math.max(activity, Math.max(0, Math.min(1, a)));
    },

    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      } catch {
        /* ctx already closing */
      }
      drone.stop();
      setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 700);
    },
  };
}
