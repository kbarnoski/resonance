// ════════════════════════════════════════════════════════════════════════════
// SHADOW (1218) — clock + shadow-delay + synthesis
//
// Four independent struck FM voices (S/A/T/B), each with a slightly different
// ratio / index / brightness so the moving harmony stays legible. The player's
// note (soprano) sounds immediately; the harmonizer's A/T/B voices are scheduled
// a musical SHADOW DELAY behind (an eighth note at the current tempo) so you hear
// the choir bloom UNDER your hand, a beat late.
//
// A look-ahead scheduler in the Chris Wilson "A Tale of Two Clocks" idiom drives
// the scripted Demo melody: a ~25 ms setInterval peeks ~120 ms ahead and commits
// upcoming note-ons onto audioCtx.currentTime, so timing never jitters with the
// UI thread. FM after Chowning (frequency modulation synthesis).
//
// Safety / hygiene: master gain ramps from 0, a DynamicsCompressor sits on the
// bus as a brick-wall limiter, polyphony is bounded (old voices are stolen), and
// dispose() tears the whole graph down.
// ════════════════════════════════════════════════════════════════════════════

import { mtof } from "./harmony";

export type VoiceId = "s" | "a" | "t" | "b";

interface VoiceProfile {
  modRatio: number; // modulator freq / carrier freq
  modIndex: number; // FM depth (peak)
  decay: number; // amplitude decay time (s)
  cutoff: number; // per-voice low-pass (Hz), warmth
  pan: number; // -1..1 stereo placement
  gain: number; // relative level
}

// S bright & present (jade line on top), B round & warm, A/T in between.
const PROFILES: Record<VoiceId, VoiceProfile> = {
  s: { modRatio: 2.0, modIndex: 2.6, decay: 2.1, cutoff: 4200, pan: 0.28, gain: 0.9 },
  a: { modRatio: 1.0, modIndex: 2.0, decay: 2.4, cutoff: 3000, pan: -0.16, gain: 0.72 },
  t: { modRatio: 1.0, modIndex: 1.6, decay: 2.6, cutoff: 2400, pan: 0.14, gain: 0.7 },
  b: { modRatio: 0.5, modIndex: 1.3, decay: 2.9, cutoff: 1500, pan: -0.3, gain: 0.82 },
};

const MAX_VOICES = 28; // bounded polyphony

interface LiveVoice {
  carrier: OscillatorNode;
  mod: OscillatorNode;
  amp: GainNode;
  ends: number;
}

export class ShadowEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private live: LiveVoice[] = [];
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -8;
    this.comp.knee.value = 6;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.15;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
  }

  /** Ramp the bus up from silence. */
  start() {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.5, now + 0.4);
  }

  now(): number {
    return this.ctx.currentTime;
  }

  get context(): AudioContext {
    return this.ctx;
  }

  /** Strike one FM voice at absolute time `when`. */
  strike(voice: VoiceId, midi: number, when: number, velocity = 0.9) {
    if (!this.started) return;
    const ctx = this.ctx;
    const p = PROFILES[voice];
    const t0 = Math.max(when, ctx.currentTime + 0.001);
    const freq = mtof(midi);

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * p.modRatio;

    // FM depth in Hz, with a struck (decaying) index so the attack is bright.
    const modGain = ctx.createGain();
    const peakDepth = freq * p.modIndex;
    modGain.gain.setValueAtTime(peakDepth, t0);
    modGain.gain.exponentialRampToValueAtTime(
      Math.max(1, peakDepth * 0.12),
      t0 + p.decay * 0.7,
    );
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // Warmth low-pass.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = p.cutoff;
    lp.Q.value = 0.5;

    // Amplitude envelope: fast struck attack, long exponential ring.
    const amp = ctx.createGain();
    const peak = Math.max(0.02, velocity) * p.gain * 0.5;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(peak, t0 + 0.009);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay);

    const pan = ctx.createStereoPanner();
    pan.pan.value = p.pan;

    carrier.connect(lp);
    lp.connect(amp);
    amp.connect(pan);
    pan.connect(this.master);

    const ends = t0 + p.decay + 0.1;
    carrier.start(t0);
    mod.start(t0);
    carrier.stop(ends);
    mod.stop(ends);

    const lv: LiveVoice = { carrier, mod, amp, ends };
    carrier.onended = () => {
      try {
        carrier.disconnect();
        mod.disconnect();
        modGain.disconnect();
        lp.disconnect();
        amp.disconnect();
        pan.disconnect();
      } catch {
        /* already torn down */
      }
      const i = this.live.indexOf(lv);
      if (i >= 0) this.live.splice(i, 1);
    };

    this.live.push(lv);
    this.stealIfNeeded();
  }

  private stealIfNeeded() {
    while (this.live.length > MAX_VOICES) {
      const victim = this.live.shift();
      if (!victim) break;
      const t = this.ctx.currentTime;
      try {
        victim.amp.gain.cancelScheduledValues(t);
        victim.amp.gain.setTargetAtTime(0.0001, t, 0.03);
        victim.carrier.stop(t + 0.12);
        victim.mod.stop(t + 0.12);
      } catch {
        /* ignore */
      }
    }
  }

  /** Quickly duck everything (pause). */
  silence() {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.0001, t, 0.04);
  }

  /** Restore the bus after silence(). */
  unsilence() {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.5, t, 0.05);
  }

  dispose() {
    const t = this.ctx.currentTime;
    for (const v of this.live) {
      try {
        v.carrier.stop(t + 0.05);
        v.mod.stop(t + 0.05);
      } catch {
        /* ignore */
      }
    }
    this.live = [];
    try {
      this.master.disconnect();
      this.comp.disconnect();
    } catch {
      /* ignore */
    }
  }
}

// ─── Look-ahead scheduler (Chris Wilson, "A Tale of Two Clocks") ──────────────
export interface ScheduledNote {
  beat: number; // start time in beats from sequence start
  midi: number; // soprano melody note
  dur: number; // duration in beats
}

/**
 * Drives a scripted melody onto the audio clock. Every ~25 ms it looks ~120 ms
 * ahead and fires a callback for each note whose start time falls in the window,
 * passing the exact audio-context time so the harmonizer + synth stay in sync.
 */
export class LookaheadScheduler {
  private ctx: AudioContext;
  private notes: ScheduledNote[];
  private secondsPerBeat: number;
  private startTime = 0;
  private nextIdx = 0;
  private timer: number | null = null;
  private onNote: (n: ScheduledNote, when: number) => void;
  private onDone: () => void;
  private readonly lookahead = 0.12; // s
  private readonly interval = 25; // ms

  constructor(
    ctx: AudioContext,
    notes: ScheduledNote[],
    bpm: number,
    onNote: (n: ScheduledNote, when: number) => void,
    onDone: () => void,
  ) {
    this.ctx = ctx;
    this.notes = notes;
    this.secondsPerBeat = 60 / bpm;
    this.onNote = onNote;
    this.onDone = onDone;
  }

  start() {
    this.startTime = this.ctx.currentTime + 0.15;
    this.nextIdx = 0;
    const tick = () => {
      const horizon = this.ctx.currentTime + this.lookahead;
      while (this.nextIdx < this.notes.length) {
        const n = this.notes[this.nextIdx];
        const when = this.startTime + n.beat * this.secondsPerBeat;
        if (when > horizon) break;
        this.onNote(n, when);
        this.nextIdx++;
      }
      if (this.nextIdx >= this.notes.length) {
        // let the tail ring out, then report done
        const last = this.notes[this.notes.length - 1];
        const end = this.startTime + (last.beat + last.dur) * this.secondsPerBeat;
        if (this.ctx.currentTime > end + 0.2) {
          this.stop();
          this.onDone();
        }
      }
    };
    this.timer = window.setInterval(tick, this.interval);
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get beatSeconds() {
    return this.secondsPerBeat;
  }
}
