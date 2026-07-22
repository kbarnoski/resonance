// ─────────────────────────────────────────────────────────────────────────────
// 2244-deep-now — audio.ts
//
// Real played voices for "the dilation of time itself." Web Audio only.
//
// HARMONY: two things at once, both deliberately NOT pentatonic / just / BP:
//   • Pitch selection is a MODAL scale — D Dorian across ~two octaves (x-axis).
//   • Each voice's TIMBRE uses SETHARES STRETCHED PARTIALS: partial k sits at
//     f0 · s^(log2 k) with a stretch ratio s ≈ 2.06 (a "stretched octave").
//     Integer harmonics would be s = 2.0 exactly; nudging the octave wide makes
//     the partials mildly inharmonic and shimmering — the classic Sethares
//     stretched timbre. Pitch stays stable; only time stretches.
//
// TIME-DILATION coupling (the mechanic): the page pushes a global attention A
// (0..1) and a derived timeScale (1 at rest → ~0.14 at deep attention). As A
// rises, note envelopes STRETCH — attack/decay/release lengthen dramatically,
// the resonant reverb tail blooms toward near-infinite, and every glide/slew
// constant is scaled by 1/timeScale so motion decelerates into an "eternal now".
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

// D Dorian, in semitone offsets from the root, spanning two octaves + tonic.
const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19, 21, 22, 24];
const ROOT_HZ = 146.83; // D3

/** Stretch ratio for the Sethares stretched-octave partial series. */
const STRETCH = 2.06;
/** Number of partials per voice. */
const N_PARTIALS = 6;

export interface Voice {
  readonly id: number;
  /** Re-target pitch (modal degree) & timbre; glide slows with time-dilation. */
  update(scaleDegree: number, brightness: number): void;
  /** Begin the long release; tail length grows with current attention. */
  release(): void;
  /** True once the release has fully faded (safe to reap). */
  done(nowSec: number): boolean;
}

/** Map an x fraction [0,1] to a modal-scale frequency (stable, quantised). */
export function degreeToHz(scaleDegree: number): number {
  const idx = Math.max(0, Math.min(DORIAN.length - 1, Math.round(scaleDegree)));
  return ROOT_HZ * Math.pow(2, DORIAN[idx] / 12);
}

export function xToDegree(xFrac: number): number {
  return xFrac * (DORIAN.length - 1);
}

export class DeepNowAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private reverb: VoidReverb;
  private voices = new Map<number, VoiceImpl>();
  private nextId = 1;

  // Live-updated by the page each frame.
  private attention = 0;
  private timeScale = 1;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.5;

    this.reverb = createVoidReverb(ctx, { seconds: 7, decay: 2, wet: 0.4 });

    // master → [dry → comp] and [→ reverb → comp] → destination
    this.master.connect(this.comp);
    this.master.connect(this.reverb.input);
    this.reverb.output.connect(this.comp);
    this.comp.connect(ctx.destination);

    // gentle fade-in of the master bus
    const t = ctx.currentTime;
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.9, t + 1.2);
  }

  /** Push the played attention state. timeScale ∈ (0,1]; smaller = deeper now. */
  setDilation(attention: number, timeScale: number): void {
    this.attention = attention;
    this.timeScale = Math.max(0.05, Math.min(1, timeScale));
    // Reverb wet blooms with attention — the tail approaches "eternal now".
    this.reverb.setWet(0.32 + 0.62 * attention);
  }

  /** Start a sustained voice at a modal degree & brightness. Returns a handle. */
  strike(scaleDegree: number, brightness: number): Voice {
    const id = this.nextId++;
    const v = new VoiceImpl(
      id,
      this.ctx,
      this.master,
      () => this.attention,
      () => this.timeScale,
    );
    v.update(scaleDegree, brightness);
    this.voices.set(id, v);
    return v;
  }

  /** Reap finished voices; call occasionally. */
  reap(): void {
    const now = this.ctx.currentTime;
    for (const [id, v] of this.voices) {
      if (v.done(now)) {
        v.dispose();
        this.voices.delete(id);
      }
    }
  }

  dispose(): void {
    for (const v of this.voices.values()) v.dispose();
    this.voices.clear();
    try {
      this.master.disconnect();
      this.comp.disconnect();
      this.reverb.output.disconnect();
    } catch {
      /* already gone */
    }
  }
}

class VoiceImpl implements Voice {
  readonly id: number;
  private ctx: AudioContext;
  private env: GainNode;
  private oscs: OscillatorNode[] = [];
  private partialGains: GainNode[] = [];
  private getAttention: () => number;
  private getTimeScale: () => number;
  private released = false;
  private releaseEndsAt = Infinity;
  private baseFreq = ROOT_HZ;

  constructor(
    id: number,
    ctx: AudioContext,
    dest: AudioNode,
    getAttention: () => number,
    getTimeScale: () => number,
  ) {
    this.id = id;
    this.ctx = ctx;
    this.getAttention = getAttention;
    this.getTimeScale = getTimeScale;

    this.env = ctx.createGain();
    this.env.gain.value = 0.0001;
    this.env.connect(dest);

    for (let k = 1; k <= N_PARTIALS; k++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(this.env);
      osc.start();
      this.oscs.push(osc);
      this.partialGains.push(g);
    }

    // Attack envelope, stretched by attention.
    const A = this.getAttention();
    const attack = 0.04 * (1 + A * 9); // 40ms → ~0.4s at deep attention
    const now = ctx.currentTime;
    const peak = 0.16;
    this.env.gain.cancelScheduledValues(now);
    this.env.gain.setValueAtTime(Math.max(0.0001, this.env.gain.value), now);
    this.env.gain.linearRampToValueAtTime(peak, now + attack);
  }

  update(scaleDegree: number, brightness: number): void {
    const now = this.ctx.currentTime;
    const A = this.getAttention();
    const ts = this.getTimeScale();
    // Glide constant scales by 1/timeScale: at deep attention, pitch drifts in
    // near-slow-motion (but the target pitch is stable/quantised).
    const glide = (0.06 + 0.05 * A) / ts;
    this.baseFreq = degreeToHz(scaleDegree);

    for (let i = 0; i < this.oscs.length; i++) {
      const k = i + 1;
      // Sethares stretched partial: f0 · s^(log2 k).
      const ratio = Math.pow(STRETCH, Math.log2(k));
      const f = this.baseFreq * ratio;
      this.oscs[i].frequency.setTargetAtTime(f, now, glide);

      // Brightness (y-axis) tilts energy toward upper partials.
      const rolloff = 1 / Math.pow(k, 1.6 - brightness * 0.9);
      const target = rolloff * (0.9 - brightness * 0.15);
      this.partialGains[i].gain.setTargetAtTime(
        Math.max(0.0001, target),
        now,
        0.08 / ts,
      );
    }
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    const now = this.ctx.currentTime;
    const A = this.getAttention();
    // Release stretches hugely with attention: ~1.2s at rest → ~25s at deep now.
    const rel = 1.2 * (1 + A * 20);
    this.env.gain.cancelScheduledValues(now);
    this.env.gain.setValueAtTime(Math.max(0.0001, this.env.gain.value), now);
    this.env.gain.exponentialRampToValueAtTime(0.0001, now + rel);
    this.releaseEndsAt = now + rel + 0.2;
  }

  done(nowSec: number): boolean {
    return this.released && nowSec >= this.releaseEndsAt;
  }

  dispose(): void {
    for (const osc of this.oscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        /* already stopped */
      }
    }
    for (const g of this.partialGains) {
      try {
        g.disconnect();
      } catch {
        /* gone */
      }
    }
    try {
      this.env.disconnect();
    } catch {
      /* gone */
    }
  }
}
