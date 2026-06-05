/**
 * Audio engine for the Paper Boat voyage.
 *
 * Self-contained Web Audio. No files, no deps. A soft always-on water/wind
 * pad, an evolving chord pad whose voicing follows the boat's lateral lane,
 * gentle bell "gate" chimes quantized to the current mode, and a synthesized
 * convolver reverb. Everything routes into a master gain (~0.5) → brick-wall
 * limiter so a child can never produce a harsh transient.
 */

// ---------------------------------------------------------------------------
// Harmonic arc — D-rooted modal voyage (Campbell: departure → initiation →
// return). Each ACT is a chord + scale (in semitones from a root) + a hue.
// Lane position chooses the *voicing*; gate notes are quantized to the
// act's scale so nothing the child plays is ever "wrong".
// ---------------------------------------------------------------------------

export interface Act {
  name: string;
  rootMidi: number; // MIDI note of the chord root
  chord: number[]; // chord tones, semitone offsets from root
  scale: number[]; // scale degrees (semitones) used to quantize gate notes
  hue: number; // base hue for the sky / water tint (0..360)
  label: string; // child-facing one word
}

// D = MIDI 50 (D3). We move through Dorian → Lydian → Mixolydian → home (D).
export const ACTS: Act[] = [
  {
    name: "departure",
    rootMidi: 50, // D3
    chord: [0, 3, 7, 10], // Dm7
    scale: [0, 2, 3, 5, 7, 9, 10], // D Dorian
    hue: 250, // dusk indigo/violet
    label: "dusk",
  },
  {
    name: "river",
    rootMidi: 53, // F3
    chord: [0, 4, 7, 11], // Fmaj7 (#11 colour via scale)
    scale: [0, 2, 4, 6, 7, 9, 11], // F Lydian
    hue: 215, // deep night blue
    label: "deep night",
  },
  {
    name: "rapids",
    rootMidi: 48, // C3
    chord: [0, 4, 7, 10], // C7
    scale: [0, 2, 4, 5, 7, 9, 10], // C Mixolydian
    hue: 280, // pre-dawn magenta
    label: "before dawn",
  },
  {
    name: "home",
    rootMidi: 50, // D3 — resolved home, major
    chord: [0, 4, 7, 11], // Dmaj7
    scale: [0, 2, 4, 7, 9], // D major pentatonic-ish, soft lullaby
    hue: 35, // dawn amber/peach
    label: "dawn · home",
  },
];

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Quantize an arbitrary midi-ish value to the nearest note in `scale`
 *  (semitone offsets) above `rootMidi`, within a register window. */
export function quantizeToScale(
  rootMidi: number,
  scale: number[],
  octave: number,
  degree: number
): number {
  const n = scale.length;
  const idx = ((degree % n) + n) % n;
  return rootMidi + 12 * octave + scale[idx];
}

// ---------------------------------------------------------------------------
// Reverb impulse — synthesized noise tail (no audio file).
// ---------------------------------------------------------------------------
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // softer, slightly diffuse tail
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export interface BoatAudio {
  ctx: AudioContext;
  /** Set the current act (changes the pad chord + filter colour). */
  setAct: (actIndex: number, voicingX: number) => void;
  /** Continuously update lane voicing (0..1 lateral) + bank proximity (0..1
   *  where 1 = mid-river full, 0 = at a bank thin). */
  steer: (voicingX: number, fullness: number) => void;
  /** Chime a gate. lane 0..(laneCount-1), returns the midi note played. */
  chime: (actIndex: number, lane: number, laneCount: number) => number;
  /** Play one remembered note during the closing replay. */
  playMemory: (midi: number, when: number, dur: number, gain: number) => void;
  /** Soften everything toward the lullaby. */
  toLullaby: () => void;
  destroy: () => Promise<void>;
}

export function createBoatAudio(): BoatAudio | null {
  const AC: typeof AudioContext | undefined =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!AC) return null;

  const ctx = new AC();

  // ---- master bus: gain → limiter → destination ----
  const master = ctx.createGain();
  master.gain.value = 0.5;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20; // brick wall
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ---- reverb send ----
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, 3.2, 2.4);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.5;
  convolver.connect(reverbReturn);
  reverbReturn.connect(master);

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.35;
  reverbSend.connect(convolver);

  // ---- always-on ambient water/wind pad (filtered noise) ----
  const noiseLen = ctx.sampleRate * 2;
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 520;
  noiseFilter.Q.value = 0.6;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.06;
  // slow LFO on the cutoff for a breathing water/wind feel
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain);
  lfoGain.connect(noiseFilter.frequency);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noiseGain.connect(reverbSend);
  noise.start();
  lfo.start();

  // ---- evolving chord pad: a small bank of oscillators retuned per act ----
  const PAD_VOICES = 4;
  const padOscs: OscillatorNode[] = [];
  const padGains: GainNode[] = [];
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.Q.value = 0.5;
  const padBus = ctx.createGain();
  padBus.gain.value = 0.0;
  padFilter.connect(padBus);
  padBus.connect(master);
  padBus.connect(reverbSend);

  for (let i = 0; i < PAD_VOICES; i++) {
    const o = ctx.createOscillator();
    o.type = i % 2 === 0 ? "triangle" : "sine";
    const g = ctx.createGain();
    g.gain.value = 0;
    // gentle detune for warmth
    o.detune.value = (i - PAD_VOICES / 2) * 4;
    o.connect(g);
    g.connect(padFilter);
    o.start();
    padOscs.push(o);
    padGains.push(g);
  }

  let currentAct = 0;
  let lulled = false;

  function applyChord(actIndex: number, voicingX: number) {
    const act = ACTS[Math.max(0, Math.min(ACTS.length - 1, actIndex))];
    currentAct = actIndex;
    const now = ctx.currentTime;
    // voicingX (0..1) spreads / inverts the voicing: left = close low,
    // right = open with the upper extension on top.
    const spread = voicingX; // 0..1
    for (let i = 0; i < PAD_VOICES; i++) {
      const tone = act.chord[i % act.chord.length];
      // higher voices lift an octave when steered right
      const octLift = i >= 2 && spread > 0.55 ? 12 : 0;
      const midi = act.rootMidi + tone + (i >= act.chord.length ? 12 : 0) + octLift;
      padOscs[i].frequency.setTargetAtTime(midiToHz(midi), now, 0.4);
      const vg = 0.05 + 0.03 * Math.sin(i + spread * 3);
      padGains[i].gain.setTargetAtTime(lulled ? vg * 0.6 : vg, now, 0.6);
    }
    // colour the pad filter by act hue position in the arc
    const cutoff = 600 + actIndex * 220 + spread * 500;
    padFilter.frequency.setTargetAtTime(cutoff, now, 0.8);
  }

  function setAct(actIndex: number, voicingX: number) {
    const now = ctx.currentTime;
    padBus.gain.setTargetAtTime(0.5, now, 1.5); // ensure pad audible
    applyChord(actIndex, voicingX);
  }

  function steer(voicingX: number, fullness: number) {
    const now = ctx.currentTime;
    // fullness: 1 mid-river (full texture) → 0 at bank (thinned)
    const thin = 0.35 + 0.65 * Math.max(0, Math.min(1, fullness));
    padBus.gain.setTargetAtTime((lulled ? 0.32 : 0.5) * thin, now, 0.3);
    noiseGain.gain.setTargetAtTime(0.04 + 0.04 * (1 - fullness), now, 0.3);
    // light, cheap re-voice as you move laterally
    applyChord(currentAct, voicingX);
  }

  function chime(actIndex: number, lane: number, laneCount: number): number {
    const act = ACTS[Math.max(0, Math.min(ACTS.length - 1, actIndex))];
    // lane → register + scale degree. Higher lanes ring brighter/higher.
    const octave = 1 + Math.floor((lane / Math.max(1, laneCount - 1)) * 2); // 1..3
    const degree = lane * 2; // spread degrees across lanes
    const midi = quantizeToScale(act.rootMidi, act.scale, octave, degree);
    const freq = midiToHz(midi);
    const now = ctx.currentTime;

    const o = ctx.createOscillator();
    o.type = lane % 2 === 0 ? "sine" : "triangle";
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2.001; // shimmer partial
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g.gain.value = 0;
    g2.gain.value = 0;
    o.connect(g);
    o2.connect(g2);
    g.connect(master);
    g.connect(reverbSend);
    g2.connect(reverbSend);

    const peak = 0.16;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.012); // gentle attack, no click
    g.gain.setTargetAtTime(0.0001, now + 0.05, 0.9);
    g2.gain.setValueAtTime(0.0001, now);
    g2.gain.linearRampToValueAtTime(peak * 0.4, now + 0.02);
    g2.gain.setTargetAtTime(0.0001, now + 0.05, 0.6);

    o.start(now);
    o2.start(now);
    o.stop(now + 2.6);
    o2.stop(now + 2.6);
    const cleanup = () => {
      try {
        o.disconnect();
        o2.disconnect();
        g.disconnect();
        g2.disconnect();
      } catch {
        /* already gone */
      }
    };
    o.onended = cleanup;
    return midi;
  }

  function playMemory(midi: number, when: number, dur: number, gain: number) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = midiToHz(midi);
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = midiToHz(midi) * 1.5; // a fifth shimmer
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g.gain.value = 0;
    g2.gain.value = 0;
    o.connect(g);
    o2.connect(g2);
    g.connect(master);
    g.connect(reverbSend);
    g2.connect(reverbSend);
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.04);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.4, dur * 0.5);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(gain * 0.3, t + 0.05);
    g2.gain.setTargetAtTime(0.0001, t + dur * 0.4, dur * 0.4);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 1.5);
    o2.stop(t + dur + 1.5);
    o.onended = () => {
      try {
        o.disconnect();
        o2.disconnect();
        g.disconnect();
        g2.disconnect();
      } catch {
        /* gone */
      }
    };
  }

  function toLullaby() {
    lulled = true;
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(0.4, now, 3);
    padFilter.frequency.setTargetAtTime(700, now, 4);
    noiseGain.gain.setTargetAtTime(0.035, now, 4);
  }

  async function destroy() {
    try {
      noise.stop();
      lfo.stop();
    } catch {
      /* already stopped */
    }
    for (const o of padOscs) {
      try {
        o.stop();
      } catch {
        /* gone */
      }
    }
    try {
      master.disconnect();
      limiter.disconnect();
      convolver.disconnect();
      reverbReturn.disconnect();
      reverbSend.disconnect();
      padBus.disconnect();
      padFilter.disconnect();
      noiseGain.disconnect();
      noiseFilter.disconnect();
    } catch {
      /* gone */
    }
    try {
      await ctx.close();
    } catch {
      /* already closed */
    }
  }

  return { ctx, setAct, steer, chime, playMemory, toLullaby, destroy };
}
