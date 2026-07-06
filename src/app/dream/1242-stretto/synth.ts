// ════════════════════════════════════════════════════════════════════════════
// STRETTO (1242) — synthesis + transport
//
// Two timbre families keep the imitative voices legible:
//   · DUX   — a bright detuned-saw pair (two sawtooths a few cents apart), the
//             leader that everything chases.
//   · COMES — a softer triangle, warmer and rounder, so the answers sit under the
//             subject without masking it.
// Each note gets an ADSR envelope, a gentle vibrato LFO, a per-voice low-pass for
// warmth, and a send into a shared feedback-delay reverb. The master bus is a
// single gain (≤ 0.26) into a DynamicsCompressor acting as a brick-wall limiter,
// with the level ramped up from silence on start.
//
// A look-ahead scheduler (Chris Wilson, "A Tale of Two Clocks") peeks ~200 ms
// ahead on a ~30 ms timer and commits note-ons onto audioCtx.currentTime, looping
// the canon seamlessly so the staggered entries are always audibly in time.
// ════════════════════════════════════════════════════════════════════════════

import { mtof } from "./canon";

export type VoiceKind = "dux" | "comes";

interface Profile {
  detune: number; // cents of spread for the saw pair (dux only)
  cutoff: number; // per-voice low-pass (Hz)
  gain: number; // relative level
}

const PROFILES: Record<VoiceKind, Profile> = {
  dux: { detune: 9, cutoff: 3400, gain: 0.9 },
  comes: { detune: 0, cutoff: 1900, gain: 0.62 },
};

const MAX_VOICES = 26; // bounded polyphony

interface LiveVoice {
  oscs: OscillatorNode[];
  lfo: OscillatorNode;
  amp: GainNode;
  ends: number;
}

export class CanonSynth {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private reverbIn: GainNode;
  private live: LiveVoice[] = [];
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // brick-wall limiter on the bus
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -6;
    this.comp.knee.value = 6;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.15;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    // gentle feedback-delay reverb send
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 1;
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.reverbIn.connect(delay);
    delay.connect(tone);
    tone.connect(fb);
    fb.connect(delay); // feedback loop
    tone.connect(wet);
    wet.connect(this.master);
  }

  /** Ramp the bus up from silence (gesture-gated). */
  start() {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.24, now + 0.35);
  }

  now(): number {
    return this.ctx.currentTime;
  }

  /** Strike one note of the given voice kind at absolute time `when`. */
  strike(midi: number, when: number, dur: number, kind: VoiceKind, vel = 0.9) {
    if (!this.started) return;
    const ctx = this.ctx;
    const p = PROFILES[kind];
    const t0 = Math.max(when, ctx.currentTime + 0.001);
    const freq = mtof(midi);
    const sustain = Math.max(0.12, dur * 0.6); // seconds the note holds
    const release = 0.28;

    // warmth low-pass
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = p.cutoff;
    lp.Q.value = 0.4;

    // ADSR amplitude envelope
    const amp = ctx.createGain();
    const peak = Math.max(0.02, vel) * p.gain * 0.5;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(peak, t0 + 0.012); // attack
    amp.gain.exponentialRampToValueAtTime(peak * 0.75, t0 + 0.12); // decay→sustain
    amp.gain.setValueAtTime(peak * 0.75, t0 + sustain);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + sustain + release);

    // gentle vibrato
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 5.2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = freq * 0.006; // a few cents
    lfo.connect(lfoGain);

    // oscillators: dux = detuned saw pair, comes = single triangle
    const oscs: OscillatorNode[] = [];
    const makeOsc = (type: OscillatorType, detune: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      lfoGain.connect(o.frequency);
      o.connect(lp);
      oscs.push(o);
      return o;
    };
    if (kind === "dux") {
      makeOsc("sawtooth", -p.detune);
      makeOsc("sawtooth", p.detune);
    } else {
      makeOsc("triangle", 0);
    }

    const pan = ctx.createStereoPanner();
    pan.pan.value = kind === "dux" ? 0.12 : -0.14;

    lp.connect(amp);
    amp.connect(pan);
    pan.connect(this.master);
    amp.connect(this.reverbIn); // reverb send

    const ends = t0 + sustain + release + 0.05;
    for (const o of oscs) {
      o.start(t0);
      o.stop(ends);
    }
    lfo.start(t0);
    lfo.stop(ends);

    const lv: LiveVoice = { oscs, lfo, amp, ends };
    oscs[0].onended = () => {
      try {
        for (const o of oscs) o.disconnect();
        lfo.disconnect();
        lfoGain.disconnect();
        lp.disconnect();
        amp.disconnect();
        pan.disconnect();
      } catch {
        /* already torn down */
      }
      const idx = this.live.indexOf(lv);
      if (idx >= 0) this.live.splice(idx, 1);
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
        for (const o of victim.oscs) o.stop(t + 0.12);
        victim.lfo.stop(t + 0.12);
      } catch {
        /* ignore */
      }
    }
  }

  dispose() {
    const t = this.ctx.currentTime;
    for (const v of this.live) {
      try {
        for (const o of v.oscs) o.stop(t + 0.05);
        v.lfo.stop(t + 0.05);
      } catch {
        /* ignore */
      }
    }
    this.live = [];
    try {
      this.master.disconnect();
      this.comp.disconnect();
      this.reverbIn.disconnect();
    } catch {
      /* ignore */
    }
  }
}

// ─── Look-ahead scheduler with seamless looping ──────────────────────────────
export interface CanonEvent {
  beat: number;
  dur: number;
  midi: number;
  voice: number; // 0 = dux
}

/**
 * Drives the flattened canon onto the audio clock and loops it forever. Each tick
 * peeks `lookahead` seconds ahead and commits every event whose onset falls in the
 * window onto audioCtx.currentTime; when the pointer runs off the end it wraps and
 * advances the loop counter, so entries stay perfectly in time across repeats.
 */
export class LoopScheduler {
  private ctx: AudioContext;
  private events: CanonEvent[];
  private spb: number;
  private loopBeats: number;
  private startTime: number;
  private idx = 0;
  private loop = 0;
  private timer: number | null = null;
  private fire: (ev: CanonEvent, when: number) => void;
  private readonly lookahead = 0.2;
  private readonly interval = 30;

  constructor(
    ctx: AudioContext,
    events: CanonEvent[],
    bpm: number,
    loopBeats: number,
    startTime: number,
    fire: (ev: CanonEvent, when: number) => void,
  ) {
    this.ctx = ctx;
    this.events = events;
    this.spb = 60 / bpm;
    this.loopBeats = loopBeats;
    this.startTime = startTime;
    this.fire = fire;
  }

  start() {
    const tick = () => {
      const horizon = this.ctx.currentTime + this.lookahead;
      // guard against an empty canon (all-rest subject)
      let guard = 0;
      while (this.events.length > 0 && guard < 512) {
        const ev = this.events[this.idx];
        const when =
          this.startTime + (ev.beat + this.loop * this.loopBeats) * this.spb;
        if (when > horizon) break;
        this.fire(ev, when);
        this.idx++;
        if (this.idx >= this.events.length) {
          this.idx = 0;
          this.loop++;
        }
        guard++;
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
}
