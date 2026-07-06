// ─────────────────────────────────────────────────────────────────────────────
// synth.ts — Karplus–Strong / digital-waveguide plucked strings (Web Audio).
//
//   Each pluck is one plucked string, built the classic 1983 way (Karplus &
//   Strong, "Digital Synthesis of Plucked-String and Drum Timbres"): a short
//   noise burst is dropped into a feedback delay line whose length is one period
//   of the target pitch, and each trip round the loop is gently low-passed so the
//   high partials die faster than the low — the string "decays to a sine".
//
//   In Web Audio this is a DelayNode (the waveguide), a lowpass BiquadFilter
//   (the loop-damping filter of Julius O. Smith's digital-waveguide framing), and
//   a feedback GainNode < 1 (the decay). The pitch is set purely by the delay
//   length, delay = 1 / frequency, so the winding-number tuning drives it
//   directly. Master chain: masterGain (ramped up on Start) → limiter.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_VOICES = 16;
const VOICE_TAIL_S = 3.0; // hard cleanup after this many seconds

interface Voice {
  readonly id: number;
  readonly startedAt: number;
  readonly nodes: AudioNode[];
  readonly excite: AudioBufferSourceNode;
  readonly out: GainNode;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

export class KarplusStrong {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private voices: Voice[] = [];
  private nextId = 0;

  /** Create the AudioContext (must be called from a user gesture) and ramp up. */
  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.6);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    master.connect(limiter);
    limiter.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.limiter = limiter;
  }

  get ready(): boolean {
    return this.ctx != null;
  }

  /**
   * Pluck a string at `freq` Hz with 0..1 `strength`. Returns the voice id, or
   * -1 if audio is not started. `bright` (0..1) opens the loop-damping filter
   * for a sharper, longer-ringing pick.
   */
  pluck(freq: number, strength = 0.8, bright = 0.5): number {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || freq <= 0) return -1;

    if (this.voices.length >= MAX_VOICES) this.stealOldest();

    const now = ctx.currentTime;
    const period = 1 / freq;

    // ── excitation: a short white-noise burst (~ a few periods long) ──────────
    const burstLen = Math.max(0.004, period * 2);
    const sampleCount = Math.ceil(burstLen * ctx.sampleRate);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      const w = Math.sin((Math.PI * i) / sampleCount); // soft window
      data[i] = (Math.random() * 2 - 1) * w;
    }
    const excite = ctx.createBufferSource();
    excite.buffer = buffer;

    const exciteGain = ctx.createGain();
    exciteGain.gain.value = 0.5 + 0.5 * strength;

    // ── the waveguide loop: delay → damping lowpass → feedback → delay ────────
    const delay = ctx.createDelay(1);
    delay.delayTime.value = period;

    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    // brighter picks keep more highs; low notes damp a touch faster
    damp.frequency.value = 1200 + bright * 6500;
    damp.Q.value = 0.0;

    const feedback = ctx.createGain();
    // decay: closer to 1 = longer ring. Slightly less for very low notes.
    feedback.gain.value = 0.986 + 0.008 * bright;

    excite.connect(exciteGain);
    exciteGain.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay); // the loop

    // ── output tap with a gentle overall envelope ────────────────────────────
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.28 * (0.5 + strength), now + 0.006);
    out.gain.setTargetAtTime(0.0001, now + 0.2, VOICE_TAIL_S * 0.5);

    damp.connect(out);
    out.connect(master);

    excite.start(now);
    excite.stop(now + burstLen + 0.01);

    const id = this.nextId++;
    const voice: Voice = {
      id,
      startedAt: now,
      nodes: [exciteGain, delay, damp, feedback],
      excite,
      out,
      cleanupTimer: null,
    };
    voice.cleanupTimer = setTimeout(
      () => this.disposeVoice(voice),
      VOICE_TAIL_S * 1000,
    );
    this.voices.push(voice);
    return id;
  }

  private stealOldest(): void {
    const v = this.voices[0];
    if (v) this.disposeVoice(v, true);
  }

  private disposeVoice(voice: Voice, fast = false): void {
    const ctx = this.ctx;
    if (ctx) {
      const t = ctx.currentTime;
      try {
        voice.out.gain.cancelScheduledValues(t);
        voice.out.gain.setTargetAtTime(0.0001, t, fast ? 0.02 : 0.08);
      } catch {
        /* node may already be gone */
      }
    }
    const kill = () => {
      if (voice.cleanupTimer) clearTimeout(voice.cleanupTimer);
      try {
        voice.excite.disconnect();
      } catch {
        /* already stopped */
      }
      for (const n of voice.nodes) {
        try {
          n.disconnect();
        } catch {
          /* already disconnected */
        }
      }
      try {
        voice.out.disconnect();
      } catch {
        /* already disconnected */
      }
      this.voices = this.voices.filter((x) => x.id !== voice.id);
    };
    setTimeout(kill, fast ? 60 : 140);
  }

  /** Tear everything down (call on unmount). */
  dispose(): void {
    for (const v of [...this.voices]) this.disposeVoice(v, true);
    this.voices = [];
    const ctx = this.ctx;
    this.master?.disconnect();
    this.limiter?.disconnect();
    this.master = null;
    this.limiter = null;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {
        /* ignore */
      });
    }
  }
}
