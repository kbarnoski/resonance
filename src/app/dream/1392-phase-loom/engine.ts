// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — the phasing-loop audio engine for 1392-phase-loom.
//
// Each note the player holds spawns a short melodic CELL that repeats at its
// OWN period. Periods differ (slightly different step tempo + different cell
// lengths), so the loops drift relative to one another — Steve-Reich phasing.
// There is NO shared 4/4 grid: every voice keeps its own `nextTime`/`stepDur`
// and is scheduled independently through one 25 ms look-ahead used purely for
// TIMING ACCURACY, never as a metronome. All pitches are just-intonation so the
// interference beats stay consonant.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

// Just-intonation major pentatonic, two octaves, over a C3 base.
const BASE = 130.81; // C3
const PENT = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

// A few short melodic cells (ratios relative to a loop's root). Cell LENGTH
// varies (3..6), which by itself produces polymeter; the per-pitch tempo drift
// then makes the polymeter never exactly repeat → continuous phasing.
const CELLS: number[][] = [
  [1, 5 / 4, 3 / 2, 2],
  [1, 3 / 2, 5 / 4],
  [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3],
  [1, 2, 3 / 2, 5 / 4, 3 / 2, 9 / 8],
];

const BASE_STEP = 0.33; // seconds per cell step at zero drift
const NUM_PADS = 10;

export interface PadInfo {
  slot: number; // 0..NUM_PADS-1, low pitch → high pitch
  freq: number; // root frequency
  hue: number; // 0..360, violet → emerald → amber
  name: string; // display label
}

interface Voice {
  slot: number;
  freq: number;
  cell: number[];
  stepDur: number;
  period: number;
  hue: number;
  nextTime: number; // audio-clock time of the next step
  startTime: number; // audio-clock time of phase 0 (root note)
  step: number;
}

export interface LoopSample {
  slot: number;
  hue: number;
  phase: number; // 0..1 position within the loop
  period: number;
  cellLen: number;
}

const NOTE_NAMES = ["C", "D", "E", "G", "A"]; // pentatonic degree labels

export function buildPads(): PadInfo[] {
  const pads: PadInfo[] = [];
  for (let i = 0; i < NUM_PADS; i++) {
    const oct = Math.floor(i / PENT.length);
    const deg = i % PENT.length;
    const freq = BASE * PENT[deg] * Math.pow(2, oct);
    const hue = 270 - (i / (NUM_PADS - 1)) * 225; // 270 violet → 45 amber
    pads.push({ slot: i, freq, hue, name: `${NOTE_NAMES[deg]}${3 + oct}` });
  }
  return pads;
}

export class PhaseLoom {
  readonly ctx: AudioContext;
  private master: GainNode;
  private voiceBus: GainNode;
  private lp: BiquadFilterNode;
  private wet: GainNode;
  private drone: DroneBank;
  private pads: PadInfo[];
  private voices = new Map<number, Voice>();
  private timer: number | null = null;
  private closed = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.pads = buildPads();

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(ctx.destination);

    // gentle lowpass over the whole plucked bed
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3400;
    lp.Q.value = 0.4;
    lp.connect(this.master);
    this.lp = lp;

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1;
    this.voiceBus.connect(lp);

    // a soft feedback delay for air (subtle, keeps it meditative)
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.28;
    this.voiceBus.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(this.wet);
    this.wet.connect(lp);

    // an underlying just-intonation pad from the shared drone bank
    this.drone = startDroneBank(ctx, this.master, {
      root: 65.41, // C2
      peakGain: 0.11,
      cutoffLow: 180,
      cutoffHigh: 900,
    });
    this.drone.setDrive(0.12);
  }

  getPads(): PadInfo[] {
    return this.pads;
  }

  async start() {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(0.9, now + 1.6);
    if (this.timer === null) {
      this.timer = window.setInterval(() => this.tick(), 25);
    }
  }

  isActive(slot: number): boolean {
    return this.voices.has(slot);
  }

  activeSlots(): number[] {
    return [...this.voices.keys()];
  }

  /** Toggle the loop on `slot`. Returns true if it is now active. */
  toggle(slot: number): boolean {
    if (this.voices.has(slot)) {
      this.voices.delete(slot);
      this.drone.setDrive(0.1 + this.voices.size * 0.05);
      return false;
    }
    this.add(slot);
    return true;
  }

  private add(slot: number) {
    const pad = this.pads[slot];
    if (!pad) return;
    const cell = CELLS[slot % CELLS.length];
    // symmetric per-pitch tempo drift, ±~2.7%
    const drift = (slot - (NUM_PADS - 1) / 2) * 0.006;
    const stepDur = BASE_STEP * (1 + drift);
    const period = cell.length * stepDur;
    const t = this.ctx.currentTime + 0.06;
    this.voices.set(slot, {
      slot,
      freq: pad.freq,
      cell,
      stepDur,
      period,
      hue: pad.hue,
      nextTime: t,
      startTime: t,
      step: 0,
    });
    this.drone.setDrive(0.1 + this.voices.size * 0.05);
  }

  /** Re-phase one loop by nudging its timeline forward ~1/3 of a cycle. */
  nudge(slot: number) {
    const v = this.voices.get(slot);
    if (!v) return;
    const dt = v.period / 3;
    v.nextTime += dt;
    v.startTime += dt;
  }

  clear() {
    this.voices.clear();
    this.drone.setDrive(0.1);
  }

  /** Per-frame phase snapshot for the visualiser. */
  sample(): LoopSample[] {
    const now = this.ctx.currentTime;
    const out: LoopSample[] = [];
    for (const v of this.voices.values()) {
      const phase = (((now - v.startTime) / v.period) % 1 + 1) % 1;
      out.push({
        slot: v.slot,
        hue: v.hue,
        phase,
        period: v.period,
        cellLen: v.cell.length,
      });
    }
    return out;
  }

  private tick() {
    if (this.closed) return;
    const ctx = this.ctx;
    const horizon = ctx.currentTime + 0.12;
    for (const v of this.voices.values()) {
      while (v.nextTime < horizon) {
        const ratio = v.cell[v.step];
        const accent = v.step === 0 ? 1 : 0.62;
        this.pluck(v.freq * ratio, v.nextTime, v.stepDur, accent);
        v.nextTime += v.stepDur;
        v.step = (v.step + 1) % v.cell.length;
      }
    }
  }

  private pluck(freq: number, t: number, stepDur: number, accent: number) {
    const ctx = this.ctx;
    const dur = Math.min(2.0, stepDur * 1.9);
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = freq * 2;
    const partial = ctx.createGain();
    partial.gain.value = 0.22;
    const env = ctx.createGain();
    const peak = 0.14 * accent;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(env);
    o2.connect(partial);
    partial.connect(env);
    env.connect(this.voiceBus);
    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } catch {
      /* ignore */
    }
    try {
      this.drone.stop();
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 620));
    try {
      await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
