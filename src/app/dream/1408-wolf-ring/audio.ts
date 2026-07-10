// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sustained-triad instrument for the Wolf Ring.
//
//   Three persistent voices (root, major third, fifth) drone continuously so the
//   ring is never silent once begun. Each step retunes the voices by gliding
//   their oscillators to the new frequencies and pulsing a swell, so "time" is
//   your gesture — how you walk and how long you hold — not a beat grid.
//
//   Every voice carries partials up to the 3rd harmonic. That matters: the 3rd
//   partial of the root and the 2nd partial of the fifth coincide for a pure
//   3:2, so a tempered fifth makes them BEAT. A gentle meantone fifth shivers a
//   couple of times a second; the wolf's 737.6¢ fifth thrashes ~10–17 Hz. The
//   howl is not an effect — it is real acoustic roughness from real detuning.
//
//   Master: voices → reverb send + dry → master gain (≤0.20) → limiter → out.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

const PARTIALS = [
  { mult: 1, gain: 0.5 },
  { mult: 2, gain: 0.24 },
  { mult: 3, gain: 0.13 },
];

const MASTER_MAX = 0.2; // hard ceiling per spec
const GLIDE = 0.14; // seconds — the glissando between fifths
const VOICE_BASE = 0.5; // resting swell level (keeps the drone alive)

interface Voice {
  oscs: OscillatorNode[];
  partialGains: GainNode[];
  swell: GainNode; // articulation envelope
  out: GainNode; // static per-voice level
}

export interface WolfAudio {
  /** Retune the held triad to a new fifth and pulse the articulation swell. */
  playEdge: (rootHz: number, thirdRatio: number, fifthRatio: number) => void;
  /** Ramp everything to silence and fully tear down. */
  stop: () => void;
}

function makeVoice(ctx: AudioContext, dest: AudioNode, level: number): Voice {
  const out = ctx.createGain();
  out.gain.value = level;
  const swell = ctx.createGain();
  swell.gain.value = VOICE_BASE;
  swell.connect(out);
  out.connect(dest);

  const oscs: OscillatorNode[] = [];
  const partialGains: GainNode[] = [];
  for (const p of PARTIALS) {
    const g = ctx.createGain();
    g.gain.value = p.gain;
    g.connect(swell);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 220 * p.mult;
    osc.connect(g);
    osc.start();
    oscs.push(osc);
    partialGains.push(g);
  }
  return { oscs, partialGains, swell, out };
}

function retune(ctx: AudioContext, v: Voice, fundamental: number) {
  const now = ctx.currentTime;
  v.oscs.forEach((osc, i) => {
    osc.frequency.setTargetAtTime(fundamental * PARTIALS[i].mult, now, GLIDE / 3);
  });
}

function articulate(ctx: AudioContext, v: Voice, peak: number) {
  const now = ctx.currentTime;
  const g = v.swell.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(peak, now + 0.03);
  g.setTargetAtTime(VOICE_BASE, now + 0.03, 0.35);
}

export function createWolfAudio(): WolfAudio | null {
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }

  const master = ctx.createGain();
  master.gain.value = 0;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 4;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // A little cosmic space for the pure regions.
  let reverb: VoidReverb | null = null;
  try {
    reverb = createVoidReverb(ctx, { seconds: 3.5, decay: 3, wet: 0.28 });
    reverb.output.connect(master);
  } catch {
    reverb = null;
  }
  const busDest: AudioNode = reverb ? reverb.input : master;

  const rootV = makeVoice(ctx, busDest, 0.085);
  const thirdV = makeVoice(ctx, busDest, 0.05); // lower so the fifth stays the star
  const fifthV = makeVoice(ctx, busDest, 0.075);

  // Fade master up from silence.
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(MASTER_MAX, ctx.currentTime + 1.2);

  function playEdge(rootHz: number, thirdRatio: number, fifthRatio: number) {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    retune(ctx, rootV, rootHz);
    retune(ctx, thirdV, rootHz * thirdRatio);
    retune(ctx, fifthV, rootHz * fifthRatio);
    articulate(ctx, rootV, 0.95);
    articulate(ctx, thirdV, 0.8);
    articulate(ctx, fifthV, 1.0);
  }

  function stop() {
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.25);
    } catch {
      // ignore
    }
    const voices = [rootV, thirdV, fifthV];
    setTimeout(() => {
      for (const v of voices) {
        v.oscs.forEach((o) => {
          try {
            o.stop();
            o.disconnect();
          } catch {
            // already gone
          }
        });
        try {
          v.swell.disconnect();
          v.out.disconnect();
          v.partialGains.forEach((g) => g.disconnect());
        } catch {
          // already gone
        }
      }
      try {
        ctx.close();
      } catch {
        // already closed
      }
    }, 320);
  }

  return { playEdge, stop };
}
