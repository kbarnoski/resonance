// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the quill synth for 7992-quillsvg.
//
// Real Web Audio graph. A stroke's kinematics are turned into a SoundEvent
// stream in stroke.ts (the Gesture2Music, arXiv:2511.00793, event/playback
// split); THIS module only knows how to PLAY one event and how to nudge the
// master brightness. The same play() is called both by a live stroke and by a
// looping canon layer — the engine is deliberately ignorant of which.
//
//   pressure  → amplitude
//   accel     → attack sharpness (sharp acceleration ⇒ percussive onset)
//   degree    → pitch, quantized to a warm just-intonation pentatonic
//   speed     → per-note brightness + the master lowpass cutoff
//
// A soft drone pad sits underneath for warmth. Everything routes through the
// shared code-generated void reverb so wet ink reads as wet sound.
//
// Timing note: only AudioContext.currentTime is used for envelope scheduling
// (the sanctioned Web-Audio clock). No Math.random / Date.now / new Date().
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import type { SoundEvent } from "./stroke";

// Warm just-intonation major pentatonic, tiled across octaves from a low base.
const BASE_HZ = 130.81; // C3
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

function degreeToHz(degree: number): number {
  const d = Math.max(0, Math.floor(degree));
  const oct = Math.floor(d / RATIOS.length);
  const idx = d % RATIOS.length;
  return BASE_HZ * RATIOS[idx] * Math.pow(2, oct);
}

export interface QuillVoice {
  /** Play one kinematic event. `gainScale` lets canon layers sit back in the mix. */
  play(ev: SoundEvent, gainScale: number): void;
  /** Continuous master brightness from recent hand speed (0..1). */
  setBrightness(x: number): void;
  /** Full teardown of the graph. */
  stop(): void;
}

export function startAudio(ctx: AudioContext): QuillVoice {
  const now0 = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setTargetAtTime(0.9, now0, 0.6);

  // Master tone: a lowpass that opens with hand speed (fast = brighter).
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 900;
  tone.Q.value = 0.5;
  tone.connect(master);

  const verb: VoidReverb = createVoidReverb(ctx, {
    seconds: 3.6,
    decay: 2.8,
    wet: 0.42,
  });
  verb.output.connect(master);
  master.connect(ctx.destination);

  // ── Warm drone pad (breathing) — ambience under the ink. ─────────────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0.035;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 480;
  padGain.connect(padFilter);
  padFilter.connect(verb.input);
  padFilter.connect(master);
  const padOscs: OscillatorNode[] = [];
  for (const [i, mult] of [1, 1.5, 2.01].entries()) {
    const o = ctx.createOscillator();
    o.type = i === 0 ? "sine" : "triangle";
    o.frequency.value = BASE_HZ * 0.5 * mult;
    o.detune.value = (i - 1) * 4;
    o.connect(padGain);
    o.start(now0);
    padOscs.push(o);
  }
  const padLfo = ctx.createOscillator();
  padLfo.frequency.value = 0.05;
  const padLfoGain = ctx.createGain();
  padLfoGain.gain.value = 140;
  padLfo.connect(padLfoGain);
  padLfoGain.connect(padFilter.frequency);
  padLfo.start(now0);

  const active = new Set<OscillatorNode>();

  function play(ev: SoundEvent, gainScale: number) {
    const amp = Math.min(0.9, 0.06 + ev.pressure * 0.34) * gainScale;
    if (amp <= 0.003) return;
    const t = ctx.currentTime + 0.02;
    const freq = degreeToHz(ev.degree);

    // Sharp acceleration ⇒ short attack (percussive); smooth ⇒ soft onset.
    const attack = Math.max(0.004, 0.05 - Math.min(0.045, ev.accel * 6));
    const dur = 0.55 + ev.pressure * 1.1;

    // Two partials → a soft FM-ish pluck (carrier + a quiet fifth-ish partial).
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2;

    const partial = ctx.createGain();
    partial.gain.value = 0.28;
    osc2.connect(partial);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    // Faster strokes ⇒ brighter per-note timbre.
    lp.frequency.value = 700 + Math.min(1, ev.speed * 2.4) * 4200;
    lp.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);

    osc.connect(lp);
    partial.connect(lp);
    lp.connect(g);
    g.connect(tone);
    g.connect(verb.input);

    osc.start(t);
    osc2.start(t);
    osc.stop(t + dur + 0.08);
    osc2.stop(t + dur + 0.08);
    active.add(osc);
    osc.onended = () => {
      active.delete(osc);
      try {
        osc.disconnect();
        osc2.disconnect();
        partial.disconnect();
        lp.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  function setBrightness(x: number) {
    const c = 700 + Math.min(1, Math.max(0, x)) * 4800;
    tone.frequency.setTargetAtTime(c, ctx.currentTime, 0.08);
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
    for (const v of active) {
      try {
        v.stop(t + 0.2);
      } catch {
        /* already stopped */
      }
    }
  }

  return { play, setBrightness, stop };
}
