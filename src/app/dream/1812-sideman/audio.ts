/**
 * audio.ts — Web Audio synthesis + look-ahead scheduler for 1812-sideman.
 *
 * A single JazzEngine drives a synthesized jazz trio (walking bass, rootless
 * comping piano, brush drums) plus a melody voice for the human / idle solo.
 * Timing uses the standard "A Tale of Two Clocks" look-ahead pattern: a 25ms
 * setInterval schedules note events onto AudioContext.currentTime up to 120ms
 * ahead, so the groove stays tight regardless of JS jitter.
 *
 * The engine also runs "score-following-lite": it infers tempo from the spacing
 * of the player's note onsets and biases the key from their pitch-class
 * histogram. All accompaniment choices are RULE-BASED (not ML) — see README.md.
 */

import {
  buildWalkingBar,
  inferKey,
  makeProgression,
  mtof,
  NOTE_NAMES,
  rootlessVoicing,
  scaleMidis,
  scalePcs,
  scoreKey,
  type Chord,
  type Mode,
} from "./engine";

export type VisKind =
  | "bass"
  | "piano"
  | "ride"
  | "kick"
  | "swish"
  | "melody"
  | "user";

export interface VisEvent {
  t: number; // AudioContext time the event fires
  kind: VisKind;
  midi: number;
  vel: number;
}

interface CompHit {
  beat: number; // 0..3, which quarter it attaches to
  off: number; // fraction of a beat (swung) after that quarter
  vel: number;
}

interface IdleNote {
  beat: number;
  off: number;
  midi: number;
}

export interface Snapshot {
  running: boolean;
  bpm: number;
  spb: number;
  beatFloat: number;
  barIndex: number;
  beatInBar: number;
  keyLabel: string;
  rootPc: number;
  mode: Mode;
  currentChord: string;
  nextChord: string;
  beatsUntilNext: number;
  tempoLocked: boolean;
  keyLocked: boolean;
}

const SWING = 0.64; // swung-eighth ratio (0.5 = straight)
const COMP_PATTERNS: CompHit[][] = [
  [
    { beat: 1, off: SWING, vel: 0.8 },
    { beat: 3, off: 0, vel: 0.65 },
  ],
  [
    { beat: 0, off: SWING, vel: 0.7 },
    { beat: 2, off: SWING, vel: 0.8 },
  ],
  [
    { beat: 1, off: 0, vel: 0.75 },
    { beat: 3, off: SWING, vel: 0.7 }, // "and of 4" — pushes the change
  ],
  [{ beat: 2, off: SWING, vel: 0.8 }],
  [
    { beat: 0, off: SWING, vel: 0.7 },
    { beat: 1, off: SWING, vel: 0.6 },
    { beat: 3, off: SWING, vel: 0.75 },
  ],
];

export class JazzEngine {
  private ctx: AudioContext;
  private noise: AudioBuffer;

  private bassBus: GainNode;
  private pianoBus: GainNode;
  private drumBus: GainNode;
  private melodyBus: GainNode;
  private mixGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private master: GainNode;

  // transport
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private beatCounter = 0;
  private startedAt = 0;
  private lookahead = 0.12;

  // musical state
  private bpm = 116;
  private rootPc = 0;
  private mode: Mode = "major";
  private progression: Chord[] = makeProgression(0, "major");
  private barNotes: number[] = [];
  private compHits: CompHit[] = [];
  private idlePhrase: IdleNote[] = [];

  // inference
  private onsets: number[] = [];
  private hist: number[] = new Array(12).fill(0);
  private notesSeen = 0;
  private barsSinceKey = 99;
  private lastUserTime = -999;

  private _running = false;
  private _tempoLocked = false;
  private _keyLocked = false;
  private _volume = 0.8;
  private _muted = false;

  private vis: VisEvent[] = [];

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // ── master chain: buses → mix(volume) → limiter → master → out ──
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -15;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.mixGain = ctx.createGain();
    this.mixGain.gain.value = this._volume;

    this.mixGain.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(ctx.destination);

    const bus = (g: number) => {
      const n = ctx.createGain();
      n.gain.value = g;
      n.connect(this.mixGain);
      return n;
    };
    this.bassBus = bus(0.6);
    this.pianoBus = bus(0.5);
    this.drumBus = bus(0.7);
    this.melodyBus = bus(0.7);

    // shared white-noise buffer for brushes / cymbals
    const len = Math.floor(ctx.sampleRate * 2);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  // ── public control ─────────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this._running = true;
    this.startedAt = this.ctx.currentTime;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.beatCounter = 0;
    this.timer = setInterval(() => this.scheduler(), 25);
  }

  stop() {
    this._running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.mixGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
  }

  dispose() {
    this.stop();
    try {
      this.master.disconnect();
    } catch {
      /* already gone */
    }
  }

  now() {
    return this.ctx.currentTime;
  }

  get running() {
    return this._running;
  }

  setVolume(v: number) {
    this._volume = v;
    const target = this._muted ? 0 : v;
    this.mixGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  setMuted(m: boolean) {
    this._muted = m;
    this.mixGain.gain.setTargetAtTime(
      m ? 0 : this._volume,
      this.ctx.currentTime,
      0.02,
    );
  }

  setTempoLocked(b: boolean) {
    this._tempoLocked = b;
  }
  setKeyLocked(b: boolean) {
    this._keyLocked = b;
  }

  getVis(): readonly VisEvent[] {
    return this.vis;
  }

  chordAt(bar: number): Chord {
    const n = this.progression.length;
    return this.progression[((bar % n) + n) % n];
  }

  timeToBeat(t: number): number {
    const spb = 60 / this.bpm;
    return this.beatCounter + (t - this.nextNoteTime) / spb;
  }

  /** MIDI note for a QWERTY key: row 'low' | 'high', index 0..9, in current key. */
  noteForKey(row: "low" | "high", index: number): number {
    const arr = scaleMidis(scalePcs(this.rootPc, this.mode), 57, 90);
    const start = row === "low" ? 2 : 9;
    const i = Math.max(0, Math.min(arr.length - 1, start + index));
    return arr[i];
  }

  legend(): { low: string[]; high: string[] } {
    const label = (row: "low" | "high", i: number) =>
      NOTE_NAMES[this.noteForKey(row, i) % 12];
    return {
      low: Array.from({ length: 10 }, (_, i) => label("low", i)),
      high: Array.from({ length: 10 }, (_, i) => label("high", i)),
    };
  }

  /** Human note (already quantized to key for QWERTY; raw for MIDI). */
  playUserNote(midi: number) {
    const t = Math.max(this.ctx.currentTime + 0.005, this.ctx.currentTime);
    this.lastUserTime = this.ctx.currentTime;
    this.idlePhrase = [];
    this.registerOnset(this.ctx.currentTime);
    this.registerPc(((midi % 12) + 12) % 12);
    this.playMelody(midi, t, 0.9, true);
  }

  snapshot(now: number): Snapshot {
    const spb = 60 / this.bpm;
    const beatFloat = this.beatCounter - (this.nextNoteTime - now) / spb;
    const barIndex = Math.floor(beatFloat / 4);
    const beatInBar = beatFloat - barIndex * 4;
    const n = this.progression.length;
    const cur = this.progression[((barIndex % n) + n) % n];
    const nxt = this.progression[(((barIndex + 1) % n) + n) % n];
    return {
      running: this._running,
      bpm: this.bpm,
      spb,
      beatFloat,
      barIndex,
      beatInBar,
      keyLabel: `${NOTE_NAMES[this.rootPc]} ${this.mode}`,
      rootPc: this.rootPc,
      mode: this.mode,
      currentChord: cur.label,
      nextChord: nxt.label,
      beatsUntilNext: 4 - beatInBar,
      tempoLocked: this._tempoLocked,
      keyLocked: this._keyLocked,
    };
  }

  // ── inference ────────────────────────────────────────────────────────────

  private registerOnset(t: number) {
    this.onsets.push(t);
    if (this.onsets.length > 8) this.onsets.shift();
    if (this._tempoLocked || this.onsets.length < 4) return;
    const gaps: number[] = [];
    for (let i = 1; i < this.onsets.length; i++) {
      const d = this.onsets[i] - this.onsets[i - 1];
      if (d > 0.12 && d < 1.6) gaps.push(d);
    }
    if (gaps.length < 3) return;
    gaps.sort((a, b) => a - b);
    const med = gaps[Math.floor(gaps.length / 2)];
    let bpm = 60 / med;
    while (bpm < 70) bpm *= 2;
    while (bpm > 160) bpm /= 2;
    const target = Math.max(70, Math.min(160, bpm));
    this.bpm += (target - this.bpm) * 0.25; // gentle glide
  }

  private registerPc(pc: number) {
    this.hist[pc] += 1;
    this.notesSeen++;
  }

  private evaluateKey() {
    if (this._keyLocked || this.notesSeen < 6 || this.barsSinceKey < 4) return;
    const best = inferKey(this.hist);
    const curScore = scoreKey(this.hist, this.rootPc, this.mode);
    if (
      (best.rootPc !== this.rootPc || best.mode !== this.mode) &&
      best.score > curScore * 1.18
    ) {
      this.rootPc = best.rootPc;
      this.mode = best.mode;
      this.progression = makeProgression(this.rootPc, this.mode);
      this.barsSinceKey = 0;
    }
  }

  // ── scheduler ────────────────────────────────────────────────────────────

  private scheduler() {
    while (this.nextNoteTime < this.ctx.currentTime + this.lookahead) {
      this.scheduleBeat(this.beatCounter, this.nextNoteTime);
      this.nextNoteTime += 60 / this.bpm;
      this.beatCounter++;
    }
    // trim old vis events
    const cutoff = this.ctx.currentTime - 4;
    if (this.vis.length > 400) this.vis = this.vis.filter((e) => e.t > cutoff);
  }

  private startBar(bar: number, time: number) {
    for (let i = 0; i < 12; i++) this.hist[i] *= 0.9;
    this.barsSinceKey++;
    this.evaluateKey();

    const chord = this.chordAt(bar);
    const next = this.chordAt(bar + 1);
    this.barNotes = buildWalkingBar(chord, next, bar);
    this.compHits =
      Math.random() < 0.12
        ? []
        : COMP_PATTERNS[Math.floor(Math.random() * COMP_PATTERNS.length)];

    const idle = time - this.lastUserTime > 3.2 && time - this.startedAt > 1.5;
    this.idlePhrase = idle ? this.makeIdlePhrase(chord) : [];
  }

  private makeIdlePhrase(chord: Chord): IdleNote[] {
    const tones = scaleMidis(scalePcs(this.rootPc, this.mode), 72, 87);
    const chordPcs = rootlessVoicing(chord).map((m) => m % 12);
    const pool = tones.filter((m) => chordPcs.includes(m % 12));
    const notes = pool.length ? pool : tones;
    const pick = () => notes[Math.floor(Math.random() * notes.length)];
    const shapes: IdleNote[][] = [
      [
        { beat: 0, off: 0, midi: pick() },
        { beat: 1, off: SWING, midi: pick() },
        { beat: 2, off: 0, midi: pick() },
      ],
      [
        { beat: 1, off: 0, midi: pick() },
        { beat: 1, off: SWING, midi: pick() },
        { beat: 3, off: 0, midi: pick() },
      ],
      [
        { beat: 0, off: SWING, midi: pick() },
        { beat: 2, off: 0, midi: pick() },
        { beat: 2, off: SWING, midi: pick() },
        { beat: 3, off: SWING, midi: pick() },
      ],
    ];
    return shapes[Math.floor(Math.random() * shapes.length)];
  }

  private scheduleBeat(beatAbs: number, time: number) {
    const spb = 60 / this.bpm;
    const beatInBar = ((beatAbs % 4) + 4) % 4;
    const bar = Math.floor(beatAbs / 4);
    if (beatInBar === 0) this.startBar(bar, time);

    const chord = this.chordAt(bar);
    const next = this.chordAt(bar + 1);

    // walking bass — quarter note
    const bMidi = this.barNotes[beatInBar] ?? 40;
    this.playBass(bMidi, time, spb * 0.92);
    this.push(time, "bass", bMidi, 0.9);

    // ride cymbal on the beat + swung skip note on 2 & 4
    this.playRide(time, beatInBar === 0 ? 1 : 0.75);
    this.push(time, "ride", 0, beatInBar === 0 ? 1 : 0.75);
    if (beatInBar === 1 || beatInBar === 3) {
      const t2 = time + spb * SWING;
      this.playRide(t2, 0.5);
      this.push(t2, "ride", 0, 0.5);
      this.playHat(time); // brush "chick" on 2 & 4
    }

    // feathered kick on 1, cross-stick shade on 3
    if (beatInBar === 0) {
      this.playKick(time, 0.5);
      this.push(time, "kick", 0, 0.5);
    }

    // brush swish across each beat
    this.playSwish(time, spb);
    this.push(time, "swish", 0, 0.3);

    // comping voicings — anticipate the change on the "and of 4"
    for (const hit of this.compHits) {
      if (hit.beat !== beatInBar) continue;
      const t = time + hit.off * spb;
      const voiceChord = hit.beat === 3 && hit.off > 0.5 ? next : chord;
      const voicing = rootlessVoicing(voiceChord);
      this.playPiano(voicing, t, hit.vel);
      for (const m of voicing) this.push(t, "piano", m, hit.vel);
    }

    // idle self-demo melody
    for (const note of this.idlePhrase) {
      if (note.beat !== beatInBar) continue;
      const t = time + note.off * spb;
      this.playMelody(note.midi, t, 0.75, false);
      this.push(t, "melody", note.midi, 0.75);
    }
  }

  private push(t: number, kind: VisKind, midi: number, vel: number) {
    this.vis.push({ t, kind, midi, vel });
  }

  // ── synthesis voices ───────────────────────────────────────────────────────

  private playBass(midi: number, time: number, dur: number) {
    const f = mtof(midi);
    const o1 = this.ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = f;
    const o2 = this.ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.value = f;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(1000, f * 4);
    lp.Q.value = 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.5, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.3, time + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    const o2g = this.ctx.createGain();
    o2g.gain.value = 0.35;
    o1.connect(lp);
    o2.connect(o2g);
    o2g.connect(lp);
    lp.connect(g);
    g.connect(this.bassBus);
    o1.start(time);
    o2.start(time);
    o1.stop(time + dur + 0.05);
    o2.stop(time + dur + 0.05);
    o1.onended = () => {
      o1.disconnect();
      o2.disconnect();
      o2g.disconnect();
      lp.disconnect();
      g.disconnect();
    };
  }

  private playPiano(midis: number[], time: number, vel: number) {
    for (const midi of midis) {
      const f = mtof(midi);
      const o1 = this.ctx.createOscillator();
      o1.type = "triangle";
      o1.frequency.value = f;
      const o2 = this.ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = f * 2;
      const o2g = this.ctx.createGain();
      o2g.gain.value = 0.3;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3000;
      const g = this.ctx.createGain();
      const peak = vel * 0.13;
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(peak, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, time + 1.1);
      o1.connect(lp);
      o2.connect(o2g);
      o2g.connect(lp);
      lp.connect(g);
      g.connect(this.pianoBus);
      o1.start(time);
      o2.start(time);
      o1.stop(time + 1.2);
      o2.stop(time + 1.2);
      o1.onended = () => {
        o1.disconnect();
        o2.disconnect();
        o2g.disconnect();
        lp.disconnect();
        g.disconnect();
      };
    }
  }

  private playMelody(midi: number, time: number, dur: number, isUser: boolean) {
    const f = mtof(midi);
    const o1 = this.ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = f;
    const o2 = this.ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = f * 2.005;
    const o2g = this.ctx.createGain();
    o2g.gain.value = 0.25;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3600;
    const g = this.ctx.createGain();
    const peak = isUser ? 0.17 : 0.13;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    o1.connect(lp);
    o2.connect(o2g);
    o2g.connect(lp);
    lp.connect(g);
    g.connect(this.melodyBus);
    o1.start(time);
    o2.start(time);
    o1.stop(time + dur + 0.05);
    o2.stop(time + dur + 0.05);
    o1.onended = () => {
      o1.disconnect();
      o2.disconnect();
      o2g.disconnect();
      lp.disconnect();
      g.disconnect();
    };
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    return src;
  }

  private playRide(time: number, accent: number) {
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6000;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 9000;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    const peak = 0.05 * accent;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0004, time + 0.32);
    src.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    g.connect(this.drumBus);
    src.start(time);
    src.stop(time + 0.34);
    src.onended = () => {
      src.disconnect();
      hp.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }

  private playHat(time: number) {
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.02, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0004, time + 0.07);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.drumBus);
    src.start(time);
    src.stop(time + 0.09);
    src.onended = () => {
      src.disconnect();
      hp.disconnect();
      g.disconnect();
    };
  }

  private playKick(time: number, vel: number) {
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, time);
    o.frequency.exponentialRampToValueAtTime(46, time + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.32 * vel, time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    o.connect(g);
    g.connect(this.drumBus);
    o.start(time);
    o.stop(time + 0.24);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  private playSwish(time: number, spb: number) {
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0006, time);
    g.gain.linearRampToValueAtTime(0.016, time + spb * 0.18);
    g.gain.exponentialRampToValueAtTime(0.002, time + spb * 0.92);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.drumBus);
    src.start(time);
    src.stop(time + spb);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }
}
