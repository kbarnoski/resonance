// ════════════════════════════════════════════════════════════════════════════
// 5384 — Cartograph · audio.ts
//
// Click-to-seek playback engine. A fresh AudioBufferSourceNode per seek → gain
// 0.3 → a DynamicsCompressor limiter → destination. Exposes the current playhead
// position so the visuals can track it, and a short "blip" for boundary crossings.
//
// The AudioContext is created lazily on the first user gesture (autoplay policy).
// ════════════════════════════════════════════════════════════════════════════

export class PlaybackEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private startCtxTime = 0; // ctx.currentTime when the current source started
  private startOffset = 0; // buffer offset (s) at that moment
  private playing = false;

  setBuffer(buf: AudioBuffer): void {
    this.buffer = buf;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.3;
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.25;
      this.gain.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Seek + play from `offset` seconds. Safe to call repeatedly (each seek). */
  seek(offset: number): void {
    if (!this.buffer) return;
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") void ctx.resume();
    this.stopSource();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain as GainNode);
    const clamped = Math.max(0, Math.min(this.buffer.duration - 0.01, offset));
    src.start(0, clamped);
    src.onended = () => {
      if (this.source === src) {
        this.playing = false;
        this.source = null;
      }
    };
    this.source = src;
    this.startCtxTime = ctx.currentTime;
    this.startOffset = clamped;
    this.playing = true;
  }

  pause(): void {
    this.stopSource();
    this.playing = false;
  }

  private stopSource(): void {
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  /** Current playback position in seconds, or null if not playing. */
  position(): number | null {
    if (!this.playing || !this.ctx || !this.buffer) return null;
    const t = this.startOffset + (this.ctx.currentTime - this.startCtxTime);
    if (t >= this.buffer.duration) {
      this.playing = false;
      return this.buffer.duration;
    }
    return t;
  }

  /** A short percussive blip — used when the playhead crosses a boundary. */
  blip(): void {
    if (!this.ctx || !this.gain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.05);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    osc.connect(g);
    g.connect(this.gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  /** Full teardown on unmount. */
  dispose(): void {
    this.stopSource();
    this.playing = false;
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.gain = null;
      this.limiter = null;
    }
  }
}
