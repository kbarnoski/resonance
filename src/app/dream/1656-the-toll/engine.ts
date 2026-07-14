/**
 * 1656 · the toll — audio engine.
 *
 * A long-form, stateful generative score you can only hear while you pay the
 * toll of attention. A "held" gesture (spacebar / pointer) integrates into an
 * `attentionProgress` currency (measured in seconds of accrued attention, read
 * from AudioContext.currentTime deltas — never the wall clock). That currency
 * moves the piece through named MOVEMENTS, each of which unlocks and transforms
 * a shared MOTIF. Release and the *sound* dissolves fast (a "veil" gain snaps
 * toward silence), but your earned *progress* only erodes slowly — a fickle
 * listener slides backward instead of resetting.
 *
 * Everything is deterministic: a mulberry32 PRNG (seeded from a literal) adds
 * micro-humanization only; no nondeterministic sources and no wall clock.
 *
 * Safety: all sound flows through a master GainNode (<= 0.14) into a
 * DynamicsCompressor before destination; every note and the veil use ramps —
 * no instant gain changes, no clicks.
 */

// ---- deterministic PRNG (mulberry32, seeded from a fixed literal) ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---- the movements: named stages keyed by accrued-attention seconds --------
export interface Stage {
  label: string;
  /** seconds of accrued attention at which this movement begins */
  at: number;
  /** step (beat) duration in seconds while in this movement */
  stepDur: number;
}

export const STAGES: Stage[] = [
  { label: "a single held tone", at: 0, stepDur: 1.0 },
  { label: "the first motif enters", at: 10, stepDur: 0.7 },
  { label: "the motif is answered", at: 34, stepDur: 0.66 },
  { label: "a countermelody threads beneath", at: 70, stepDur: 0.58 },
  { label: "the climb", at: 125, stepDur: 0.44 },
  { label: "the tonic — home", at: 250, stepDur: 0.85 },
];

export const RESOLUTION_AT = STAGES[STAGES.length - 1].at; // 250s

// erosion is slower than accrual: releasing costs, but does not wipe the slate.
const EROSION_RATE = 0.6; // progress-seconds lost per real second of release

// just-intonation modal scale (warm, contemplative minor/dorian colour)
const JI = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5];
const ROOT_HZ = 146.83; // D3 — patient, low, human

// the MOTIF that returns transformed across movements (state = memory)
const MOTIF = [0, 2, 4, 3, 2];
const RHY = [1, 0, 1, 1, 1]; // rest on the 2nd step gives the phrase breath
const PHRASE = MOTIF.length;

export interface Snapshot {
  stageIndex: number;
  stageLabel: string;
  nextStageLabel: string | null;
  secondsToNext: number | null;
  meter: number; // 0..1 progress toward resolution
  progress: number; // accrued-attention seconds
  held: boolean;
  resolved: boolean;
  resolvedLine: string | null;
  receiptId: number;
  receiptText: string | null;
}

type OscType = OscillatorType;

export class TollEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private veil: GainNode; // the fast presence envelope (0 on release)
  private droneGain: GainNode;
  private droneFilter: BiquadFilterNode;
  private droneOscs: OscillatorNode[] = [];
  private rng = mulberry32(0x1656a70c);

  private started = false;
  private held = false;
  private lastT = 0;
  private nextStepTime = 0;
  private beatIndex = 0;

  private progress = 0; // accrued-attention seconds
  private holdSeconds = 0; // length of the current continuous hold

  private resolved = false;
  private resolvedLine: string | null = null;
  private receiptId = 0;
  private receiptText: string | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.28;
    this.comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.14; // hard master ceiling
    this.master.connect(this.comp);

    this.veil = ctx.createGain();
    this.veil.gain.value = 0.0001; // silent until the toll is paid
    this.veil.connect(this.master);

    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 220;
    this.droneFilter.Q.value = 0.6;
    this.droneFilter.connect(this.veil);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.09;
    this.droneGain.connect(this.droneFilter);
  }

  /** Anchor timing to the audio clock and start the persistent drone. Call
   *  once, the first time the AudioContext is confirmed running. */
  begin(): void {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    this.lastT = t;
    this.nextStepTime = t + 0.15;

    // persistent drone: two detuned saws + a sine sub, always synthesizing,
    // audible only through the veil.
    const specs: Array<{ type: OscType; detune: number; oct: number; g: number }> = [
      { type: "sawtooth", detune: -4, oct: 0, g: 0.5 },
      { type: "sawtooth", detune: 5, oct: 0, g: 0.45 },
      { type: "sine", detune: 0, oct: -1, g: 0.9 },
    ];
    for (const s of specs) {
      const osc = this.ctx.createOscillator();
      osc.type = s.type;
      osc.frequency.value = ROOT_HZ * Math.pow(2, s.oct);
      osc.detune.value = s.detune;
      const g = this.ctx.createGain();
      g.gain.value = s.g;
      osc.connect(g);
      g.connect(this.droneGain);
      osc.start(t);
      this.droneOscs.push(osc);
    }
  }

  setHeld(held: boolean): void {
    if (held === this.held) return;
    this.held = held;
    if (!held) {
      // release: dissolve, and print what was let go — but ignore taps.
      if (this.holdSeconds > 0.5) this.pushReleaseReceipt();
      this.holdSeconds = 0;
    }
  }

  private stageAt(p: number): number {
    let idx = 0;
    for (let i = 0; i < STAGES.length; i++) {
      if (p >= STAGES[i].at) idx = i;
    }
    return idx;
  }

  private degFreq(degree: number, octaveOffset: number): number {
    const oct = octaveOffset + Math.floor(degree / 7);
    const idx = ((degree % 7) + 7) % 7;
    return ROOT_HZ * JI[idx] * Math.pow(2, oct);
  }

  private pushReleaseReceipt(): void {
    const p = this.progress;
    const st = this.stageAt(p);
    const held = Math.round(this.holdSeconds);
    const next = st + 1;
    let line: string;
    if (next < STAGES.length) {
      const away = Math.max(0, Math.round(STAGES[next].at - p));
      line = `you held for ${held}s — "${STAGES[next].label}" was ${away}s away.`;
    } else {
      line = `you held for ${held}s — you were already home, and you let go.`;
    }
    this.receiptId += 1;
    this.receiptText = line;
  }

  /** Create one enveloped note. Ramps only — no clicks. Self-disconnects. */
  private playNote(
    time: number,
    freq: number,
    dur: number,
    peak: number,
    type: OscType,
    cutoff?: number
  ): void {
    if (peak <= 0.0005) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = this.rng() * 6 - 3; // micro-humanization (deterministic)

    const g = ctx.createGain();
    const vel = 0.9 + this.rng() * 0.2;
    const pk = peak * vel;
    const atk = Math.min(0.09, dur * 0.3);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(pk, time + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);

    let tail: AudioNode = g;
    let filter: BiquadFilterNode | null = null;
    if (cutoff) {
      filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      filter.Q.value = 0.5;
      g.connect(filter);
      tail = filter;
    }
    tail.connect(this.veil);

    osc.start(time);
    osc.stop(time + dur + 0.06);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      if (filter) filter.disconnect();
    };
  }

  /** Schedule everything that sounds on one beat, given accrued progress. */
  private scheduleStep(time: number, beat: number): void {
    const p = this.progress;
    const wMel = smoothstep(STAGES[1].at, STAGES[1].at + 6, p);
    const wAns = smoothstep(STAGES[2].at, STAGES[2].at + 6, p);
    const wCnt = smoothstep(STAGES[3].at, STAGES[3].at + 6, p);
    const wClm = smoothstep(STAGES[4].at, STAGES[4].at + 8, p);
    const wHome = smoothstep(STAGES[5].at - 6, STAGES[5].at, p);

    const pos = beat % PHRASE;
    const phrase = Math.floor(beat / PHRASE);
    const stepDur = STAGES[this.stageAt(p)].stepDur;

    // subtle root heartbeat under everything
    if (beat % 8 === 0) {
      this.playNote(time, this.degFreq(0, -1), stepDur * 4, 0.05, "sine", 600);
    }

    if (wHome > 0.4) {
      // HOME: the tonic. Voices converge to a sustained root/fifth/octave bell.
      if (pos === 0) {
        this.playNote(time, this.degFreq(0, -1), 4.6, 0.12 * wHome, "sine", 900);
        this.playNote(time, this.degFreq(4, 0), 4.6, 0.085 * wHome, "triangle", 1400);
        this.playNote(time, this.degFreq(7, 0), 4.6, 0.06 * wHome, "sine", 1900);
      }
      if (RHY[pos]) {
        this.playNote(time, this.degFreq(0, 0), stepDur * 1.5, 0.1 * wHome, "triangle", 1600);
      }
      return; // home overrides the busier machinery
    }

    // the climb transposes the motif upward, scaled by how earned it is
    const climbT = Math.round((phrase % 4) * 2 * wClm);
    const answering = wAns > 0.2 && phrase % 2 === 1;

    if (RHY[pos]) {
      const deg = MOTIF[pos] + climbT;
      if (answering) {
        // the motif answered a fifth up, brighter
        this.playNote(
          time,
          this.degFreq(deg + 4, 0),
          stepDur * 1.5,
          0.12 * wAns,
          "sine",
          1600 + wClm * 1200
        );
      } else {
        this.playNote(
          time,
          this.degFreq(deg, 0),
          stepDur * 1.6,
          0.15 * wMel,
          "triangle",
          1100 + wClm * 1500
        );
      }
    }

    // countermelody: inverted motif, low, filling the phrase's rests
    if (wCnt > 0.15 && !RHY[pos]) {
      const cdeg = 6 - MOTIF[pos] + climbT;
      this.playNote(time, this.degFreq(cdeg, -1), stepDur * 1.8, 0.09 * wCnt, "sine", 900);
    }

    // climb shimmer: an octave-up harmonic doubling the motif
    if (wClm > 0.2 && RHY[pos]) {
      this.playNote(
        time,
        this.degFreq(MOTIF[pos] + climbT + 7, 0),
        stepDur * 1.2,
        0.05 * wClm,
        "sine",
        4200
      );
    }
  }

  /** Advance one frame off the audio clock; returns the render snapshot. */
  tick(): Snapshot {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this.lastT === 0) this.lastT = t;
    let dt = t - this.lastT;
    this.lastT = t;
    if (dt < 0) dt = 0;
    if (dt > 0.25) dt = 0.25; // guard against tab-throttle jumps

    if (this.started) {
      if (this.held) {
        this.progress += dt;
        this.holdSeconds += dt;
      } else {
        this.progress = Math.max(0, this.progress - dt * EROSION_RATE);
      }
      this.progress = Math.min(this.progress, RESOLUTION_AT + 30);

      // the veil: fast toward presence when held, fast toward silence on
      // release — the sound dissolves the instant you let go.
      const target = this.held ? 1 : 0.0001;
      this.veil.gain.setTargetAtTime(target, t, this.held ? 0.18 : 0.22);

      // the drone brightens as attention accrues
      const meter = clamp(this.progress / RESOLUTION_AT, 0, 1);
      this.droneFilter.frequency.setTargetAtTime(220 + meter * 1500, t, 0.3);

      // schedule ahead of the clock
      while (this.nextStepTime < t + 0.12) {
        this.scheduleStep(this.nextStepTime, this.beatIndex);
        const st = this.stageAt(this.progress);
        this.nextStepTime += STAGES[st].stepDur;
        this.beatIndex += 1;
      }

      if (this.progress >= RESOLUTION_AT && !this.resolved) {
        this.resolved = true;
        this.resolvedLine =
          "you reached the tonic. almost no one does. the piece is complete — you can let go now.";
        this.receiptId += 1;
        this.receiptText = "resolution reached. the toll is paid in full.";
      }
    }

    const stageIndex = this.stageAt(this.progress);
    const next = stageIndex + 1 < STAGES.length ? STAGES[stageIndex + 1] : null;
    return {
      stageIndex,
      stageLabel: STAGES[stageIndex].label,
      nextStageLabel: next ? next.label : null,
      secondsToNext: next ? Math.max(0, next.at - this.progress) : null,
      meter: clamp(this.progress / RESOLUTION_AT, 0, 1),
      progress: this.progress,
      held: this.held,
      resolved: this.resolved,
      resolvedLine: this.resolvedLine,
      receiptId: this.receiptId,
      receiptText: this.receiptText,
    };
  }

  /** Stop and disconnect everything this engine owns. Caller closes the ctx. */
  dispose(): void {
    const now = this.ctx.currentTime;
    for (const osc of this.droneOscs) {
      try {
        osc.stop(now);
      } catch {
        /* already stopped */
      }
      osc.disconnect();
    }
    this.droneOscs = [];
    try {
      this.droneGain.disconnect();
      this.droneFilter.disconnect();
      this.veil.disconnect();
      this.master.disconnect();
      this.comp.disconnect();
    } catch {
      /* ignore */
    }
  }
}
