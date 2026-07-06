// ── Tideglass · granular synthesis + stereo-spatial engine ───────────────────
// The CORE IDEA lives here. Each hand is a GRAIN-HEAD scrubbing a living cloud
// of short windowed wavelets that are granulated out of a synthesized wavetable
// (no external audio file). Each head is hard-panned to its side and placed in
// the stereo field with an equal-power StereoPanner — spatialization is part of
// the instrument. Hand height → grain playback-rate (pitch) + filter cutoff.
// Reach between the hands → grain DENSITY / cloud spread. Torso place in the
// room → panorama + a slow global filter sweep.
//
// Named reference: Curtis Roads — *Microsound* (2001): grain clouds, density,
// windowed wavelets. Ear-safe: a bounded look-ahead scheduler caps active grain
// voices, every grain frees itself onended, and the master fades in through a
// DynamicsCompressor limiter.

import type { PoseFrame } from "./pose";

type AC = AudioContext;

// Hard voice-count safety. Real density stays far below this (rate × grainDur ≈
// a handful of active grains); the cap is the backstop against any runaway.
const MAX_ACTIVE_GRAINS = 64;

// Grain rate per head, in grains/second, mapped from reach (0..1).
const RATE_MIN = 4;
const RATE_MAX = 30;

// Per-grain output peak. Small so a dense scatter sums without slamming the
// limiter; the compressor catches transient stacks.
const GRAIN_PEAK = 0.16;

const MASTER_TARGET = 0.5;

interface Head {
  input: BiquadFilterNode; // grains connect here (per-head lowpass)
  panner: StereoPannerNode; // equal-power stereo placement
  gain: GainNode;
  rate: number; // live grains/sec (read by the scheduler)
  playbackRate: number; // live pitch (read at grain creation)
  sideBias: number; // -1 left head, +1 right head
  fired: number; // grains fired since last consume()
  nextAt: number; // next scheduled grain time (ctx clock)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export class GranularEngine {
  private ctx: AC | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private wavetable: AudioBuffer | null = null;
  private heads: Head[] = [];
  private active = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sweepPhase = 0;
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    // Master chain: master gain (fades in from 0) → limiter → destination.
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-14, ctx.currentTime);
    comp.knee.setValueAtTime(6, ctx.currentTime);
    comp.ratio.setValueAtTime(12, ctx.currentTime);
    comp.attack.setValueAtTime(0.003, ctx.currentTime);
    comp.release.setValueAtTime(0.18, ctx.currentTime);
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;
    this.comp = comp;

    this.wavetable = this.buildWavetable(ctx);

    // Two grain-heads, hard-biased to their sides.
    for (const bias of [-1, 1]) {
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(1200, ctx.currentTime);
      filt.Q.setValueAtTime(0.9, ctx.currentTime);
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(bias * 0.6, ctx.currentTime);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.9, ctx.currentTime);
      filt.connect(panner);
      panner.connect(gain);
      gain.connect(master);
      this.heads.push({
        input: filt,
        panner,
        gain,
        rate: RATE_MIN,
        playbackRate: 1,
        sideBias: bias,
        fired: 0,
        nextAt: ctx.currentTime + 0.05,
      });
    }

    // Fade the master up gently once the graph is live.
    master.gain.exponentialRampToValueAtTime(
      MASTER_TARGET,
      ctx.currentTime + 1.4,
    );

    // Look-ahead grain scheduler (classic Web-Audio pattern): a plain timer
    // schedules grains a little into the future so timing is jitter-free.
    this.timer = setInterval(() => this.schedule(), 22);
  }

  // A short evolving FM tone we granulate. ~2.6 s so grain offsets never repeat
  // audibly. Mono; per-head filtering + panning happen downstream.
  private buildWavetable(ctx: AC): AudioBuffer {
    const dur = 2.6;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const carrier = 174.6; // ~F3 root
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      // Slowly drifting FM index + a wandering modulator ratio give the cloud
      // an ever-changing timbre as grains read different offsets.
      const modRatio = 1.5 + 0.5 * Math.sin(t * 0.4);
      const modIndex = 2.0 + 1.5 * Math.sin(t * 0.23);
      const mod = Math.sin(2 * Math.PI * carrier * modRatio * t) * modIndex;
      let s = Math.sin(2 * Math.PI * carrier * t + mod);
      s += 0.35 * Math.sin(2 * Math.PI * carrier * 2 * t); // a touch of octave
      d[i] = s * 0.5;
    }
    return buf;
  }

  // Drive the heads from a pose frame. Called every render frame. Smooth,
  // zipper-free parameter moves via setTargetAtTime.
  update(f: PoseFrame): void {
    const ctx = this.ctx;
    if (!ctx || this.heads.length < 2) return;
    const now = ctx.currentTime;

    // Reach → density (grains/sec) and stereo width (together = point source).
    const density = RATE_MIN + f.spread * (RATE_MAX - RATE_MIN);
    const widthFactor = 0.35 + f.spread * 0.65;
    const panorama = clamp(f.torsoX * 0.35 + f.lean * 0.1, -0.6, 0.6);

    const hands: Array<{ x: number; y: number }> = [
      { x: f.lx, y: f.ly },
      { x: f.rx, y: f.ry },
    ];

    for (let i = 0; i < 2; i++) {
      const head = this.heads[i];
      const hand = hands[i];
      head.rate = density;

      // Hand height → pitch (playback-rate) and filter cutoff (brighter high).
      const y01 = clamp((hand.y + 1) / 2, 0, 1);
      head.playbackRate = Math.pow(2, (y01 - 0.5) * 2.2); // ~0.47 .. 2.14

      // Torso place → a slow global filter sweep on top of the hand's cutoff.
      const sweep = 0.7 + 0.45 * Math.sin(this.sweepPhase + f.torsoX * 1.6);
      const cutoff = clamp(300 * Math.pow(2, y01 * 4.4) * sweep, 180, 9000);
      head.input.frequency.setTargetAtTime(cutoff, now, 0.08);

      // Stereo placement: hard side-bias + hand x, scaled by width, shifted by
      // where the body stands in the room.
      const pan = clamp(
        head.sideBias * 0.6 * widthFactor + hand.x * 0.4 * widthFactor + panorama,
        -1,
        1,
      );
      head.panner.pan.setTargetAtTime(pan, now, 0.06);
    }
  }

  // Advance the slow sweep LFO a little (called from update cadence via the
  // scheduler tick counter). Kept simple: nudged here each scheduler tick.
  private schedule(): void {
    const ctx = this.ctx;
    const wt = this.wavetable;
    const master = this.master;
    if (!ctx || !wt || !master) return;

    this.sweepPhase += 0.02 * Math.PI * 0.22; // ~ very slow
    const now = ctx.currentTime;
    const horizon = now + 0.12; // look-ahead window

    for (const head of this.heads) {
      const interval = 1 / Math.max(1, head.rate);
      // Schedule every grain whose time falls inside the look-ahead window.
      let guard = 0;
      while (head.nextAt < horizon && guard < 32) {
        guard++;
        if (this.active < MAX_ACTIVE_GRAINS) {
          this.spawnGrain(ctx, wt, head, Math.max(head.nextAt, now));
          head.fired++;
        }
        // Randomise the interval ±40% for a natural, non-metronomic cloud.
        head.nextAt += interval * (0.6 + Math.random() * 0.8);
      }
      // If we fell behind (tab throttling), resync so we never burst-catch-up.
      if (head.nextAt < now) head.nextAt = now + interval;
    }
  }

  // One grain: a windowed slice of the wavetable, pitch-shifted, self-freeing.
  private spawnGrain(
    ctx: AC,
    wt: AudioBuffer,
    head: Head,
    when: number,
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = wt;
    src.playbackRate.value = head.playbackRate * (0.995 + Math.random() * 0.01);

    const g = ctx.createGain();
    const dur = 0.06 + Math.random() * 0.08; // 60–140 ms wavelet
    const offset = Math.random() * (wt.duration - 0.2);

    // Triangular (Hann-like) window so grains have no clicks.
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(GRAIN_PEAK, when + dur * 0.5);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);

    src.connect(g);
    g.connect(head.input);

    this.active++;
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
      this.active = Math.max(0, this.active - 1);
    };
    src.start(when, offset);
    src.stop(when + dur + 0.02);
  }

  // How many grains each head fired since the last call — the renderer turns
  // these into amber sparks in the point cloud. Resets the counters.
  consumeGrains(): { left: number; right: number } {
    const left = this.heads[0]?.fired ?? 0;
    const right = this.heads[1]?.fired ?? 0;
    if (this.heads[0]) this.heads[0].fired = 0;
    if (this.heads[1]) this.heads[1].fired = 0;
    return { left, right };
  }

  get activeGrains(): number {
    return this.active;
  }

  // Full teardown: stop scheduling, ramp down, disconnect, close context.
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = this.ctx;
    const master = this.master;
    if (master && ctx) {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      } catch {
        /* ignore */
      }
    }
    for (const head of this.heads) {
      try {
        head.input.disconnect();
        head.panner.disconnect();
        head.gain.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.heads = [];
    if (master) {
      try {
        master.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (this.comp) {
      try {
        this.comp.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (ctx) {
      setTimeout(() => {
        ctx.close().catch(() => {
          /* ignore */
        });
      }, 200);
    }
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.wavetable = null;
    this.started = false;
  }
}
