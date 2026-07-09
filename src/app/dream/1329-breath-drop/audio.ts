// ════════════════════════════════════════════════════════════════════════════
// 1329-breath-drop / audio.ts — the beat engine you breathe into being.
//
// A REAL rhythmic step-sequencer at 126 BPM driven by a lookahead scheduler
// (the standard Web Audio trick: a setInterval polls ctx.currentTime and
// schedules 16th-note events ~120ms ahead, decoupled from rAF for tight
// timing). Layers are GATED by the player-charged tension T:
//
//   T>0.05 kick · T>0.35 closed hats · T>0.55 riser (Shepard drive-up + noise
//   sweep + drone filter opening) · T→1 snare fill.
//
// A drop (triggered by a sharp exhale onset while T is high — decided in the
// page) fires a hard downbeat impact and a full four-on-the-floor groove for a
// few bars, then decays into a breakdown so you breathe it back up. Loops,
// player-shaped, never identical.
//
// SAFETY: master gain <= 0.24, a DynamicsCompressorNode limiter sits before the
// destination, envelopes are short (bounded polyphony), and stop() tears every
// node down. The mic is analysed elsewhere (breath.ts) and is NEVER connected to
// the destination.
// ════════════════════════════════════════════════════════════════════════════

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

const MASTER_GAIN = 0.24;
const BPM = 126;
const SIXTEENTH = 60 / BPM / 4; // seconds per 16th note
const LOOK_AHEAD = 0.12; // seconds scheduled ahead
const POLL_MS = 25;
const DROP_BARS = 4; // full-groove bars after a drop before it decays

export type LayerLabel =
  | "silent"
  | "kick"
  | "kick + hats"
  | "riser building"
  | "fill — ready"
  | "DROP";

export interface AudioVisualState {
  bpm: number;
  layer: LayerLabel;
  dropActive: boolean;
  /** 0..1 kick pulse, decays between kicks (for a subtle visual throb). */
  beat: number;
}

export class DropAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private noiseBuf: AudioBuffer;

  private shepard: ShepardEngine | null = null;
  private drone: DroneBank | null = null;

  // riser noise sweep (continuous, gated by T)
  private riserSrc: AudioBufferSourceNode | null = null;
  private riserBp: BiquadFilterNode | null = null;
  private riserGain: GainNode | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;

  private tension = 0;
  private pitchNorm = 0.4;
  private dropUntil = 0; // ctx time until which full drop groove plays
  private kickQueue: number[] = []; // scheduled kick times for the visual pulse
  private beatPulse = 0;
  private started = false;

  constructor() {
    const Ctx: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx();

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;
    this.limiter.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(this.limiter);

    // one shared white-noise buffer for hats / snare / riser / bursts
    const len = Math.floor(this.ctx.sampleRate * 2);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  get audioTime(): number {
    return this.ctx.currentTime;
  }

  /** The shared AudioContext, so the mic analyser can attach to it. */
  get context(): AudioContext {
    return this.ctx;
  }

  /** Resume the context (must be called from a user gesture) and start the
   *  scheduler + sustained voices. */
  async start(): Promise<void> {
    if (this.started) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();

    // Shepard undertow = the "drive up" riser; drone = the filter-opening bed.
    this.shepard = startShepard(this.ctx, this.master, {
      dir: 1,
      peakGain: 0.18,
      driveRate: 0.22,
    });
    this.drone = startDroneBank(this.ctx, this.master, {
      root: 55,
      peakGain: 0.14,
      cutoffLow: 160,
      cutoffHigh: 3200,
    });

    // continuous riser noise sweep (gated by T in tick)
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 300;
    bp.Q.value = 2.5;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start();
    this.riserSrc = src;
    this.riserBp = bp;
    this.riserGain = g;

    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.started = true;
  }

  setTension(t: number): void {
    this.tension = Math.min(1, Math.max(0, t));
  }

  setPitch(norm: number): void {
    this.pitchNorm = Math.min(1, Math.max(0, norm));
  }

  get dropActive(): boolean {
    return this.ctx.currentTime < this.dropUntil;
  }

  /** Fire the drop: a hard downbeat impact now + full groove for DROP_BARS. */
  triggerDrop(): void {
    const now = this.ctx.currentTime + 0.02;
    this.dropUntil = now + (DROP_BARS * 4) * (60 / BPM);
    this.impact(now);
  }

  /** Per-animation-frame update: advance Shepard, set drives + riser sweep from
   *  T, and decay the visual beat pulse. */
  frame(dtSec: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const drop = this.dropActive;
    // during the drop the machine is at full drive regardless of T
    const drive = drop ? 1 : this.tension;

    this.shepard?.setDrive(drive * 0.9);
    this.shepard?.step(dtSec);
    this.drone?.setDrive(0.15 + drive * 0.85);

    if (this.riserGain && this.riserBp) {
      // riser only present while genuinely building (T>0.55) and not dropped
      const amt = drop ? 0 : smoothstep(0.55, 0.95, this.tension);
      this.riserGain.gain.setTargetAtTime(amt * 0.1, now, 0.12);
      const f = 250 * Math.pow(28, this.tension); // 250 -> ~7kHz sweep
      this.riserBp.frequency.setTargetAtTime(f, now, 0.1);
    }

    // advance the visual kick pulse
    while (this.kickQueue.length && this.kickQueue[0] <= now) {
      this.kickQueue.shift();
      this.beatPulse = 1;
    }
    this.beatPulse = Math.max(0, this.beatPulse - dtSec * 4.5);
  }

  getVisualState(): AudioVisualState {
    return {
      bpm: BPM,
      layer: this.currentLayer(),
      dropActive: this.dropActive,
      beat: this.beatPulse,
    };
  }

  private currentLayer(): LayerLabel {
    if (this.dropActive) return "DROP";
    const t = this.tension;
    if (t >= 0.85) return "fill — ready";
    if (t >= 0.55) return "riser building";
    if (t >= 0.35) return "kick + hats";
    if (t >= 0.05) return "kick";
    return "silent";
  }

  // ── lookahead scheduler ─────────────────────────────────────────────────────
  private tick(): void {
    const horizon = this.ctx.currentTime + LOOK_AHEAD;
    while (this.nextNoteTime < horizon) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.step = (this.step + 1) % 16;
      this.nextNoteTime += SIXTEENTH;
    }
  }

  private scheduleStep(step: number, t: number): void {
    const t01 = this.tension;
    const beat = step % 4 === 0; // quarter-note grid position

    if (this.dropActive) {
      // ---- DROP: full four-on-the-floor ----
      if (beat) {
        this.kick(t, 1.0);
        this.sub(t, 0.9);
      }
      if (step === 4 || step === 12) this.snare(t, 0.9);
      // 8th hats, open on offbeats
      if (step % 2 === 0) this.hat(t, step % 4 === 2, 0.4);
      return;
    }

    // ---- BUILD: layers gated by T ----
    if (t01 > 0.05 && beat) {
      this.kick(t, 0.55 + t01 * 0.4);
    }

    if (t01 > 0.35) {
      // closed hats on 8ths, tightening to 16ths near the top
      const div = t01 > 0.75 ? 1 : 2;
      if (step % div === 0) this.hat(t, false, 0.18 + t01 * 0.18);
      // open hat on the offbeat as it opens up
      if (t01 > 0.55 && (step === 6 || step === 14)) this.hat(t, true, 0.28);
    }

    // snare fill as T -> 1 (accelerating 16th snares)
    if (t01 > 0.85) {
      this.snare(t, 0.2 + (t01 - 0.85) * 2.0);
    } else if (t01 > 0.55 && (step === 4 || step === 12)) {
      this.snare(t, 0.35);
    }
  }

  // ── voices ──────────────────────────────────────────────────────────────────
  private kick(t: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.min(1, gain), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);
    this.kickQueue.push(t);
    if (this.kickQueue.length > 32) this.kickQueue.shift();
  }

  private sub(t: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(48, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.min(1, gain) * 0.8, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.42);
  }

  private hat(t: number, open: boolean, gain: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    const dur = open ? 0.14 : 0.045;
    g.gain.setValueAtTime(Math.min(1, gain) * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private snare(t: number, gain: number): void {
    // noise body
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.min(1, gain) * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.14);
    // tonal snap
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(190, t);
    og.gain.setValueAtTime(Math.min(1, gain) * 0.25, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(og);
    og.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  private impact(t: number): void {
    // the hard downbeat: kick + sub + a filtered noise burst
    this.kick(t, 1.0);
    this.sub(t, 1.0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(9000, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.62);
  }

  /** Full teardown — stop every node, disconnect, close the context. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.shepard?.stop();
    } catch {
      /* closing */
    }
    try {
      this.drone?.stop();
    } catch {
      /* closing */
    }
    try {
      this.riserSrc?.stop();
    } catch {
      /* already stopped */
    }
    this.riserSrc?.disconnect();
    this.riserBp?.disconnect();
    this.riserGain?.disconnect();
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    } catch {
      /* closing */
    }
    setTimeout(() => {
      try {
        this.master.disconnect();
        this.limiter.disconnect();
      } catch {
        /* closing */
      }
      if (this.ctx.state !== "closed") void this.ctx.close();
    }, 320);
    this.started = false;
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
