// audio.ts — gentle, safe-for-small-ears Web Audio engine.
//
// Everything is synthesized. A soft always-on D drone (so it's never silent and
// nothing is ever "wrong"), bell/triangle note voices, click-free glides via
// setTargetAtTime, and a brick-wall DynamicsCompressor limiter on the master so
// there are no sudden loud transients. Also: a live autocorrelation pitch
// detector for the hum/sing input — analysis-only, the mic is never recorded.

import { D_ROOT_HZ, SCALE_HZ } from "./sync";

export class SongAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private droneGain: GainNode | null = null;

  // mic / pitch detection
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array | null = null;

  /** Create + resume the AudioContext. MUST be called inside a user gesture. */
  async start(): Promise<void> {
    if (this.ctx) {
      await this.ctx.resume().catch(() => {});
      return;
    }
    const Ctx: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    // master chain: master gain → brick-wall limiter → destination
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20; // brick wall
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);
    this.limiter = limiter;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(limiter);
    this.master = master;
    // gentle fade-in to avoid a click
    master.gain.setTargetAtTime(0.85, ctx.currentTime, 0.4);

    await ctx.resume().catch(() => {});
    this.startDrone();
  }

  /** Soft D drone (root + fifth + octave), always on under everything. */
  private startDrone(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0001;
    droneGain.gain.setTargetAtTime(0.14, ctx.currentTime, 1.2);
    droneGain.connect(master);
    this.droneGain = droneGain;

    const partials = [
      { hz: D_ROOT_HZ / 2, gain: 0.5, type: "sine" as OscillatorType },
      { hz: (D_ROOT_HZ / 2) * 1.5, gain: 0.28, type: "sine" as OscillatorType },
      { hz: D_ROOT_HZ, gain: 0.22, type: "triangle" as OscillatorType },
    ];
    for (const p of partials) {
      const osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = p.hz;
      // a slow, tiny vibrato so the drone breathes rather than sits flat
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12 + Math.random() * 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = p.hz * 0.004;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(droneGain);
      osc.start();
      lfo.start();
    }
  }

  /** Play one in-scale note as a soft bell. `delay` in seconds from now. */
  playDegree(degree: number, delay = 0, velocity = 1): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const hz = SCALE_HZ[degree] ?? SCALE_HZ[0];
    const t = ctx.currentTime + Math.max(0, delay);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34 * velocity, t + 0.02);
    g.gain.setTargetAtTime(0.0001, t + 0.05, 0.5);
    g.connect(master);

    // bell = fundamental triangle + a quiet shimmer two octaves up
    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.setValueAtTime(hz, t);
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(hz * 2, t);
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    o2.connect(g2);
    g2.connect(g);
    o1.connect(g);

    o1.start(t);
    o2.start(t);
    o1.stop(t + 1.6);
    o2.stop(t + 1.6);
  }

  /** A short sparkly "whoosh" when the creature flies away. */
  whoosh(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(SCALE_HZ[0] * 2, t);
    o.frequency.setTargetAtTime(SCALE_HZ[7] * 2, t, 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
    g.gain.setTargetAtTime(0.0001, t + 0.05, 0.18);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.9);
  }

  // ── Mic / pitch detection (analysis only) ─────────────────────────────────
  async startMic(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) throw new Error("audio not started");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.stream = stream;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    // NOT connected to destination — no feedback, mic is analysis-only.
    src.connect(analyser);
    this.analyser = analyser;
    this.buf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
  }

  hasMic(): boolean {
    return this.analyser != null;
  }

  /** Detect the fundamental pitch (Hz) of the current mic frame via
   *  autocorrelation, or -1 if too quiet / unvoiced. Call in rAF. */
  detectPitch(): number {
    const analyser = this.analyser;
    const ctx = this.ctx;
    const buf = this.buf;
    if (!analyser || !ctx || !buf) return -1;
    analyser.getFloatTimeDomainData(
      buf as unknown as Float32Array<ArrayBuffer>
    );
    const N = buf.length;

    // RMS gate — ignore silence/breath.
    let rms = 0;
    for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / N);
    if (rms < 0.012) return -1;

    // Autocorrelation over a vocal range (~80–800 Hz).
    const sr = ctx.sampleRate;
    const minLag = Math.floor(sr / 800);
    const maxLag = Math.floor(sr / 80);
    let bestLag = -1;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < N - lag; i++) corr += buf[i] * buf[i + lag];
      corr /= N - lag;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    if (bestLag <= 0 || bestCorr < 0.0008) return -1;
    return sr / bestLag;
  }

  /** Stop mic tracks immediately (analysis-only privacy). */
  stopMic(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.buf = null;
  }

  /** Full teardown — fade master, stop mic, close context. */
  async dispose(): Promise<void> {
    this.stopMic();
    const ctx = this.ctx;
    if (ctx && this.master) {
      try {
        this.master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
      } catch {
        /* noop */
      }
    }
    if (ctx) {
      await new Promise((r) => setTimeout(r, 160));
      await ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.master = null;
    this.limiter = null;
    this.droneGain = null;
  }
}
