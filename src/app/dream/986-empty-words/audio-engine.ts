// ─────────────────────────────────────────────────────────────────────────────
// audio-engine.ts — Web Audio scheduler with look-ahead timing + harmonic bed.
//
// Plays a Composition's NoteEvents in time using the classic ~25ms look-ahead
// pattern (A Tale of Two Clocks). An always-on drone/pad in the chosen mode
// keeps the sung melody consonant. The only non-determinism is a tiny cosmetic
// detune jitter on the voice oscillators — it changes timbre microscopically,
// never which notes play or when.
// ─────────────────────────────────────────────────────────────────────────────

import { midiToFreq, MODES, type Composition, type ModeName, type NoteEvent } from "./composer";

const LOOKAHEAD_MS = 25; // how often the scheduler wakes
const SCHEDULE_AHEAD_S = 0.12; // how far ahead we queue notes

export type ActiveNote = { event: NoteEvent; atTime: number };

export class TextMusicEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private bedGain: GainNode;
  private bedOscs: OscillatorNode[] = [];
  private bedLfo: OscillatorNode | null = null;

  private comp: Composition | null = null;
  private bpm = 84;
  private secPerBeat = 60 / 84;

  private timerId: number | null = null;
  private nextEventIndex = 0;
  private startTime = 0; // ctx time the piece started
  private running = false;

  // Provenance callback: fired (scheduled) when a note begins, for the readout.
  onNote: ((e: NoteEvent, when: number) => void) | null = null;
  onEnd: (() => void) | null = null;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(this.ctx.destination);

    this.bedGain = this.ctx.createGain();
    this.bedGain.gain.value = 0.0;
    this.bedGain.connect(this.master);
  }

  get audioContext(): AudioContext {
    return this.ctx;
  }

  setTempo(bpm: number) {
    this.bpm = bpm;
    this.secPerBeat = 60 / bpm;
  }

  /** Current playback position in beats, or -1 if stopped. */
  positionBeats(): number {
    if (!this.running) return -1;
    return (this.ctx.currentTime - this.startTime) / this.secPerBeat;
  }

  async start(comp: Composition, bpm: number) {
    this.comp = comp;
    this.setTempo(bpm);
    if (this.ctx.state === "suspended") await this.ctx.resume();

    // fade master up
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.9, now + 0.4);

    this.buildBed(comp.mode);

    this.nextEventIndex = 0;
    this.startTime = this.ctx.currentTime + 0.15; // small lead-in
    this.running = true;
    this.scheduler();
  }

  stop() {
    this.running = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0, now + 0.3);
    this.tearDownBed(now + 0.35);
  }

  /** Fully release audio resources. Call on unmount. */
  async dispose() {
    this.stop();
    this.onNote = null;
    this.onEnd = null;
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }

  // ── Harmonic bed ──────────────────────────────────────────────────────────
  private buildBed(modeName: ModeName) {
    this.tearDownBed(this.ctx.currentTime);
    const mode = MODES[modeName];
    const now = this.ctx.currentTime;

    // Root + fifth drone, an octave below the singing register, plus a soft
    // upper pad on the modal 3rd for colour.
    const droneMidis = [mode.tonicMidi - 12, mode.tonicMidi - 12 + mode.steps[4]];
    const padMidi = mode.tonicMidi + mode.steps[2];

    this.bedGain.gain.cancelScheduledValues(now);
    this.bedGain.gain.setValueAtTime(0.0, now);
    this.bedGain.gain.linearRampToValueAtTime(0.16, now + 1.2);

    // slow tremolo for breathing pad
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain).connect(this.bedGain.gain);
    lfo.start(now);
    this.bedLfo = lfo;

    for (const midi of droneMidis) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = midiToFreq(midi);
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(this.bedGain);
      osc.start(now);
      this.bedOscs.push(osc);
    }
    // soft triangle pad
    const pad = this.ctx.createOscillator();
    pad.type = "triangle";
    pad.frequency.value = midiToFreq(padMidi);
    const pg = this.ctx.createGain();
    pg.gain.value = 0.18;
    pad.connect(pg).connect(this.bedGain);
    pad.start(now);
    this.bedOscs.push(pad);
  }

  private tearDownBed(at: number) {
    for (const osc of this.bedOscs) {
      try {
        osc.stop(at);
      } catch {
        /* not started */
      }
    }
    this.bedOscs = [];
    if (this.bedLfo) {
      try {
        this.bedLfo.stop(at);
      } catch {
        /* noop */
      }
      this.bedLfo = null;
    }
  }

  // ── Look-ahead scheduler ──────────────────────────────────────────────────
  private scheduler = () => {
    this.timerId = window.setInterval(() => {
      if (!this.running || !this.comp) return;
      const horizon = this.ctx.currentTime + SCHEDULE_AHEAD_S;
      const events = this.comp.events;

      while (this.nextEventIndex < events.length) {
        const ev = events[this.nextEventIndex];
        const when = this.startTime + ev.startBeat * this.secPerBeat;
        if (when > horizon) break;
        if (!ev.isRest) this.playVoice(ev, when);
        if (this.onNote) {
          // fire the readout slightly before audible to feel synced
          const delay = Math.max(0, (when - this.ctx.currentTime) * 1000);
          window.setTimeout(() => this.onNote?.(ev, when), delay);
        }
        this.nextEventIndex++;
      }

      // end of piece?
      const endTime = this.startTime + this.comp.totalBeats * this.secPerBeat + 0.5;
      if (this.nextEventIndex >= events.length && this.ctx.currentTime > endTime) {
        this.running = false;
        if (this.timerId !== null) {
          window.clearInterval(this.timerId);
          this.timerId = null;
        }
        const now = this.ctx.currentTime;
        this.master.gain.linearRampToValueAtTime(0.0, now + 0.6);
        this.tearDownBed(now + 0.7);
        this.onEnd?.();
      }
    }, LOOKAHEAD_MS);
  };

  // ── Voice (a single sung note) ────────────────────────────────────────────
  private playVoice(ev: NoteEvent, when: number) {
    const dur = ev.durBeat * this.secPerBeat;
    const freq = midiToFreq(ev.midi);

    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    // cosmetic, non-musical detune jitter (does not change pitch perceptibly,
    // never changes which notes play). Bounded ±4 cents.
    osc.detune.value = (Math.random() * 2 - 1) * 4;

    // a soft sine sub-partial for body
    const sub = this.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq;

    const g = this.ctx.createGain();
    const peak = ev.velocity * 0.35;

    // articulation shapes the envelope
    let attack = 0.02;
    let release = 0.25;
    let sustainFrac = 0.9;
    if (ev.articulation === "staccato") {
      attack = 0.005;
      release = 0.08;
      sustainFrac = 0.45;
    } else if (ev.articulation === "legato") {
      attack = 0.05;
      release = 0.4;
      sustainFrac = 1.0;
    }
    const sustainTime = dur * sustainFrac;

    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.setValueAtTime(peak, when + Math.max(attack, sustainTime - release));
    g.gain.exponentialRampToValueAtTime(0.0008, when + sustainTime + release);

    // gentle low-pass to keep the timbre warm (engraved, not buzzy)
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    lp.Q.value = 0.6;

    const subG = this.ctx.createGain();
    subG.gain.value = 0.4;

    osc.connect(g);
    sub.connect(subG).connect(g);
    g.connect(lp).connect(this.master);

    const stopAt = when + sustainTime + release + 0.05;
    osc.start(when);
    sub.start(when);
    osc.stop(stopAt);
    sub.stop(stopAt);
  }
}
