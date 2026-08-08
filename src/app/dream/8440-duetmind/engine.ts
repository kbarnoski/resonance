// The conductor. Owns the master clock, the note timeline, the call-and-response
// turn structure, and the moment where the agent COMMITS its plan a beat ahead.
//
// Turn trading: the timeline is cut into 4-beat turns that alternate YOU / AGENT.
// Each turn is scheduled `planLead` seconds before it sounds — so agent notes are
// born into the future and slide in from the right as translucent ghosts (the
// anticipation display) before they cross the NOW line and speak.
//
// Clock: performance.now() is the master (drives visuals). When audio is present
// its schedule time is derived as ctx.currentTime + (noteTime − now), so the two
// clocks never need to share an origin.

import {
  type Note,
  type RelNote,
  type Voice,
  generateAgentPhrase,
  generateHumanPhrase,
  mulberry32,
} from "./agent";
import { type DuetSynth } from "./audio";

export interface Snapshot {
  time: number;
  notes: Note[];
  transformLabel: string;
  turnParity: number; // 0 = your turn window, 1 = agent's
  live: boolean;
  activePitches: Set<number>;
  beat: number;
  turnLen: number;
}

export class DuetEngine {
  notes: Note[] = [];
  live = false;
  transformLabel = "listening…";
  activePitches = new Set<number>();

  readonly beat = 0.42;
  readonly turnLen = this.beat * 4;
  private readonly planLead = this.beat * 1.15;

  private readonly t0 = performance.now();
  private readonly rand: () => number;
  private idc = 0;
  private nextTurnStart = 0.55;
  private turnParity = 0;
  private ctx: AudioContext | null = null;
  private synth: DuetSynth | null = null;
  private held = new Map<number, Note>();

  constructor(seed = 0x1a2b3c) {
    this.rand = mulberry32(seed);
  }

  getTime(): number {
    return (performance.now() - this.t0) / 1000;
  }

  attachAudio(ctx: AudioContext, synth: DuetSynth): void {
    this.ctx = ctx;
    this.synth = synth;
  }

  private schedAudio(n: Note): void {
    if (!this.ctx || !this.synth) return;
    const when = this.ctx.currentTime + (n.t - this.getTime());
    const safe = Math.max(when, this.ctx.currentTime + 0.001);
    if (n.voice === "human") this.synth.playHuman(n.pitch, safe, n.dur);
    else this.synth.playAgent(n.pitch, safe, n.dur);
  }

  private push(voice: Voice, pitch: number, t: number, dur: number): Note {
    const n: Note = { id: this.idc++, voice, pitch, t, dur };
    this.notes.push(n);
    return n;
  }

  // Gather the recent motif for the agent to react to: your last turn's notes,
  // or — if you've gone quiet — the agent's own last phrase, so it develops
  // itself and the conversation keeps breathing.
  private collectMotif(start: number): RelNote[] {
    const from = start - this.turnLen * 1.35;
    let src = this.notes.filter((n) => n.voice === "human" && n.t >= from && n.t < start);
    if (src.length === 0) {
      src = this.notes.filter((n) => n.voice === "agent" && n.t < start).slice(-6);
    }
    if (src.length === 0) return [];
    const base = Math.min(...src.map((n) => n.t));
    return src.map((n) => ({ pitch: n.pitch, rel: n.t - base, dur: n.dur }));
  }

  private scheduleTurn(start: number, parity: number): void {
    if (parity === 0) {
      // Your turn. In the self-demo we play a seeded line for you; once you've
      // taken over, this window is left open for your live playing.
      if (!this.live) {
        for (const m of generateHumanPhrase(this.rand, this.turnLen, this.beat)) {
          this.schedAudio(this.push("human", m.pitch, start + m.rel, m.dur));
        }
      }
    } else {
      // Agent's turn. Commit the plan now (a beat ahead of sounding).
      const phrase = generateAgentPhrase(
        this.collectMotif(start),
        this.rand,
        this.turnLen,
        this.beat,
      );
      this.transformLabel = phrase.label;
      for (const m of phrase.notes) {
        this.schedAudio(this.push("agent", m.pitch, start + m.rel, m.dur));
      }
    }
  }

  tick(): void {
    const t = this.getTime();
    let guard = 0;
    while (this.nextTurnStart - this.planLead <= t && guard < 8) {
      this.scheduleTurn(this.nextTurnStart, this.turnParity);
      this.nextTurnStart += this.turnLen;
      this.turnParity ^= 1;
      guard++;
    }
    const cutoff = t - 1.7;
    this.notes = this.notes.filter((n) => n.t + n.dur > cutoff);
    for (const n of this.held.values()) n.dur = Math.max(0.08, t - n.t);
  }

  pressKey(pitch: number): void {
    if (!this.live) this.live = true; // hand control back the instant you play
    const t = this.getTime();
    const n = this.push("human", pitch, t, 0.3);
    n.held = true;
    this.held.set(pitch, n);
    this.activePitches.add(pitch);
    this.schedAudio(n);
  }

  releaseKey(pitch: number): void {
    const n = this.held.get(pitch);
    if (n) {
      n.dur = Math.max(0.1, this.getTime() - n.t);
      n.held = false;
      this.held.delete(pitch);
    }
    this.activePitches.delete(pitch);
  }

  snapshot(): Snapshot {
    return {
      time: this.getTime(),
      notes: this.notes,
      transformLabel: this.transformLabel,
      turnParity: this.turnParity,
      live: this.live,
      activePitches: this.activePitches,
      beat: this.beat,
      turnLen: this.turnLen,
    };
  }

  dispose(): void {
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        // already closed
      }
    }
    this.synth?.dispose();
    this.ctx = null;
    this.synth = null;
    this.notes = [];
    this.held.clear();
    this.activePitches.clear();
  }
}
