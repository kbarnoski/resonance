// 1810 · Bourse — audio engine (Ikeda cold synthesis).
//
// Borrowing Ryoji Ikeda's datamatics language: pure sines, precise clicks, a
// little sub, nothing muddy. Each trade is a short quantised tone whose pitch
// comes from price mapped (log) into the asset's rolling [lo,hi] window, snapped
// to a sparse scale. Buy vs sell = a subtle pan + brightness difference. Size =
// amplitude + a 1 ms click "print" (big prints add a sub thud). Underneath, a
// quiet minimal-techno kick pulses on a grid and a high "tape tone" tracks
// volatility. Master → DynamicsCompressor → master gain (<= 0.18).

import type { Side, Trade } from "./market";

const MASTER_GAIN = 0.16;

// A sparse pentatonic-ish lattice — pure intervals, Ikeda-clinical.
const SCALE = [0, 2, 4, 7, 9, 11];

// Per-asset base register (MIDI) + timbre. High/low registers, few voices.
const ASSET_VOICE: Record<string, { base: number; type: OscillatorType }> = {
  BTC: { base: 36, type: "sine" }, // low pure sine
  ETH: { base: 60, type: "sine" }, // mid sine
  SOL: { base: 72, type: "triangle" }, // high triangle
  XRP: { base: 84, type: "triangle" }, // very high triangle
  INDEX: { base: 48, type: "sine" },
};

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Log-map a price within [lo,hi] to [0,1], then snap to a sparse scale step
 *  over ~2 octaves and return a MIDI note offset. */
function priceToNoteOffset(price: number, lo: number, hi: number): number {
  if (!(hi > lo)) return SCALE[0];
  const lp = Math.log(Math.max(lo, price));
  const frac = Math.max(0, Math.min(1, (lp - Math.log(lo)) / (Math.log(hi) - Math.log(lo))));
  const steps = SCALE.length * 2; // 2 octaves of the scale
  const idx = Math.max(0, Math.min(steps - 1, Math.floor(frac * steps)));
  const octave = Math.floor(idx / SCALE.length);
  const degree = idx % SCALE.length;
  return octave * 12 + SCALE[degree];
}

export class BourseAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;

  // volatility "tape tone" — a quiet high sine tracking turbulence
  private tape: OscillatorNode | null = null;
  private tapeGain: GainNode | null = null;

  // shared noise buffer for the click transients (deterministic content)
  private noiseBuf: AudioBuffer | null = null;

  // minimal-techno kick grid
  private kickTimer: number | null = null;
  private kickPeriodMs = 500; // 120 bpm default; tightened by volatility

  private reducedMotion = false;
  private started = false;

  constructor(reducedMotion = false) {
    this.reducedMotion = reducedMotion;
  }

  get isRunning(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.started) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio unavailable");
    const ctx = new Ctx();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 22;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;
    comp.connect(master);
    master.connect(ctx.destination);
    this.master = master;
    this.comp = comp;

    // Deterministic noise buffer for clicks (LCG, fixed seed).
    const len = Math.ceil(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 0x1810 >>> 0;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    this.noiseBuf = buf;

    // Volatility tape tone — a quiet high sine, level/pitch set by setVolatility.
    const tape = ctx.createOscillator();
    tape.type = "sine";
    tape.frequency.value = 5200;
    const tapeGain = ctx.createGain();
    tapeGain.gain.value = 0;
    tape.connect(tapeGain).connect(comp);
    tape.start();
    this.tape = tape;
    this.tapeGain = tapeGain;

    // Minimal-techno kick grid.
    this.scheduleKick();

    // Gentle master fade-in.
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(MASTER_GAIN, now + 1.2);

    this.started = true;
  }

  /** A trade → a short precise tone + a click print (+ sub thud if large). */
  trade(tr: Trade, lo: number, hi: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.comp || !this.noiseBuf) return;
    const now = ctx.currentTime;

    const voice = ASSET_VOICE[tr.asset] ?? ASSET_VOICE.INDEX;
    const offset = priceToNoteOffset(tr.price, lo, hi);
    // buy slightly brighter/higher-shifted, sell slightly darker/lower.
    const sideShift = tr.side === "buy" ? 0 : -1;
    const freq = midiToFreq(voice.base + offset + sideShift);
    const pan = this.sidePan(tr.side);

    // size → amplitude (clamped) — heavy-tailed sizes stay controlled.
    const norm = Math.max(0, Math.min(1, Math.log1p(tr.size) / Math.log1p(40)));
    const amp = 0.05 + norm * 0.16;

    // ---- the pure tone ----
    const osc = ctx.createOscillator();
    osc.type = voice.type;
    osc.frequency.value = freq;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = tr.side === "buy" ? freq * 6 : freq * 3;
    filt.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(filt).connect(g).connect(panner).connect(this.comp);
    const dur = 0.09 + norm * 0.1;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0006, now + dur);
    osc.start(now);
    osc.stop(now + dur + 0.02);
    osc.onended = () => this.safeDisconnect([osc, filt, g, panner]);

    // ---- the 1ms click "print" ----
    this.click(pan, 0.06 + norm * 0.14);

    // ---- large print → a short sub thud ----
    if (norm > 0.72) {
      this.subThud(amp * 1.1);
    }
  }

  /** A 1 ms noise impulse — the "print". */
  private click(pan: number, amp: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.comp || !this.noiseBuf) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.value = 0;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(hp).connect(g).connect(panner).connect(this.comp);
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.0002, now + 0.012);
    src.start(now);
    src.stop(now + 0.02);
    src.onended = () => this.safeDisconnect([src, hp, g, panner]);
  }

  /** Sub-bass thud for a large print. */
  private subThud(amp: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.comp) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(Math.min(0.22, amp), now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 0.25);
    osc.connect(g).connect(this.comp);
    osc.start(now);
    osc.stop(now + 0.3);
    osc.onended = () => this.safeDisconnect([osc, g]);
  }

  /** The minimal-techno grid kick — quiet, on the beat. */
  private kick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.comp) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 0.16);
    osc.connect(g).connect(this.comp);
    osc.start(now);
    osc.stop(now + 0.2);
    osc.onended = () => this.safeDisconnect([osc, g]);
  }

  private scheduleKick(): void {
    if (!this.ctx) return;
    this.kick();
    this.kickTimer = window.setTimeout(() => this.scheduleKick(), this.kickPeriodMs);
  }

  /** Volatility [0,1]-ish (regime) → tape-tone level/pitch + kick tempo. */
  setVolatility(regime: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const r = Math.max(0, Math.min(1, regime));
    const now = ctx.currentTime;
    if (this.tape && this.tapeGain) {
      // higher + louder (but still quiet) as turbulence rises
      this.tape.frequency.setTargetAtTime(4200 + r * 4200, now, 0.5);
      const lvl = this.reducedMotion ? 0.006 + r * 0.01 : 0.008 + r * 0.02;
      this.tapeGain.gain.setTargetAtTime(lvl, now, 0.6);
    }
    // tempo: calm ~112bpm, turbulent ~140bpm (tighter grid)
    const bpm = 108 + r * 34;
    this.kickPeriodMs = Math.round(60000 / bpm);
  }

  private sidePan(side: Side): number {
    // buy slightly right, sell slightly left.
    return side === "buy" ? 0.28 : -0.28;
  }

  private safeDisconnect(nodes: AudioNode[]): void {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        // already gone
      }
    }
  }

  stop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.kickTimer !== null) {
      window.clearTimeout(this.kickTimer);
      this.kickTimer = null;
    }
    // clean fade-out, then close.
    try {
      const now = ctx.currentTime;
      if (this.master) {
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(this.master.gain.value, now);
        this.master.gain.linearRampToValueAtTime(0, now + 0.3);
      }
      this.tape?.stop(now + 0.35);
    } catch {
      // noop
    }
    const c = ctx;
    window.setTimeout(() => {
      c.close().catch(() => {
        // noop
      });
    }, 400);
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.tape = null;
    this.tapeGain = null;
    this.noiseBuf = null;
    this.started = false;
  }
}
