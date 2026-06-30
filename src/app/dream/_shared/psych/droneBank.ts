// ─────────────────────────────────────────────────────────────────────────────
// _shared/psych/droneBank.ts — a just-intonation detuned drone bed for the
// altered-states pieces. A small stack of sine/triangle partials tuned to a
// pure-ratio chord, lightly detuned for chorus, fed through a lowpass that OPENS
// with `drive` plus a gentle waveshaper so peak intensity grows teeth.
//
//   EXTRACTED 2026-06-30 (cycle 611). This drone + its drive-opening filter were
//   re-synthesised by hand in nearly every recent psychedelic cycle (1052/1053/
//   1056/1058/1064/1066/1067). This is the canonical copy.
//
//   `drive` (0..1) raises the cutoff, the saturation, and the level — so the bed
//   sits as a calm sub at rest and swells toward a saturated wall at breakthrough.
// ─────────────────────────────────────────────────────────────────────────────

export interface DroneOptions {
  /** Root frequency in Hz. Default 55 (A1). */
  root?: number;
  /** Pure-interval ratios above the root. Default a stacked just chord. */
  ratios?: number[];
  /** Cutoff (Hz) at drive 0. Default 220. */
  cutoffLow?: number;
  /** Cutoff (Hz) at drive 1. Default 2600. */
  cutoffHigh?: number;
  /** Peak output gain. Default 0.32. */
  peakGain?: number;
}

export interface DroneBank {
  setDrive(d: number): void;
  stop(): void;
  output: GainNode;
}

// A short odd-symmetric curve — transparent near zero, soft-clips as it swells.
function makeSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

export function startDroneBank(
  ctx: AudioContext,
  destination: AudioNode,
  opts: DroneOptions = {},
): DroneBank {
  const root = opts.root ?? 55;
  const ratios = opts.ratios ?? [1, 3 / 2, 2, 5 / 2, 3];
  const cutoffLow = opts.cutoffLow ?? 220;
  const cutoffHigh = opts.cutoffHigh ?? 2600;
  const peakGain = opts.peakGain ?? 0.32;

  const output = ctx.createGain();
  output.gain.value = 0.0001;
  output.gain.setValueAtTime(0.0001, ctx.currentTime);
  output.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + 2.5);

  const shaper = ctx.createWaveShaper();
  shaper.curve = makeSaturationCurve(0.6);
  shaper.oversample = "2x";

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cutoffLow;
  lp.Q.value = 0.7;

  lp.connect(shaper);
  shaper.connect(output);
  output.connect(destination);

  const oscs: OscillatorNode[] = [];
  for (let i = 0; i < ratios.length; i++) {
    const baseFreq = root * ratios[i];
    // Two slightly detuned voices per partial for a slow chorus beat.
    for (const cents of [-4, 4]) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = baseFreq;
      osc.detune.value = cents;
      const g = ctx.createGain();
      // Higher partials quieter so the sub stays the foundation.
      g.gain.value = (0.5 / ratios[i]) * 0.5;
      osc.connect(g);
      g.connect(lp);
      osc.start();
      oscs.push(osc);
    }
  }

  let stopped = false;
  return {
    output,
    setDrive(d: number) {
      const drive = Math.min(1, Math.max(0, d));
      const now = ctx.currentTime;
      // Exponential feel: cutoff opens fast once drive climbs.
      const cutoff = cutoffLow * Math.pow(cutoffHigh / cutoffLow, drive);
      lp.frequency.setTargetAtTime(cutoff, now, 0.15);
      lp.Q.setTargetAtTime(0.7 + drive * 4, now, 0.2);
      if (!stopped) {
        output.gain.setTargetAtTime(peakGain * (0.6 + 0.4 * drive), now, 0.2);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        output.gain.cancelScheduledValues(now);
        output.gain.setValueAtTime(Math.max(0.0001, output.gain.value), now);
        output.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      } catch {
        /* ctx closing */
      }
      const killAt = now + 0.7;
      for (const osc of oscs) {
        try {
          osc.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}
