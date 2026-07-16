// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — cross-modal memory replay for 1792-replay-svg.
//
// WAKE (α≈0): a short seeded MOTIF plays faithfully, in order — the "day's" sound,
// the auditory counterpart of the sharp day scene. As α rises the faithful voice
// fades and the SAME motif is REPLAYED recombined: fragments in the wrong order,
// pitch-shifted, time-stretched, overlapping loops — the cortex dreaming its own
// recent sound back. Calm & warm (DREAM pole): a soft pad under warm plucks, wet
// with the shared code-synthesised void reverb. Never harsh, never a strobe.
//
// Determinism: scheduling is driven by an integer frame counter + per-beat
// mulberry32. No Math.random / Date.now / performance.now. AudioContext.currentTime
// is used only for Web-Audio envelope timing (allowed).
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { mulberry32 } from "./scene";

// Warm just-intonation degrees over a low base — a soft minor-pentatonic colour.
const BASE_HZ = 196; // G3
const RATIOS = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2, 12 / 5];

interface Note {
  deg: number; // index into RATIOS
  vel: number;
}
// A gentle 8-step motif — the remembered melody.
const MOTIF: Note[] = [
  { deg: 0, vel: 0.9 },
  { deg: 2, vel: 0.7 },
  { deg: 3, vel: 0.8 },
  { deg: 4, vel: 0.7 },
  { deg: 3, vel: 0.6 },
  { deg: 5, vel: 0.8 },
  { deg: 2, vel: 0.6 },
  { deg: 0, vel: 0.7 },
];

// Pitch-shift choices for replayed fragments (semitones) — octaves & a fifth.
const TRANSPOSE = [-12, -5, 0, 0, 7, 12];

const BEAT_FRAMES = 30; // ~0.5 s at 60fps → calm tempo.

export interface ReplayAudio {
  /** Advance the scheduler one frame; α ∈ [0,1] steers wake↔replay. */
  tick(frame: number, alpha: number): void;
  /** Full teardown of all nodes (context is closed by the caller). */
  stop(): void;
}

export function startAudio(ctx: AudioContext): ReplayAudio {
  const now0 = ctx.currentTime;

  // ── Master bus → reverb → destination ──────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setTargetAtTime(0.9, now0, 0.8); // slow fade-in, no click

  const verb: VoidReverb = createVoidReverb(ctx, { seconds: 4.5, decay: 2.6, wet: 0.5 });
  verb.output.connect(master);
  master.connect(ctx.destination);

  // ── Warm pad drone (breathing lowpass) ─────────────────────────────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0.05;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 520;
  padFilter.Q.value = 0.6;
  padGain.connect(padFilter);
  padFilter.connect(verb.input);
  padFilter.connect(master);

  const padOscs: OscillatorNode[] = [];
  for (const [i, mult] of [1, 1.5, 2].entries()) {
    const o = ctx.createOscillator();
    o.type = i === 0 ? "sine" : "triangle";
    o.frequency.value = BASE_HZ * 0.5 * mult;
    o.detune.value = (i - 1) * 5;
    o.connect(padGain);
    o.start(now0);
    padOscs.push(o);
  }
  // Slow filter breathing via a low-freq oscillator on the cutoff (< 0.15 Hz).
  const padLfo = ctx.createOscillator();
  padLfo.frequency.value = 0.06;
  const padLfoGain = ctx.createGain();
  padLfoGain.gain.value = 180;
  padLfo.connect(padLfoGain);
  padLfoGain.connect(padFilter.frequency);
  padLfo.start(now0);

  const activeVoices = new Set<OscillatorNode>();

  function pluck(deg: number, semis: number, gain: number, dur: number, atOffset: number) {
    if (gain <= 0.004) return;
    const t = ctx.currentTime + 0.04 + atOffset;
    const ratio = RATIOS[((deg % RATIOS.length) + RATIOS.length) % RATIOS.length];
    const freq = BASE_HZ * ratio * Math.pow(2, semis / 12);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    lp.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.005, gain), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);

    osc.connect(lp);
    lp.connect(g);
    g.connect(verb.input);
    g.connect(master);

    osc.start(t);
    osc.stop(t + dur + 0.1);
    activeVoices.add(osc);
    osc.onended = () => {
      activeVoices.delete(osc);
      try {
        osc.disconnect();
        lp.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  function scheduleBeat(beat: number, alpha: number) {
    const rnd = mulberry32((0x51a7 ^ (beat * 2654435761)) >>> 0);

    // Faithful WAKE voice — present awake, gone by α≈0.8.
    const faith = Math.min(0.9, Math.max(0, 0.92 - alpha * 1.15));
    const note = MOTIF[beat % MOTIF.length];
    const dur = 0.85 + alpha * 0.9; // time-stretch as the dream deepens.
    if (faith > 0.02) pluck(note.deg, 0, faith * note.vel * 0.5, dur, 0);

    // Replayed / recombined voices — rise with α.
    if (alpha > 0.16) {
      const rGain = Math.min(0.8, (alpha - 0.14) * 1.05);
      // Wrong-order: jump to a shuffled motif index.
      const j = Math.floor(rnd() * MOTIF.length);
      const semi = TRANSPOSE[Math.floor(rnd() * TRANSPOSE.length)];
      pluck(MOTIF[j].deg, semi, rGain * MOTIF[j].vel * 0.6, dur, 0);

      // Overlapping second voice at high α → superimposed loops.
      if (alpha > 0.45 && rnd() < alpha) {
        const j2 = Math.floor(rnd() * MOTIF.length);
        const semi2 = TRANSPOSE[Math.floor(rnd() * TRANSPOSE.length)];
        pluck(MOTIF[j2].deg, semi2, rGain * 0.45, dur * 1.2, 0.12 + rnd() * 0.18);
      }
    }
  }

  let lastBeat = -1;
  function tick(frame: number, alpha: number) {
    verb.setWet(0.42 + alpha * 0.34); // wetter, more diffuse as we dream.
    if (frame % BEAT_FRAMES === 0) {
      const beat = Math.floor(frame / BEAT_FRAMES);
      if (beat !== lastBeat) {
        lastBeat = beat;
        scheduleBeat(beat, alpha);
      }
    }
  }

  function stop() {
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(0.0001, t, 0.15);
    } catch {
      /* ignore */
    }
    for (const o of [...padOscs, padLfo]) {
      try {
        o.stop(t + 0.3);
      } catch {
        /* already stopped */
      }
    }
    for (const v of activeVoices) {
      try {
        v.stop(t + 0.3);
      } catch {
        /* already stopped */
      }
    }
  }

  return { tick, stop };
}
