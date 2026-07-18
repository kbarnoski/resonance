// Forking Garden — Web Audio engine.
//
// PLAYBACK MODEL: ALL sounding leaves play at once. Every voice is one leaf's
// root→leaf path, looping as its own note sequence. The root→cursor path is
// FOREGROUNDED (louder + brighter); the other alternate futures sit quietly in
// a shared bed over a soft root drone. Voice count is bounded by the caller
// (nearest ~7 leaves) so the garden never runs away or turns to mud.
//
// Warm, simple synth: triangle+sine detuned pair → per-note envelope →
// per-voice lowpass → per-voice gain → master (≤ 0.18).

import { DORIAN_SEMITONES, type PhraseNote } from "./tree";

const TONIC_HZ = 146.83; // D3 — the shared root of the whole garden.

function noteHz(note: PhraseNote): number {
  const deg = ((note.deg % 7) + 7) % 7;
  const semis = DORIAN_SEMITONES[deg] + 12 * (note.oct + 1); // +1 octave up from D3
  return TONIC_HZ * Math.pow(2, semis / 12);
}

export interface VoiceSpec {
  /** Stable key: leaf id, or the sentinel -1 for the foreground cursor path. */
  key: number;
  notes: PhraseNote[];
  foreground: boolean;
}

interface Voice {
  key: number;
  foreground: boolean;
  freqs: number[];
  step: number;
  nextTime: number;
  filter: BiquadFilterNode;
  gain: GainNode;
  lastOnset: number; // ctx.currentTime of the most recent note — drives glow.
}

const STEP_DUR = 0.34; // seconds per note (relaxed ~88bpm eighths feel)
const LOOKAHEAD = 0.14; // schedule window
const PULSE_DECAY = 0.55; // seconds for a glow to fade

export class GardenAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private voices = new Map<number, Voice>();
  private droneGain: GainNode | null = null;
  private disposed = false;

  constructor() {
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(this.ctx.destination);
    this.buildDrone();
  }

  /** Ramp master up on the first user gesture; resume a suspended context. */
  async start(): Promise<void> {
    try {
      await this.ctx.resume();
    } catch {
      /* ignore — visuals still run */
    }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.linearRampToValueAtTime(0.18, now + 1.2);
  }

  private buildDrone() {
    // Soft sustained tonic (D2 + D3) — the common root every branch sits over.
    const g = this.ctx.createGain();
    g.gain.value = 0.22;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    lp.connect(g);
    g.connect(this.master);

    for (const f of [TONIC_HZ / 2, TONIC_HZ]) {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const d = this.ctx.createOscillator();
      d.type = "sine";
      d.frequency.value = f * 1.005;
      o.connect(lp);
      d.connect(lp);
      o.start();
      d.start();
    }
    // Gentle breathing on the drone.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start();
    this.droneGain = g;
  }

  /** Reconcile the sounding voices with a new spec list (preserves phase for
   *  voices that persist, so navigation/growth doesn't restart the texture). */
  updateVoices(specs: VoiceSpec[]) {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const wanted = new Set(specs.map((s) => s.key));

    // Remove voices no longer wanted.
    for (const [key, v] of this.voices) {
      if (!wanted.has(key)) {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0.0001, now, 0.15);
        // Disconnect shortly after the fade.
        const filter = v.filter;
        const gain = v.gain;
        window.setTimeout(() => {
          try {
            filter.disconnect();
            gain.disconnect();
          } catch {
            /* already gone */
          }
        }, 400);
        this.voices.delete(key);
      }
    }

    for (const spec of specs) {
      const freqs = spec.notes.map(noteHz);
      const existing = this.voices.get(spec.key);
      const targetGain = spec.foreground ? 1.0 : 0.34;
      const cutoff = spec.foreground ? 2600 : 900;
      if (existing) {
        existing.freqs = freqs;
        existing.foreground = spec.foreground;
        existing.gain.gain.setTargetAtTime(targetGain, now, 0.2);
        existing.filter.frequency.setTargetAtTime(cutoff, now, 0.2);
        if (existing.step >= freqs.length) existing.step = 0;
      } else {
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = cutoff;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.0001;
        gain.gain.setTargetAtTime(targetGain, now, 0.25);
        filter.connect(gain);
        gain.connect(this.master);
        // Stagger new voices so they don't all attack on the same beat.
        const offset = (this.voices.size % 4) * (STEP_DUR / 4);
        this.voices.set(spec.key, {
          key: spec.key,
          foreground: spec.foreground,
          freqs,
          step: 0,
          nextTime: now + 0.08 + offset,
          filter,
          gain,
          lastOnset: -10,
        });
      }
    }
  }

  /** Call every animation frame: schedules upcoming notes for every voice. */
  tick() {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    for (const v of this.voices.values()) {
      if (v.freqs.length === 0) continue;
      while (v.nextTime < horizon) {
        this.scheduleNote(v, v.nextTime);
        v.lastOnset = v.nextTime;
        v.step = (v.step + 1) % v.freqs.length;
        v.nextTime += STEP_DUR;
      }
    }
  }

  private scheduleNote(v: Voice, t: number) {
    const f = v.freqs[v.step % v.freqs.length];
    if (!isFinite(f)) return;
    const env = this.ctx.createGain();
    const peak = v.foreground ? 0.5 : 0.34;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + STEP_DUR * 0.92);
    env.connect(v.filter);

    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const s = this.ctx.createOscillator();
    s.type = "sine";
    s.frequency.value = f;
    s.detune.value = 4;
    o.connect(env);
    s.connect(env);
    o.start(t);
    s.start(t);
    o.stop(t + STEP_DUR);
    s.stop(t + STEP_DUR);
  }

  /** Per-voice glow level (0..1) keyed by leaf key, for the canvas. */
  getPulses(): Map<number, number> {
    const now = this.ctx.currentTime;
    const out = new Map<number, number>();
    for (const v of this.voices.values()) {
      const p = Math.max(0, 1 - (now - v.lastOnset) / PULSE_DECAY);
      out.set(v.key, p);
    }
    return out;
  }

  async dispose() {
    this.disposed = true;
    this.voices.clear();
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(0.0001, now + 0.1);
    } catch {
      /* ignore */
    }
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
