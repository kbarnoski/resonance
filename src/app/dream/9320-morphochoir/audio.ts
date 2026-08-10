// audio.ts — the Morphochoir: eight note-gated warm voices, one per probe.
//
// Each frame the field hands us the probe readings. A probe whose local
// activity (V concentration blended with gradient magnitude) crosses a
// threshold GATES its voice open; below threshold the voice fades to silence.
// There is NO continuous held drone — voices only sound while their probe is
// "lit" by the growing pattern, so the chord breathes and re-voices as the
// morphology sweeps across the ring.
//
// Each voice is a gentle FM tone (carrier + a low-index modulator) through a
// per-voice gate gain and a soft lowpass, mixed at ~0.18 into a safe master
// (high-shelf + lowpass cap + limiter). Voices never feed anything analysed —
// the probe data comes from the GPU field, never from the audio graph.

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  midiToHz,
  mulberry32,
  PROBE_COUNT,
  PROBE_MIDI,
  SEED,
} from "./field";

interface Voice {
  carrier: OscillatorNode;
  mod: OscillatorNode;
  modGain: GainNode;
  tone: BiquadFilterNode;
  gate: GainNode;
  baseHz: number;
}

export interface Choir {
  readonly ctx: AudioContext;
  /** Push the latest probe readings; opens/closes gates accordingly. */
  update(probes: Float32Array, reduce: boolean): void;
  /** How many voices are currently audible (for the on-screen meter). */
  litCount(): number;
  stop(): void;
}

const GATE_THRESHOLD = 0.14; // activity must exceed this for a voice to sound
const ATTACK_TC = 0.04;
const RELEASE_TC = 0.55;

export async function createChoir(): Promise<Choir> {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* resumes on first gesture anyway */
    }
  }

  const master: SafeMaster = createSafeMaster(ctx, { gain: 0.85 });
  const mixBus = ctx.createGain();
  mixBus.gain.value = 0.18; // whole choir sits well below unity
  mixBus.connect(master.input);

  // a single slow shared vibrato so voices breathe together
  const vibrato = ctx.createOscillator();
  vibrato.type = "sine";
  vibrato.frequency.value = 4.6;
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.value = 3.2; // Hz of pitch sway (subtle)
  vibrato.connect(vibratoGain);
  vibrato.start();

  const rnd = mulberry32(SEED ^ 0x51);
  const t0 = ctx.currentTime;
  const voices: Voice[] = [];

  for (let i = 0; i < PROBE_COUNT; i++) {
    const baseHz = midiToHz(PROBE_MIDI[i]);
    // a touch of deterministic detune per voice for chorus warmth
    const detune = (rnd() - 0.5) * 6;

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = baseHz;
    carrier.detune.value = detune;

    // low-index FM modulator: a fifth/octave ratio gives a hollow, warm reed
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = baseHz * (i % 2 === 0 ? 1.0 : 1.5);
    const modGain = ctx.createGain();
    modGain.gain.value = baseHz * 0.35; // modest index
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // shared vibrato into carrier pitch
    vibratoGain.connect(carrier.frequency);

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = Math.min(5200, baseHz * 6);
    tone.Q.value = 0.6;

    const gate = ctx.createGain();
    gate.gain.value = 0.0001; // silent until its probe lights up

    carrier.connect(tone);
    tone.connect(gate);
    gate.connect(mixBus);

    carrier.start(t0);
    mod.start(t0);

    voices.push({ carrier, mod, modGain, tone, gate, baseHz });
  }

  let lit = 0;

  function update(probes: Float32Array, reduce: boolean): void {
    if (ctx.state === "closed") return;
    const now = ctx.currentTime;
    let count = 0;
    for (let i = 0; i < PROBE_COUNT && i < voices.length; i++) {
      const V = probes[i * 4] || 0;
      const grad = probes[i * 4 + 1] || 0;
      // activity: mostly concentration, a little edge energy
      const activity = Math.min(1, V * 1.15 + grad * 2.2);
      const v = voices[i];
      if (activity > GATE_THRESHOLD) {
        count++;
        // loudness follows how strongly the probe is lit
        const amp = 0.12 + Math.min(0.9, (activity - GATE_THRESHOLD) * 1.4);
        v.gate.gain.setTargetAtTime(amp, now, ATTACK_TC);
        // brighter tone when more active (still under the safe cap)
        const cut = Math.min(6000, v.baseHz * (3 + activity * 5));
        v.tone.frequency.setTargetAtTime(cut, now, 0.12);
        // FM index tracks edge energy for a little bite at boundaries
        const idx = v.baseHz * (0.2 + grad * (reduce ? 0.4 : 0.9));
        v.modGain.gain.setTargetAtTime(idx, now, 0.15);
      } else {
        v.gate.gain.setTargetAtTime(0.0001, now, RELEASE_TC);
      }
    }
    lit = count;
  }

  function stop(): void {
    const now = ctx.currentTime;
    for (const v of voices) {
      try {
        v.gate.gain.cancelScheduledValues(now);
        v.gate.gain.setTargetAtTime(0.0001, now, 0.05);
      } catch {
        /* closing */
      }
    }
    // give the release a beat, then tear everything down
    window.setTimeout(() => {
      for (const v of voices) {
        try {
          v.carrier.stop();
          v.mod.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.carrier.disconnect();
          v.mod.disconnect();
          v.modGain.disconnect();
          v.tone.disconnect();
          v.gate.disconnect();
        } catch {
          /* noop */
        }
      }
      try {
        vibrato.stop();
        vibrato.disconnect();
        vibratoGain.disconnect();
      } catch {
        /* noop */
      }
      try {
        mixBus.disconnect();
        master.disconnect();
      } catch {
        /* noop */
      }
      if (ctx.state !== "closed") void ctx.close();
    }, 180);
  }

  return {
    ctx,
    update,
    litCount: () => lit,
    stop,
  };
}
