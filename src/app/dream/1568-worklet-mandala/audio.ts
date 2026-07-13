// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the drone bed + mic pitch/energy analysis (one AudioContext).
//
// SYNTH: a soft harmonic pad tied to the detected (or idle) pitch — a small
// cluster of detuned pad oscillators through a lowpass whose cutoff opens with
// loudness, plus a few just-intonation partials. Never silent. ≤14 voices total.
// master ≤0.18 → DynamicsCompressor → destination. Full teardown on stop.
//
// MIC: optional. When granted, a time-domain analyser feeds an autocorrelation
// pitch tracker (good for a sung/hummed note) + RMS energy. Not routed to the
// destination — no feedback. If the mic is denied the drone + idle demo run on.
// ─────────────────────────────────────────────────────────────────────────────

// Just-intonation partial ratios for the harmonic bed (fundamental = 1).
const PARTIALS = [1, 1.5, 2, 2.5, 3]; // 1, 3/2, 2, 5/2, 3 — open + bright.
// Detuned pad cluster around the fundamental (cents).
const PAD_DETUNE = [-7, 0, 6, 12]; // 4 voices
// Total voices = PARTIALS(5) + PAD(4) = 9 ≤ 14.

export interface AudioStartResult {
  ok: boolean;
  micGranted: boolean;
  micError: string | null;
  audioError: string | null;
}

export interface MicReading {
  /** Detected fundamental in Hz, or null when no clear pitch. */
  pitch: number | null;
  /** RMS energy 0..1. */
  energy: number;
}

type Voice = { osc: OscillatorNode; gain: GainNode; ratio: number };

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padVoices: Voice[] = [];
  private partialVoices: Voice[] = [];

  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private timeBuf: Float32Array<ArrayBuffer> | null = null;

  private fundamental = 196; // G3 default

  get contextState(): string {
    return this.ctx?.state ?? "closed";
  }

  async start(wantMic: boolean): Promise<AudioStartResult> {
    const res: AudioStartResult = {
      ok: false,
      micGranted: false,
      micError: null,
      audioError: null,
    };

    const Ctx: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!Ctx) {
      res.audioError = "Web Audio is unavailable in this browser.";
      return res;
    }

    let ctx: AudioContext;
    try {
      ctx = new Ctx();
      this.ctx = ctx;
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      res.audioError = "Could not create an AudioContext.";
      return res;
    }

    // master chain: master gain → compressor → destination
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.28;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    // pad cluster through a moving lowpass
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 700;
    padFilter.Q.value = 0.6;
    padFilter.connect(master);
    this.padFilter = padFilter;

    for (const cents of PAD_DETUNE) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = this.fundamental;
      osc.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = 0.16;
      osc.connect(g);
      g.connect(padFilter);
      osc.start();
      this.padVoices.push({ osc, gain: g, ratio: 1 });
    }

    for (const ratio of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = this.fundamental * ratio;
      const g = ctx.createGain();
      g.gain.value = ratio === 1 ? 0.2 : 0.05;
      osc.connect(g);
      g.connect(master);
      osc.start();
      this.partialVoices.push({ osc, gain: g, ratio });
    }

    // fade master up to a safe ceiling (≤0.18)
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(0.16, t + 0.7);

    // optional mic
    if (wantMic) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        this.stream = stream;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.15;
        src.connect(analyser); // NOT connected to destination — no feedback.
        this.analyser = analyser;
        this.timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
        res.micGranted = true;
      } catch (e) {
        res.micError =
          e instanceof Error && e.message
            ? "Microphone denied — running the seeded idle demo."
            : "Microphone unavailable — running the seeded idle demo.";
      }
    }

    res.ok = true;
    return res;
  }

  /** Read pitch + energy from the mic. Returns null if no mic analyser. */
  readMic(): MicReading | null {
    const analyser = this.analyser;
    const buf = this.timeBuf;
    const ctx = this.ctx;
    if (!analyser || !buf || !ctx) return null;

    analyser.getFloatTimeDomainData(buf);

    // RMS energy
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const energy = Math.min(1, rms * 4.2);

    // Autocorrelation pitch (only trust it when there is signal).
    let pitch: number | null = null;
    if (rms > 0.008) {
      pitch = this.autoCorrelate(buf, ctx.sampleRate);
    }
    return { pitch, energy };
  }

  private autoCorrelate(buf: Float32Array, sampleRate: number): number | null {
    const SIZE = buf.length;
    const minLag = Math.floor(sampleRate / 620); // upper pitch bound
    const maxLag = Math.floor(sampleRate / 90); // lower pitch bound
    let bestLag = -1;
    let bestCorr = 0;
    let lastCorr = 1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < SIZE - lag; i++) corr += buf[i] * buf[i + lag];
      corr /= SIZE - lag;
      if (corr > bestCorr && corr > lastCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
      lastCorr = corr;
    }
    if (bestLag <= 0 || bestCorr < 0.0015) return null;
    return sampleRate / bestLag;
  }

  /** Retune the drone toward a target fundamental + open the bed with loudness. */
  setTargets(fundamental: number, energy: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.padFilter) return;
    const f = Math.max(80, Math.min(560, fundamental));
    this.fundamental = f;
    const t = ctx.currentTime;
    const glide = 0.14;

    for (const v of this.padVoices) {
      v.osc.frequency.setTargetAtTime(f, t, glide);
    }
    for (const v of this.partialVoices) {
      v.osc.frequency.setTargetAtTime(f * v.ratio, t, glide);
      // brighter singing lifts the upper partials a touch
      const base = v.ratio === 1 ? 0.2 : 0.05;
      v.gain.gain.setTargetAtTime(base + energy * 0.06 * v.ratio, t, 0.2);
    }
    // louder → open the lowpass (600 Hz → ~3.2 kHz)
    const cutoff = 600 + energy * 2600;
    this.padFilter.frequency.setTargetAtTime(cutoff, t, 0.2);
  }

  async stop(): Promise<void> {
    const ctx = this.ctx;
    if (ctx && this.master) {
      const t = ctx.currentTime;
      try {
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(0.0001, t, 0.12);
      } catch {
        /* ignore */
      }
    }
    // stop oscillators shortly after the fade
    const all = [...this.padVoices, ...this.partialVoices];
    for (const v of all) {
      try {
        v.osc.stop((ctx?.currentTime ?? 0) + 0.35);
      } catch {
        /* already stopped */
      }
    }
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.stream = null;
    this.analyser = null;
    this.timeBuf = null;

    if (ctx) {
      // let the fade finish, then close
      await new Promise((r) => setTimeout(r, 380));
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
    this.ctx = null;
    this.master = null;
    this.padFilter = null;
    this.padVoices = [];
    this.partialVoices = [];
  }
}
