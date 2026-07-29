// ---------------------------------------------------------------------------
// 3672 · OATH — audio engine
//
// An irreversible, append-only commit ledger played through a look-ahead
// Web Audio scheduler (the classic "A Tale of Two Clocks" pattern: a coarse
// ~25 ms setInterval that schedules sample-accurate WebAudio events ~100 ms
// ahead of the audio clock). Each committed vow becomes a looping voice that
// sounds forever. There is deliberately NO removal path.
//
// Master chain: voices -> bus -> DynamicsCompressor -> masterGain(0.28) -> out
// A live "ghost" audition voice runs at low gain so the player HEARS a pitch
// before daring to vow it.
// ---------------------------------------------------------------------------

/** A permanent choice. Once appended to the ledger it is never removed. */
export interface Vow {
  id: number;
  /** position within the looping bar, 0..1 */
  phase: number;
  /** committed frequency in Hz — may be gloriously out of tune */
  freq: number;
  /** which of the 8 keys sounded it */
  keyIndex: number;
  /** bend in cents from the key's base pitch, for the record */
  cents: number;
  /** engine time at which it was sworn (for the birth ripple) */
  born: number;
  /** scheduler cursor: next loop occurrence to be scheduled */
  nextK: number;
}

const LOOKAHEAD = 0.1; // seconds scheduled ahead of the audio clock
const TICK_MS = 25; // scheduler wake interval
const PLUCK_DUR = 1.05; // seconds — committed voice decay tail

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class OathEngine {
  ctx: AudioContext | null = null;
  audioOK = false;

  readonly L: number; // loop duration (seconds)
  readonly beats: number;
  t0 = 0; // engine time at loop origin

  /** the append-only ledger — the whole point of the instrument */
  vows: Vow[] = [];

  private bus: GainNode | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;

  private ghostGain: GainNode | null = null;
  private ghostOsc: OscillatorNode | null = null;
  private ghostOsc2: OscillatorNode | null = null;

  private timer: number | null = null;
  private perfOrigin = 0;
  private nextId = 1;

  constructor(bpm: number, beats: number) {
    this.beats = beats;
    this.L = (60 / bpm) * beats;
  }

  /** monotonic engine clock in seconds (audio clock when available). */
  now(): number {
    if (this.ctx) return this.ctx.currentTime;
    return (performance.now() - this.perfOrigin) / 1000;
  }

  /** current playhead position within the loop, 0..1. */
  phaseNow(): number {
    const p = ((this.now() - this.t0) / this.L) % 1;
    return p < 0 ? p + 1 : p;
  }

  /** Must be called inside a user gesture (first keypress / Start button). */
  async start(): Promise<boolean> {
    this.perfOrigin = performance.now();
    try {
      const AC =
        window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (!AC) throw new Error("no-web-audio");
      const ctx = new AC();
      await ctx.resume();

      const master = ctx.createGain();
      master.gain.value = 0.28;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      const bus = ctx.createGain();
      bus.gain.value = 1;

      bus.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);

      // Persistent ghost audition voice (kept silent until a key is held).
      const ghostGain = ctx.createGain();
      ghostGain.gain.value = 0;
      const ghostLp = ctx.createBiquadFilter();
      ghostLp.type = "lowpass";
      ghostLp.frequency.value = 2400;
      const o1 = ctx.createOscillator();
      o1.type = "triangle";
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.detune.value = 5;
      o1.connect(ghostGain);
      o2.connect(ghostGain);
      ghostGain.connect(ghostLp);
      ghostLp.connect(bus);
      o1.start();
      o2.start();

      this.ctx = ctx;
      this.bus = bus;
      this.comp = comp;
      this.master = master;
      this.ghostGain = ghostGain;
      this.ghostOsc = o1;
      this.ghostOsc2 = o2;
      this.audioOK = true;
      this.t0 = ctx.currentTime;
      this.timer = window.setInterval(() => this.scheduleAhead(), TICK_MS);
    } catch {
      // Graceful degrade: no audio, but the rite still runs visually.
      this.ctx = null;
      this.audioOK = false;
      this.t0 = this.now();
    }
    return this.audioOK;
  }

  /** Begin / continue the live ghost audition at a continuous pitch. */
  audition(freq: number): void {
    if (!this.ctx || !this.ghostGain || !this.ghostOsc || !this.ghostOsc2)
      return;
    const t = this.ctx.currentTime;
    this.ghostOsc.frequency.setTargetAtTime(freq, t, 0.008);
    this.ghostOsc2.frequency.setTargetAtTime(freq * 2, t, 0.008);
    this.ghostGain.gain.cancelScheduledValues(t);
    this.ghostGain.gain.setTargetAtTime(0.07, t, 0.02);
  }

  /** Slide the ghost pitch as the player bends it. */
  bendAudition(freq: number): void {
    if (!this.ctx || !this.ghostOsc || !this.ghostOsc2) return;
    const t = this.ctx.currentTime;
    this.ghostOsc.frequency.setTargetAtTime(freq, t, 0.012);
    this.ghostOsc2.frequency.setTargetAtTime(freq * 2, t, 0.012);
  }

  /** Release the ghost voice (auditioning is free and reversible). */
  endAudition(): void {
    if (!this.ctx || !this.ghostGain) return;
    const t = this.ctx.currentTime;
    this.ghostGain.gain.cancelScheduledValues(t);
    this.ghostGain.gain.setTargetAtTime(0, t, 0.05);
  }

  /**
   * Swear a vow: append a permanent looping voice at `phase`/`freq`.
   * Returns the ledger entry. There is intentionally no inverse operation.
   */
  commit(phase: number, freq: number, keyIndex: number, cents: number): Vow {
    const vow: Vow = {
      id: this.nextId++,
      phase,
      freq,
      keyIndex,
      cents,
      born: this.now(),
      nextK: 0,
    };
    this.vows.push(vow);
    // Sound it once immediately so the commit is felt, if it hasn't just played.
    if (this.ctx) {
      this.pluck(freq, this.ctx.currentTime + 0.01, 0.5);
    }
    return vow;
  }

  // --- look-ahead scheduler ------------------------------------------------
  private scheduleAhead(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    for (const v of this.vows) {
      let time = this.t0 + (v.nextK + v.phase) * this.L;
      // fast-forward the cursor to the present (handles late-born vows)
      if (time < now) {
        v.nextK = Math.ceil((now - this.t0) / this.L - v.phase);
        time = this.t0 + (v.nextK + v.phase) * this.L;
      }
      while (time < horizon) {
        this.pluck(v.freq, time, 0.42);
        v.nextK++;
        time = this.t0 + (v.nextK + v.phase) * this.L;
      }
    }
  }

  /** A short bowed pluck: triangle body + soft sine octave, fast attack. */
  private pluck(freq: number, time: number, peak: number): void {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, time + PLUCK_DUR);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(Math.min(freq * 7, 7000), time);
    lp.frequency.exponentialRampToValueAtTime(
      Math.min(freq * 2.2, 3200),
      time + PLUCK_DUR,
    );

    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.28;

    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(lp);
    lp.connect(this.bus);

    o.start(time);
    o2.start(time);
    o.stop(time + PLUCK_DUR + 0.05);
    o2.stop(time + PLUCK_DUR + 0.05);
  }

  /** Full teardown — stop everything, disconnect, close the context. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.ghostOsc?.stop();
      this.ghostOsc2?.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.ghostGain?.disconnect();
      this.bus?.disconnect();
      this.comp?.disconnect();
      this.master?.disconnect();
    } catch {
      /* noop */
    }
    this.ghostOsc = null;
    this.ghostOsc2 = null;
    this.ghostGain = null;
    this.bus = null;
    this.comp = null;
    this.master = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.audioOK = false;
    if (ctx) {
      ctx.close().catch(() => {});
    }
  }
}

// --- deterministic PRNG (mulberry32) — never Math.random / Date.now --------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
