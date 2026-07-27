// ════════════════════════════════════════════════════════════════════════════
// 3136 · Tarab — audio + tuning theory
//
// The ONE question: what if pressing a single key woke a whole body of
// sympathetic strings? This module owns the "resonator bank": a fixed rack of
// tarab (sympathetic) strings, each tuned to a just-intonation raga degree, and
// the coupling law that decides how much a given played note excites each one.
//
// Sympathetic coupling is modelled as SHARED-PARTIAL resonance. A plucked string
// at f0 radiates partials at k·f0; a sympathetic string tuned to fs will ring
// when one of its own partials j·fs coincides with one of the driver's partials
// k·f0. The coupling strength is the best such coincidence, weighted 1/(k·j) so
// the lowest-order agreements dominate — unison (1,1)=1, octave 0.5, fifth
// (3,2)≈0.17, fourth (4,3)≈0.08 … which is exactly the physical ordering of
// sympathetic resonance on a sarangi/sitar. This is the classical modal-synthesis
// view (Adrien 1991): each string is a mode, coupling is spectral overlap.
// ════════════════════════════════════════════════════════════════════════════

// ── Deterministic PRNG (mulberry32). No Math.random / Date anywhere. ──────────
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Equal-tempered MIDI → Hz (the keybed is honest ET, no quantizer added). ───
export function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// ── The playable front rack: one rod per MIDI note, C3..C5 (2 octaves). ───────
export const PLAY_LO = 48; // C3
export const PLAY_HI = 72; // C5
export const PLAY_COUNT = PLAY_HI - PLAY_LO + 1; // 25
export const PLAY_FREQS: number[] = Array.from({ length: PLAY_COUNT }, (_, i) =>
  mtof(PLAY_LO + i),
);

// ── The sympathetic (tarab) rack: a just-intoned raga across ~3 octaves. ──────
// Warm, major-leaning Bilaval-flavoured set; JI ratios sharpen integer-ratio
// coupling so consonant played notes bloom and dissonant ones only shimmer.
const RAGA_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const RAGA_NAMES = ["Sa", "Re", "Ga", "ma", "Pa", "Dha", "Ni"];
const TARAB_BASE = mtof(PLAY_LO); // Sa = C3

export const TARAB_FREQS: number[] = [];
export const TARAB_LABELS: string[] = [];
for (let oct = 0; oct < 3; oct++) {
  for (let d = 0; d < RAGA_RATIOS.length; d++) {
    TARAB_FREQS.push(TARAB_BASE * RAGA_RATIOS[d] * Math.pow(2, oct));
    TARAB_LABELS.push(RAGA_NAMES[d] + "'".repeat(oct));
  }
}
// Cap Sa three octaves up so the rack ends on the tonic (22 strings).
TARAB_FREQS.push(TARAB_BASE * 8);
TARAB_LABELS.push("Sa'''");
export const TARAB_COUNT = TARAB_FREQS.length;

// ── Coupling law: shared-partial spectral overlap (see header). ───────────────
function centsBetween(a: number, b: number): number {
  return 1200 * Math.log2(a / b);
}

export function coupling(f0: number, fs: number): number {
  const width = 30; // cents; how sharply a coincidence must line up
  let best = 0;
  for (let k = 1; k <= 6; k++) {
    for (let j = 1; j <= 6; j++) {
      const c = centsBetween(k * f0, j * fs);
      const x = c / width;
      const g = (Math.exp(-x * x) / (k * j));
      if (g > best) best = g;
    }
  }
  return best; // 1 at unison, 0.5 octave, ~0.17 fifth …
}

// Coupling of one played frequency to every tarab string.
export function couplingVector(f0: number): number[] {
  return TARAB_FREQS.map((fs) => coupling(f0, fs));
}

// ── Karplus-Strong pluck render (seeded → deterministic buffers). ─────────────
// A delay line of length sr/freq is excited with a shaped seeded noise burst,
// then fed back through a two-tap averaging lowpass scaled by damping rho. The
// averaging filter is what decays high partials first into a warm fundamental —
// authentic plucked-string timbre for both driver and sympathetic strings.
function renderKarplus(
  sampleRate: number,
  freq: number,
  seconds: number,
  rho: number,
  rng: () => number,
): Float32Array {
  const total = Math.max(1, Math.floor(sampleRate * seconds));
  const n = Math.max(2, Math.round(sampleRate / freq));
  const line = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const white = rng() * 2 - 1;
    prev = 0.6 * white + 0.4 * prev;
    line[i] = prev;
  }
  const out = new Float32Array(total);
  let idx = 0;
  for (let i = 0; i < total; i++) {
    const cur = line[idx];
    const next = line[(idx + 1) % n];
    out[i] = cur;
    line[idx] = rho * 0.5 * (cur + next);
    idx = (idx + 1) % n;
  }
  let peak = 1e-6;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = 0.92 / peak;
  for (let i = 0; i < total; i++) out[i] *= g;
  return out;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

// Result of one strike: which front rod lit, and the coupling to every tarab.
export interface StrikeResult {
  rod: number; // index into the front rack (octave-folded if out of range)
  couplings: number[]; // length TARAB_COUNT
}

const COUPLING_THRESHOLD = 0.06; // below this a tarab string stays dark/silent

export class TarabAudio {
  ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private wet: GainNode;
  private delay: DelayNode;
  private fb: GainNode;
  private tone: BiquadFilterNode;
  private tarabBuffers: (AudioBuffer | null)[] = [];
  private playedCache = new Map<number, AudioBuffer>();
  private live = new Set<Voice>();

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();
    const sr = this.ctx.sampleRate;

    // Pre-render one long, slowly-decaying buffer per tarab string.
    const rng = makeRng(0x7a11ab00);
    for (let i = 0; i < TARAB_COUNT; i++) {
      const f = TARAB_FREQS[i];
      const rho = 0.9975 - (i / TARAB_COUNT) * 0.004; // slow decay, top a touch faster
      const seconds = 6.0 - (i / TARAB_COUNT) * 2.0;
      const data = renderKarplus(sr, f, seconds, rho, rng);
      const buf = this.ctx.createBuffer(1, data.length, sr);
      buf.getChannelData(0).set(data);
      this.tarabBuffers.push(buf);
    }

    // Master chain: voices → warm lowpass → compressor → gain → destination,
    // with a small feedback-delay send for the tarab shimmer/room.
    this.tone = this.ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 5200;
    this.tone.Q.value = 0.5;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.3;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.14;

    this.delay = this.ctx.createDelay(0.6);
    this.delay.delayTime.value = 0.19;
    this.fb = this.ctx.createGain();
    this.fb.gain.value = 0.34;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.13;

    this.tone.connect(this.comp);
    this.comp.connect(this.master);
    this.comp.connect(this.delay);
    this.delay.connect(this.fb);
    this.fb.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  async resume() {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  // Lazily render (and cache) a driver pluck for any MIDI note so the keybed
  // plays its true pitch — no quantization onto a scale grid.
  private playedBuffer(midi: number): AudioBuffer {
    const key = Math.round(midi);
    const cached = this.playedCache.get(key);
    if (cached) return cached;
    const sr = this.ctx.sampleRate;
    const rng = makeRng(0x0d0e0000 ^ (key * 2654435761));
    const data = renderKarplus(sr, mtof(key), 2.4, 0.9955, rng);
    const buf = this.ctx.createBuffer(1, data.length, sr);
    buf.getChannelData(0).set(data);
    this.playedCache.set(key, buf);
    return buf;
  }

  private voice(buf: AudioBuffer, amp: number, attack: number, dest: AudioNode) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(amp, t + attack);
    src.connect(gain);
    gain.connect(dest);
    const v: Voice = { src, gain };
    this.live.add(v);
    src.onended = () => {
      try {
        gain.disconnect();
        src.disconnect();
      } catch {
        /* already gone */
      }
      this.live.delete(v);
    };
    src.start(t);
  }

  // Strike a note: play its true-pitch driver, then bloom every sympathetic
  // string in proportion to its harmonic coupling. Returns the coupling map so
  // the visuals ring exactly the strings you hear.
  strike(midi: number, velocity: number): StrikeResult {
    const vel = Math.max(0.05, Math.min(1, velocity));
    const f0 = mtof(midi);

    // Driver pluck (the note you decided to play).
    this.voice(this.playedBuffer(midi), 0.28 + vel * 0.4, 0.004, this.tone);

    // Sympathetic bloom.
    const couplings = couplingVector(f0);
    for (let i = 0; i < TARAB_COUNT; i++) {
      const c = couplings[i];
      if (c < COUPLING_THRESHOLD) {
        couplings[i] = 0;
        continue;
      }
      const buf = this.tarabBuffers[i];
      if (buf) {
        // Slow, sympathetic build-up; amplitude ∝ coupling · velocity.
        this.voice(buf, c * vel * 0.5, 0.03 + (1 - c) * 0.05, this.tone);
      }
    }

    // Fold the true MIDI note into a front-rack rod for the visuals.
    let rod = Math.round(midi) - PLAY_LO;
    while (rod < 0) rod += 12;
    while (rod >= PLAY_COUNT) rod -= 12;
    return { rod, couplings };
  }

  close() {
    for (const v of this.live) {
      try {
        v.src.stop();
        v.src.disconnect();
        v.gain.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.live.clear();
    try {
      this.tone.disconnect();
      this.comp.disconnect();
      this.delay.disconnect();
      this.fb.disconnect();
      this.wet.disconnect();
      this.master.disconnect();
    } catch {
      /* ignore */
    }
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}
