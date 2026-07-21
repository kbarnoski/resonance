// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the memory material as sound.
//
//   Carrier = piano "memory fragments." Headless self-demo synthesises a
//   deterministic seeded generative-piano voice (warm 3:1 FM), scheduled
//   sparse → dense → overlapping → thinning across the arc so the field's
//   binding is audible: the life review made into a growing chord.
//
//   OPTIONAL "Drop a piano track": a locally decoded AudioBuffer (no network)
//   is grain-sampled instead — windowed fragments of the listener's own piano
//   become the memory material. Never required.
//
//   Bed: slow just-intonation drone + code-generated void reverb. A
//   DynamicsCompressor limiter on the master guarantees nothing runs away.
//   NO struck-bell events; NEVER the banned Chladni ratios 1/2.76/5.40/8.93.
//   AudioContext is gated behind Begin and the whole graph tears down on unmount.
// ─────────────────────────────────────────────────────────────────────────────

import { makeRng, SEED } from "./rng";
import { sampleArc, type Phase } from "./arc";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

export interface AudioEngine {
  resume(): Promise<void>;
  loadFile(file: File): Promise<void>;
  hasSample(): boolean;
  dispose(): void;
}

const LOOKAHEAD = 0.6; // seconds scheduled ahead
const TICK_MS = 50;
const ROOT = 110; // A2

// Warm just-intonation scale ratios across ~two octaves (no bell/inharmonic ratios).
const SCALE_RATIOS = [
  1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8,
  2, 9 / 4, 5 / 2, 8 / 3, 3, 15 / 4, 4,
];
// A warm chord-of-a-whole-life for the boundless plateau.
const CHORD_RATIOS = [1, 5 / 4, 3 / 2, 2, 15 / 8, 5 / 2, 3];

function buildPitches(ratios: number[]): number[] {
  return ratios.map((r) => ROOT * r);
}

export function createAudio(): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let pianoBus: GainNode | null = null;
  let drone: DroneBank | null = null;
  let reverb: VoidReverb | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let startTime = 0;
  let nextNoteTime = 0;
  let sampleBuffer: AudioBuffer | null = null;
  let closed = false;

  const rng = makeRng(SEED ^ 0x51a1);
  const scaleAll = buildPitches(SCALE_RATIOS);
  const scaleHigh = buildPitches(SCALE_RATIOS.filter((r) => r >= 2));
  const chord = buildPitches(CHORD_RATIOS);

  function playFM(time: number, freq: number, dur: number, level: number): void {
    if (!ctx || !pianoBus) return;
    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 3.0; // 3:1 — odd-harmonic, piano-ish glint
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 2.0, time);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.14, time + dur * 0.6);
    mod.connect(modGain);
    modGain.connect(car.frequency);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(level, time + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    car.connect(amp);
    amp.connect(pianoBus);
    car.start(time);
    mod.start(time);
    car.stop(time + dur + 0.05);
    mod.stop(time + dur + 0.05);
  }

  function playGrain(time: number, freq: number, dur: number, level: number): void {
    if (!ctx || !pianoBus || !sampleBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = sampleBuffer;
    src.playbackRate.value = Math.min(2, Math.max(0.5, freq / 220));
    const maxOff = Math.max(0, sampleBuffer.duration - dur - 0.05);
    const off = rng() * maxOff;

    const amp = ctx.createGain();
    const atk = Math.min(0.25, dur * 0.3);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(level, time + atk);
    amp.gain.setTargetAtTime(0.0001, time + dur * 0.7, dur * 0.25);

    src.connect(amp);
    amp.connect(pianoBus);
    src.start(time, off, dur + 0.15);
  }

  function playFragment(time: number, phase: Phase, C: number, prog: number): void {
    let freq: number;
    let dur: number;
    let level: number;

    if (phase === "boundless") {
      freq = chord[Math.floor(rng() * chord.length)];
      dur = 5 + rng() * 5; // long, overlapping — a sustained chord of a whole life
      level = 0.09 + 0.05 * rng();
    } else {
      const pool = C > 0.4 ? scaleAll : scaleHigh;
      freq = pool[Math.floor(rng() * pool.length)];
      const base = phase === "fading" ? 0.045 : 0.06 + 0.15 * C;
      level = base * (0.6 + 0.6 * rng());
      dur = phase === "fading"
        ? 1.6 + rng() * 1.4
        : 1.2 + 2.4 * C + rng() * 1.4;
      if (phase === "return") level *= 0.5 + 0.5 * (1 - prog);
    }

    if (sampleBuffer) playGrain(time, freq, dur, level);
    else playFM(time, freq, dur, level);
  }

  function nextIoi(phase: Phase, C: number, prog: number): number {
    const j = rng();
    let ioi: number;
    if (phase === "fading") ioi = 3.2 + j * 3.5;
    else if (phase === "surge") ioi = 2.6 - 2.0 * C + j * (0.8 - 0.4 * C);
    else if (phase === "boundless") ioi = 1.8 + j * 2.2;
    else ioi = 1.0 + prog * 3.5 + j * 2.0; // return: lengthening back to sparse
    return Math.max(0.25, ioi);
  }

  function schedule(): void {
    if (!ctx || closed || ctx.state !== "running") return;
    const now = ctx.currentTime;
    while (nextNoteTime < now + LOOKAHEAD) {
      const t = nextNoteTime - startTime;
      const arc = sampleArc(t);
      playFragment(nextNoteTime, arc.phase, arc.C, arc.progress);
      nextNoteTime += nextIoi(arc.phase, arc.C, arc.progress);
      // Bed follows coherence: calm sub → fuller wash; reverb blooms at the peak.
      if (drone) drone.setDrive(0.12 + 0.55 * arc.C);
      if (reverb) reverb.setWet(0.4 + 0.3 * arc.C);
    }
  }

  async function resume(): Promise<void> {
    if (closed) return;
    if (!ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();

      // master → limiter → destination
      master = ctx.createGain();
      master.gain.value = 0.85;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      master.connect(limiter);
      limiter.connect(ctx.destination);

      reverb = createVoidReverb(ctx, { seconds: 5, decay: 2.4, wet: 0.45 });
      reverb.output.connect(master);

      pianoBus = ctx.createGain();
      pianoBus.gain.value = 0.9;
      pianoBus.connect(master); // dry
      pianoBus.connect(reverb.input); // wet

      drone = startDroneBank(ctx, master, {
        root: 55,
        peakGain: 0.2,
        cutoffLow: 180,
        cutoffHigh: 1600,
      });

      startTime = ctx.currentTime;
      nextNoteTime = startTime + 0.15;
      timer = setInterval(schedule, TICK_MS);
    }
    if (ctx.state === "suspended") await ctx.resume();
  }

  async function loadFile(file: File): Promise<void> {
    // Local decode only — NO network, NO fetch.
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const tmp: AudioContext = ctx ?? new Ctor();
    const buf = await file.arrayBuffer();
    const decoded = await tmp.decodeAudioData(buf.slice(0));
    sampleBuffer = decoded;
    if (!ctx && tmp.state !== "closed") {
      // We only made tmp to decode before Begin; close it to free resources.
      try {
        await tmp.close();
      } catch {
        /* ignore */
      }
    }
  }

  function hasSample(): boolean {
    return sampleBuffer !== null;
  }

  function dispose(): void {
    closed = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    try {
      drone?.stop();
    } catch {
      /* ignore */
    }
    const c = ctx;
    if (c) {
      const kill = () => {
        try {
          c.close();
        } catch {
          /* ignore */
        }
      };
      // brief tail so the drone stop ramp completes, then close
      setTimeout(kill, 800);
    }
    ctx = null;
    master = null;
    pianoBus = null;
    drone = null;
    reverb = null;
    sampleBuffer = null;
  }

  return { resume, loadFile, hasSample, dispose };
}
