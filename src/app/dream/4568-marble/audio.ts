/*
 * 4568 · MARBLE — audio engine (inverted subtractive synthesis)
 *
 * We START at full ADDITIVE saturation — one sine oscillator per partial, all
 * sounding at once (the roaring, uncarved block) — and make music by
 * SUBTRACTING: silencing partials one at a time, permanently. What remains is
 * the figure. A DynamicsCompressor tames the initial 48-voice cluster; as the
 * block thins the surviving partials naturally emerge as a sparse, luminous
 * chord.
 *
 * The engine is deliberately dumb: it holds oscillators + per-partial gains and
 * exposes setGainTarget / setDetune, which the simulation loop drives every
 * frame. All agency (resistance, lean-back, settling) lives in the sim, not
 * here.
 */

import type { Partial } from "./material";

type ACtor = typeof AudioContext;

export class MarbleAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private oscs: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  built = false;

  // mic
  private analyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  sampleRate = 48000;

  /** Construct the context + oscillator bank. Idempotent. Must run after a
   *  user gesture on mobile (autoplay policy) — construction is fine, sound
   *  only flows once the context is running. */
  build(partials: Partial[]): void {
    if (this.built) return;
    const AC: ACtor | undefined =
      typeof window === "undefined"
        ? undefined
        : window.AudioContext ||
          (window as unknown as { webkitAudioContext?: ACtor })
            .webkitAudioContext;
    if (!AC) return;

    try {
      const ctx = new AC();
      this.ctx = ctx;
      this.sampleRate = ctx.sampleRate;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 26;
      comp.ratio.value = 4;
      comp.attack.value = 0.006;
      comp.release.value = 0.18;
      this.comp = comp;

      const master = ctx.createGain();
      master.gain.value = 0.55;
      this.master = master;

      comp.connect(master);
      master.connect(ctx.destination);

      for (const p of partials) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = p.freq;
        o.detune.value = p.detune;
        const g = ctx.createGain();
        g.gain.value = 0; // sim swells the block up on the next frame
        o.connect(g);
        g.connect(comp);
        o.start();
        this.oscs.push(o);
        this.gains.push(g);
      }
      this.built = true;
    } catch {
      this.built = false;
    }
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  async resume(): Promise<void> {
    try {
      await this.ctx?.resume();
    } catch {
      /* ignore */
    }
  }

  setGainTarget(i: number, v: number, tc = 0.05): void {
    const g = this.gains[i];
    if (!g || !this.ctx) return;
    try {
      g.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, tc);
    } catch {
      /* ignore */
    }
  }

  setDetune(i: number, cents: number, tc = 0.12): void {
    const o = this.oscs[i];
    if (!o || !this.ctx) return;
    try {
      o.detune.setTargetAtTime(cents, this.ctx.currentTime, tc);
    } catch {
      /* ignore */
    }
  }

  /** A soft confirming chime — the reward for a deliberate, precise cut. */
  chime(freq: number): void {
    if (!this.ctx || !this.master) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g);
      g.connect(this.master);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.4);
      o.start(t);
      o.stop(t + 0.45);
    } catch {
      /* ignore */
    }
  }

  /** Request the mic and wire it into a time-domain analyser (never to the
   *  speakers). Returns false if denied / unavailable. */
  async enableMic(): Promise<boolean> {
    if (!this.ctx) return false;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    )
      return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      this.micStream = stream;
      this.micSource = this.ctx.createMediaStreamSource(stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024; // 512-lag YIN window, cheap on phones
      this.micSource.connect(analyser);
      this.analyser = analyser;
      return true;
    } catch {
      return false;
    }
  }

  get micReady(): boolean {
    return !!this.analyser;
  }

  readTime(buf: Float32Array): boolean {
    if (!this.analyser) return false;
    // Cast: lib.dom types getFloatTimeDomainData's arg as Float32Array<ArrayBuffer>,
    // but a plain Float32Array param widens to ArrayBufferLike. Runtime-identical.
    this.analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
    return true;
  }

  dispose(): void {
    for (const o of this.oscs) {
      try {
        o.stop();
      } catch {
        /* ignore */
      }
    }
    this.oscs = [];
    this.gains = [];
    try {
      this.micStream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.built = false;
  }
}
