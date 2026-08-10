// audio.ts — the four generative geometry voices, crossfaded by the cursor.
//
// Each of Klüver's four form constants gets its OWN harmonic voice with a
// distinct scale + timbre:
//   • tunnel    — low, spacious fifths (sine + sub), long soft tails.
//   • spoke     — stark octaves (square + octave), short and hard.
//   • spiral    — a rising triangle arpeggio on each trigger.
//   • honeycomb — clustered FM bells.
// A soft breathing PAD per voice sits under it, and its level = that voice's
// cursor weight × a shared "energy" that decays between triggers — so the mix is
// note-GATED, not a continuous drone. Pressing a key TRIGGERS a note in every
// active voice at an amplitude proportional to its weight, so the timbre
// crossfades as you morph between constants. Everything routes into the shared
// safe master (high-shelf + lowpass cap + limiter); nothing touches
// ctx.destination directly.

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { mulberry32, SEED, type Weights } from "./field";

// Per-voice note pools (MIDI). A key press picks a degree 0..4 in each pool.
const POOLS: number[][] = [
  [36, 43, 48, 55, 60], // tunnel   — open fifths, low
  [40, 47, 52, 59, 64], // spoke    — stark, fourth/fifth spread
  [57, 60, 64, 67, 72], // spiral   — pentatonic, up high
  [60, 63, 65, 68, 72], // honeycomb— clustered
];
// Pad chords (MIDI) per voice.
const PADS: number[][] = [
  [36, 43], // tunnel: root + fifth
  [40, 52], // spoke: octaves
  [60, 67], // spiral: fifth up high
  [60, 62, 67], // honeycomb: cluster
];
const PAD_BASE = 0.05;
const TREMOLO_HZ = [0.12, 0.19, 0.27, 0.16];

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export interface GeometryVoices {
  readonly ctx: AudioContext;
  /** Crossfade pad levels: weights per voice × decaying energy. */
  setWeights(w: Weights, energy: number, reduce: boolean): void;
  /** Trigger a note (degree 0..4) across all active voices, weighted. */
  trigger(w: Weights, degree: number, velocity: number, reduce: boolean): void;
  stop(): void;
}

interface Pad {
  oscs: OscillatorNode[];
  padMix: GainNode; // sums the pad oscillators
  trem: GainNode; // tremolo-modulated (LFO)
  fade: GainNode; // crossfade level (weight × energy)
  lfo: OscillatorNode;
  lfoGain: GainNode;
}

export async function createGeometryVoices(): Promise<GeometryVoices> {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* resumes on first gesture anyway */
    }
  }

  const master: SafeMaster = createSafeMaster(ctx, { gain: 0.18 });
  const mixBus = ctx.createGain();
  mixBus.gain.value = 1;
  mixBus.connect(master.input);

  const rnd = mulberry32(SEED ^ 0x51);
  const t0 = ctx.currentTime;

  // ── build the four breathing pads ─────────────────────────────────────────
  const pads: Pad[] = PADS.map((chord, i) => {
    const padMix = ctx.createGain();
    padMix.gain.value = 1;
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    const fade = ctx.createGain();
    fade.gain.value = 0.0001;

    // slow tremolo so pads breathe (never a static drone)
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = TREMOLO_HZ[i];
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    lfo.connect(lfoGain);
    lfoGain.connect(trem.gain);
    lfo.start(t0);

    const oscs = chord.map((m) => {
      const o = ctx.createOscillator();
      o.type = i === 1 ? "triangle" : "sine";
      o.frequency.value = midiToHz(m);
      o.detune.value = (rnd() - 0.5) * 7;
      o.connect(padMix);
      o.start(t0);
      return o;
    });

    padMix.connect(trem);
    trem.connect(fade);
    fade.connect(mixBus);
    return { oscs, padMix, trem, fade, lfo, lfoGain };
  });

  const live = new Set<{ nodes: AudioNode[]; oscs: OscillatorNode[] }>();
  let destroyed = false;

  function setWeights(w: Weights, energy: number, reduce: boolean): void {
    if (destroyed || ctx.state === "closed") return;
    const now = ctx.currentTime;
    const e = 0.22 + 0.78 * Math.min(1, Math.max(0, energy)); // whisper floor
    const tc = reduce ? 0.5 : 0.3;
    for (let i = 0; i < 4; i++) {
      const level = w[i] * PAD_BASE * e;
      pads[i].fade.gain.setTargetAtTime(Math.max(0.0001, level), now, tc);
    }
  }

  // one-shot note synth per voice, self-cleaning
  function makeNote(voice: number, midi: number, amp: number, reduce: boolean): void {
    if (destroyed || ctx.state === "closed" || amp < 0.002) return;
    const now = ctx.currentTime;
    const hz = midiToHz(midi);
    const nodes: AudioNode[] = [];
    const oscs: OscillatorNode[] = [];
    const reg = { nodes, oscs };
    live.add(reg);

    const env = ctx.createGain();
    env.gain.value = 0.0001;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    nodes.push(env, tone);
    tone.connect(env);
    env.connect(mixBus);

    let dur = 1.2;

    if (voice === 0) {
      // tunnel: sine + sub octave, spacious
      tone.frequency.value = 900;
      const a = ctx.createOscillator();
      a.type = "sine";
      a.frequency.value = hz;
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = hz * 0.5;
      const subG = ctx.createGain();
      subG.gain.value = 0.6;
      a.connect(tone);
      sub.connect(subG);
      subG.connect(tone);
      nodes.push(subG);
      oscs.push(a, sub);
      a.start(now);
      sub.start(now);
      dur = reduce ? 1.6 : 2.2;
      env.gain.setTargetAtTime(amp * 0.9, now, 0.05);
      env.gain.setTargetAtTime(0.0001, now + 0.2, dur * 0.4);
    } else if (voice === 1) {
      // spoke: stark octaves, square, short + hard
      tone.frequency.value = 2000;
      tone.Q.value = 0.7;
      const a = ctx.createOscillator();
      a.type = "square";
      a.frequency.value = hz;
      const oct = ctx.createOscillator();
      oct.type = "square";
      oct.frequency.value = hz * 2;
      const octG = ctx.createGain();
      octG.gain.value = 0.4;
      a.connect(tone);
      oct.connect(octG);
      octG.connect(tone);
      nodes.push(octG);
      oscs.push(a, oct);
      a.start(now);
      oct.start(now);
      dur = 0.5;
      env.gain.setTargetAtTime(amp * 0.5, now, 0.004);
      env.gain.setTargetAtTime(0.0001, now + 0.06, 0.12);
    } else if (voice === 2) {
      // spiral: a rising triangle arpeggio
      tone.frequency.value = 3200;
      const steps = [0, 3, 7, 10];
      const a = ctx.createOscillator();
      a.type = "triangle";
      a.frequency.value = hz;
      a.connect(tone);
      oscs.push(a);
      a.start(now);
      const stepDur = reduce ? 0.16 : 0.12;
      for (let s = 0; s < steps.length; s++) {
        const tt = now + s * stepDur;
        a.frequency.setValueAtTime(midiToHz(midi + steps[s]), tt);
        env.gain.setTargetAtTime(amp * 0.55, tt, 0.01);
        env.gain.setTargetAtTime(0.0001, tt + stepDur * 0.55, stepDur * 0.4);
      }
      dur = steps.length * stepDur + 0.4;
    } else {
      // honeycomb: clustered FM bell
      tone.frequency.value = 4000;
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = hz;
      const mod = ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.value = hz * 3.5;
      const modG = ctx.createGain();
      modG.gain.value = hz * 2.5;
      modG.gain.setTargetAtTime(hz * 0.2, now, 0.25); // index decays → bell
      mod.connect(modG);
      modG.connect(carrier.frequency);
      carrier.connect(tone);
      // a soft cluster partner a whole tone up
      const partner = ctx.createOscillator();
      partner.type = "sine";
      partner.frequency.value = midiToHz(midi + 2);
      const pG = ctx.createGain();
      pG.gain.value = 0.4;
      partner.connect(pG);
      pG.connect(tone);
      nodes.push(modG, pG);
      oscs.push(carrier, mod, partner);
      carrier.start(now);
      mod.start(now);
      partner.start(now);
      dur = reduce ? 1.4 : 1.8;
      env.gain.setTargetAtTime(amp * 0.7, now, 0.005);
      env.gain.setTargetAtTime(0.0001, now + 0.05, dur * 0.35);
    }

    const stopAt = now + dur;
    for (const o of oscs) {
      try {
        o.stop(stopAt + 0.1);
      } catch {
        /* noop */
      }
    }
    window.setTimeout(
      () => {
        for (const o of oscs) {
          try {
            o.disconnect();
          } catch {
            /* noop */
          }
        }
        for (const n of nodes) {
          try {
            n.disconnect();
          } catch {
            /* noop */
          }
        }
        live.delete(reg);
      },
      (dur + 0.3) * 1000,
    );
  }

  function trigger(w: Weights, degree: number, velocity: number, reduce: boolean): void {
    if (destroyed) return;
    const d = ((degree % 5) + 5) % 5;
    for (let i = 0; i < 4; i++) {
      if (w[i] < 0.04) continue;
      const midi = POOLS[i][d];
      makeNote(i, midi, w[i] * velocity, reduce);
    }
  }

  function stop(): void {
    if (destroyed) return;
    destroyed = true;
    const now = ctx.currentTime;
    for (const p of pads) {
      try {
        p.fade.gain.cancelScheduledValues(now);
        p.fade.gain.setTargetAtTime(0.0001, now, 0.06);
      } catch {
        /* closing */
      }
    }
    window.setTimeout(() => {
      for (const p of pads) {
        for (const o of p.oscs) {
          try {
            o.stop();
          } catch {
            /* noop */
          }
        }
        try {
          p.lfo.stop();
        } catch {
          /* noop */
        }
        for (const n of [...p.oscs, p.padMix, p.trem, p.fade, p.lfo, p.lfoGain]) {
          try {
            n.disconnect();
          } catch {
            /* noop */
          }
        }
      }
      for (const reg of live) {
        for (const o of reg.oscs) {
          try {
            o.stop();
          } catch {
            /* noop */
          }
        }
        for (const n of reg.nodes) {
          try {
            n.disconnect();
          } catch {
            /* noop */
          }
        }
      }
      live.clear();
      try {
        mixBus.disconnect();
        master.disconnect();
      } catch {
        /* noop */
      }
      if (ctx.state !== "closed") void ctx.close();
    }, 260);
  }

  return { ctx, setWeights, trigger, stop };
}
