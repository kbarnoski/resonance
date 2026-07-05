// ─────────────────────────────────────────────────────────────────────────────
// formant.ts — a real formant (vowel) vocal/choir synth in Web Audio.
//
//   The face plays this. Each "voice" is a glottal source (a sawtooth, rich in
//   harmonics) plus a whisper of breath noise, fed through THREE parallel
//   bandpass BiquadFilters tuned to the first three formant frequencies
//   F1/F2/F3. Sweep those centre frequencies between the Peterson & Barney
//   (1952) vowel targets and the filtered source turns into recognisable sung
//   vowels — "ooo" → "aaah" → "eee" — not a buzzer.
//
//   A small unison stack of slightly-detuned voices, plus a shared vibrato LFO,
//   gives the choral shimmer. Pitch is quantised to a major-pentatonic scale so
//   whatever your brows do, the choir stays consonant. A DynamicsCompressor
//   limiter + a conservative, ramped master gain sit before the destination.
// ─────────────────────────────────────────────────────────────────────────────

interface Vowel {
  name: string;
  f: [number, number, number]; // F1, F2, F3 (Hz), Peterson & Barney (1952)
}

// Ordered along the front/back (F2) axis: back-rounded → open → front.
const VOWELS: Vowel[] = [
  { name: "U", f: [300, 870, 2240] },
  { name: "O", f: [500, 1000, 2500] },
  { name: "A", f: [730, 1090, 2440] },
  { name: "E", f: [530, 1840, 2480] },
  { name: "I", f: [270, 2290, 3010] },
];

// Two octaves of major pentatonic (semitone offsets) → always consonant.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const BASE_MIDI = 57; // A3 — a comfortable low choir anchor.

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];

const NUM_VOICES = 3;
// Static unison spread (cents) — the body of the choir.
const VOICE_DETUNE = [-9, 0, 9];

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Smooth 0→1 ramp used to shape the loudness gate. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export interface FormantParams {
  /** jawOpen 0..1 — master gate/loudness AND vowel openness (raises F1). */
  gate: number;
  /** 0..1 vowel front/back position: 0 = /u/, 0.5 = /a/, 1 = /i/. */
  frontness: number;
  /** 0..1 brow raise → step up the pentatonic scale (about one octave). */
  pitch: number;
  /** -1..1 head roll → stereo pan. */
  pan: number;
  /** -1..1 head roll → gentle pitch bend (cents). */
  bend: number;
}

export interface FormantEngine {
  update(p: FormantParams): void;
  /** A soft accent + vibrato swell — fired on a real blink. */
  accent(): void;
  currentVowel(): string;
  currentNote(): string;
  /** Smoothed output level 0..1 for the meter. */
  level(): number;
  stop(): void;
}

interface Voice {
  osc: OscillatorNode;
  filters: BiquadFilterNode[];
  staticDetune: number;
}

/** Build the formant choir engine on an already-running AudioContext. */
export function buildFormantEngine(ctx: AudioContext): FormantEngine {
  const now = ctx.currentTime;

  // ── master chain: mix → masterGain → panner → limiter → destination ─────────
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);

  const panner = ctx.createStereoPanner();

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-14, now);
  limiter.knee.setValueAtTime(6, now);
  limiter.ratio.setValueAtTime(12, now);
  limiter.attack.setValueAtTime(0.004, now);
  limiter.release.setValueAtTime(0.18, now);

  masterGain.connect(panner);
  panner.connect(limiter);
  limiter.connect(ctx.destination);

  const mix = ctx.createGain();
  mix.gain.setValueAtTime(0.5, now);
  mix.connect(masterGain);

  // ── shared vibrato LFO → each voice's detune ───────────────────────────────
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(5.4, now);
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.setValueAtTime(5, now); // resting vibrato ~5 cents
  lfo.connect(vibratoDepth);
  lfo.start();

  // ── voices ──────────────────────────────────────────────────────────────────
  const voices: Voice[] = [];
  for (let v = 0; v < NUM_VOICES; v++) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const staticDetune = VOICE_DETUNE[v] ?? 0;
    osc.detune.setValueAtTime(staticDetune, now);
    vibratoDepth.connect(osc.detune);

    const voiceMix = ctx.createGain();
    voiceMix.gain.setValueAtTime(1 / NUM_VOICES, now);

    const filters: BiquadFilterNode[] = [];
    const formantGain = [1.0, 0.66, 0.4];
    const formantQ = [10, 12, 15];
    for (let k = 0; k < 3; k++) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(VOWELS[2].f[k], now);
      bp.Q.setValueAtTime(formantQ[k], now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(formantGain[k], now);
      osc.connect(bp);
      bp.connect(g);
      g.connect(voiceMix);
      filters.push(bp);
    }
    voiceMix.connect(mix);
    osc.start();
    voices.push({ osc, filters, staticDetune });
  }

  // ── shared breath: a whisper of filtered noise for airiness ─────────────────
  const noiseLen = Math.floor(ctx.sampleRate * 1.5);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const noiseBp = ctx.createBiquadFilter();
  noiseBp.type = "bandpass";
  noiseBp.frequency.setValueAtTime(2200, now);
  noiseBp.Q.setValueAtTime(0.8, now);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.05, now);
  noise.connect(noiseBp);
  noiseBp.connect(noiseGain);
  noiseGain.connect(mix);
  noise.start();

  // ── live state (for the readout) ────────────────────────────────────────────
  let vowelName = "A";
  let noteName = "A3";
  let levelSmoothed = 0;

  const update = (p: FormantParams): void => {
    const t = ctx.currentTime;

    // Vowel: interpolate formant targets along the front/back axis.
    const pos = clamp01(p.frontness) * (VOWELS.length - 1);
    const idx = Math.min(VOWELS.length - 2, Math.floor(pos));
    const frac = pos - idx;
    const a = VOWELS[idx];
    const b = VOWELS[idx + 1];
    vowelName = frac < 0.5 ? a.name : b.name;

    // jawOpen additionally opens the vowel (raises F1), like a dropping jaw.
    const open = 0.82 + clamp01(p.gate) * 0.45;
    for (const voice of voices) {
      for (let k = 0; k < 3; k++) {
        let target = a.f[k] + (b.f[k] - a.f[k]) * frac;
        if (k === 0) target *= open;
        // per-voice micro-offset so the formants shimmer, not phase-lock.
        target *= 1 + (voice.staticDetune / 900) * (k + 1) * 0.12;
        voice.filters[k].frequency.setTargetAtTime(target, t, 0.07);
      }
    }

    // Pitch: quantise brow to the pentatonic scale, glide there (portamento).
    const step = Math.round(clamp01(p.pitch) * (SCALE.length - 1));
    const midi = BASE_MIDI + SCALE[step];
    const freq = midiToFreq(midi);
    const oct = Math.floor(midi / 12) - 1;
    noteName = NOTE_NAMES[((midi % 12) + 12) % 12] + oct;

    const bendCents = Math.max(-1, Math.min(1, p.bend)) * 45;
    for (const voice of voices) {
      voice.osc.frequency.setTargetAtTime(freq, t, 0.06);
      voice.osc.detune.setTargetAtTime(voice.staticDetune + bendCents, t, 0.05);
    }

    // Gate/loudness: mouth closed = silence, mouth open = the choir sings.
    const loud = smoothstep(0.04, 0.55, clamp01(p.gate));
    const master = 0.03 + loud * 0.27;
    masterGain.gain.setTargetAtTime(master, t, 0.05);
    // Breath rides gate but stays subtle.
    noiseGain.gain.setTargetAtTime(0.015 + loud * 0.06, t, 0.08);

    panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, p.pan)) * 0.8, t, 0.08);

    levelSmoothed += (loud - levelSmoothed) * 0.2;
  };

  const accent = (): void => {
    const t = ctx.currentTime;
    // A short vibrato swell + a gentle amplitude bloom — a soft choral accent.
    vibratoDepth.gain.cancelScheduledValues(t);
    vibratoDepth.gain.setValueAtTime(28, t);
    vibratoDepth.gain.setTargetAtTime(5, t + 0.05, 0.5);
    mix.gain.cancelScheduledValues(t);
    mix.gain.setValueAtTime(0.72, t);
    mix.gain.setTargetAtTime(0.5, t + 0.04, 0.4);
  };

  const stop = (): void => {
    const t = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setTargetAtTime(0.0001, t, 0.05);
    const off = t + 0.2;
    try {
      for (const voice of voices) voice.osc.stop(off);
      lfo.stop(off);
      noise.stop(off);
    } catch {
      /* already stopped */
    }
  };

  return {
    update,
    accent,
    currentVowel: () => vowelName,
    currentNote: () => noteName,
    level: () => levelSmoothed,
    stop,
  };
}
