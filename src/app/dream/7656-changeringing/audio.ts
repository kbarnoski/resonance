// ─────────────────────────────────────────────────────────────────────────────
// 7656-changeringing · audio.ts
//
// Tuned tower-bell voices for the change-ringing braid. Each bell is a real
// (inharmonic) bell tone: the classic partials — hum, prime, tierce (the
// characteristic minor third that makes a bell sound like a bell), quint,
// nominal and a couple of faint upper partials — each a lightly detuned sine /
// triangle under a long exponential decay. Struck in the order given by each
// successive change, they cascade and re-weave; under them sits a low just-
// intonation drone bed. Everything passes through a generated convolution void
// so the peal blooms in a cavernous, meditative space.
//
//   graph:  strike voices ─┐
//           droneBank    ──┤→ bus → voidReverb → master → destination
//
// No percussion, no melody line — only the bells themselves and the drone.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";

type WebAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export interface RingingAudio {
  ctx: AudioContext;
  /** Strike bell at frequency-index `i` (0 = treble). velocity 0..1. */
  strike(i: number, velocity?: number): void;
  /** Re-tune (e.g. on a stage change) — sets the per-bell frequency table. */
  setTuning(freqs: number[]): void;
  stop(): void;
}

// Relative partial frequencies of a tuned bell and their gains/decays.
// The tierce at 1.2 (a just minor third above the prime) is what makes a cast
// bell unmistakably a bell rather than a pure tone.
const PARTIALS: { mult: number; gain: number; decay: number; type: OscillatorType }[] = [
  { mult: 0.5, gain: 0.5, decay: 4.2, type: "sine" }, // hum (octave below prime)
  { mult: 1.0, gain: 1.0, decay: 3.2, type: "sine" }, // prime / fundamental
  { mult: 1.2, gain: 0.55, decay: 2.4, type: "triangle" }, // tierce (minor 3rd)
  { mult: 1.5, gain: 0.3, decay: 1.8, type: "sine" }, // quint (fifth)
  { mult: 2.0, gain: 0.42, decay: 1.6, type: "sine" }, // nominal (octave)
  { mult: 2.5, gain: 0.14, decay: 1.0, type: "sine" }, // faint upper
  { mult: 3.0, gain: 0.08, decay: 0.7, type: "triangle" }, // faint upper
];

export function startRingingAudio(freqs: number[]): RingingAudio | null {
  const w = window as WebAudioWindow;
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  void ctx.resume();

  let tuning = freqs.slice();
  const now = ctx.currentTime;

  // ── master with a slow bloom-in ───────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.6, now + 3);
  master.connect(ctx.destination);

  // ── cavernous reverb: the tower ───────────────────────────────────────────
  const reverb: VoidReverb = createVoidReverb(ctx, { seconds: 5.5, decay: 2.4, wet: 0.55 });
  reverb.output.connect(master);

  // ── a bus for the struck bells (kept a touch below the reverb input) ───────
  const bus = ctx.createGain();
  bus.gain.value = 0.5;
  bus.connect(reverb.input);

  // ── low just-intonation drone bed, tuned an octave below the tenor tonic ───
  // The tenor is the lowest bell (last frequency) — take it down an octave.
  const tenor = tuning[tuning.length - 1] ?? 146.83;
  const drone: DroneBank = startDroneBank(ctx, reverb.input, {
    root: tenor / 2,
    ratios: [1, 3 / 2, 2, 5 / 2],
    cutoffLow: 130,
    cutoffHigh: 900,
    peakGain: 0.16,
  });
  drone.setDrive(0.25);

  let stopped = false;

  const strike = (i: number, velocity = 1) => {
    if (stopped) return;
    const f = tuning[i];
    if (!f || !isFinite(f)) return;
    const t = ctx.currentTime;
    const vel = Math.min(1, Math.max(0, velocity));

    // Per-strike voice gain so partials share one envelope shape but each partial
    // gets its own decay length (the bell "clangs" then hums out).
    const voice = ctx.createGain();
    voice.gain.value = 0.18 * vel;
    voice.connect(bus);

    const oscs: OscillatorNode[] = [];
    let maxStop = t;
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = f * p.mult;
      // A little inharmonic detune per partial gives the shimmering bell beat.
      osc.detune.value = (p.mult - 1) * 4;

      const g = ctx.createGain();
      const peak = p.gain;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.006); // sharp strike
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);

      osc.connect(g);
      g.connect(voice);
      osc.start(t);
      const stopAt = t + p.decay + 0.1;
      osc.stop(stopAt);
      if (stopAt > maxStop) maxStop = stopAt;
      oscs.push(osc);
    }
    // Release the voice node shortly after the last partial dies.
    window.setTimeout(() => {
      try {
        voice.disconnect();
      } catch {
        /* already gone */
      }
    }, (maxStop - t) * 1000 + 200);
  };

  return {
    ctx,
    strike,
    setTuning(f: number[]) {
      tuning = f.slice();
      const newTenor = tuning[tuning.length - 1] ?? 146.83;
      drone.setDrive(0.25);
      // droneBank has no retune; re-root is not supported, but the tonic octave
      // is close enough across our two stages that we simply keep the bed. The
      // bell voices themselves carry the new tuning.
      void newTenor;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      } catch {
        /* context already closing */
      }
      drone.stop();
      window.setTimeout(() => {
        if (ctx.state !== "closed") ctx.close().catch(() => {});
      }, 1100);
    },
  };
}
