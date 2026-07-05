// ─────────────────────────────────────────────────────────────────────────────
// grains.ts — granular synthesis voice + the "loom" transport ring (Web Audio).
//
//   The VOICE is granular (Curtis Roads, *Microsound*, 2001), deliberately NOT a
//   just-intonation choir/pad/drone. At load we synthesize two short source
//   buffers with no external assets — a filtered-noise burst and a decaying
//   resonator ping — and every hit granulates THOSE: a grain is a windowed slice
//   of a buffer played through a fast Hann envelope, pitched by playbackRate and
//   panned by which limb fired it. Footfalls = low granular thuds/kick-clouds;
//   wrists = bright high grain sprays.
//
//   The TRANSPORT is the body's gait. A ring of 16 steps (one bar of sixteenths)
//   spins at the gait BPM. Limb events are quantized into the ring; each cycle
//   replays the deposited grains, so a loop *weaves* as you keep moving. Slot
//   lives decay each cycle, so when you stop the loom slowly unravels to silence.
//   Look-ahead scheduling keeps it tight against audioContext.currentTime.
// ─────────────────────────────────────────────────────────────────────────────

import type { Limb, LimbHit } from "./gait";

const STEPS = 16; // sixteenth-notes per bar
const LOOKAHEAD = 0.12; // seconds scheduled ahead of the clock
const DECAY = 0.9; // per-cycle life multiplier (loom unravel rate)
const MAX_GRAINS = 56; // hard cap on simultaneous grains

interface Voice {
  buffer: "noise" | "ping";
  rate: number; // base playbackRate (pitch)
  rateJitter: number; // ± random spread
  length: number; // grain window seconds
  posMin: number; // grain read position (fraction of buffer)
  posMax: number;
  gain: number; // per-grain base gain
  layers: number; // grains per hit (spray count)
  panScale: number; // how much hit.pan drives the panner
}

const VOICES: Record<Limb, Voice> = {
  footL: { buffer: "ping", rate: 0.5, rateJitter: 0.04, length: 0.15, posMin: 0.0, posMax: 0.06, gain: 0.9, layers: 2, panScale: 0.4 },
  footR: { buffer: "ping", rate: 0.55, rateJitter: 0.04, length: 0.15, posMin: 0.0, posMax: 0.06, gain: 0.9, layers: 2, panScale: 0.4 },
  kneeL: { buffer: "ping", rate: 1.05, rateJitter: 0.06, length: 0.09, posMin: 0.05, posMax: 0.2, gain: 0.5, layers: 1, panScale: 0.7 },
  kneeR: { buffer: "ping", rate: 1.18, rateJitter: 0.06, length: 0.09, posMin: 0.05, posMax: 0.2, gain: 0.5, layers: 1, panScale: 0.7 },
  wristL: { buffer: "noise", rate: 2.1, rateJitter: 0.25, length: 0.05, posMin: 0.1, posMax: 0.7, gain: 0.4, layers: 3, panScale: 0.9 },
  wristR: { buffer: "noise", rate: 2.5, rateJitter: 0.25, length: 0.05, posMin: 0.1, posMax: 0.7, gain: 0.4, layers: 3, panScale: 0.9 },
};

interface GrainSpec {
  limb: Limb;
  intensity: number;
  pan: number;
  life: number; // 0..1, decays each cycle
}

export interface LoomEvent {
  limb: Limb;
  slot: number; // 0..STEPS-1
  intensity: number;
}

export interface LoomState {
  /** playhead position around the ring, 0..1 */
  head: number;
  /** per-slot brightness 0..1 (max life across limbs in that slot) */
  slots: number[];
  /** grains fired since last poll, for burst visuals */
  fired: LoomEvent[];
  bpm: number;
}

export interface GranularLoom {
  setBpm(bpm: number): void;
  setEnergy(motion: number): void;
  /** deposit a hit into the quantized ring (+ a soft immediate grain) */
  feed(hit: LimbHit): void;
  /** advance the look-ahead scheduler; call once per animation frame */
  pump(): void;
  /** read + clear the visual event/ring state */
  drain(): LoomState;
  stop(): void;
}

/** Small seedable noise so the buffers are stable-ish but lively. */
function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Filtered (integrated) noise → a warmer, less hissy grain source.
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    lp = lp * 0.6 + white * 0.4;
    d[i] = lp * 0.9;
  }
  return buf;
}

/** A short decaying resonator ping: a few detuned partials × exp decay + grit. */
function makePingBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.6);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const base = 150; // Hz — low so footfalls read as thuds
  const partials = [1, 2.01, 3.02, 4.98];
  const amps = [1, 0.4, 0.22, 0.12];
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 9);
    let s = 0;
    for (let p = 0; p < partials.length; p++) {
      s += amps[p] * Math.sin(2 * Math.PI * base * partials[p] * t);
    }
    const grit = (Math.random() * 2 - 1) * 0.15 * Math.exp(-t * 30);
    d[i] = (s / 1.7 + grit) * env;
  }
  return buf;
}

/** A fast Hann-ish window as a value curve for a grain's amplitude. */
function hannCurve(peak: number): Float32Array {
  const n = 48;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    c[i] = w * peak;
  }
  return c;
}

export function createGranularLoom(ctx: AudioContext): GranularLoom {
  const noiseBuf = makeNoiseBuffer(ctx);
  const pingBuf = makePingBuffer(ctx);

  // ── master chain: grains → bus → lowpass → compressor → out ──────────────
  const bus = ctx.createGain();
  bus.gain.value = 0.9;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 6800;
  tone.Q.value = 0.4;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  const master = ctx.createGain();
  master.gain.value = 0.0001; // ramps up with energy

  // A short feedback delay gives the grain clouds a woven tail.
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.26;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;

  bus.connect(tone);
  tone.connect(comp);
  tone.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);

  const ring: Array<Map<Limb, GrainSpec>> = Array.from(
    { length: STEPS },
    () => new Map<Limb, GrainSpec>(),
  );

  let bpm = 100;
  let energy = 0;
  let activeGrains = 0;
  let stepIndex = 0;
  let nextTickTime = ctx.currentTime + 0.08;
  const fired: LoomEvent[] = [];

  const stepDur = (): number => 60 / bpm / 4; // sixteenth-note seconds

  const playGrain = (spec: GrainSpec, when: number, amp: number): void => {
    if (activeGrains >= MAX_GRAINS) return;
    const v = VOICES[spec.limb];
    for (let l = 0; l < v.layers; l++) {
      if (activeGrains >= MAX_GRAINS) break;
      const src = ctx.createBufferSource();
      src.buffer = v.buffer === "noise" ? noiseBuf : pingBuf;
      const rate = v.rate * (1 + (Math.random() * 2 - 1) * v.rateJitter);
      src.playbackRate.value = Math.max(0.1, rate);
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, spec.pan * v.panScale));
      src.connect(g);
      g.connect(pan);
      pan.connect(bus);

      const dur = v.length * (0.8 + Math.random() * 0.5);
      const peak = amp * v.gain * spec.intensity * (l === 0 ? 1 : 0.7);
      const t0 = when + l * 0.006 * Math.random();
      g.gain.setValueCurveAtTime(hannCurve(Math.max(0.0001, peak)), t0, dur);
      const offset =
        (v.posMin + Math.random() * (v.posMax - v.posMin)) *
        (v.buffer === "noise" ? noiseBuf.duration : pingBuf.duration);
      try {
        src.start(t0, offset, dur + 0.02);
      } catch {
        return;
      }
      activeGrains++;
      src.onended = () => {
        activeGrains--;
        src.disconnect();
        g.disconnect();
        pan.disconnect();
      };
    }
  };

  const feed = (hit: LimbHit): void => {
    // Quantize into the slot that will next fire (≤ one sixteenth away).
    const slot = stepIndex % STEPS;
    const cell = ring[slot];
    const prev = cell.get(hit.limb);
    const intensity = prev
      ? Math.max(prev.intensity, hit.intensity)
      : hit.intensity;
    cell.set(hit.limb, { limb: hit.limb, intensity, pan: hit.pan, life: 1 });
    // A soft immediate grain for tactile responsiveness (unquantized).
    if (energy > 0.001) {
      playGrain(
        { limb: hit.limb, intensity: hit.intensity, pan: hit.pan, life: 1 },
        ctx.currentTime + 0.005,
        0.45,
      );
    }
  };

  const pump = (): void => {
    // Ramp master toward energy so movement raises the loom, stillness lowers it.
    const target = 0.0001 + energy * 0.9;
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.25);

    let guard = 0;
    while (nextTickTime < ctx.currentTime + LOOKAHEAD && guard < 8) {
      guard++;
      const slot = stepIndex % STEPS;
      const cell = ring[slot];
      const dur = stepDur();
      for (const spec of cell.values()) {
        if (spec.life > 0.06) {
          playGrain(spec, nextTickTime, 0.55 * spec.life * (0.3 + energy));
          fired.push({ limb: spec.limb, slot, intensity: spec.life });
        }
        // Unravel: fade deposited grains each pass unless refreshed by feed().
        spec.life *= DECAY;
        if (spec.life < 0.05) cell.delete(spec.limb);
      }
      nextTickTime += dur;
      stepIndex = (stepIndex + 1) % (STEPS * 1024); // keep bounded
    }
  };

  const drain = (): LoomState => {
    const slots = ring.map((cell) => {
      let m = 0;
      for (const s of cell.values()) m = Math.max(m, s.life * s.intensity);
      return m;
    });
    const dur = stepDur();
    const frac = Math.max(0, Math.min(1, 1 - (nextTickTime - ctx.currentTime) / dur));
    const head = ((stepIndex % STEPS) + frac) / STEPS;
    const out: LoomState = { head: (head + 1) % 1, slots, fired: [...fired], bpm };
    fired.length = 0;
    return out;
  };

  return {
    setBpm(b) {
      bpm = Math.max(40, Math.min(200, b));
    },
    setEnergy(m) {
      energy = Math.max(0, Math.min(1, m));
    },
    feed,
    pump,
    drain,
    stop() {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      } catch {
        /* noop */
      }
      window.setTimeout(() => {
        for (const node of [bus, tone, comp, master, delay, fb, wet]) {
          try {
            node.disconnect();
          } catch {
            /* noop */
          }
        }
      }, 300);
    },
  };
}
