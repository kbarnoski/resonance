// audio.ts — a small polyphonic Web Audio synth driven by the Conductor,
// with a look-ahead scheduler so timing stays tight. No libraries.

import {
  Conductor,
  degreeToMidi,
  midiToFreq,
  PHASE_TEMPO,
  type Note,
  type Phase,
  type Phrase,
} from "./engine";

export type Voice = "lead" | "bass" | "pad";

/** A note handed to the renderer / piano-roll. Times are AudioContext seconds. */
export interface RenderNote {
  startTime: number;
  duration: number;
  midi: number;
  voice: Voice;
  phraseId: number;
  phase: Phase;
}

/** Common surface the page draws from — real audio or the silent fallback. */
export interface MusicSource {
  start(): Promise<void> | void;
  pause(): void;
  dispose(): Promise<void> | void;
  now(): number;
  getEvents(): readonly RenderNote[];
  getState(): ComposerState;
}

export interface ComposerState {
  phase: Phase;
  label: string;
  tag: string;
  lineage: string[];
  center: number;
  movement: number;
  phraseId: number;
}

const BPM = 108;
const BASE_SEC_PER_BEAT = 60 / BPM;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.2; // seconds
const MAX_EVENTS = 400;

export class Composer {
  readonly ctx: AudioContext;
  private conductor: Conductor;
  private master: GainNode;
  private delay: DelayNode;
  private feedback: GainNode;

  private timer: number | null = null;
  private nextNoteTime = 0;
  private queue: Note[] = [];
  private qIndex = 0;
  private currentPhrase: Phrase | null = null;

  private events: RenderNote[] = [];
  private state: ComposerState = {
    phase: "exposition",
    label: "—",
    tag: "seed",
    lineage: ["seed"],
    center: 0,
    movement: 0,
    phraseId: -1,
  };

  constructor(conductor: Conductor) {
    this.conductor = conductor;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(this.ctx.destination);

    // simple feedback delay for warmth / space
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = BASE_SEC_PER_BEAT * 0.75;
    this.feedback = this.ctx.createGain();
    this.feedback.gain.value = 0.32;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.28;
    this.delay.connect(this.feedback).connect(this.delay);
    this.delay.connect(wet).connect(this.master);
  }

  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.7, t + 0.6);
    this.nextNoteTime = t + 0.15;
    if (this.timer === null) {
      this.timer = window.setInterval(() => this.pump(), LOOKAHEAD_MS);
    }
  }

  pause(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.0, t + 0.25);
  }

  async dispose(): Promise<void> {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }

  now(): number {
    return this.ctx.currentTime;
  }
  getEvents(): readonly RenderNote[] {
    return this.events;
  }
  getState(): ComposerState {
    return this.state;
  }

  // ---- the look-ahead scheduler ------------------------------------------

  private pump(): void {
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      // refill from the conductor when the current phrase is exhausted
      if (this.qIndex >= this.queue.length) {
        const phrase = this.conductor.next();
        this.currentPhrase = phrase;
        this.queue = phrase.notes;
        this.qIndex = 0;
        this.state = {
          phase: phrase.phase,
          label: phrase.label,
          tag: phrase.tag,
          lineage: phrase.lineage,
          center: phrase.center,
          movement: phrase.movement,
          phraseId: phrase.id,
        };
        // a small breath between phrases
        this.nextNoteTime += BASE_SEC_PER_BEAT * 0.5;
        this.schedulePhraseAccompaniment(phrase, this.nextNoteTime);
      }

      const phrase = this.currentPhrase!;
      const note = this.queue[this.qIndex];
      const secPerBeat = BASE_SEC_PER_BEAT / PHASE_TEMPO[phrase.phase];
      const durSec = note.duration * secPerBeat;
      const midi = degreeToMidi(note.degree, phrase.center);

      this.playLead(midi, this.nextNoteTime, durSec, phrase.phase);
      this.pushEvent({
        startTime: this.nextNoteTime,
        duration: durSec,
        midi,
        voice: "lead",
        phraseId: phrase.id,
        phase: phrase.phase,
      });

      this.nextNoteTime += durSec;
      this.qIndex++;
    }
  }

  private schedulePhraseAccompaniment(phrase: Phrase, at: number): void {
    const secPerBeat = BASE_SEC_PER_BEAT / PHASE_TEMPO[phrase.phase];
    const beats = phrase.notes.reduce((s, n) => s + n.duration, 0);
    const len = beats * secPerBeat;

    // bass: root of the current centre, two octaves down
    const bassMidi = degreeToMidi(0, phrase.center) - 24;
    this.playBass(bassMidi, at, Math.min(len, 4 * secPerBeat));
    this.pushEvent({
      startTime: at,
      duration: len,
      midi: bassMidi,
      voice: "bass",
      phraseId: phrase.id,
      phase: phrase.phase,
    });

    // pad: an open triad (i–III–v), one octave down, softly sustained
    const chordDegrees = [0, 2, 4];
    for (const d of chordDegrees) {
      const m = degreeToMidi(d, phrase.center) - 12;
      this.playPad(m, at, len);
      this.pushEvent({
        startTime: at,
        duration: len,
        midi: m,
        voice: "pad",
        phraseId: phrase.id,
        phase: phrase.phase,
      });
    }
  }

  private pushEvent(e: RenderNote): void {
    this.events.push(e);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }

  // ---- voices -------------------------------------------------------------

  private playLead(midi: number, t: number, dur: number, phase: Phase): void {
    const freq = midiToFreq(midi);
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    const bright = phase === "climax" ? 5200 : 2600;
    lp.frequency.setValueAtTime(bright, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + Math.min(dur, 0.9));
    lp.Q.value = 6;

    const o1 = this.ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freq;
    const o2 = this.ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.value = freq;
    o2.detune.value = 8;

    const peak = 0.26;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.12, dur * 0.95));

    o1.connect(g);
    o2.connect(g);
    g.connect(lp);
    lp.connect(this.master);
    lp.connect(this.delay);

    o1.start(t);
    o2.start(t);
    const stop = t + dur + 0.1;
    o1.stop(stop);
    o2.stop(stop);
  }

  private playBass(midi: number, t: number, dur: number): void {
    const freq = midiToFreq(midi);
    const g = this.ctx.createGain();
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const sub = this.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(g);
    sub.connect(g);
    g.connect(this.master);
    o.start(t);
    sub.start(t);
    o.stop(t + dur + 0.1);
    sub.stop(t + dur + 0.1);
  }

  private playPad(midi: number, t: number, dur: number): void {
    const freq = midiToFreq(midi);
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;

    const o1 = this.ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = freq;
    o1.detune.value = -6;
    const o2 = this.ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.value = freq;
    o2.detune.value = 7;

    const peak = 0.05;
    const atk = Math.min(0.4, dur * 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.setValueAtTime(peak, t + Math.max(atk, dur - 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);

    o1.connect(g);
    o2.connect(g);
    g.connect(lp);
    lp.connect(this.master);

    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.3);
    o2.stop(t + dur + 0.3);
  }
}
