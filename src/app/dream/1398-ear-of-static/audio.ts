// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the auditory-pareidolia engine for 1398-ear-of-static.
//
//   A bed of deterministic filtered noise runs from the first gesture. Seven
//   tuned resonances are ALWAYS RUNNING inside it but gated to silence: for each
//   one a bandpass "ring" reads the SAME noise buffer (so its pitch literally IS
//   the hiss, filtered), and a look-ahead scheduler plays its short in-key
//   melodic fragment on a continuously-running oscillator whose gate is closed.
//   As the listening focus dwells near a resonance, its ring Q + gain climb, its
//   melody gate opens, and a soft notch thins the broadband noise exactly at
//   that pitch — so the melody appears to resolve OUT of the static, as if it was
//   always there. (Anil Seth: perception is controlled hallucination.)
//
//   AudioContext is gesture-gated (created only inside start(), from a tap).
//   Master ≤ 0.20, ramped up from silence (never a click) → DynamicsCompressor
//   limiter → destination. stop() tears everything down and closes the ctx we own.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import {
  buildResonances,
  scaleFreq,
  alignment,
  SEED,
  type Resonance,
} from "./resonances";

const MASTER_PEAK = 0.2; // ≤ 0.22 ceiling, ramped from silence
const HISS_BASE = 0.06; // broadband bed gain at rest
const RING_PEAK = 0.055; // per-resonance bandpass ring peak
const MELODY_PEAK = 0.07; // per-note melodic peak (gated by alignment/dwell)
const SCHED_AHEAD = 0.12; // look-ahead window (s) for the note scheduler
const SCHED_TICK = 45; // scheduler poll interval (ms)

interface Voice {
  res: Resonance;
  ring: BiquadFilter; // reads the same noise → pitched ring
  ringGain: GainNode;
  osc: OscillatorNode; // always-running melody oscillator
  env: GainNode; // per-note envelope
  gate: GainNode; // alignment/dwell gate (0..1)
  align: number; // current alignment 0..1
  gateLevel: number; // current melody gate 0..1
  nextNoteTime: number; // scheduler cursor (ctx time)
  noteIndex: number;
}

type BiquadFilter = BiquadFilterNode;

export class EarAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hissGain: GainNode | null = null;
  private hissNotch: BiquadFilterNode | null = null;
  private noiseSrc: AudioBufferSourceNode | null = null;
  private drone: DroneBank | null = null;
  private verb: VoidReverb | null = null;
  private voices: Voice[] = [];
  private schedTimer: number | null = null;
  private disposed = false;
  private focusX = 0.5;
  private dwell = 0;

  readonly resonances: Resonance[];

  constructor() {
    this.resonances = buildResonances(SEED);
  }

  /** Gesture-gated: call only from inside a user tap handler. */
  async start(): Promise<void> {
    if (this.ctx || this.disposed) return;
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* resumes on first node */
      }
    }
    const now = ctx.currentTime;

    // limiter → destination
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);

    // master, ramped from silence
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 2.2);
    master.connect(limiter);
    this.master = master;

    // shared void reverb bus
    const verb = createVoidReverb(ctx, { seconds: 5, decay: 2.8, wet: 0.55 });
    verb.output.connect(master);
    this.verb = verb;

    // shared ambient drone bed (kept low; grounds the hiss)
    const drone = startDroneBank(ctx, master, {
      root: 55,
      ratios: [1, 3 / 2, 2, 5 / 2],
      peakGain: 0.06,
      cutoffLow: 130,
      cutoffHigh: 1400,
    });
    drone.setDrive(0.1);
    this.drone = drone;

    // deterministic looping noise buffer (the static)
    const len = Math.floor(ctx.sampleRate * 2.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let s = 0x1398face >>> 0;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = (s / 0xffffffff) * 2 - 1;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buf;
    noiseSrc.loop = true;
    this.noiseSrc = noiseSrc;

    // broadband bed: noise → wide bandpass → dynamic notch → hiss gain → out
    const wide = ctx.createBiquadFilter();
    wide.type = "bandpass";
    wide.frequency.value = 900;
    wide.Q.value = 0.35;
    const notch = ctx.createBiquadFilter();
    notch.type = "notch";
    notch.frequency.value = 330;
    notch.Q.value = 0.0001; // transparent until a resonance resolves
    this.hissNotch = notch;
    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.0001, now);
    hissGain.gain.setTargetAtTime(HISS_BASE, now, 1.4);
    this.hissGain = hissGain;

    noiseSrc.connect(wide);
    wide.connect(notch);
    notch.connect(hissGain);
    hissGain.connect(master);
    hissGain.connect(verb.input);

    // per-resonance voices — all running, all gated to silence at t=0
    for (const res of this.resonances) {
      // bandpass ring reads the SAME noise (its pitch is the filtered hiss)
      const ring = ctx.createBiquadFilter();
      ring.type = "bandpass";
      ring.frequency.value = res.freq;
      ring.Q.value = 1.5;
      const ringGain = ctx.createGain();
      ringGain.gain.value = 0.0001;
      noiseSrc.connect(ring);
      ring.connect(ringGain);
      ringGain.connect(master);
      ringGain.connect(verb.input);

      // always-running melody oscillator, gated
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = res.freq;
      const env = ctx.createGain();
      env.gain.value = 0.0001;
      const gate = ctx.createGain();
      gate.gain.value = 0.0001;
      osc.connect(env);
      env.connect(gate);
      gate.connect(master);
      gate.connect(verb.input);
      osc.start(now);

      this.voices.push({
        res,
        ring,
        ringGain,
        osc,
        env,
        gate,
        align: 0,
        gateLevel: 0,
        nextNoteTime: now + 0.5 + res.phase * res.noteDur,
        noteIndex: 0,
      });
    }

    noiseSrc.start(now);

    // look-ahead note scheduler
    this.schedTimer = window.setInterval(() => this.scheduleNotes(), SCHED_TICK);
  }

  /** Focus position along the ribbon (0..1) + dwell charge (0..1). */
  setFocus(x: number, dwellLevel: number): void {
    if (!this.ctx || this.disposed) return;
    this.focusX = Math.max(0, Math.min(1, x));
    this.dwell = Math.max(0, Math.min(1, dwellLevel));
    const ctx = this.ctx;
    const now = ctx.currentTime;

    let topAlign = 0;
    let topFreq = 330;
    for (const v of this.voices) {
      const a = alignment(this.focusX, v.res.x);
      v.align = a;
      // Ring: gain + Q climb with alignment (a pitched ridge rings out).
      const rg = RING_PEAK * a * a;
      v.ringGain.gain.setTargetAtTime(Math.max(0.0001, rg), now, 0.08);
      v.ring.Q.setTargetAtTime(1.5 + a * a * 16, now, 0.1);
      // Melody gate: alignment gated further by dwell so it "locks" on dwell.
      const gateTarget = a * a * (0.35 + 0.65 * this.dwell);
      v.gateLevel = gateTarget;
      v.gate.gain.setTargetAtTime(Math.max(0.0001, gateTarget), now, 0.1);
      if (a > topAlign) {
        topAlign = a;
        topFreq = v.res.freq;
      }
    }

    // Thin the broadband noise: a soft notch opens exactly at the resolving
    // pitch, so the ring + melody emerge from a gap in the hiss.
    if (this.hissNotch) {
      this.hissNotch.frequency.setTargetAtTime(topFreq, now, 0.12);
      this.hissNotch.Q.setTargetAtTime(0.0001 + topAlign * topAlign * 7, now, 0.12);
    }
    if (this.hissGain) {
      this.hissGain.gain.setTargetAtTime(
        HISS_BASE * (1 - 0.4 * topAlign),
        now,
        0.2,
      );
    }
    // Drive the shared drone a touch as resonances resolve.
    this.drone?.setDrive(0.1 + 0.5 * topAlign);
  }

  /** Look-ahead scheduler: shapes each voice's looping melodic fragment. */
  private scheduleNotes(): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    const until = ctx.currentTime + SCHED_AHEAD;
    for (const v of this.voices) {
      while (v.nextNoteTime < until) {
        const t = v.nextNoteTime;
        const degree = v.res.contour[v.noteIndex % v.res.contour.length];
        const freq = scaleFreq(degree);
        v.osc.frequency.setValueAtTime(freq, t);
        // per-note envelope (peak fixed; audibility comes from the gate)
        const dur = v.res.noteDur;
        const atk = 0.02;
        const rel = dur * 0.6;
        v.env.gain.cancelScheduledValues(t);
        v.env.gain.setValueAtTime(0.0001, t);
        v.env.gain.exponentialRampToValueAtTime(MELODY_PEAK, t + atk);
        v.env.gain.exponentialRampToValueAtTime(0.0001, t + atk + rel);
        v.noteIndex++;
        v.nextNoteTime += dur;
      }
    }
  }

  /** Full teardown. Owns the ctx → closes it. */
  stop(): void {
    if (this.disposed) return;
    this.disposed = true;
    const ctx = this.ctx;
    if (this.schedTimer !== null) {
      window.clearInterval(this.schedTimer);
      this.schedTimer = null;
    }
    const now = ctx ? ctx.currentTime : 0;
    if (ctx && this.master) {
      try {
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(
          Math.max(0.0001, this.master.gain.value),
          now,
        );
        this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      } catch {
        /* ctx closing */
      }
    }
    try {
      this.drone?.stop();
    } catch {
      /* noop */
    }
    const killAt = now + 0.5;
    for (const v of this.voices) {
      try {
        v.osc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    try {
      this.noiseSrc?.stop(killAt);
    } catch {
      /* noop */
    }
    this.voices = [];
    if (ctx) {
      window.setTimeout(() => {
        try {
          this.master?.disconnect();
          this.hissGain?.disconnect();
          this.verb?.output.disconnect();
          void ctx.close();
        } catch {
          /* noop */
        }
      }, 600);
    }
    this.ctx = null;
  }
}
