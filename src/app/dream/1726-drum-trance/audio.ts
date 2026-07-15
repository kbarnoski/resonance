// ─────────────────────────────────────────────────────────────────────────────
// 1726 · drum-trance — modal membrane-drum synthesis (Web Audio).
//
// Each pad hit = a short noise transient (bandpassed) that excites 3 DETUNED,
// INHARMONIC modal resonators (decaying sines at membrane-like Bessel ratios,
// 1 : 1.59 : 2.14 …). Because the ratios are inharmonic AND each partial is
// detuned a few fixed cents, no hit is ever a consonant just-intonation chord —
// it is a percussion voice: punchy, pitched-but-buzzy, short. Different pads =
// different fundamentals + ratio sets + decay lengths.
//
// Master safety chain:  voices → busGain → DynamicsCompressor → master(0.12) →
// destination, with a small void-reverb send for space. No droneBank (banned).
//
// Determinism: the excitation noise is one fixed-seed mulberry32 buffer, built
// once. Nothing here reads the clock except ctx.currentTime for scheduling,
// which is the one sanctioned time source.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb } from "../_shared/psych/convolutionVoid";

export interface PadSpec {
  label: string;
  role: string;
  /** keyboard trigger (event.key, lowercased; " " for space) */
  key: string;
  keyLabel: string;
  /** fundamental (Hz) */
  freq: number;
  /** inharmonic modal ratios (membrane Bessel-like) — never integer harmonics */
  ratios: number[];
  /** per-partial gains */
  gains: number[];
  /** per-partial fixed detune (cents) — the deliberate dissonant "skin" buzz */
  detune: number[];
  /** modal decay time (s) for the fundamental */
  decay: number;
}

// Four voices: a big centre "skin" + three rim/edge tones, each a different
// pitch and timbre. All ratio sets are inharmonic (no 2:1, 3:2 etc.).
export const PAD_SPECS: PadSpec[] = [
  {
    label: "Skin",
    role: "centre",
    key: " ",
    keyLabel: "Space",
    freq: 98,
    ratios: [1, 1.593, 2.136],
    gains: [0.9, 0.42, 0.22],
    detune: [-6, 9, -3],
    decay: 0.42,
  },
  {
    label: "Rim A",
    role: "rim",
    key: "f",
    keyLabel: "F",
    freq: 146.8,
    ratios: [1, 1.71, 2.30],
    gains: [0.85, 0.4, 0.2],
    detune: [7, -5, 4],
    decay: 0.3,
  },
  {
    label: "Rim B",
    role: "rim",
    key: "j",
    keyLabel: "J",
    freq: 196,
    ratios: [1, 1.51, 2.14],
    gains: [0.8, 0.38, 0.18],
    detune: [-8, 6, -4],
    decay: 0.26,
  },
  {
    label: "Edge",
    role: "edge",
    key: "k",
    keyLabel: "K",
    freq: 261.6,
    ratios: [1, 1.66, 2.29],
    gains: [0.7, 0.3, 0.15],
    detune: [5, -9, 3],
    decay: 0.2,
  },
];

// Fixed-seed PRNG so the excitation noise is identical on every build/run.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DrumAudio {
  ctx: AudioContext;
  hit(padIndex: number, amp: number): void;
  resume(): Promise<void>;
  destroy(): void;
}

export function makeDrumAudio(): DrumAudio {
  const Ctor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor({ latencyHint: "interactive" });

  // ── master safety chain ──
  const master = ctx.createGain();
  master.gain.value = 0.12;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 6;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  const bus = ctx.createGain();
  bus.gain.value = 1;

  bus.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);

  // a touch of cistern space, kept mostly dry so hits stay percussive
  const reverb = createVoidReverb(ctx, { seconds: 2.4, decay: 3.4, wet: 0.18 });
  bus.connect(reverb.input);
  reverb.output.connect(master);

  // ── one deterministic excitation-noise buffer (0.18 s) ──
  const rng = makeRng(0x1726beef);
  const noiseLen = Math.floor(0.18 * ctx.sampleRate);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = rng() * 2 - 1;

  function hit(padIndex: number, amp: number): void {
    const spec = PAD_SPECS[padIndex];
    if (!spec) return;
    const a = Math.max(0, Math.min(1, amp));
    if (a < 0.001) return;
    const t = ctx.currentTime;

    // (1) attack transient — bandpassed noise burst, very short
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = spec.freq * 2.2;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(a * 0.55, t + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    noise.start(t);
    noise.stop(t + 0.1);

    // (2) modal partials — detuned inharmonic decaying sines (the skin tone)
    for (let i = 0; i < spec.ratios.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = spec.freq * spec.ratios[i];
      osc.detune.value = spec.detune[i];
      const g = ctx.createGain();
      const dec = spec.decay * (1 - i * 0.22);
      const peak = a * spec.gains[i];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.06, dec));
      osc.connect(g);
      g.connect(bus);
      osc.start(t);
      osc.stop(t + Math.max(0.06, dec) + 0.05);
    }
  }

  async function resume(): Promise<void> {
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  function destroy(): void {
    try {
      bus.disconnect();
    } catch {
      /* ignore */
    }
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    try {
      void ctx.close();
    } catch {
      /* ignore */
    }
  }

  return { ctx, hit, resume, destroy };
}
