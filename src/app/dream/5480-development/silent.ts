// silent.ts — graceful fallback when AudioContext is unavailable.
// Runs the same Conductor against a wall-clock so the piano-roll still
// composes and scrolls, silently. Pull-based: events fill on demand.

import {
  Conductor,
  degreeToMidi,
  PHASE_TEMPO,
  type Note,
  type Phrase,
} from "./engine";
import type { ComposerState, MusicSource, RenderNote } from "./audio";

const BPM = 108;
const BASE_SEC_PER_BEAT = 60 / BPM;
const SCHEDULE_AHEAD = 0.3;
const MAX_EVENTS = 400;

export class SilentDriver implements MusicSource {
  private conductor: Conductor;
  private events: RenderNote[] = [];
  private nextTime = 0;
  private queue: Note[] = [];
  private qIndex = 0;
  private current: Phrase | null = null;
  private base = 0;
  private paused = true;
  private elapsedAtPause = 0;

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
  }

  start(): void {
    this.base = performance.now() / 1000 - this.elapsedAtPause;
    this.paused = false;
  }
  pause(): void {
    this.elapsedAtPause = this.now();
    this.paused = true;
  }
  dispose(): void {
    /* nothing to release */
  }

  now(): number {
    if (this.paused) return this.elapsedAtPause;
    return performance.now() / 1000 - this.base;
  }

  getState(): ComposerState {
    return this.state;
  }

  getEvents(): readonly RenderNote[] {
    this.fill(this.now() + SCHEDULE_AHEAD);
    return this.events;
  }

  private fill(until: number): void {
    let guard = 0;
    while (this.nextTime < until && guard++ < 200) {
      if (this.qIndex >= this.queue.length) {
        const phrase = this.conductor.next();
        this.current = phrase;
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
        this.nextTime += BASE_SEC_PER_BEAT * 0.5;
        this.accompany(phrase, this.nextTime);
      }
      const phrase = this.current!;
      const note = this.queue[this.qIndex];
      const secPerBeat = BASE_SEC_PER_BEAT / PHASE_TEMPO[phrase.phase];
      const durSec = note.duration * secPerBeat;
      this.push({
        startTime: this.nextTime,
        duration: durSec,
        midi: degreeToMidi(note.degree, phrase.center),
        voice: "lead",
        phraseId: phrase.id,
        phase: phrase.phase,
      });
      this.nextTime += durSec;
      this.qIndex++;
    }
  }

  private accompany(phrase: Phrase, at: number): void {
    const secPerBeat = BASE_SEC_PER_BEAT / PHASE_TEMPO[phrase.phase];
    const beats = phrase.notes.reduce((s, n) => s + n.duration, 0);
    const len = beats * secPerBeat;
    this.push({
      startTime: at,
      duration: len,
      midi: degreeToMidi(0, phrase.center) - 24,
      voice: "bass",
      phraseId: phrase.id,
      phase: phrase.phase,
    });
    for (const d of [0, 2, 4]) {
      this.push({
        startTime: at,
        duration: len,
        midi: degreeToMidi(d, phrase.center) - 12,
        voice: "pad",
        phraseId: phrase.id,
        phase: phrase.phase,
      });
    }
  }

  private push(e: RenderNote): void {
    this.events.push(e);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }
}
