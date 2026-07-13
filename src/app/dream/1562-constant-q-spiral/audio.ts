// ─────────────────────────────────────────────────────────────────────────────
// 1562-constant-q-spiral — audio.ts
//
// The lab's FIRST Constant-Q Transform AND first use of Web Audio's
// IIRFilterNode (both grep-0× across the whole gallery — every other piece uses
// FFT via the AnalyserNode frequency-bin API). Here the analysis is a real,
// geometrically-spaced bank of resonant IIR bandpass filters — a live CQT /
// scalogram, NOT an FFT.
//
// Signal graph:
//
//   mic  ─┐
//         ├─► inputGain ─┬─► IIR band[0]  ─► tap[0] (AnalyserNode, RMS only)
//   synth ┘              │                └─► voiceGain[0] ─┐
//   carrier              ├─► IIR band[1]  ─► tap[1] ...      ├─► sumBus ─► master
//                        │                                  │            (≤0.15)
//                        └─► IIR band[N]  ─► tap[N] ...  ────┘            │
//                                                                        ▼
//                                                            DynamicsCompressor
//                                                              (limiter) ─► out
//
// Each tap AnalyserNode is used ONLY for getFloatTimeDomainData → RMS (the CQT
// column energy), never for its FFT. The summed band outputs are what you HEAR
// — the resonant filterbank ringing — so the picture and the sound are the
// exact same 60 numbers (the see = hear weld).
// ─────────────────────────────────────────────────────────────────────────────

import {
  makeBands,
  rbjBandpass,
  mulberry32,
  BAND_Q,
  NUM_BANDS,
  type CqtBand,
} from "./cqt";

export interface StartResult {
  mic: boolean;
  error: string | null;
}

const MASTER_GAIN = 0.15; // hard ceiling well under the 0.2 cap
const BAND_AUDIBLE_GAIN = 0.22; // per-band contribution to the audible ring
const RMS_SMOOTH = 0.72; // EMA on the per-band level (visual stability)

export class CqtEngine {
  readonly bands: CqtBand[] = makeBands();
  /** Smoothed per-band RMS, 0..~1. The CQT column the helix draws + hears. */
  readonly levels = new Float32Array(NUM_BANDS);

  private ctx: AudioContext | null = null;
  private inputGain: GainNode | null = null;
  private sumBus: GainNode | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;

  private filters: IIRFilterNode[] = [];
  private taps: AnalyserNode[] = [];
  private tapBufs: Float32Array[] = [];

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  // Seeded synth carrier (idle self-demo) — an evolving harmonic arpeggio.
  private carrierGain: GainNode | null = null;
  private carrierOn = false;
  private prng = mulberry32(0x1562c);
  private nextNoteTime = 0;
  private scaleDegree = 0;

  running = false;
  micActive = false;
  reduced = false;

  /** Build the graph, start the idle carrier immediately, then try the mic.
   *  Must be called from a user gesture (AudioContext resume). */
  async start(): Promise<StartResult> {
    if (this.running) return { mic: this.micActive, error: null };

    const Ctx: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? window.AudioContext ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).webkitAudioContext
        : undefined;
    if (!Ctx) return { mic: false, error: "no-audiocontext" };

    const ctx = new Ctx();
    this.ctx = ctx;
    try {
      await ctx.resume();
    } catch {
      /* resume may reject off-gesture; the shared cleanup layer retries */
    }

    this.buildGraph();
    this.startCarrier();
    this.running = true;

    // Try the mic — the carrier keeps sounding while the prompt is open.
    let micError: string | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.attachMic(stream);
    } catch (e) {
      micError = e instanceof Error ? e.name || e.message : "mic-denied";
    }

    return { mic: this.micActive, error: micError };
  }

  private buildGraph() {
    const ctx = this.ctx;
    if (!ctx) return;
    const sr = ctx.sampleRate;

    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 0;
    comp.ratio.value = 20;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;
    this.comp = comp;

    const sumBus = ctx.createGain();
    sumBus.gain.value = 1;
    sumBus.connect(master);
    this.sumBus = sumBus;

    const inputGain = ctx.createGain();
    inputGain.gain.value = 1;
    this.inputGain = inputGain;

    // One resonant IIR bandpass + one RMS tap per band.
    for (const band of this.bands) {
      const { feedforward, feedback } = rbjBandpass(band.freq, sr, BAND_Q);
      const iir = ctx.createIIRFilter(feedforward, feedback);
      inputGain.connect(iir);

      const tap = ctx.createAnalyser();
      tap.fftSize = 1024; // time-domain window, ~23 ms — covers even 65 Hz
      iir.connect(tap); // tap has no downstream — pure measurement

      const voiceGain = ctx.createGain();
      voiceGain.gain.value = BAND_AUDIBLE_GAIN;
      iir.connect(voiceGain);
      voiceGain.connect(sumBus);

      this.filters.push(iir);
      this.taps.push(tap);
      this.tapBufs.push(new Float32Array(new ArrayBuffer(tap.fftSize * 4)));
    }
  }

  // ── Seeded synth carrier: evolving sawtooth arpeggio through the bank ──────
  private startCarrier() {
    const ctx = this.ctx;
    const inputGain = this.inputGain;
    if (!ctx || !inputGain) return;
    const cg = ctx.createGain();
    cg.gain.value = 0.9;
    cg.connect(inputGain);
    this.carrierGain = cg;
    this.carrierOn = true;
    this.nextNoteTime = ctx.currentTime + 0.05;
  }

  // Pentatonic-ish semitone offsets (C D E G A) over the band grid, so the
  // carrier walks tidy chroma that light clean radial arms on the spiral.
  private static SCALE = [0, 2, 4, 7, 9, 12, 16, 19];

  /** Schedule any carrier notes due in the look-ahead window. Sawtooth voices
   *  are short-lived (create → ramp → stop) so concurrency stays ≤ ~3. */
  private pumpCarrier(now: number) {
    const ctx = this.ctx;
    const cg = this.carrierGain;
    if (!ctx || !cg || !this.carrierOn) return;
    const period = 0.62; // seconds between notes
    while (this.nextNoteTime < now + 0.12) {
      // seeded walk over the scale
      const step = Math.floor(this.prng() * 3) - 1;
      this.scaleDegree = Math.max(
        0,
        Math.min(CqtEngine.SCALE.length - 1, this.scaleDegree + step),
      );
      const octaveLift = this.prng() < 0.3 ? 12 : 0;
      const semitone =
        CqtEngine.SCALE[this.scaleDegree] + octaveLift + 3; // sit in-band
      const freq = 65.406 * Math.pow(2, semitone / 12);

      const t0 = this.nextNoteTime;
      const dur = 1.1;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth"; // harmonics → multiple bands / partials light up
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(cg);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
      this.nextNoteTime += period;
    }
  }

  private attachMic(stream: MediaStream) {
    const ctx = this.ctx;
    const inputGain = this.inputGain;
    if (!ctx || !inputGain) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.micStream = stream;
    const src = ctx.createMediaStreamSource(stream);
    const mg = ctx.createGain();
    mg.gain.value = 1.4;
    src.connect(mg);
    mg.connect(inputGain);
    this.micSource = src;
    this.micActive = true;

    // Fade the idle carrier out — the voice now drives the bank.
    if (this.carrierGain) {
      const t = ctx.currentTime;
      this.carrierGain.gain.setValueAtTime(this.carrierGain.gain.value, t);
      this.carrierGain.gain.linearRampToValueAtTime(0.0001, t + 0.6);
    }
    this.carrierOn = false;
  }

  /** Per-frame: advance the carrier schedule and read each band's RMS.
   *  Call once per render frame; then read `levels`. */
  update() {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;
    if (this.carrierOn) this.pumpCarrier(ctx.currentTime);

    for (let i = 0; i < this.taps.length; i++) {
      const buf = this.tapBufs[i];
      this.taps[i].getFloatTimeDomainData(
        buf as unknown as Float32Array<ArrayBuffer>,
      );
      let sum = 0;
      for (let n = 0; n < buf.length; n++) sum += buf[n] * buf[n];
      const rms = Math.sqrt(sum / buf.length);
      // Perceptual lift: sqrt makes quiet partials visible without blowing
      // out loud ones; low bands carry more energy so gently tilt them down.
      const shaped = Math.sqrt(rms) * (1 - i / (this.taps.length * 3));
      this.levels[i] =
        this.levels[i] * RMS_SMOOTH + shaped * (1 - RMS_SMOOTH);
    }
  }

  /** Full teardown — cancel nothing (no RAF here), stop mic, disconnect every
   *  node incl. all 60 filters + taps, close the context. */
  dispose() {
    this.running = false;
    this.carrierOn = false;
    try {
      this.micStream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    const all: (AudioNode | null)[] = [
      this.micSource,
      this.inputGain,
      this.sumBus,
      this.master,
      this.comp,
      this.carrierGain,
      ...this.filters,
      ...this.taps,
    ];
    for (const node of all) {
      try {
        node?.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.filters = [];
    this.taps = [];
    this.tapBufs = [];
    this.micSource = null;
    this.micStream = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {
        /* ignore */
      });
    }
    this.levels.fill(0);
  }
}
