// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the voice of the tide-pool. INHARMONIC by design.
//
//   Two layers, both routed into the shared safe-master limiter:
//     1. RIPPLE-BELLS — struck when a droplet moves fast or crosses its own
//        wake. Each strike is a bank of decaying sine PARTIALS in the ratio
//        1 : 2.41 : 3.83 : 5.17 — deliberately NON-integer, NON-just, so the
//        bells shimmer like struck glass rather than ring a consonant chord.
//        There is no scale and no tonal centre; the fundamental slides
//        continuously with the droplet's x-position.
//     2. WAKE WASH — a filtered-noise bed whose band-pass brightness and gain
//        track how fast the droplets are moving. This is the "water" — a quiet
//        continuous texture, never a pitched drone.
//
//   A `gate` gain sits before the master so the piece can start MUTED (the
//   seeded ghost-hand auto-conductor plays silently) and unmute the instant a
//   real tilt gesture arrives.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

/** Inharmonic partial ratios — the signature struck-glass timbre. */
const PARTIALS = [1.0, 2.41, 3.83, 5.17];
const PARTIAL_GAIN = [1.0, 0.55, 0.32, 0.2];

export class TideAudio {
  private ctx: AudioContext;
  private master: SafeMaster;
  private gate: GainNode;

  // wake wash
  private washSrc: AudioBufferSourceNode;
  private washFilter: BiquadFilterNode;
  private washGain: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = createSafeMaster(ctx, { gain: 0.16 });

    // start silent; unmute on first real gesture
    this.gate = ctx.createGain();
    this.gate.gain.value = 0.0001;
    this.gate.connect(this.master.input);

    // ── wake wash: looping pink-ish noise → bandpass → gain ────────────────
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // deterministic-enough shaped noise; not seeded (audio texture, not motion)
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = (i * 12.9898) % 1;
      const n = Math.sin(white * 43758.5453) - Math.sin(i * 0.0007);
      last = 0.96 * last + 0.04 * n;
      data[i] = last * 0.9;
    }
    this.washSrc = ctx.createBufferSource();
    this.washSrc.buffer = buf;
    this.washSrc.loop = true;

    this.washFilter = ctx.createBiquadFilter();
    this.washFilter.type = "bandpass";
    this.washFilter.frequency.value = 520;
    this.washFilter.Q.value = 0.9;

    this.washGain = ctx.createGain();
    this.washGain.gain.value = 0.0;

    this.washSrc.connect(this.washFilter);
    this.washFilter.connect(this.washGain);
    this.washGain.connect(this.gate);
    this.washSrc.start();
  }

  /** Open (or close) the master gate. 0 = silent ghost mode, 1 = audible. */
  setGate(open: boolean) {
    const t = this.ctx.currentTime;
    this.gate.gain.setTargetAtTime(open ? 1.0 : 0.0001, t, 0.12);
  }

  /**
   * Continuous update: drive the wake wash from the fastest droplet's speed.
   * @param speed 0..~1 normalised droplet speed.
   */
  updateWash(speed: number) {
    const s = Math.min(1, Math.max(0, speed));
    const t = this.ctx.currentTime;
    this.washFilter.frequency.setTargetAtTime(360 + s * 2200, t, 0.08);
    this.washGain.gain.setTargetAtTime(0.015 + s * 0.11, t, 0.08);
  }

  /**
   * Strike one inharmonic ripple-bell.
   * @param x       droplet x in 0..1 → slides the fundamental (no scale).
   * @param amp     0..1 strike energy.
   * @param bright  0..1 extra brightness when crossing an old wake.
   */
  strike(x: number, amp: number, bright: number) {
    const ctx = this.ctx;
    if (!Number.isFinite(x) || !Number.isFinite(amp)) return;
    const now = ctx.currentTime;
    const a = Math.min(1, Math.max(0, amp));
    // continuous inharmonic fundamental, ~180..760 Hz, no tonal grid
    const f0 = 180 + Math.min(1, Math.max(0, x)) * 580;

    const strikeGain = ctx.createGain();
    strikeGain.gain.value = 0;
    strikeGain.connect(this.gate);

    const partials = 2 + Math.round(bright * (PARTIALS.length - 2));
    for (let i = 0; i < partials; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const detune = 1 + (i === 0 ? 0 : (i % 2 === 0 ? 0.004 : -0.004));
      osc.frequency.value = f0 * PARTIALS[i] * detune;
      const pg = ctx.createGain();
      const g = PARTIAL_GAIN[i] * a * 0.5;
      pg.gain.value = g;
      osc.connect(pg);
      pg.connect(strikeGain);
      const dur = 1.6 + (1 - i / PARTIALS.length) * 1.4;
      osc.start(now);
      osc.stop(now + dur + 0.05);
      // higher partials die faster → struck-glass decay
      pg.gain.setValueAtTime(g, now);
      pg.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    }

    // percussive envelope on the whole strike
    const peak = 0.9 * a;
    strikeGain.gain.setValueAtTime(0.0001, now);
    strikeGain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), now + 0.006);
    strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
  }

  destroy() {
    try {
      this.washSrc.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.master.disconnect();
    } catch {
      /* closing */
    }
  }
}
