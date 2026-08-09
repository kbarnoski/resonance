// 4200-flatlands — audio.ts
//
// The dissociative sound-bed, built entirely from the shared _shared/visionary
// altered-states infrastructure (not re-derived here):
//
//   • startShepard(dir:-1)  — an endless Shepard–Risset DESCENT: the pitch of
//     the whole world seems to fall forever, the auditory analogue of the floor
//     dropping out of reality (Shepard 1964 / Risset).
//   • startDroneBank        — a just-intonation steel drone bed; its lowpass
//     opens with drive so the bed swells from a calm sub toward a wall and
//     thins back to one held partial at the still point.
//   • createVoidReverb      — a cistern-like convolution void; the descent and
//     the drone are routed THROUGH it and the wet mix opens toward 1.0 at the
//     white void so the world dissolves into pure space.
//
// Optional mic: RMS loudness (breath / room) is smoothed and ADDED to the
// Shepard drive, so breathing quickens the descent. Fully self-demos with no
// mic — micDrive stays 0.

import { startShepard, type ShepardEngine } from "../_shared/visionary/shepard";
import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";

export interface FlatAudio {
  /** Push the current arc drives (0..1). */
  setArc(shepard: number, drone: number, wet: number): void;
  /** Advance the descent; call once per frame with dt seconds. */
  step(dt: number): void;
  /** Attach a mic stream so loudness modulates the descent rate. */
  attachMic(stream: MediaStream): void;
  /** Smoothed mic drive contribution (0..1); 0 when no mic. */
  getMicLevel(): number;
  stop(): void;
}

export function makeFlatAudio(ctx: AudioContext): FlatAudio {
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.7, ctx.currentTime + 2.0);
  master.connect(ctx.destination);

  // A wide, slow void — 5s tail, gentle decay so it blooms rather than slaps.
  const verb: VoidReverb = createVoidReverb(ctx, { seconds: 5, decay: 2.5, wet: 0.3 });
  verb.output.connect(master);

  // Endless DESCENT (dir:-1). A touch narrower/darker than default for a
  // steel, unglamorous fall.
  const shepard: ShepardEngine = startShepard(ctx, verb.input, {
    dir: -1,
    partials: 9,
    centerOct: 3.6,
    sigmaOct: 1.5,
    baseRate: 0.02,
    driveRate: 0.14,
    peakGain: 0.42,
  });

  // Just-intonation steel bed. A close, slightly hollow voicing.
  const drone: DroneBank = startDroneBank(ctx, verb.input, {
    root: 49, // ~G1
    ratios: [1, 3 / 2, 2, 9 / 4, 3],
    cutoffLow: 180,
    cutoffHigh: 2200,
    peakGain: 0.3,
  });

  let shepardDrive = 0;
  let micDrive = 0;
  let analyser: AnalyserNode | null = null;
  let micData: Uint8Array<ArrayBuffer> | null = null;
  let micRaw = 0;

  const setArc = (s: number, d: number, w: number) => {
    shepardDrive = Math.min(1, Math.max(0, s));
    drone.setDrive(d);
    verb.setWet(w);
  };

  const step = (dt: number) => {
    if (analyser && micData) {
      analyser.getByteTimeDomainData(micData);
      let sum = 0;
      for (let i = 0; i < micData.length; i++) {
        const v = (micData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / micData.length);
      // gentle expansion; mic contributes at most ~0.35 to the descent rate.
      micRaw = Math.min(1, rms * 6);
      const target = micRaw * 0.35;
      const a = 1 - Math.exp(-dt / 0.5);
      micDrive += (target - micDrive) * a;
    }
    shepard.setDrive(Math.min(1, shepardDrive + micDrive));
    shepard.step(dt);
  };

  const attachMic = (stream: MediaStream) => {
    try {
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.6;
      src.connect(an);
      // analyser is a sink only — never routed to master (no feedback howl).
      analyser = an;
      micData = new Uint8Array(new ArrayBuffer(an.fftSize));
    } catch {
      /* mic attach failed — arc keeps running silently modulated at 0 */
    }
  };

  let stopped = false;
  return {
    setArc,
    step,
    attachMic,
    getMicLevel: () => micDrive,
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      } catch {
        /* ctx closing */
      }
      shepard.stop();
      drone.stop();
      void micRaw;
    },
  };
}
