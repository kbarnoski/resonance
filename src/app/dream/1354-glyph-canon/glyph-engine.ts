// ════════════════════════════════════════════════════════════════════════════
// glyph-engine.ts — audio brain for 1354 GLYPH CANON.
//
// A just-intonation FM/additive instrument PLUS a Steve-Reich phase canon.
// A short repeating PHRASE (8 steps) is replayed by two independent players:
//   • player A (violet stream) at the base step interval,
//   • player B (teal  stream) at base × 1.012 — a hair slower.
// They begin in unison and slowly de-phase, exactly like Piano Phase. There is
// NO BPM step-sequencer clock: each player is scheduled directly against
// audioContext.currentTime with a short look-ahead, so TIME emerges from the
// drift between the two voices rather than from a drum grid.
//
// Output only (no mic). Master ≤ 0.22, ending in a DynamicsCompressor limiter.
// ════════════════════════════════════════════════════════════════════════════

/** A2. Low root for the just-intonation lattice. */
export const ROOT_HZ = 110;

/** Seven just-intonation degrees (the octave 2/1 is reached by degree 7). */
export const RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];

/** Steps in the looping phrase (the canon motif length). */
export const STEPS = 8;

/** Map a global scale degree (0..21, three octaves) to a frequency in Hz. */
export function degreeToFreq(globalDegree: number): number {
  const oct = Math.floor(globalDegree / 7);
  const deg = ((globalDegree % 7) + 7) % 7;
  return ROOT_HZ * Math.pow(2, oct) * RATIOS[deg];
}

/** Which player/stream fired a note: 0 = live/violet, 1 = twin/teal. */
export type Stream = 0 | 1;

export interface NoteEvent {
  stream: Stream;
  degree: number;
  freq: number;
  velocity: number;
}

type NoteListener = (ev: NoteEvent) => void;

interface Voice {
  endsAt: number;
  stop: (fadeAt: number) => void;
}

const BASE_STEP = 0.19; // seconds per phrase step for player A
const DRIFT = 1.012; // player B is 1.2% slower — the phasing ratio
const LOOKAHEAD = 0.12; // schedule this far ahead of the audio clock
const MASTER = 0.22;
const MAX_VOICES = 12;

export class GlyphCanon {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private wetReturn: GainNode;
  private delay: DelayNode;
  private droneGain: GainNode;
  private droneNodes: OscillatorNode[] = [];
  private lfo: OscillatorNode | null = null;

  private phrase: (number | null)[] = new Array(STEPS).fill(null);
  private voices: Voice[] = [];
  private listener: NoteListener | null = null;

  // canon scheduler state
  private gridOrigin = 0;
  private nextA = 0;
  private nextB = 0;
  private iA = 0;
  private iB = 0;
  private running = false;
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.limiter);

    // A gentle feedback-delay space (self-contained reverb-ish tail).
    this.delay = ctx.createDelay(0.6);
    this.delay.delayTime.value = 0.26;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2600;
    this.delay.connect(damp);
    damp.connect(fb);
    fb.connect(this.delay);
    this.wetReturn = ctx.createGain();
    this.wetReturn.gain.value = 0.34;
    damp.connect(this.wetReturn);
    this.wetReturn.connect(this.master);

    // Drone bed: root + fifth, softly filtered, slow amplitude drift.
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    const droneLp = ctx.createBiquadFilter();
    droneLp.type = "lowpass";
    droneLp.frequency.value = 520;
    this.droneGain.connect(droneLp);
    droneLp.connect(this.master);
    for (const f of [ROOT_HZ, ROOT_HZ * 1.5, ROOT_HZ * 0.5]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f < ROOT_HZ ? 0.06 : 0.045;
      o.connect(g);
      g.connect(this.droneGain);
      this.droneNodes.push(o);
    }
  }

  /** Register the callback that spawns a visual glyph pulse per note. */
  setNoteListener(fn: NoteListener): void {
    this.listener = fn;
  }

  /** Begin: gesture-gated. Ramps master up, starts drone + canon clock. */
  start(): void {
    if (this.running || this.disposed) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.linearRampToValueAtTime(MASTER, t + 1.2);

    this.droneGain.gain.setValueAtTime(0.0001, t);
    this.droneGain.gain.linearRampToValueAtTime(1, t + 2.4);
    for (const o of this.droneNodes) o.start(t);

    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain);
    lfoGain.connect(this.droneGain.gain);
    lfo.start(t);
    this.lfo = lfo;

    this.gridOrigin = t + 0.2;
    this.nextA = this.gridOrigin;
    this.nextB = this.gridOrigin;
    this.iA = 0;
    this.iB = 0;
    this.running = true;
  }

  /** True while the canon clock is advancing. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Number of non-rest steps currently in the phrase. */
  noteCount(): number {
    return this.phrase.reduce<number>((n, s) => n + (s === null ? 0 : 1), 0);
  }

  /** Seed a gentle consonant motif so the canon plays itself when idle. */
  seedIdle(): void {
    const motif: (number | null)[] = [0, 4, 2, 7, 4, 9, null, 5];
    this.phrase = motif.slice();
  }

  /** Wipe the phrase (idle logic will re-seed it after a few seconds). */
  clearPhrase(): void {
    this.phrase = new Array(STEPS).fill(null);
  }

  /** Re-seed only when the phrase has fallen nearly silent. */
  ensureIdle(): void {
    if (this.noteCount() < 2) this.seedIdle();
  }

  /** Live keypress: sound immediately (violet), and record into the phrase
   *  at the nearest A-grid slot so it joins the looping canon. */
  playLive(degree: number): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const freq = degreeToFreq(degree);
    this.fireVoice(freq, now, 1, 0);
    this.emit({ stream: 0, degree, freq, velocity: 1 });
    if (this.running) {
      const slot =
        ((Math.round((now - this.gridOrigin) / BASE_STEP) % STEPS) + STEPS) % STEPS;
      this.phrase[slot] = degree;
    }
  }

  /** Look-ahead scheduler — call once per animation frame. Drives both
   *  players against the audio clock; player B drifts at BASE_STEP × DRIFT. */
  schedule(): void {
    if (!this.running || this.disposed) return;
    const stepB = BASE_STEP * DRIFT;
    const ahead = this.ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (this.nextA < ahead && guard < 64) {
      this.fireStep(0, this.iA, this.nextA);
      this.iA = (this.iA + 1) % STEPS;
      this.nextA += BASE_STEP;
      guard++;
    }
    while (this.nextB < ahead && guard < 128) {
      this.fireStep(1, this.iB, this.nextB);
      this.iB = (this.iB + 1) % STEPS;
      this.nextB += stepB;
      guard++;
    }
    // prune finished voices
    const t = this.ctx.currentTime;
    if (this.voices.length > 0) {
      this.voices = this.voices.filter((v) => v.endsAt > t);
    }
  }

  private fireStep(stream: Stream, idx: number, when: number): void {
    const degree = this.phrase[idx];
    if (degree === null) return;
    const freq = degreeToFreq(degree);
    const vel = stream === 0 ? 0.82 : 0.7;
    this.fireVoice(freq, when, vel, stream);
    this.emit({ stream, degree, freq, velocity: vel });
  }

  private emit(ev: NoteEvent): void {
    if (this.listener) this.listener(ev);
  }

  /** One soft FM voice: carrier + modulator, pitch/stream-panned, enveloped. */
  private fireVoice(freq: number, when: number, velocity: number, stream: Stream): void {
    if (this.voices.length >= MAX_VOICES) {
      const oldest = this.voices.shift();
      oldest?.stop(when);
    }
    const ctx = this.ctx;
    const t = Math.max(when, ctx.currentTime);

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * (stream === 0 ? 2 : 1.5);
    const modGain = ctx.createGain();
    const depth = freq * (stream === 0 ? 1.4 : 0.7);
    modGain.gain.setValueAtTime(depth, t);
    modGain.gain.exponentialRampToValueAtTime(depth * 0.08 + 0.001, t + 0.5);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const vgain = ctx.createGain();
    // higher notes softer to keep the field balanced
    const peak = velocity * 0.1 * Math.pow(110 / freq, 0.28);
    vgain.gain.setValueAtTime(0.0001, t);
    vgain.gain.linearRampToValueAtTime(peak, t + 0.014);
    vgain.gain.setTargetAtTime(0.0001, t + 0.05, 0.42);

    const pan = ctx.createStereoPanner();
    const pitchPan = Math.max(-0.5, Math.min(0.5, (freq - 220) / 660));
    pan.pan.value = Math.max(-0.9, Math.min(0.9, pitchPan * 0.5 + (stream === 0 ? -0.32 : 0.32)));

    carrier.connect(vgain);
    vgain.connect(pan);
    pan.connect(this.master);
    // a taste of the delay space
    const send = ctx.createGain();
    send.gain.value = 0.5;
    pan.connect(send);
    send.connect(this.delay);

    const dur = 1.6;
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + dur);
    mod.stop(t + dur);

    const voice: Voice = {
      endsAt: t + dur,
      stop: (fadeAt: number) => {
        try {
          vgain.gain.cancelScheduledValues(fadeAt);
          vgain.gain.setTargetAtTime(0.0001, fadeAt, 0.04);
          carrier.stop(fadeAt + 0.2);
          mod.stop(fadeAt + 0.2);
        } catch {
          // already stopped
        }
      },
    };
    this.voices.push(voice);
  }

  /** Instant panic-stop: master to 0 in ≤80 ms, freeze the clock. */
  panic(): void {
    this.running = false;
    const t = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0.0001, t + 0.07);
    } catch {
      // ignore
    }
  }

  /** Full teardown: ramp down and close the context. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    const t = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(0.0001, t + 0.08);
    } catch {
      // ignore
    }
    const closeAt = 140;
    window.setTimeout(() => {
      try {
        for (const o of this.droneNodes) o.stop();
        this.lfo?.stop();
      } catch {
        // already stopped
      }
      this.ctx.close().catch(() => {});
    }, closeAt);
  }
}
