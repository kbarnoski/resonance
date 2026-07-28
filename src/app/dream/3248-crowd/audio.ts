// 3248 — crowd · audio voice + lookahead scheduler
//
// A proper AudioContext lookahead scheduler (Chris Wilson pattern): a setInterval
// wakes every ~25 ms and schedules any note-events that fall within the next
// ~120 ms against absolute ctx.currentTime — never one-oscillator-per-timer.
//
// Per note: 2 detuned oscillators → lowpass → per-note gain → shared bus →
// DynamicsCompressor (limiter) → master. Activation drives loudness AND
// brightness AND presence: a strongly-held note is loud and bright, a
// near-evicted one is quiet and dull, an evicted one is simply gone from the set.

import type { Note } from "./memory";
import { EVICT_THRESHOLD } from "./memory";

const BPM = 110;
const BEATS_PER_LOOP = 8;
const LOOP_DUR = (60 / BPM) * BEATS_PER_LOOP; // seconds per phrase (~4.36 s)
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25; // scheduler wake interval
const NOTE_DUR = 0.42; // seconds per sounded note

interface QueuedEvent {
  time: number; // absolute ctx time to sound
  note: Note; // snapshot (activation captured at phrase build)
}

export class MemoryAudio {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private phraseStart = 0; // ctx time of the current phrase's t=0
  private queue: QueuedEvent[] = [];
  private getNotes: () => Note[] = () => [];

  get available(): boolean {
    return typeof window !== "undefined" && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
  }

  get currentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  get loopDur(): number {
    return LOOP_DUR;
  }

  // phase within the looping phrase, [0,1) — drives the visual playhead
  get phase(): number {
    if (!this.ctx) return 0;
    const dt = this.ctx.currentTime - this.phraseStart;
    return ((dt % LOOP_DUR) + LOOP_DUR) % LOOP_DUR / LOOP_DUR;
  }

  async start(getNotes: () => Note[]): Promise<boolean> {
    if (!this.available) return false;
    this.getNotes = getNotes;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.15;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -24;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 20;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.phraseStart = this.ctx.currentTime + 0.06;
    this.queue = this.buildPhrase(this.phraseStart);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    return true;
  }

  private buildPhrase(startTime: number): QueuedEvent[] {
    const notes = this.getNotes();
    return notes
      .filter((n) => n.act >= EVICT_THRESHOLD)
      .map((n) => ({ time: startTime + n.t * LOOP_DUR, note: { ...n } }))
      .sort((a, b) => a.time - b.time);
  }

  private tick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD;

    // roll the phrase forward when it has fully elapsed (catch up if throttled)
    while (now >= this.phraseStart + LOOP_DUR) {
      this.phraseStart += LOOP_DUR;
      this.queue = this.buildPhrase(this.phraseStart).filter((e) => e.time > now);
    }

    while (this.queue.length && this.queue[0].time < horizon) {
      const ev = this.queue.shift()!;
      if (ev.time >= now - 0.02) this.playVoice(ev.note, Math.max(ev.time, now));
    }
  }

  private playVoice(note: Note, when: number) {
    if (!this.ctx || !this.bus) return;
    const act = Math.min(1, Math.max(0, note.act));
    const ctx = this.ctx;

    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    // brightness follows activation: dull when near-evicted, bright when held
    lp.frequency.value = 320 + 3600 * Math.pow(act, 1.4);
    lp.Q.value = 0.7;

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = "triangle";
    oscB.type = "sawtooth";
    oscA.frequency.value = note.freq;
    oscB.frequency.value = note.freq;
    oscA.detune.value = -6;
    oscB.detune.value = 6;

    // loudness + presence follow activation
    const peak = 0.02 + 0.16 * act;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + NOTE_DUR);

    oscA.connect(lp);
    oscB.connect(lp);
    lp.connect(g);
    g.connect(this.bus);

    oscA.start(when);
    oscB.start(when);
    const stop = when + NOTE_DUR + 0.02;
    oscA.stop(stop);
    oscB.stop(stop);
    const cleanup = () => {
      oscA.disconnect();
      oscB.disconnect();
      lp.disconnect();
      g.disconnect();
    };
    oscB.onended = cleanup;
  }

  // a short confirmation blip when the user (or demo) taps/rehearses
  blip(freq: number, strong: boolean) {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + 0.005;
    const g = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const peak = strong ? 0.14 : 0.09;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    osc.connect(g);
    g.connect(this.bus);
    osc.start(when);
    osc.stop(when + 0.18);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.queue = [];
    if (this.bus) this.bus.disconnect();
    if (this.comp) this.comp.disconnect();
    if (this.master) this.master.disconnect();
    this.bus = null;
    this.comp = null;
    this.master = null;
    if (this.ctx) {
      const c = this.ctx;
      this.ctx = null;
      void c.close();
    }
  }
}
