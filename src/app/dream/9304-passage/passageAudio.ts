// ─────────────────────────────────────────────────────────────────────────────
// 9304-passage · passageAudio.ts — the moving spatial corridor.
//
// This is the payoff of the piece and it lives in the ears. Warm, note-gated
// voices are SPAWNED ahead of you (negative-z, far) and travel THROUGH the head
// and behind (positive-z) on HRTF PannerNodes — a genuine Chowning (1971)
// moving-source pass-by that reads as forward motion down a corridor. There is
// NO static drone bed: every voice is a transient, quantized to a slow warm mode
// that RESOLVES toward a consonant chord as you near the light. A centre bloom
// of additive partials swells and breathes (never a held pad) and, at the
// clarity-snap, its micro-detune collapses to zero for a moment of impossible
// consonance before the warm return.
//
// If HRTF panning is unavailable we fall back to a StereoPanner + L/R DelayNode
// (ITD) + gain (ILD) sweep — coarser, but still a pass-by. `fellBack` reports it.
//
// Everything routes into the shared safeMaster (ear-safety limiter) and through
// a void reverb for corridor depth. All randomness is the inlined seeded
// mulberry32(0x9304); all timing is ctx.currentTime.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster } from "../_shared/visionary/safeMaster";
import { createVoidReverb } from "../_shared/visionary/convolutionVoid";
import type { PassageField } from "./timeline";

// ── inlined seeded PRNG — NEVER Math.random ──────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Warm mode (major pentatonic) that resolves to the root triad (0,4,7,12).
const ROOT_HZ = 130.81; // C3
const SCALE = [0, 2, 4, 7, 9, 12, 16, 19];
const CHORD = [0, 4, 7, 12];
const semis = (n: number) => Math.pow(2, n / 12);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface PassageAudio {
  /** Drive per animation frame with the current arc field + optional lean. */
  update(f: PassageField, lean: number): void;
  /** Smoothly silence and tear the whole rig down. */
  stop(): void;
  /** True when HRTF was unavailable and we fell back to a stereo pass-by. */
  readonly fellBack: boolean;
}

interface BloomPartial {
  osc: OscillatorNode;
  gain: GainNode;
  base: number;
  weight: number;
  rate: number;
  phase: number;
}

export function createPassageAudio(ctx: AudioContext): PassageAudio {
  const rng = mulberry32(0x9304);
  const now0 = ctx.currentTime;

  const master = createSafeMaster(ctx, { gain: 0.0 });
  master.setGain(0.78); // smooth fade-in from 0

  const reverb = createVoidReverb(ctx, {
    seconds: 5,
    decay: 2.4,
    wet: 0.5,
  });
  reverb.output.connect(master.input);

  // A dry corridor bus alongside the reverb for presence.
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  dry.connect(master.input);

  const busIn = (node: AudioNode) => {
    node.connect(reverb.input);
    node.connect(dry);
  };

  // ── HRTF capability probe ──────────────────────────────────────────────────
  let fellBack = false;
  try {
    const probe = ctx.createPanner();
    probe.panningModel = "HRTF";
    if (probe.panningModel !== "HRTF") fellBack = true;
    probe.disconnect();
  } catch {
    fellBack = true;
  }

  // ── centre bloom: additive partials that breathe + resolve (no held pad) ────
  const bloomGain = ctx.createGain();
  bloomGain.gain.value = 0.0001;
  busIn(bloomGain);

  const partials: BloomPartial[] = CHORD.map((c, i) => {
    const osc = ctx.createOscillator();
    osc.type = i < 2 ? "sine" : "triangle";
    const base = ROOT_HZ * semis(c);
    osc.frequency.value = base;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(bloomGain);
    osc.start(now0);
    return {
      osc,
      gain,
      base,
      weight: 1 / (i + 1.6),
      rate: 0.08 + i * 0.017 + rng() * 0.02,
      phase: rng() * 6.283,
    };
  });

  const active = new Set<AudioNode>();
  let voiceCount = 0;
  let nextVoice = now0 + 0.6;
  let stopped = false;

  // ── spawn one moving voice: front (−z, far) → through → behind (+z) ─────────
  function spawnVoice(when: number, f: PassageField): void {
    if (voiceCount > 10) return;

    // Note: bias toward chord tones as the light grows (the resolution).
    const resolveBias = 0.28 + f.bloom * 0.6;
    const pool = rng() < resolveBias ? CHORD : SCALE;
    let note = pool[Math.floor(rng() * pool.length)];
    if (rng() < 0.2) note += 12;
    const detCents = (rng() * 2 - 1) * (1 - f.clarity) * 7;
    const freq = ROOT_HZ * semis(note) * semis(detCents / 100);

    const travel = lerp(6.2, 2.2, f.speed);
    const peak = 0.085 * (0.7 + 0.3 * rng());

    // tone: fundamental + a soft partner
    const oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.value = freq;
    const oscB = ctx.createOscillator();
    oscB.type = "triangle";
    oscB.frequency.value = freq * 2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(peak, when + 0.7);
    env.gain.setTargetAtTime(0.0001, when + travel * 0.68, 0.7);

    const partnerTrim = ctx.createGain();
    partnerTrim.gain.value = 0.35;
    oscA.connect(env);
    oscB.connect(partnerTrim);
    partnerTrim.connect(env);

    const side = rng() < 0.5 ? -1 : 1;
    const x0 = side * (2 + rng() * 2.5);
    const z0 = -(7 + rng() * 4);
    const x1 = -x0 * 0.55;
    const z1 = 5 + rng() * 4;

    let spatialTail: AudioNode;
    const perVoice: AudioNode[] = [oscA, oscB, partnerTrim, env];

    if (!fellBack) {
      const pan = ctx.createPanner();
      pan.panningModel = "HRTF";
      pan.distanceModel = "inverse";
      pan.refDistance = 1.2;
      pan.rolloffFactor = 1.1;
      pan.maxDistance = 30;
      pan.positionX.setValueAtTime(x0, when);
      pan.positionX.linearRampToValueAtTime(x1, when + travel);
      pan.positionY.setValueAtTime((rng() * 2 - 1) * 0.6, when);
      pan.positionZ.setValueAtTime(z0, when);
      pan.positionZ.linearRampToValueAtTime(z1, when + travel);
      env.connect(pan);
      spatialTail = pan;
      perVoice.push(pan);
    } else {
      // Fallback pass-by: ILD (L/R gains) + ITD (L/R delays), swept across.
      const p0 = side; // start on a side
      const p1 = -side * 0.6; // cross past
      const itd = 0.0006;
      const gL = ctx.createGain();
      const gR = ctx.createGain();
      const dL = ctx.createDelay(0.002);
      const dR = ctx.createDelay(0.002);
      const merger = ctx.createChannelMerger(2);
      const gain0L = Math.sqrt((1 - p0) / 2);
      const gain0R = Math.sqrt((1 + p0) / 2);
      const gain1L = Math.sqrt((1 - p1) / 2);
      const gain1R = Math.sqrt((1 + p1) / 2);
      gL.gain.setValueAtTime(gain0L, when);
      gL.gain.linearRampToValueAtTime(gain1L, when + travel);
      gR.gain.setValueAtTime(gain0R, when);
      gR.gain.linearRampToValueAtTime(gain1R, when + travel);
      dL.delayTime.setValueAtTime(itd * (0.5 + 0.5 * p0), when);
      dL.delayTime.linearRampToValueAtTime(itd * (0.5 + 0.5 * p1), when + travel);
      dR.delayTime.setValueAtTime(itd * (0.5 - 0.5 * p0), when);
      dR.delayTime.linearRampToValueAtTime(itd * (0.5 - 0.5 * p1), when + travel);
      env.connect(gL);
      env.connect(gR);
      gL.connect(dL);
      gR.connect(dR);
      dL.connect(merger, 0, 0);
      dR.connect(merger, 0, 1);
      spatialTail = merger;
      perVoice.push(gL, gR, dL, dR, merger);
    }

    busIn(spatialTail);
    perVoice.forEach((n) => active.add(n));
    voiceCount++;

    oscA.start(when);
    oscB.start(when);
    const end = when + travel + 0.3;
    oscA.stop(end);
    oscB.stop(end);
    oscA.onended = () => {
      voiceCount--;
      perVoice.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          /* closing */
        }
        active.delete(n);
      });
    };
  }

  return {
    get fellBack() {
      return fellBack;
    },
    update(f: PassageField, lean: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      const density = Math.min(1, f.speed + lean * 0.25);

      // schedule voices with a small lookahead
      const interval = lerp(3.4, 0.68, density);
      while (nextVoice < t + 0.3) {
        spawnVoice(nextVoice, f);
        nextVoice += interval * (0.75 + rng() * 0.5);
      }

      // centre bloom envelope + per-partial breathing + detune collapse
      bloomGain.gain.setTargetAtTime(0.0001 + f.bloom * 0.22, t, 0.5);
      for (const p of partials) {
        const breath = 0.55 + 0.45 * Math.sin(t * p.rate + p.phase);
        p.gain.gain.setTargetAtTime(p.weight * breath, t, 0.7);
        const cents = (1 - f.clarity) * 4 * Math.sin(p.phase + p.base);
        p.osc.frequency.setTargetAtTime(p.base * semis(cents / 100), t, 0.6);
      }

      // corridor depth: wetter as it warms and blooms
      reverb.setWet(0.42 + f.warmth * 0.22 + f.bloom * 0.14);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      master.setGain(0.0001);
      for (const p of partials) {
        try {
          p.gain.gain.setTargetAtTime(0.0001, t, 0.4);
          p.osc.stop(t + 1.4);
        } catch {
          /* already stopped */
        }
      }
      window.setTimeout(() => {
        for (const p of partials) {
          try {
            p.osc.disconnect();
            p.gain.disconnect();
          } catch {
            /* closing */
          }
        }
        active.forEach((n) => {
          try {
            n.disconnect();
          } catch {
            /* closing */
          }
        });
        active.clear();
        try {
          bloomGain.disconnect();
          dry.disconnect();
          reverb.output.disconnect();
        } catch {
          /* closing */
        }
        master.disconnect();
      }, 1500);
    },
  };
}
