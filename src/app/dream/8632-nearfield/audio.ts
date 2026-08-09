// ════════════════════════════════════════════════════════════════════════════
// Nearfield (8632) — the VEIL restoration engine.
//
// A seeded, band-limited musical loop (piano/bell arpeggio + pad, key of A
// minor) is synthesized once, deterministically, into an AudioBuffer. It then
// runs through a rule-based DSP chain — NO machine learning — governed by a
// single macro depth `d ∈ [0,1]`:
//
//   d = 0  →  far / muffled: LP ~800Hz + HP ~300Hz (telephone band), dark tilt,
//            no sub, no sparkle, reverb-drenched & distant, quiet.
//   d = 1  →  near / vivid:  filters open to ~18kHz / ~25Hz, harmonic exciter
//            synthesizes upper partials, subharmonic oscillator restores body,
//            bright tilt, reverb pulls back to dry, gain rises.
//
// Restoration techniques (all classical DSP):
//   • Missing highs  → aural exciter: bandpass a copy of the mid band, push it
//     through a saturating waveshaper to synthesize new upper partials, HP it,
//     mix back in (Aphex Aural Exciter / SBR lineage).
//   • Missing lows   → subharmonic synthesis: an envelope follower on the loop's
//     low band drives a sub oscillator pitched to the current chord root, one
//     octave down — restoring phantom-fundamental body.
//   • Presence       → dynamic tilt EQ (dark→bright shelving) + a short early-
//     reflection convolution room whose wet/dry crossfades near→far.
//
// Determinism: every random value comes from mulberry32(0x8632). No Math.random,
// no argless Date. Timing uses performance.now() upstream.
// ════════════════════════════════════════════════════════════════════════════

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

export function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitAudioContext ||
    null
  );
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Loop is 8s of A-minor: Am – F – C – G, two seconds each.
export const LOOP_SECONDS = 8;

// Chord tones (MIDI) arpeggiated per 2s segment.
const CHORDS: number[][] = [
  [57, 60, 64, 69], // Am : A3 C4 E4 A4
  [53, 57, 60, 65], // F  : F3 A3 C4 F4
  [48, 52, 55, 60], // C  : C3 E3 G3 C4
  [55, 59, 62, 67], // G  : G3 B3 D4 G4
];

// Sub-oscillator root (Hz) per segment — one octave under the chord root,
// tracking the harmony so the restored body stays consonant.
const SUB_ROOTS = [55.0, 43.65, 65.41, 49.0]; // A1, F1, C2, G1

/** Render the seeded band-limited loop into an AudioBuffer via additive
 *  synthesis. Notes wrap-add across the loop boundary → seamless loop. */
function buildLoopBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const N = Math.floor(LOOP_SECONDS * sr);
  const buf = ctx.createBuffer(1, N, sr);
  const data = buf.getChannelData(0);
  const rand = mulberry32(0x8632);

  // Slight per-partial detune field (fixed, seeded) → gentle chorus/life.
  const detune = new Float32Array(6);
  for (let i = 0; i < detune.length; i++) detune[i] = 1 + (rand() - 0.5) * 0.004;

  const twoPi = Math.PI * 2;

  // Bell / piano voice: a struck note, inharmonic partials, exp decay.
  const addNote = (startSec: number, freq: number, amp: number, decay: number) => {
    const start = Math.floor(startSec * sr);
    const dur = Math.floor(Math.min(LOOP_SECONDS, 2.2) * sr);
    const partials = [1, 2, 3, 4.2, 5.4];
    const pAmp = [1, 0.5, 0.32, 0.16, 0.09];
    for (let n = 0; n < dur; n++) {
      const t = n / sr;
      const env = Math.exp(-t * decay) * (1 - Math.exp(-t * 400)); // fast attack
      if (env < 0.0005) break;
      let s = 0;
      for (let p = 0; p < partials.length; p++) {
        s += pAmp[p] * Math.sin(twoPi * freq * partials[p] * detune[p] * t);
      }
      const idx = (start + n) % N; // wrap-add for seamless loop
      data[idx] += s * amp * env;
    }
  };

  // Sustained pad: low triad drone per segment, soft sine, slow tremolo.
  const addPad = (startSec: number, freq: number, amp: number) => {
    const start = Math.floor(startSec * sr);
    const seg = Math.floor(2 * sr);
    for (let n = 0; n < seg; n++) {
      const t = n / sr;
      // 100ms attack & release inside the segment so wrap edges are gentle.
      const a = Math.min(1, t / 0.1);
      const r = Math.min(1, (2 - t) / 0.1);
      const env = Math.max(0, Math.min(a, r));
      const trem = 0.85 + 0.15 * Math.sin(twoPi * 0.7 * t);
      const s =
        Math.sin(twoPi * freq * t) + 0.3 * Math.sin(twoPi * freq * 2 * t);
      const idx = (start + n) % N;
      data[idx] += s * amp * env * trem;
    }
  };

  for (let c = 0; c < CHORDS.length; c++) {
    const segStart = c * 2;
    const chord = CHORDS[c];
    // Arpeggio: 4 notes at 0, 0.5, 1.0, 1.5s.
    for (let k = 0; k < 4; k++) {
      const freq = midiToFreq(chord[k]);
      addNote(segStart + k * 0.5, freq, 0.16, 3.2 + k * 0.4);
    }
    // Pad: chord root two octaves down + its fifth, quiet.
    const rootHz = midiToFreq(chord[0] - 12);
    addPad(segStart, rootHz, 0.06);
    addPad(segStart, rootHz * 1.5, 0.035);
  }

  // Normalize to a safe peak.
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) {
    const g = 0.85 / peak;
    for (let i = 0; i < N; i++) data[i] *= g;
  }
  return buf;
}

/** Seeded exponential-decay stereo impulse response → a short room. */
function buildImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(seconds * sr);
  const ir = ctx.createBuffer(2, len, sr);
  const rand = mulberry32(0x8632 ^ 0x51ed);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // A couple of early reflections then diffuse exp tail.
      const decay = Math.pow(1 - t, 2.6);
      d[i] = (rand() * 2 - 1) * decay;
    }
    // Two discrete early reflections for "room" cues.
    d[Math.floor(0.011 * sr)] += ch === 0 ? 0.5 : 0.35;
    d[Math.floor(0.023 * sr)] += ch === 0 ? 0.32 : 0.45;
  }
  return ir;
}

/** Saturating waveshaper curve for the aural exciter (odd + a little even
 *  harmonic content → synthesized "air"). */
function buildExciterCurve(): Float32Array {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = 0.7 * Math.tanh(4 * x) + 0.3 * (x < 0 ? 0 : x); // asymmetric
  }
  return c;
}

/** The restoration engine: seeded loop → veil DSP → destination + analyser. */
export class VeilEngine {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode; // taps the restored (post-DSP) signal
  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0;

  // veil / restoration nodes
  private hp: BiquadFilterNode;
  private lp: BiquadFilterNode;
  private lowShelf: BiquadFilterNode;
  private highShelf: BiquadFilterNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private convolver: ConvolverNode;
  private masterGain: GainNode;

  // exciter (missing highs)
  private exBand: BiquadFilterNode;
  private exShaper: WaveShaperNode;
  private exHp: BiquadFilterNode;
  private exGain: GainNode;

  // subharmonic (missing lows)
  private subOsc: OscillatorNode;
  private subVCA: GainNode;
  private subTap: BiquadFilterNode; // low tap → envelope follower
  private subAnalyser: AnalyserNode;
  private subBuf: Float32Array;

  // mic (drives depth; NOT routed to output)
  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micBuf: Float32Array | null = null;

  private loopBuf: AudioBuffer;
  private lowEnv = 0;
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.loopBuf = buildLoopBuffer(ctx);

    // ── restored-signal analyser (feeds the visual spectrogram) ──
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;

    // ── main band chain ──
    this.hp = ctx.createBiquadFilter();
    this.hp.type = "highpass";
    this.hp.Q.value = 0.7;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.Q.value = 0.7;
    this.lowShelf = ctx.createBiquadFilter();
    this.lowShelf.type = "lowshelf";
    this.lowShelf.frequency.value = 320;
    this.highShelf = ctx.createBiquadFilter();
    this.highShelf.type = "highshelf";
    this.highShelf.frequency.value = 3200;

    // ── near/far room ──
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = buildImpulse(ctx, 1.6);
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.9;

    // ── aural exciter (highs) ──
    this.exBand = ctx.createBiquadFilter();
    this.exBand.type = "bandpass";
    this.exBand.frequency.value = 2000;
    this.exBand.Q.value = 0.7;
    this.exShaper = ctx.createWaveShaper();
    this.exShaper.curve = buildExciterCurve() as unknown as Float32Array<ArrayBuffer>;
    this.exShaper.oversample = "2x";
    this.exHp = ctx.createBiquadFilter();
    this.exHp.type = "highpass";
    this.exHp.frequency.value = 3500;
    this.exHp.Q.value = 0.7;
    this.exGain = ctx.createGain();
    this.exGain.gain.value = 0;

    // ── subharmonic synth (lows) ──
    this.subOsc = ctx.createOscillator();
    this.subOsc.type = "sine";
    this.subOsc.frequency.value = SUB_ROOTS[0];
    this.subVCA = ctx.createGain();
    this.subVCA.gain.value = 0;
    this.subTap = ctx.createBiquadFilter();
    this.subTap.type = "lowpass";
    this.subTap.frequency.value = 180;
    this.subAnalyser = ctx.createAnalyser();
    this.subAnalyser.fftSize = 512;
    this.subBuf = new Float32Array(
      new ArrayBuffer(this.subAnalyser.fftSize * 4),
    );
  }

  /** Wire the graph and start the seeded loop. Call from a user gesture. */
  start() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.loopBuf;
    src.loop = true;
    this.source = src;

    // source → band chain
    src.connect(this.hp);
    this.hp.connect(this.lp);
    this.lp.connect(this.lowShelf);
    this.lowShelf.connect(this.highShelf);
    // band → dry + wet room
    this.highShelf.connect(this.dryGain);
    this.highShelf.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.dryGain.connect(this.masterGain);
    this.wetGain.connect(this.masterGain);

    // exciter path (tapped pre-filter, from the raw source mid band)
    src.connect(this.exBand);
    this.exBand.connect(this.exShaper);
    this.exShaper.connect(this.exHp);
    this.exHp.connect(this.exGain);
    this.exGain.connect(this.masterGain);

    // sub path
    this.subOsc.connect(this.subVCA);
    this.subVCA.connect(this.masterGain);
    // low envelope tap (source → lowpass → analyser, not audible)
    src.connect(this.subTap);
    this.subTap.connect(this.subAnalyser);

    // master → speakers + visual analyser
    this.masterGain.connect(this.analyser);
    this.masterGain.connect(ctx.destination);

    this.subOsc.start();
    src.start(0);
    this.startedAt = ctx.currentTime;
  }

  /** Attempt to attach the mic as the depth control (loudness = lean-in).
   *  Returns true on success. Mic is analysed only — never routed to output. */
  async attachMic(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.micStream = stream;
      const srcNode = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 1024;
      srcNode.connect(an);
      this.micAnalyser = an;
      this.micBuf = new Float32Array(new ArrayBuffer(an.fftSize * 4));
      return true;
    } catch {
      return false;
    }
  }

  /** Current mic loudness (RMS 0..1-ish), or null if no mic. */
  micLevel(): number | null {
    const an = this.micAnalyser;
    const buf = this.micBuf;
    if (!an || !buf) return null;
    an.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    return clamp(rms * 3.2, 0, 1); // scale quiet rooms up
  }

  /** Map depth d∈[0,1] onto the whole restoration chain. Call every frame. */
  update(d: number) {
    if (this.disposed || !this.source) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const tc = 0.06;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, now, tc);

    // Filters open as it draws near.
    set(this.hp.frequency, 300 * Math.pow(25 / 300, d)); // 300 → 25 Hz
    set(this.lp.frequency, 800 * Math.pow(18000 / 800, d)); // 800 → 18k Hz

    // Tilt EQ: dark (boomy + rolled highs) → bright & present.
    set(this.lowShelf.gain, 5 - 5 * d); // +5dB muddy → 0
    set(this.highShelf.gain, -20 + 28 * d); // -20dB → +8dB

    // Room: far & wet → near & dry.
    set(this.wetGain.gain, 0.9 * (1 - d) + 0.04);
    set(this.dryGain.gain, 0.25 + 0.75 * d);
    set(this.masterGain.gain, 0.45 + 0.5 * d);

    // Exciter highs bloom in super-linearly at the top of the range.
    set(this.exGain.gain, 0.55 * Math.pow(d, 1.6));

    // Subharmonic: envelope-follow the loop's low band, pitch to chord root.
    this.subAnalyser.getFloatTimeDomainData(
      this.subBuf as unknown as Float32Array<ArrayBuffer>,
    );
    let s = 0;
    for (let i = 0; i < this.subBuf.length; i++) s += this.subBuf[i] * this.subBuf[i];
    const rms = Math.sqrt(s / this.subBuf.length);
    this.lowEnv = this.lowEnv * 0.8 + rms * 0.2;
    const phase = (now - this.startedAt) % LOOP_SECONDS;
    const seg = Math.min(3, Math.floor(phase / 2));
    set(this.subOsc.frequency, SUB_ROOTS[seg]);
    set(this.subVCA.gain, Math.pow(d, 1.2) * this.lowEnv * 2.6);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.subOsc.stop();
    } catch {
      /* already stopped */
    }
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    // Disconnect everything.
    const nodes: AudioNode[] = [
      this.hp,
      this.lp,
      this.lowShelf,
      this.highShelf,
      this.dryGain,
      this.wetGain,
      this.convolver,
      this.masterGain,
      this.exBand,
      this.exShaper,
      this.exHp,
      this.exGain,
      this.subOsc,
      this.subVCA,
      this.subTap,
      this.subAnalyser,
      this.analyser,
    ];
    if (this.micAnalyser) nodes.push(this.micAnalyser);
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* noop */
      }
    }
    void this.ctx.close();
  }
}

// ── Column extraction for the spectrogram ────────────────────────────────────

export const SPECTRO_BINS = 256;

/** Log-frequency resample of the analyser magnitude into SPECTRO_BINS columns
 *  (musical: low freqs get more resolution). Fills `out` (Uint8, 0..255). */
export function makeColumnFromAnalyser(
  analyser: AnalyserNode,
  freqBuf: Uint8Array,
  out: Uint8Array,
) {
  analyser.getByteFrequencyData(freqBuf as unknown as Uint8Array<ArrayBuffer>);
  const bins = freqBuf.length;
  const minF = 40;
  const maxF = 16000;
  const nyquist = analyser.context.sampleRate / 2;
  for (let i = 0; i < SPECTRO_BINS; i++) {
    const frac = i / (SPECTRO_BINS - 1);
    const f = minF * Math.pow(maxF / minF, frac); // log scale
    const bin = Math.min(bins - 1, Math.round((f / nyquist) * bins));
    out[i] = freqBuf[bin];
  }
}

/** Synthetic spectrogram column for the MUTED auto-demo — no AudioContext.
 *  Models the same loop: a handful of harmonic peaks that pulse with the
 *  arpeggio, band-limited by d so the veil/bloom reads with zero sound. */
export function makeDemoColumn(
  tSec: number,
  d: number,
  out: Uint8Array,
  rand01: (i: number) => number,
) {
  const phase = tSec % LOOP_SECONDS;
  const seg = Math.min(3, Math.floor(phase / 2));
  const chord = CHORDS[seg];
  const inSeg = phase - seg * 2;
  const minF = 40;
  const maxF = 16000;

  // Restoration band edges (mirror the audio HP/LP sweep).
  const hpF = 300 * Math.pow(25 / 300, d);
  const lpF = 800 * Math.pow(18000 / 800, d);

  for (let i = 0; i < SPECTRO_BINS; i++) {
    const frac = i / (SPECTRO_BINS - 1);
    const f = minF * Math.pow(maxF / minF, frac);
    let mag = 0;

    // Chord partials (bell): fundamental + a few harmonics, decaying per note.
    for (let k = 0; k < 4; k++) {
      const noteOn = k * 0.5;
      const age = inSeg - noteOn;
      if (age < 0) continue;
      const noteAmp = Math.exp(-age * 2.6);
      const base = 440 * Math.pow(2, (chord[k] - 69) / 12);
      for (let h = 1; h <= 6; h++) {
        const pf = base * h;
        const width = pf * 0.03 + 12;
        const dist = Math.abs(f - pf);
        if (dist < width * 3) {
          mag += (noteAmp / h) * Math.exp(-(dist * dist) / (2 * width * width));
        }
      }
    }
    // Pad / sub body near the root, only present as d restores lows.
    const subF = SUB_ROOTS[seg];
    const dsub = Math.abs(f - subF);
    mag += 0.5 * Math.pow(d, 1.2) * Math.exp(-(dsub * dsub) / (2 * 220));

    // Band-limit like the veil: attenuate outside [hpF, lpF].
    let bandGain = 1;
    if (f < hpF) bandGain *= Math.exp(-(hpF - f) / (hpF * 0.4 + 1));
    if (f > lpF) bandGain *= Math.exp(-(f - lpF) / (lpF * 0.5 + 1));
    // Exciter: synthesized highs bloom above ~3.5k as d→1.
    if (f > 3500) bandGain += 0.6 * Math.pow(d, 1.6) * Math.exp(-(f - 3500) / 9000);

    mag *= bandGain;
    // Seeded floor grain.
    mag += 0.03 * rand01(i) * (0.4 + 0.6 * d);

    out[i] = Math.max(0, Math.min(255, Math.round(mag * 235)));
  }
}
