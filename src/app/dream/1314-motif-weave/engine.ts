// 1314-motif-weave — engine.ts
// The MUSICAL irreversible-memory engine.
//
// Every melodic gesture the player performs is captured as a MOTIF (a pitch/
// rhythm contour) and pushed into a growing library that is NEVER cleared
// within a run. A rAF-driven beat clock walks the piece through named dream
// phases; on each beat the generative score may (a) keep the pulse, (b) sow a
// new idle seed phrase, or (c) RECALL an earlier motif — transposed, time-
// stretched, harmonized, reversed or set in canon — so at minute 6 you
// literally hear the phrase you played at minute 1 come back changed. Each
// stored motif is also a persistent luminous thread in the weave (see weave.ts):
// the visual IS the record. Irreversible, like teamLab's "The World of
// Irreversible Change" — the viewer becomes part of the work's structure.
//
// No React, no DOM at module scope. AudioContext is only built inside start(),
// which a Begin gesture calls. Voice-count-limited through a compressor limiter
// so overlapping recall never clips or runs away.

import { startShepard, ShepardEngine } from "../_shared/psych/shepard";

// ── Musical constants ────────────────────────────────────────────────────────
const ROOT = 110; // A2
const PENTA = [0, 3, 5, 7, 10]; // minor pentatonic — always consonant when stacked
const IMAX = 24; // pitch-index range for pointer + normalisation (~4.8 octaves)
const MAX_VOICES = 16; // hard voice cap — overlapping recall can never run away
const MAX_MOTIFS = 72; // library cap (never cleared, but bounded so it can't leak)
const MASTER = 0.28; // ≤0.3

export type Transform = "gentle" | "harmonize" | "canon" | "reverse" | "stretch";

export interface MotifNote {
  i: number; // pitch index
  t: number; // onset, in beats, relative to motif start
  dur: number; // duration in beats
  vel: number; // 0..1
}

export interface Motif {
  id: number;
  born: number; // elapsed seconds when created
  origin: "seed" | "played" | "echo";
  notes: MotifNote[];
  lenBeats: number;
  avgNorm: number; // mean pitch, 0..1 (for thread base height)
  contour: number[]; // per-note pitch, 0..1 (for the drawn thread shape)
  ySeed: number; // stable jitter so threads spread out on the loom
  hue: number; // base hue in the dusk→dawn palette
  glowAt: number; // performance.now() ms the motif last sounded
  glowDur: number; // ms the glow should last (its audible length)
  recallCount: number;
}

export interface PhaseSpec {
  name: string;
  until: number; // elapsed seconds this phase runs until
  bpm: number;
  seedRate: number; // P(new idle seed) per beat
  recallRate: number; // P(recall an earlier motif) per beat
  brightness: number; // 0..1 filter openness / intensity (the pole)
  density: number; // extra off-beat shimmer in lucid passages
}

// Named long-form arc — genuinely different at minute 5 than minute 1 because
// the library has grown and the transforms intensify.
const ARC: PhaseSpec[] = [
  { name: "drifting off", until: 75, bpm: 52, seedRate: 0.5, recallRate: 0.16, brightness: 0.3, density: 0 },
  { name: "the dream deepens", until: 170, bpm: 63, seedRate: 0.24, recallRate: 0.46, brightness: 0.5, density: 0.15 },
  { name: "lucid bloom", until: 285, bpm: 82, seedRate: 0.12, recallRate: 0.82, brightness: 0.85, density: 0.5 },
  { name: "dissolution", until: 345, bpm: 57, seedRate: 0.05, recallRate: 0.55, brightness: 0.42, density: 0.1 },
  { name: "waking", until: Infinity, bpm: 50, seedRate: 0.12, recallRate: 0.3, brightness: 0.34, density: 0 },
];

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

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const NOTE_NAMES = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];

export class MotifEngine {
  // Public live state read by the render loop / React HUD.
  motifs: Motif[] = [];
  elapsed = 0; // active seconds (the arc clock)
  active = false; // audio started?
  breath = 0; // 0..1 mic amplitude (0 without mic)
  micOn = false;
  phaseIndex = 0;
  phaseName = ARC[0].name;
  tempoBpm = ARC[0].bpm;
  brightness = ARC[0].brightness;
  beatPhase = 0; // 0..1 within the current beat (for the loom pulse)
  level = 0; // recent audible activity, 0..1 (visual)
  lastNote = "";
  seedCount = 0;
  playedCount = 0;
  recallTotal = 0;

  private rng = mulberry32(0x1314 ^ Date.now());
  private nextId = 1;
  private beatCount = 0;
  private idleAccum = 0;

  // Audio graph (only after start()).
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private delay: DelayNode | null = null;
  private delayFb: GainNode | null = null;
  private wet: GainNode | null = null;
  private shepard: ShepardEngine | null = null;
  private voices = 0;

  // Mic (breath).
  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micBuf: Uint8Array<ArrayBuffer> | null = null;

  // Live pointer-gesture recording buffer.
  private gesture: { startMs: number; notes: MotifNote[]; lastI: number; lastMs: number; motif: Motif | null } | null =
    null;

  constructor() {
    // Seed the library with a few idle phrases so the weave is populated and
    // recall is demonstrable within seconds — the piece is alive before Begin.
    for (let k = 0; k < 3; k++) this.motifs.push(this.makeSeedMotif(-1));
    this.seedCount = 3;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async start(): Promise<void> {
    if (this.active) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* the Begin gesture should cover this */
      }
    }

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(MASTER, ctx.currentTime + 1.2);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 14;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;

    // A feedback delay — the audible "echo" of memory (canon / recall tails).
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.42;
    const delayFb = ctx.createGain();
    delayFb.gain.value = 0.34;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    delay.connect(delayFb);
    delayFb.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    master.connect(comp);
    comp.connect(ctx.destination);

    // Cosmic-ambient Shepard undertow beneath the score.
    const shepard = startShepard(ctx, master, { peakGain: 0.085, driveRate: 0.12, baseRate: 0.02 });

    this.master = master;
    this.comp = comp;
    this.delay = delay;
    this.delayFb = delayFb;
    this.wet = wet;
    this.shepard = shepard;
    this.active = true;
    this.beatCount = 0;
    this.beatPhase = 0;
  }

  attachMic(stream: MediaStream): void {
    if (!this.ctx) return;
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an); // analysis only — never to destination (no feedback)
      this.micStream = stream;
      this.micAnalyser = an;
      this.micBuf = new Uint8Array(new ArrayBuffer(an.fftSize));
      this.micOn = true;
    } catch {
      this.micOn = false;
    }
  }

  beginAgain(): void {
    // A fresh run is allowed to start clean (within a run nothing is undone).
    this.motifs = [];
    for (let k = 0; k < 3; k++) this.motifs.push(this.makeSeedMotif(-1));
    this.seedCount = 3;
    this.playedCount = 0;
    this.recallTotal = 0;
    this.elapsed = 0;
    this.beatCount = 0;
    this.beatPhase = 0;
    this.phaseIndex = 0;
  }

  dispose(): void {
    this.active = false;
    try {
      this.shepard?.stop();
    } catch {
      /* ctx closing */
    }
    if (this.micStream) {
      for (const t of this.micStream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
    }
    try {
      this.micAnalyser?.disconnect();
      this.wet?.disconnect();
      this.delay?.disconnect();
      this.delayFb?.disconnect();
      this.master?.disconnect();
      this.comp?.disconnect();
    } catch {
      /* nodes may be gone */
    }
    const ctx = this.ctx;
    if (ctx && ctx.state !== "closed") void ctx.close();
    this.ctx = null;
  }

  setBreath(v: number): void {
    this.breath = clamp01(v);
  }

  // ── The frame tick — the beat clock + generative score ──────────────────────
  tick(dt: number): void {
    const d = Math.min(0.05, Math.max(0, dt));

    // Breath from the mic (RMS of the time-domain signal).
    if (this.micOn && this.micAnalyser && this.micBuf) {
      this.micAnalyser.getByteTimeDomainData(this.micBuf);
      let sum = 0;
      for (let n = 0; n < this.micBuf.length; n++) {
        const x = (this.micBuf[n] - 128) / 128;
        sum += x * x;
      }
      const rms = Math.sqrt(sum / this.micBuf.length);
      const target = clamp01((rms - 0.015) * 9); // gate room tone, scale breath
      this.breath += (target - this.breath) * (1 - Math.exp(-d / 0.25));
    }

    this.level *= Math.exp(-d / 0.6);

    if (!this.active) {
      // Pre-Begin: silent idle shimmer so the weave already breathes.
      this.idleAccum += d;
      if (this.idleAccum > 1.5) {
        this.idleAccum = 0;
        if (this.motifs.length) {
          const m = this.motifs[(this.rng() * this.motifs.length) | 0];
          m.glowAt = performance.now();
          m.glowDur = 1600;
        }
      }
      return;
    }

    this.elapsed += d;
    this.updatePhase();

    const beatDur = 60 / this.tempoBpm;
    this.beatPhase += d / beatDur;
    while (this.beatPhase >= 1) {
      this.beatPhase -= 1;
      this.beatCount++;
      this.onBeat(this.beatCount, beatDur);
    }

    if (this.shepard) {
      this.shepard.setDrive(clamp01(this.brightness * 0.6 + this.breath * 0.5));
      this.shepard.step(d);
    }
  }

  private updatePhase(): void {
    let idx = ARC.length - 1;
    for (let k = 0; k < ARC.length; k++) {
      if (this.elapsed < ARC[k].until) {
        idx = k;
        break;
      }
    }
    this.phaseIndex = idx;
    const p = ARC[idx];
    this.phaseName = p.name;
    // Breath nudges tempo up a touch and opens the filter (breath brightens).
    this.tempoBpm = p.bpm + this.breath * 6;
    this.brightness = clamp01(p.brightness + this.breath * 0.25);
  }

  private onBeat(beat: number, beatDur: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime + 0.06; // small lookahead
    const p = ARC[this.phaseIndex];

    // (a) PULSE — a soft sub root every two beats. This is the audible TIME.
    if (beat % 2 === 0) {
      this.trigger(ROOT / 2, now, beatDur * 1.8, 0.5, 0, this.brightness * 0.4, 0.05, "sine", true);
    }
    // A gentle off-beat pulse in busier phases keeps the rhythm moving.
    if (p.density > 0 && beat % 2 === 1 && this.rng() < 0.6) {
      this.trigger(ROOT, now, beatDur * 0.5, 0.28, 0, this.brightness * 0.5, 0.06, "triangle", false);
    }

    // (b) SEED — an auto-generated idle phrase (also grows the memory).
    if (this.rng() < p.seedRate && this.motifs.length < MAX_MOTIFS) {
      const m = this.makeSeedMotif(this.elapsed);
      this.pushMotif(m);
      this.seedCount++;
      this.scheduleMotif(m, now, beatDur, "gentle");
    }

    // (c) RECALL — weave an earlier motif back, transformed.
    if (this.motifs.length && this.rng() < p.recallRate) {
      const m = this.pickRecall();
      if (m) {
        const tf = this.chooseTransform();
        this.scheduleMotif(m, now, beatDur, tf);
        m.recallCount++;
        this.recallTotal++;
        // In lucid bloom a transform may crystallise as a NEW faint echo thread
        // — the memory changes irreversibly, the weave keeps growing.
        if (this.phaseIndex === 2 && this.rng() < 0.18 && this.motifs.length < MAX_MOTIFS) {
          this.pushMotif(this.makeEchoMotif(m, tf));
        }
      }
    }

    // Extra lucid shimmer for density (short high sparkles, never a strobe).
    if (p.density > 0 && this.rng() < p.density * 0.5) {
      const i = 14 + ((this.rng() * 10) | 0);
      this.trigger(this.freqOf(i), now, beatDur * 0.6, 0.22, (this.rng() * 2 - 1) * 0.6, this.brightness, 0.12, "sine", false);
    }
  }

  // ── Recall selection & transforms ────────────────────────────────────────────
  private pickRecall(): Motif | null {
    const played = this.motifs.filter((m) => m.origin === "played");
    // In the deepening / lucid passages, sometimes force the OLDEST played
    // phrase to return — this is the min-1 → min-6 promise made audible.
    if (played.length && (this.phaseIndex === 1 || this.phaseIndex === 2) && this.rng() < 0.4) {
      return played.reduce((a, b) => (a.born <= b.born ? a : b));
    }
    // Otherwise weighted random, favouring rarely-recalled motifs so the whole
    // library keeps circulating (nothing is forgotten).
    let total = 0;
    const w = this.motifs.map((m) => {
      const ww = 1 + 2 / (1 + m.recallCount) + (m.origin === "played" ? 1.2 : 0);
      total += ww;
      return ww;
    });
    let r = this.rng() * total;
    for (let k = 0; k < this.motifs.length; k++) {
      r -= w[k];
      if (r <= 0) return this.motifs[k];
    }
    return this.motifs[this.motifs.length - 1];
  }

  private chooseTransform(): Transform {
    const r = this.rng();
    switch (this.phaseIndex) {
      case 0:
        return "gentle";
      case 1:
        return r < 0.5 ? "harmonize" : "gentle";
      case 2:
        return r < 0.34 ? "canon" : r < 0.62 ? "harmonize" : r < 0.82 ? "reverse" : "gentle";
      case 3:
        return r < 0.7 ? "stretch" : "harmonize";
      default:
        return r < 0.5 ? "gentle" : "harmonize";
    }
  }

  // Schedule every note of a motif into the audio graph, transformed, and light
  // the motif's thread for the duration it sounds.
  private scheduleMotif(m: Motif, now: number, beatDur: number, tf: Transform): void {
    // Diatonic (pentatonic-index) transposition keeps recalls consonant.
    const transpose = tf === "gentle" ? [0, 2, -3, 3][(this.rng() * 4) | 0] : [0, 2, 4, -3][(this.rng() * 4) | 0];
    const stretch = tf === "stretch" ? 1.8 + this.rng() * 0.6 : tf === "canon" ? 1 : 0.9 + this.rng() * 0.3;
    const notes = tf === "reverse" ? this.reversed(m.notes, m.lenBeats) : m.notes;

    const play = (offBeats: number, semiShift: number, velScale: number) => {
      for (const n of notes) {
        const when = now + (n.t * stretch + offBeats) * beatDur;
        const i = n.i + transpose + semiShift;
        this.trigger(
          this.freqOf(i),
          when,
          Math.max(0.2, n.dur * stretch * beatDur),
          clamp01(n.vel * velScale),
          (this.rng() * 2 - 1) * 0.5,
          this.brightness,
          0.16,
          "triangle",
          false,
        );
      }
    };

    play(0, 0, 1);
    if (tf === "harmonize") play(0, 2, 0.6); // a pentatonic "third" above
    if (tf === "canon") play(1, 3, 0.7); // a staggered, transposed answer

    const lenBeats = m.lenBeats * stretch + (tf === "canon" ? 1 : 0);
    m.glowAt = performance.now();
    m.glowDur = Math.max(700, lenBeats * beatDur * 1000 + 400);
    this.level = Math.min(1, this.level + 0.35);
  }

  private reversed(notes: MotifNote[], lenBeats: number): MotifNote[] {
    return notes
      .map((n) => ({ ...n, t: lenBeats - (n.t + n.dur) }))
      .sort((a, b) => a.t - b.t)
      .map((n) => ({ ...n, t: Math.max(0, n.t) }));
  }

  // ── Pointer performance — the player PLAYS melody, the piece will remember ───
  beginGesture(): void {
    this.gesture = { startMs: performance.now(), notes: [], lastI: -99, lastMs: 0, motif: null };
  }

  // nx,ny in 0..1 (canvas space). Returns the note name just played (or "").
  playPointerNote(nx: number, ny: number): string {
    if (!this.active || !this.ctx) return "";
    const i = Math.round((1 - clamp01(ny)) * IMAX);
    const g = this.gesture;
    const nowMs = performance.now();
    if (g) {
      const stepped = i !== g.lastI;
      const spaced = nowMs - g.lastMs > 110;
      if (!stepped && !spaced) return this.lastNote;
      const beatDur = 60 / this.tempoBpm;
      const t = ((nowMs - g.startMs) / 1000) / beatDur;
      g.notes.push({ i, t, dur: 0.6, vel: 0.85 });
      g.lastI = i;
      g.lastMs = nowMs;
      // Live audible feedback — you hear what you play, instantly.
      this.trigger(this.freqOf(i), this.ctx.currentTime + 0.01, 0.55, 0.85, nx * 2 - 1, this.brightness + 0.1, 0.12, "triangle", false);
      this.level = Math.min(1, this.level + 0.3);
      // Light the in-progress thread as it is being drawn.
      if (g.motif) {
        g.motif.glowAt = nowMs;
        g.motif.glowDur = 900;
      }
    }
    this.lastNote = NOTE_NAMES[((this.pitchSemi(i) % 12) + 12) % 12] + (Math.floor(this.pitchSemi(i) / 12) + 2);
    return this.lastNote;
  }

  endGesture(): void {
    const g = this.gesture;
    this.gesture = null;
    if (!g || g.notes.length < 2) return;
    const t0 = g.notes[0].t;
    const notes = g.notes.map((n) => ({ ...n, t: n.t - t0 }));
    const last = notes[notes.length - 1];
    const lenBeats = Math.max(1, last.t + last.dur);
    const m = this.finishMotif(notes, lenBeats, "played", this.elapsed);
    this.pushMotif(m);
    this.playedCount++;
    // It glows once as it is committed to memory.
    m.glowAt = performance.now();
    m.glowDur = 1200;
  }

  // ── Motif construction ──────────────────────────────────────────────────────
  private makeSeedMotif(born: number): Motif {
    const len = 3 + ((this.rng() * 4) | 0);
    let i = 6 + ((this.rng() * 10) | 0);
    const notes: MotifNote[] = [];
    let t = 0;
    for (let k = 0; k < len; k++) {
      notes.push({ i, t, dur: 0.7, vel: 0.5 + this.rng() * 0.3 });
      const stepChoices = [-2, -1, -1, 0, 1, 1, 2];
      i = Math.max(2, Math.min(IMAX - 2, i + stepChoices[(this.rng() * stepChoices.length) | 0]));
      t += [0.5, 1, 1, 1.5][(this.rng() * 4) | 0];
    }
    const lenBeats = t + 0.7;
    return this.finishMotif(notes, lenBeats, "seed", born);
  }

  private makeEchoMotif(src: Motif, tf: Transform): Motif {
    const shift = tf === "reverse" ? 0 : [2, -3, 4][(this.rng() * 3) | 0];
    const notes = (tf === "reverse" ? this.reversed(src.notes, src.lenBeats) : src.notes).map((n) => ({
      ...n,
      i: Math.max(2, Math.min(IMAX - 2, n.i + shift)),
      vel: n.vel * 0.7,
    }));
    const m = this.finishMotif(notes, src.lenBeats, "echo", this.elapsed);
    m.hue = (src.hue + 24) % 360;
    return m;
  }

  private finishMotif(notes: MotifNote[], lenBeats: number, origin: Motif["origin"], born: number): Motif {
    const contour = notes.map((n) => clamp01(n.i / IMAX));
    const avgNorm = contour.reduce((a, b) => a + b, 0) / Math.max(1, contour.length);
    // Palette: dusk violet (early) warming toward dawn gold (later memories).
    const prog = born < 0 ? 0 : clamp01(born / 345);
    const baseHue = origin === "played" ? 285 : origin === "echo" ? 200 : 262;
    const hue = (baseHue - prog * 210 + (this.rng() * 20 - 10) + 360) % 360;
    return {
      id: this.nextId++,
      born,
      origin,
      notes,
      lenBeats,
      avgNorm,
      contour,
      ySeed: this.rng(),
      hue,
      glowAt: -1e9,
      glowDur: 900,
      recallCount: 0,
    };
  }

  private pushMotif(m: Motif): void {
    this.motifs.push(m);
    if (this.motifs.length > MAX_MOTIFS) {
      // Never forget the player's FIRST phrase (the origin of the memory), and
      // prefer dropping old seeds over old performances.
      const firstPlayed = this.motifs.find((x) => x.origin === "played");
      let dropIdx = -1;
      for (let k = 0; k < this.motifs.length; k++) {
        const x = this.motifs[k];
        if (x === firstPlayed) continue;
        if (x.origin === "seed") {
          dropIdx = k;
          break;
        }
        if (dropIdx === -1) dropIdx = k;
      }
      if (dropIdx >= 0) this.motifs.splice(dropIdx, 1);
    }
    // Track the live gesture's motif so it can glow while being drawn.
    if (this.gesture && m.origin === "played") this.gesture.motif = m;
  }

  // ── Synthesis ────────────────────────────────────────────────────────────────
  private pitchSemi(i: number): number {
    const deg = PENTA[((i % 5) + 5) % 5];
    return Math.floor(i / 5) * 12 + deg;
  }
  private freqOf(i: number): number {
    return ROOT * Math.pow(2, this.pitchSemi(i) / 12);
  }

  private trigger(
    freq: number,
    when: number,
    dur: number,
    vel: number,
    pan: number,
    bright: number,
    wetSend: number,
    type: OscillatorType,
    isBass: boolean,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (this.voices >= MAX_VOICES) return;
    this.voices++;

    const o1 = ctx.createOscillator();
    o1.type = type;
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * (isBass ? 0.5 : 2.001);
    const o2g = ctx.createGain();
    o2g.gain.value = isBass ? 0.5 : 0.28;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(300 + 2800 * clamp01(bright), when);
    lp.Q.value = 0.6;

    const g = ctx.createGain();
    const atk = 0.012 + 0.05 * (1 - vel);
    const rel = Math.max(0.28, dur);
    const peak = Math.max(0.001, (isBass ? 0.14 : 0.15) * vel);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, when + atk + rel);

    o1.connect(lp);
    o2.connect(o2g);
    o2g.connect(lp);
    lp.connect(g);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCtx = ctx as any;
    if (typeof anyCtx.createStereoPanner === "function") {
      const pn = ctx.createStereoPanner();
      pn.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(pn);
      pn.connect(master);
      if (this.wet && wetSend > 0) {
        const s = ctx.createGain();
        s.gain.value = wetSend;
        pn.connect(s);
        s.connect(this.wet);
      }
    } else {
      g.connect(master);
      if (this.wet && wetSend > 0) {
        const s = ctx.createGain();
        s.gain.value = wetSend;
        g.connect(s);
        s.connect(this.wet);
      }
    }

    const stopAt = when + atk + rel + 0.05;
    o1.start(when);
    o2.start(when);
    o1.stop(stopAt);
    o2.stop(stopAt);
    o1.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      try {
        o1.disconnect();
        o2.disconnect();
        o2g.disconnect();
        lp.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }
}
