// engine.ts — the response half of Pulse Mirror.
//
// Composes the shared drone bed + void reverb, routes a master through a
// DynamicsCompressor, and runs the ANTICIPATORY scheduler: a lookahead loop
// (poll ~25 ms, schedule ~120 ms ahead on the Web Audio clock) that commits a
// pure just-intonation note to the PREDICTED next beat so the answer lands ON
// the beat rather than late (Dannenberg 1984).
//
// It owns the OnsetSource (mic or demo) and the TempoTracker, and exposes a
// snapshot for the renderer + UI.

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import {
  DemoPerformer,
  MicListener,
  TempoTracker,
  type OnsetEvent,
  type OnsetSource,
  type TempoState,
} from "./listener";

// A pure just-intonation ladder over a warm root (~220 Hz, A3).
const ROOT = 220;
const JI_LADDER = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];

const LOOKAHEAD_S = 0.12; // schedule this far ahead of the clock
const POLL_MS = 25;

/** A scheduled answer note, for the visual answer blooms. */
export interface AnswerEvent {
  time: number; // AudioContext clock (seconds) it will sound
  ratio: number;
  freq: number;
  strength: number;
}

export interface EngineSnapshot {
  tempo: TempoState;
  now: number;
  mode: "mic" | "demo";
  /** Most recent caller onsets (mirror of tracker.recentOnsets). */
  onsets: OnsetEvent[];
  /** Recently scheduled answer notes. */
  answers: AnswerEvent[];
}

export class PulseEngine {
  readonly ctx: AudioContext;
  private tracker = new TempoTracker();
  private source: OnsetSource;
  private drone: DroneBank;
  private reverb: VoidReverb;
  private master: GainNode;
  private answerBus: GainNode;
  private compressor: DynamicsCompressorNode;

  private pollTimer: number | null = null;
  private scheduledUpToBeat = -1;
  private recentAnswers: AnswerEvent[] = [];
  private ladderIndex = 0;

  private constructor(ctx: AudioContext, source: OnsetSource) {
    this.ctx = ctx;
    this.source = source;

    // Master → compressor → destination.
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 3.5;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.18;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    // Void reverb bus for the answer voice + pad.
    this.reverb = createVoidReverb(ctx, { seconds: 3.5, decay: 3, wet: 0.42 });
    this.reverb.output.connect(this.master);

    // A soft JI pad underneath everything, one octave below the answer root.
    this.drone = startDroneBank(ctx, this.reverb.input, {
      root: ROOT / 2,
      ratios: [1, 5 / 4, 3 / 2, 2],
      cutoffLow: 300,
      cutoffHigh: 1400,
      peakGain: 0.12,
    });
    this.drone.setDrive(0.25);

    // Answer voice bus (dry-ish, also sends to reverb).
    this.answerBus = ctx.createGain();
    this.answerBus.gain.value = 0.9;
    this.answerBus.connect(this.master);
    this.answerBus.connect(this.reverb.input);
  }

  static async create(preferMic: boolean): Promise<PulseEngine> {
    const AC: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();

    let source: OnsetSource;
    if (preferMic) {
      try {
        source = await MicListener.open(ctx);
      } catch {
        source = new DemoPerformer(ctx);
      }
    } else {
      source = new DemoPerformer(ctx);
    }
    return new PulseEngine(ctx, source);
  }

  get mode(): "mic" | "demo" {
    return this.source.kind;
  }

  start(): void {
    if (this.pollTimer !== null) return;
    const loop = () => {
      this.source.poll(this.tracker);
      this.scheduleAhead();
      this.pollTimer = window.setTimeout(loop, POLL_MS);
    };
    loop();
  }

  /** Commit answer notes to predicted beats within the lookahead horizon. */
  private scheduleAhead(): void {
    const now = this.ctx.currentTime;
    const state = this.tracker.sample(now);
    // Confidence gate: don't answer until a tempo is established.
    if (state.confidence < 0.18 || state.onsetCount < 3) return;

    const horizon = now + LOOKAHEAD_S + state.period; // look one beat past the edge
    let beat = this.tracker.nextBeatAfter(
      Math.max(now, this.scheduledUpToBeat),
    );
    let guard = 0;
    while (beat <= horizon && guard < 8) {
      guard += 1;
      if (beat > this.scheduledUpToBeat + 1e-4 && beat >= now + 0.02) {
        this.scheduleAnswerAt(beat, state.confidence);
        this.scheduledUpToBeat = beat;
      }
      beat = this.tracker.nextBeatAfter(beat);
    }
  }

  private scheduleAnswerAt(time: number, confidence: number): void {
    // Walk the JI ladder — a gentle call-and-response melody.
    this.ladderIndex = (this.ladderIndex + 1) % JI_LADDER.length;
    const ratio = JI_LADDER[this.ladderIndex];
    const freq = ROOT * ratio;
    const strength = 0.4 + 0.6 * confidence;

    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    // A softer sine sub an octave down for body.
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq / 2;

    const g = ctx.createGain();
    const peak = 0.16 * strength;
    const attack = 0.012;
    const release = Math.min(0.9, 0.35 + strength * 0.4);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, peak), time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + release);

    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.0001, time);
    subG.gain.exponentialRampToValueAtTime(
      Math.max(0.002, peak * 0.5),
      time + attack,
    );
    subG.gain.exponentialRampToValueAtTime(0.0001, time + attack + release);

    // A soft lowpass so the answer glows rather than bites.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600 + 1200 * strength;
    lp.Q.value = 0.6;

    osc.connect(g);
    sub.connect(subG);
    g.connect(lp);
    subG.connect(lp);
    lp.connect(this.answerBus);

    osc.start(time);
    sub.start(time);
    const stopAt = time + attack + release + 0.05;
    osc.stop(stopAt);
    sub.stop(stopAt);

    const ev: AnswerEvent = { time, ratio, freq, strength };
    this.recentAnswers.push(ev);
    if (this.recentAnswers.length > 24) this.recentAnswers.shift();

    // Nudge the pad brightness with confidence for a subtle swell.
    this.drone.setDrive(0.2 + 0.35 * confidence);
  }

  snapshot(): EngineSnapshot {
    const now = this.ctx.currentTime;
    return {
      tempo: this.tracker.sample(now),
      now,
      mode: this.source.kind,
      onsets: this.tracker.recentOnsets,
      answers: this.recentAnswers,
    };
  }

  async dispose(): Promise<void> {
    if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.source.dispose();
    this.drone.stop();
    try {
      this.answerBus.disconnect();
      this.reverb.output.disconnect();
      this.master.disconnect();
      this.compressor.disconnect();
    } catch {
      /* closing */
    }
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
