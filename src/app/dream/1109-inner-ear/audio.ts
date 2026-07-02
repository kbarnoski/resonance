/**
 * 1109 · Inner Ear — Web Audio engine.
 *
 * Strict per-ear routing: one ChannelMerger(2) whose two inputs are fed by a
 * left-bus gain and a right-bus gain. Dichotic tones route to exactly one bus;
 * diotic tones (tritone / Zwicker) route to both. Every tone gets a raised-
 * cosine attack/release so nothing clicks. A lookahead scheduler drives the
 * alternating modes deterministically off ctx.currentTime.
 */

import {
  buildPinkNoise,
  ModeId,
  OCTAVE_HIGH,
  OCTAVE_LOW,
  SCALE_ASC,
  SCALE_DESC,
  SCALE_PERIOD,
  shepardPartials,
  ZWICKER_CENTER,
} from "./illusions";

export type Ear = "L" | "R" | "both";
export type Reveal = "both" | "left" | "right";

export interface ToneEvent {
  start: number;
  end: number;
  lane: "L" | "R" | "P" | "T" | "Z";
  freq: number;
  side?: "L" | "R"; // percept marker (which ear you tend to hear it in)
  pc?: number; // tritone pitch class
  noiseEnd?: number; // zwicker: end of the noise burst (silence follows)
}

// Normalized raised-cosine ramps (0→1 rise, 1→0 fall).
const ENV_N = 48;
const RISE = new Float32Array(ENV_N);
const FALL = new Float32Array(ENV_N);
for (let i = 0; i < ENV_N; i++) {
  const x = i / (ENV_N - 1);
  RISE[i] = 0.5 - 0.5 * Math.cos(Math.PI * x);
  FALL[i] = 0.5 + 0.5 * Math.cos(Math.PI * x);
}
function scaledCurve(base: Float32Array, peak: number): Float32Array {
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) out[i] = base[i] * peak;
  return out;
}

const LOOKAHEAD = 0.2; // seconds scheduled ahead of currentTime
const TICK_MS = 25;
const ATTACK = 0.012;
const RELEASE = 0.014;

const ZW_NOISE = 2.6; // noise burst duration (s)
const ZW_SILENCE = 3.2; // silence gap after the burst (s)

export class InnerEarEngine {
  ctx: AudioContext | null = null;
  mode: ModeId = "octave";
  swapped = false;
  reveal: Reveal = "both";
  events: ToneEvent[] = [];

  private merger: ChannelMergerNode | null = null;
  private leftBus: GainNode | null = null;
  private rightBus: GainNode | null = null;

  // Persistent Zwicker chain.
  private zwSource: AudioBufferSourceNode | null = null;
  private zwGain: GainNode | null = null;

  private tick: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;

  /** Build the graph. Must be called from a user gesture so audio can resume. */
  async start(): Promise<void> {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;

    const merger = ctx.createChannelMerger(2);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 18;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    const master = ctx.createGain();
    master.gain.value = 0.72;

    merger.connect(limiter);
    limiter.connect(master);
    master.connect(ctx.destination);

    const leftBus = ctx.createGain();
    const rightBus = ctx.createGain();
    leftBus.gain.value = 1;
    rightBus.gain.value = 1;
    leftBus.connect(merger, 0, 0); // → left channel
    rightBus.connect(merger, 0, 1); // → right channel

    this.merger = merger;
    this.leftBus = leftBus;
    this.rightBus = rightBus;

    if (ctx.state === "suspended") await ctx.resume();

    this.resetSchedule();
    this.tick = setInterval(() => this.runTick(), TICK_MS);
  }

  stop(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    if (this.zwSource) {
      try {
        this.zwSource.stop();
      } catch {
        /* already stopped */
      }
      this.zwSource = null;
    }
    const ctx = this.ctx;
    this.ctx = null;
    this.merger = null;
    this.leftBus = null;
    this.rightBus = null;
    this.zwGain = null;
    this.events = [];
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
  }

  get running(): boolean {
    return this.ctx !== null;
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setMode(mode: ModeId): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === "zwicker") this.ensureZwicker();
    else if (this.zwGain && this.ctx) {
      this.zwGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.zwGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    // Reveal only makes sense for dichotic modes; restore both otherwise.
    if (mode === "tritone" || mode === "zwicker" || mode === "calibration") {
      this.setReveal("both");
    }
    this.resetSchedule();
  }

  setSwapped(v: boolean): void {
    this.swapped = v;
  }

  setReveal(r: Reveal): void {
    this.reveal = r;
    if (!this.ctx || !this.leftBus || !this.rightBus) return;
    const t = this.ctx.currentTime;
    const dur = 0.15;
    const lTarget = r === "right" ? 0 : 1;
    const rTarget = r === "left" ? 0 : 1;
    for (const [bus, target] of [
      [this.leftBus, lTarget],
      [this.rightBus, rTarget],
    ] as [GainNode, number][]) {
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(target, t + dur);
    }
  }

  // --- scheduling ----------------------------------------------------------
  private resetSchedule(): void {
    if (!this.ctx) return;
    this.stepIndex = 0;
    this.nextStepTime =
      this.mode === "calibration" ? Infinity : this.ctx.currentTime + 0.08;
  }

  private runTick(): void {
    if (!this.ctx) return;
    const ahead = this.ctx.currentTime + LOOKAHEAD;
    while (this.nextStepTime < ahead) {
      const dur = this.scheduleStep(this.stepIndex, this.nextStepTime);
      if (!isFinite(dur) || dur <= 0) {
        this.nextStepTime = Infinity;
        break;
      }
      this.nextStepTime += dur;
      this.stepIndex++;
    }
    this.pruneEvents(this.ctx.currentTime);
  }

  private scheduleStep(i: number, t: number): number {
    switch (this.mode) {
      case "octave":
        return this.schedOctave(i, t);
      case "scale":
        return this.schedScale(i, t);
      case "tritone":
        return this.schedTritone(i, t);
      case "zwicker":
        return this.schedZwicker(t);
      default:
        return Infinity; // calibration: driven on demand by the UI
    }
  }

  private pruneEvents(now: number): void {
    if (this.events.length > 120) {
      this.events = this.events.filter((e) => e.end > now - 6);
    }
  }

  // --- tone helpers --------------------------------------------------------
  private busFor(ear: Ear): GainNode[] {
    const l = this.leftBus!;
    const r = this.rightBus!;
    if (ear === "both") return [l, r];
    if (ear === "L") return [this.swapped ? r : l];
    return [this.swapped ? l : r];
  }

  private applyEnv(g: GainNode, t: number, dur: number, peak: number): void {
    const rel = Math.min(RELEASE, dur * 0.4);
    const att = Math.min(ATTACK, dur * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.setValueCurveAtTime(scaledCurve(RISE, peak), t, att);
    g.gain.setValueCurveAtTime(scaledCurve(FALL, peak), t + dur - rel, rel);
  }

  private playTone(
    freq: number,
    t: number,
    dur: number,
    ear: Ear,
    peak: number,
    type: OscillatorType = "sine",
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    osc.connect(g);
    for (const bus of this.busFor(ear)) g.connect(bus);
    this.applyEnv(g, t, dur, peak);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private playShepard(pc: number, t: number, dur: number, peak: number): void {
    const partials = shepardPartials(pc);
    let norm = 0;
    for (const p of partials) norm += p.amp;
    for (const p of partials) {
      this.playTone(p.freq, t, dur, "both", (peak * p.amp) / norm, "sine");
    }
  }

  // --- modes ---------------------------------------------------------------
  private schedOctave(i: number, t: number): number {
    const dur = 0.25;
    const even = i % 2 === 0;
    const leftFreq = even ? OCTAVE_LOW : OCTAVE_HIGH;
    const rightFreq = even ? OCTAVE_HIGH : OCTAVE_LOW;
    this.playTone(leftFreq, t, dur, "L", 0.24);
    this.playTone(rightFreq, t, dur, "R", 0.24);
    // Typical right-hander percept: one tone bouncing ear-to-ear + octave jump.
    const pFreq = even ? OCTAVE_HIGH : OCTAVE_LOW;
    const pSide: "L" | "R" = even ? "R" : "L";
    this.events.push({ start: t, end: t + dur, lane: "L", freq: leftFreq });
    this.events.push({ start: t, end: t + dur, lane: "R", freq: rightFreq });
    this.events.push({
      start: t,
      end: t + dur,
      lane: "P",
      freq: pFreq,
      side: pSide,
    });
    return dur;
  }

  private schedScale(i: number, t: number): number {
    const dur = 0.28;
    const idx = i % SCALE_PERIOD;
    const asc = SCALE_ASC[idx];
    const desc = SCALE_DESC[idx];
    // i even: ascending → RIGHT, descending → LEFT; i odd: swap.
    const even = i % 2 === 0;
    const rightFreq = even ? asc : desc;
    const leftFreq = even ? desc : asc;
    this.playTone(leftFreq, t, dur, "L", 0.22, "triangle");
    this.playTone(rightFreq, t, dur, "R", 0.22, "triangle");
    const hi = Math.max(asc, desc);
    const lo = Math.min(asc, desc);
    this.events.push({ start: t, end: t + dur, lane: "L", freq: leftFreq });
    this.events.push({ start: t, end: t + dur, lane: "R", freq: rightFreq });
    // Reassembled percept: smooth high line in R ear, low line in L ear.
    this.events.push({ start: t, end: t + dur, lane: "P", freq: hi, side: "R" });
    this.events.push({ start: t, end: t + dur, lane: "P", freq: lo, side: "L" });
    return dur;
  }

  private schedTritone(i: number, t: number): number {
    const noteDur = 0.55;
    const gap = 0.1;
    const pairGap = 0.55;
    const pcA = (i * 5) % 12; // walk by fifths — deterministic, covers all 12
    const pcB = (pcA + 6) % 12;
    this.playShepard(pcA, t, noteDur, 0.3);
    this.playShepard(pcB, t + noteDur + gap, noteDur, 0.3);
    this.events.push({ start: t, end: t + noteDur, lane: "T", freq: 0, pc: pcA });
    this.events.push({
      start: t + noteDur + gap,
      end: t + noteDur + gap + noteDur,
      lane: "T",
      freq: 0,
      pc: pcB,
    });
    return noteDur + gap + noteDur + pairGap;
  }

  private schedZwicker(t: number): number {
    const g = this.zwGain;
    const ctx = this.ctx;
    if (!g || !ctx) return ZW_NOISE + ZW_SILENCE;
    const peak = 0.5;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.18);
    g.gain.setValueAtTime(peak, t + ZW_NOISE - 0.04);
    g.gain.linearRampToValueAtTime(0, t + ZW_NOISE); // abrupt-but-clickless stop
    this.events.push({
      start: t,
      end: t + ZW_NOISE + ZW_SILENCE,
      lane: "Z",
      freq: ZWICKER_CENTER,
      noiseEnd: t + ZW_NOISE,
    });
    return ZW_NOISE + ZW_SILENCE;
  }

  private ensureZwicker(): void {
    const ctx = this.ctx;
    if (!ctx || this.zwSource || !this.leftBus || !this.rightBus) return;
    const buffer = ctx.createBuffer(
      1,
      Math.floor(ctx.sampleRate * 2),
      ctx.sampleRate,
    );
    buffer.getChannelData(0).set(buildPinkNoise(ctx.sampleRate, 2));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    // Carve the spectral gap with cascaded notch filters across the band.
    const centers = [700, 850, 1000, 1150];
    let node: AudioNode = src;
    for (const f of centers) {
      const notch = ctx.createBiquadFilter();
      notch.type = "notch";
      notch.frequency.value = f;
      notch.Q.value = 4;
      node.connect(notch);
      node = notch;
    }

    const g = ctx.createGain();
    g.gain.value = 0;
    node.connect(g);
    g.connect(this.leftBus);
    g.connect(this.rightBus);
    src.start();

    this.zwSource = src;
    this.zwGain = g;
  }

  /** Calibration: play one tritone pair (Shepard pc then pc+6), diotically. */
  playCalibrationPair(pc: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.06;
    const noteDur = 0.6;
    this.playShepard(pc % 12, t, noteDur, 0.3);
    this.playShepard((pc + 6) % 12, t + noteDur + 0.12, noteDur, 0.3);
    this.events.push({
      start: t,
      end: t + noteDur,
      lane: "T",
      freq: 0,
      pc: pc % 12,
    });
    this.events.push({
      start: t + noteDur + 0.12,
      end: t + noteDur + 0.12 + noteDur,
      lane: "T",
      freq: 0,
      pc: (pc + 6) % 12,
    });
  }
}
