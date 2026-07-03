// voice.ts — a tiny source–filter formant synthesizer + a look-ahead loop
// scheduler for the Verbal Transformation Effect (Warren 1958).
//
// The whole illusion depends on a byte-for-byte identical, click-free loop:
// one recorded word repeated *unchanged* ~1.5–3×/second. After ~15–40 s the
// listener's own auditory system begins to rewrite it into other words that
// were never spoken. So the two jobs here are:
//   1. renderWord() — synthesize a short, natural-ish spoken word offline into
//      a normalized, edge-faded AudioBuffer (no external assets, no fetch).
//   2. VerbalOracleEngine — fire that *same* buffer at an exact period so every
//      repetition is perceptually identical. Invariance is the artwork.

/** A formant target sampled at a moment `t` (seconds) inside the voiced span. */
export type VowelTarget = { t: number; f1: number; f2: number; f3: number };

/** A noise-based articulation cue (fricative hiss like /s/,/f/ or a plosive
 *  burst like /t/) laid over the voiced body. */
export type ConsonantSpec = {
  t: number; // start time (s)
  dur: number; // duration (s)
  center: number; // band-pass center frequency (Hz)
  q: number; // band-pass Q (lower = more diffuse hiss)
  gain: number; // peak amplitude of the burst (pre-normalize)
};

/** A complete one-syllable recipe. */
export type WordRecipe = {
  label: string;
  f0: number; // glottal fundamental (Hz)
  duration: number; // total buffer length (s)
  voicedEnd: number; // when the glottal source stops (s)
  vowelScript: VowelTarget[]; // formant path spelling the vowel nucleus
  consonants: ConsonantSpec[];
  /** Illusory alternates people commonly report — placard hints, not data. */
  alternates: string[];
};

/** mulberry32 — a tiny deterministic PRNG. Used for reproducible synthesis
 *  noise and for the seeded "ghost listener." No Math.random, no Date.now. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string → 32-bit seed so each word gets its own reproducible noise. */
export function seedFromLabel(label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Per-formant filter sharpness (Q) and relative loudness. F1 carries the vowel
// body, F2 the "color," F3 a thin brightness. Kept modest to avoid ringing.
const FORMANT_Q = [5, 8, 9];
const FORMANT_GAIN = [0.95, 0.5, 0.25];

/**
 * Synthesize one word into a normalized, click-free AudioBuffer.
 * Rendered offline so it is deterministic and gesture-independent; `ctx` only
 * supplies the sample rate so the buffer matches the live context.
 */
export async function renderWord(
  ctx: BaseAudioContext,
  recipe: WordRecipe,
): Promise<AudioBuffer> {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.ceil(recipe.duration * sr));
  const off = new OfflineAudioContext(1, len, sr);

  const master = off.createGain();
  master.gain.value = 1;
  master.connect(off.destination);

  const voicedEnd = Math.min(recipe.voicedEnd, recipe.duration);

  // --- Glottal source: a sawtooth buzz with a gentle natural pitch contour ---
  const osc = off.createOscillator();
  osc.type = "sawtooth";
  const f0 = recipe.f0;
  osc.frequency.setValueAtTime(f0 * 0.97, 0);
  osc.frequency.linearRampToValueAtTime(f0 * 1.05, voicedEnd * 0.35);
  osc.frequency.linearRampToValueAtTime(f0 * 0.92, voicedEnd);

  // Voiced amplitude envelope (soft onset + release so the syllable breathes).
  const voice = off.createGain();
  voice.gain.setValueAtTime(0, 0);
  voice.gain.linearRampToValueAtTime(1, Math.min(0.045, voicedEnd * 0.3));
  voice.gain.setValueAtTime(1, Math.max(0.05, voicedEnd - 0.06));
  voice.gain.linearRampToValueAtTime(0, voicedEnd);
  osc.connect(voice);

  // --- Vocal tract: three parallel band-pass formant filters, whose center
  // frequencies are automated along the vowel script to spell the nucleus. ---
  const script =
    recipe.vowelScript.length > 0
      ? recipe.vowelScript
      : [{ t: 0, f1: 500, f2: 1500, f3: 2500 }];
  const keys: (keyof VowelTarget)[] = ["f1", "f2", "f3"];
  for (let i = 0; i < 3; i++) {
    const bp = off.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = FORMANT_Q[i];
    const key = keys[i + 1] as "f1" | "f2" | "f3";
    bp.frequency.setValueAtTime(script[0][key], 0);
    for (const pt of script) {
      bp.frequency.linearRampToValueAtTime(
        pt[key],
        Math.min(pt.t, recipe.duration),
      );
    }
    const g = off.createGain();
    g.gain.value = FORMANT_GAIN[i];
    voice.connect(bp);
    bp.connect(g);
    g.connect(master);
  }

  // --- Consonants: band-passed noise bursts (fricatives + plosive edges) ---
  if (recipe.consonants.length > 0) {
    const noiseBuf = off.createBuffer(1, len, sr);
    const nd = noiseBuf.getChannelData(0);
    const rand = mulberry32(seedFromLabel(recipe.label));
    for (let i = 0; i < len; i++) nd[i] = rand() * 2 - 1;

    for (const c of recipe.consonants) {
      const src = off.createBufferSource();
      src.buffer = noiseBuf;
      const bp = off.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = c.center;
      bp.Q.value = c.q;
      const g = off.createGain();
      const attack = Math.min(0.02, c.dur * 0.4);
      g.gain.setValueAtTime(0, c.t);
      g.gain.linearRampToValueAtTime(c.gain, c.t + attack);
      g.gain.setValueAtTime(c.gain, c.t + c.dur * 0.6);
      g.gain.linearRampToValueAtTime(0, c.t + c.dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(master);
      src.start(0);
    }
  }

  osc.start(0);
  osc.stop(voicedEnd);

  const rendered = await off.startRendering();

  // --- Post: peak-normalize, then cosine-fade both edges to exact silence so
  // that looping the buffer produces no click at the seam. ---
  const data = rendered.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  const norm = peak > 0 ? 0.9 / peak : 1;
  const fade = Math.max(1, Math.floor(0.006 * sr)); // ~6 ms
  for (let i = 0; i < len; i++) {
    let g = norm;
    if (i < fade) g *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    else if (i >= len - fade)
      g *= 0.5 - 0.5 * Math.cos((Math.PI * (len - 1 - i)) / fade);
    data[i] *= g;
  }
  return rendered;
}

/**
 * VerbalOracleEngine — a look-ahead scheduler that fires the *same* AudioBuffer
 * (a fresh source node each time) at an exact period. A short timer stays ~0.2 s
 * ahead of ctx.currentTime and queues plays at `nextTime += period`, so the
 * repetition is sample-accurate and perfectly identical every cycle. Routed
 * through a master gain → soft-limiting compressor → destination.
 */
export class VerbalOracleEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private buffer: AudioBuffer | null = null;
  private rateHz = 2;
  private timer: number | null = null;
  private nextTime = 0;
  private active = new Set<AudioBufferSourceNode>();
  private scheduled: number[] = []; // start times (ctx clock) of recent loops
  private readonly lookahead = 0.2; // s
  private readonly tickMs = 25;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.knee.value = 6;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
  }

  setBuffer(b: AudioBuffer) {
    this.buffer = b;
  }

  setRate(hz: number) {
    this.rateHz = Math.min(3, Math.max(1.2, hz));
  }

  get period(): number {
    return 1 / this.rateHz;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Buffer length in seconds, or 0 if none loaded. */
  get bufferDuration(): number {
    return this.buffer ? this.buffer.duration : 0;
  }

  start() {
    if (!this.buffer || this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.12;
    this.scheduled = [];
    this.tick();
    this.timer = window.setInterval(this.tick, this.tickMs);
  }

  private tick = () => {
    if (!this.buffer) return;
    const now = this.ctx.currentTime;
    const period = this.period;
    while (this.nextTime < now + this.lookahead) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      src.connect(this.master);
      const startAt = this.nextTime;
      src.start(startAt);
      this.active.add(src);
      src.onended = () => {
        this.active.delete(src);
        try {
          src.disconnect();
        } catch {
          // already disconnected
        }
      };
      this.scheduled.push(startAt);
      this.nextTime += period;
    }
    // prune loop marks older than 2 s so lookups stay cheap
    while (this.scheduled.length > 0 && this.scheduled[0] < now - 2) {
      this.scheduled.shift();
    }
  };

  /** Start time (ctx clock) of the loop currently sounding at `now`, or null. */
  currentLoopStart(now: number): number | null {
    let best: number | null = null;
    for (const t of this.scheduled) {
      if (t <= now && (best === null || t > best)) best = t;
    }
    return best;
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const s of this.active) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
      try {
        s.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.active.clear();
    this.scheduled = [];
  }

  dispose() {
    this.stop();
    try {
      this.master.disconnect();
    } catch {
      // noop
    }
    try {
      this.comp.disconnect();
    } catch {
      // noop
    }
  }
}
