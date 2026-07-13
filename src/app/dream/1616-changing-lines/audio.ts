/**
 * audio.ts — a six-voice guqin / gong-pentatonic synth for the changing-lines
 * canon.
 *
 * Each of the six lines of a hexagram maps to one voice in a six-note chord
 * drawn from the Chinese gong pentatonic scale (宫商角徵羽 ≈ do re mi sol la),
 * spread across registers: the bottom line is the lowest voice, the top line
 * the highest. YANG lines sound present and bright; YIN lines sound softer and
 * hollow (a slow amplitude notch — the "gap" of a broken line). A changing line
 * audibly moves: its timbre glides and its pitch bends as the present hexagram
 * dissolves into its transformed self.
 *
 * Signal chain (house rules): every voice → bus → dry + convolver reverb →
 * DynamicsCompressor → master gain (ceiling ≤ 0.16) → destination.
 * Determinism: the reverb impulse is generated from a seeded PRNG — no
 * Math.random anywhere.
 */

import { mulberry32, type LineType } from "./iching";

const MASTER_CEILING = 0.14; // house rule: ≤ 0.16

// Gong-pentatonic voicing on C, one note per line, bottom → top.
// C2 · G2 · D3 · A3 · E4 · C5 — an open pentatonic spread (root, 5th, 9th…).
const LINE_FREQS = [65.41, 98.0, 146.83, 220.0, 329.63, 523.25];

interface Character {
  cutoff: number; // lowpass brightness
  shimmer: number; // octave partial level
  shimmer2: number; // twelfth partial level (metallic sheen)
  tremBase: number; // baseline amplitude
  tremDepth: number; // depth of the slow "gap" notch
}

function characterFor(freq: number, type: LineType): Character {
  if (type === "yang") {
    return {
      cutoff: Math.min(freq * 10, 4200),
      shimmer: 0.17,
      shimmer2: 0.07,
      tremBase: 1.0,
      tremDepth: 0.03,
    };
  }
  // yin — hollow, dimmer, with a slow amplitude gap
  return {
    cutoff: Math.min(freq * 4, 1400),
    shimmer: 0.05,
    shimmer2: 0.015,
    tremBase: 0.6,
    tremDepth: 0.55,
  };
}

interface Voice {
  freq: number;
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  oscC: OscillatorNode;
  shimmerGain: GainNode;
  shimmer2Gain: GainNode;
  filter: BiquadFilterNode;
  amp: GainNode; // pluck envelope
  trem: GainNode; // amplitude notch (modulated by lfo)
  lfoDepth: GainNode; // scales the tremolo LFO into trem.gain
  level: GainNode; // static per-voice level
}

export interface AudioEngine {
  ctx: AudioContext;
  resume(): Promise<void>;
  setMuted(muted: boolean): void;
  /** Set every voice's timbre to match `lines` (quick glide). */
  setCharacters(lines: LineType[], glide?: number): void;
  /** Glide one line's timbre + pitch from present to transformed over `secs`. */
  transitionLine(i: number, from: LineType, to: LineType, secs: number): void;
  /** Soft-attack / long-decay pluck on one voice. */
  pluck(i: number, type: LineType, strength?: number, delay?: number): void;
  /** Pluck all six voices, gently arpeggiated bottom → top. */
  pluckAll(lines: LineType[], strength?: number): void;
  dispose(): void;
}

/** Generate a deterministic temple-hall impulse response (no Math.random). */
function makeReverbIR(ctx: AudioContext): AudioBuffer {
  const rng = mulberry32(0x1c1a1616);
  const seconds = 3.4;
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const ir = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // gentle early-reflection swell, then long exponential tail
      const env = Math.pow(1 - t, 2.6) * (t < 0.02 ? t / 0.02 : 1);
      data[i] = (rng() * 2 - 1) * env;
    }
  }
  return ir;
}

export function createAudio(): AudioEngine {
  const AC: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();
  const now = ctx.currentTime;

  // master chain --------------------------------------------------------
  const master = ctx.createGain();
  master.gain.value = 0;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 24;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.02;
  comp.release.value = 0.28;

  master.connect(comp);
  comp.connect(ctx.destination);

  // reverb send ---------------------------------------------------------
  const bus = ctx.createGain();
  bus.gain.value = 1;

  const dry = ctx.createGain();
  dry.gain.value = 0.7;
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  const convolver = ctx.createConvolver();
  convolver.buffer = makeReverbIR(ctx);

  bus.connect(dry);
  dry.connect(master);
  bus.connect(convolver);
  convolver.connect(wet);
  wet.connect(master);

  // a shared slow tremolo LFO for the yin "gap" ------------------------
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.7;
  lfo.start(now);

  // voices --------------------------------------------------------------
  const voices: Voice[] = LINE_FREQS.map((freq, i) => {
    const oscA = ctx.createOscillator();
    oscA.type = "triangle";
    oscA.frequency.value = freq;

    const oscB = ctx.createOscillator();
    oscB.type = "sine";
    oscB.frequency.value = freq * 2;

    const oscC = ctx.createOscillator();
    oscC.type = "sine";
    oscC.frequency.value = freq * 3.01; // slightly inharmonic sheen

    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.1;
    const shimmer2Gain = ctx.createGain();
    shimmer2Gain.gain.value = 0.03;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq * 6;
    filter.Q.value = 0.6;

    const amp = ctx.createGain();
    amp.gain.value = 0.0001;

    const trem = ctx.createGain();
    trem.gain.value = 1;

    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.03;
    lfo.connect(lfoDepth);
    lfoDepth.connect(trem.gain);

    const level = ctx.createGain();
    // lower voices carry a touch more weight so the chord sits on its root
    level.gain.value = 0.9 - i * 0.07;

    oscA.connect(filter);
    oscB.connect(shimmerGain);
    shimmerGain.connect(filter);
    oscC.connect(shimmer2Gain);
    shimmer2Gain.connect(filter);
    filter.connect(amp);
    amp.connect(trem);
    trem.connect(level);
    level.connect(bus);

    oscA.start(now);
    oscB.start(now);
    oscC.start(now);

    return {
      freq,
      oscA,
      oscB,
      oscC,
      shimmerGain,
      shimmer2Gain,
      filter,
      amp,
      trem,
      lfoDepth,
      level,
    };
  });

  function applyCharacter(v: Voice, c: Character, glide: number) {
    const t = ctx.currentTime;
    const tc = Math.max(0.01, glide / 3);
    v.filter.frequency.setTargetAtTime(c.cutoff, t, tc);
    v.shimmerGain.gain.setTargetAtTime(c.shimmer, t, tc);
    v.shimmer2Gain.gain.setTargetAtTime(c.shimmer2, t, tc);
    v.trem.gain.setTargetAtTime(c.tremBase, t, tc);
    v.lfoDepth.gain.setTargetAtTime(c.tremDepth, t, tc);
  }

  function pluck(i: number, type: LineType, strength = 1, delay = 0) {
    const v = voices[i];
    if (!v) return;
    const t = ctx.currentTime + delay;
    // lower voices a little louder; yin softer than yang
    const reg = 0.55 - i * 0.03;
    const polarity = type === "yang" ? 1 : 0.62;
    const peak = Math.max(0.05, reg * polarity * strength);
    const decay = type === "yang" ? 7.5 : 5.5;
    const g = v.amp.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.linearRampToValueAtTime(peak, t + 0.025); // soft pluck attack
    g.exponentialRampToValueAtTime(0.0001, t + decay); // long guqin decay
  }

  const engine: AudioEngine = {
    ctx,

    async resume() {
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* ignore */
        }
      }
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.linearRampToValueAtTime(MASTER_CEILING, t + 2.2);
    },

    setMuted(muted: boolean) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.linearRampToValueAtTime(
        muted ? 0.0001 : MASTER_CEILING,
        t + 0.4,
      );
    },

    setCharacters(lines: LineType[], glide = 0.5) {
      lines.forEach((type, i) => {
        const v = voices[i];
        if (v) applyCharacter(v, characterFor(v.freq, type), glide);
      });
    },

    transitionLine(i: number, from: LineType, to: LineType, secs: number) {
      const v = voices[i];
      if (!v || from === to) return;
      // timbre glide from present character to transformed character
      applyCharacter(v, characterFor(v.freq, to), secs);
      // pitch bend: a slow glide that signals the line is in motion, then
      // settles back on pitch as the transformed hexagram arrives.
      const t = ctx.currentTime;
      const dir = to === "yang" ? 1 : -1; // rising into yang, falling into yin
      const cents = 45 * dir;
      [v.oscA, v.oscB, v.oscC].forEach((osc) => {
        const d = osc.detune;
        d.cancelScheduledValues(t);
        d.setValueAtTime(d.value, t);
        d.linearRampToValueAtTime(cents, t + secs * 0.45);
        d.linearRampToValueAtTime(0, t + secs);
      });
      // a soft re-pluck partway through, in the transformed voice, so the
      // movement is heard as an arrival, not just a fade.
      pluck(i, to, 0.6, secs * 0.5);
    },

    pluck,

    pluckAll(lines: LineType[], strength = 1) {
      lines.forEach((type, i) => pluck(i, type, strength, i * 0.14));
    },

    dispose() {
      try {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.linearRampToValueAtTime(0.0001, t + 0.1);
      } catch {
        /* ignore */
      }
      try {
        lfo.stop();
        voices.forEach((v) => {
          v.oscA.stop();
          v.oscB.stop();
          v.oscC.stop();
        });
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        if (ctx.state !== "closed") ctx.close().catch(() => {});
      }, 200);
    },
  };

  return engine;
}
