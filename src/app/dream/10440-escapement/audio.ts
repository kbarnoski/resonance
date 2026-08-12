// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the voice of the escapement. PERCUSSION ONLY. No pitched drone,
// ever — nothing sustains.
//
//   Every event is a short click / knock / ping routed through the shared
//   safe-master limiter. Four voices:
//
//     • TICK — the pallet CATCHES the wheel. A low wood/anvil knock: a filtered
//       noise burst plus a fast pitch-dropping thud. The downbeat.
//     • TOCK — the pallet RELEASES. A brighter, drier knock a step up. The
//       off-beat.
//     • HAMMERS ×3 — struck off every 3rd / 5th / 7th tooth. Each is a metallic
//       PING: two or three detuned INHARMONIC partials with a very fast
//       exponential decay, plus a noise-click transient. Distinct bodies (low
//       anvil, mid bell, high plate) — but each dies in a fraction of a second,
//       so no partial ever becomes a bed.
//
//   A `gate` gain sits before the master so the piece starts MUTED — the seeded
//   auto-conductor drives the visible mechanism silently — and unmutes the
//   instant a real tilt / drag gesture arrives. The noise buffer is filled from
//   the seeded mulberry32 PRNG (never Math.random) so the texture is identical
//   every run.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";

/** Inharmonic partial banks per hammer — non-integer ratios so pings shimmer
 *  like struck metal instead of ringing a chord. */
const HAMMER_PARTIALS: number[][] = [
  [1.0, 2.76, 5.4], // 0 · low anvil
  [1.0, 3.19, 4.71], // 1 · mid bell
  [1.0, 2.43, 6.08], // 2 · high plate
];
const HAMMER_F0 = [196, 372, 588]; // base freq per hammer body (Hz)
const HAMMER_DECAY = [0.34, 0.24, 0.16]; // seconds — all fast, none sustain

export class EscapementAudio {
  private ctx: AudioContext;
  private master: SafeMaster;
  private gate: GainNode;
  private noise: AudioBuffer;
  private noiseCursor = 0;

  constructor(ctx: AudioContext, rng: () => number) {
    this.ctx = ctx;
    this.master = createSafeMaster(ctx, { gain: 0.19 });

    // start silent; unmute on first real gesture
    this.gate = ctx.createGain();
    this.gate.gain.value = 0.0001;
    this.gate.connect(this.master.input);

    // one short noise buffer, seeded → deterministic transient texture
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = rng() * 2 - 1;
    }
    this.noise = buf;
  }

  /** Open (or close) the master gate. 0 = silent auto mode, 1 = audible. */
  setGate(open: boolean) {
    const t = this.ctx.currentTime;
    this.gate.gain.setTargetAtTime(open ? 1.0 : 0.0001, t, 0.1);
  }

  /** A short slice of the seeded noise buffer, band-passed, for transients. */
  private noiseBurst(
    dest: AudioNode,
    when: number,
    dur: number,
    freq: number,
    q: number,
    peak: number,
  ) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    // wander the read offset so successive bursts differ (deterministic cursor)
    this.noiseCursor = (this.noiseCursor + 0.037) % 0.4;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    src.start(when, this.noiseCursor, dur + 0.02);
    src.stop(when + dur + 0.04);
  }

  /** A fast pitch-dropping sine "thud" — the body of a wood/anvil knock. */
  private thud(
    dest: AudioNode,
    when: number,
    f0: number,
    f1: number,
    dur: number,
    peak: number,
  ) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.04);
  }

  /** TICK — pallet catches. Low wood knock (downbeat). amp 0..1. */
  tick(amp: number) {
    if (!Number.isFinite(amp)) return;
    const now = this.ctx.currentTime;
    const a = Math.min(1, Math.max(0, amp));
    this.thud(this.gate, now, 150, 62, 0.09, 0.55 * a);
    this.noiseBurst(this.gate, now, 0.05, 220, 1.4, 0.4 * a);
  }

  /** TOCK — pallet releases. Brighter, drier knock (off-beat). amp 0..1. */
  tock(amp: number) {
    if (!Number.isFinite(amp)) return;
    const now = this.ctx.currentTime;
    const a = Math.min(1, Math.max(0, amp));
    this.thud(this.gate, now, 240, 120, 0.06, 0.42 * a);
    this.noiseBurst(this.gate, now, 0.04, 430, 1.8, 0.42 * a);
  }

  /** HAMMER — metallic ping off the wheel. idx 0..2 selects the body. */
  hammer(idx: number, amp: number) {
    if (!Number.isFinite(amp)) return;
    const i = idx % 3;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const a = Math.min(1, Math.max(0, amp));
    const f0 = HAMMER_F0[i];
    const dur = HAMMER_DECAY[i];
    const partials = HAMMER_PARTIALS[i];

    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(this.gate);

    for (let k = 0; k < partials.length; k++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const detune = k === 0 ? 1 : 1 + (k % 2 === 0 ? 0.006 : -0.006);
      osc.frequency.value = f0 * partials[k] * detune;
      const g = ctx.createGain();
      const pk = a * 0.5 * (1 / (1 + k * 1.1)); // upper partials quieter
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(pk, 0.0002), now + 0.003);
      // higher partials die faster → struck-metal decay
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur * (1 - k * 0.22));
      osc.connect(g);
      g.connect(bus);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }
    // strike transient
    this.noiseBurst(bus, now, 0.02, f0 * 3.2, 2.2, 0.3 * a);
  }

  destroy() {
    try {
      this.master.disconnect();
    } catch {
      /* closing */
    }
  }
}
