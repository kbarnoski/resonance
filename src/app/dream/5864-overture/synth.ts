// synth.ts — a small generative ENSEMBLE that renders the Freytag arc with the
// Web Audio API. No external files: every sound is synthesised.
//
//   • felt-piano   — a 2-operator FM voice with a soft attack (the lead).
//   • string pad   — detuned saws through a lowpass, slow swells per chord.
//   • bass / cello — a low sustained root per chord.
//   • percussion   — a soft filtered-noise tick that enters in the rising
//                    action (never faster than the beat, well under any
//                    flicker concern).
//
// A lookahead scheduler advances a journey clock in real time; the *inverse*
// tension model (tension.ts) chooses register, dynamics, harmony, density and
// tempo at each beat to hit the demanded Freytag tension. The journey loops
// (restarting from the exposition) so the gallery piece self-plays forever —
// but each pass is a full through-composed shape, not a bar loop.

import { mulberry32, hashSeed } from "./rng";
import {
  computeParams,
  realizedTension,
  chordForSlot,
  slotAt,
  runDescribe,
  TENSION_MIDI_TONIC,
  type Chord,
  type Params,
} from "./tension";
import { targetTension, actAt } from "./arc";
import { DURATION_S } from "./demo";

const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead of the clock
const TICK_MS = 25; // scheduler wakeup interval
const SLOW_BEAT = 1.15; // beat duration at tempo 0 (calm)
const FAST_BEAT = 0.4; // beat duration at tempo 1 (urgent)

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface EnsembleState {
  pos01: number;
  actName: string;
  tensionTarget: number;
  tensionLive: number;
  tempoBpm: number;
  chordName: string;
  description: string;
  params: Params;
}

export class Ensemble {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wet: GainNode | null = null;
  private timer: number | null = null;

  private seed: number;
  private playing = false;

  // scheduler bookkeeping (all in ctx time / journey seconds)
  private nextBeatCtx = 0;
  private beatJourneySec = 0;
  private posSec = 0;
  private curSlot = -1;
  private curChord: Chord;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.curChord = chordForSlot(0, this.seed);
  }

  reseed(seed: number): void {
    this.seed = seed >>> 0;
    this.curSlot = -1;
    this.curChord = chordForSlot(slotAt(this.posSec / DURATION_S), this.seed);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Normalised playback position, smoothly interpolated for the UI. */
  getPos(): number {
    if (this.ctx && this.playing) {
      const p = this.beatJourneySec - (this.nextBeatCtx - this.ctx.currentTime);
      return Math.max(0, Math.min(1, p / DURATION_S));
    }
    return Math.max(0, Math.min(1, this.posSec / DURATION_S));
  }

  /** Everything the readout needs, sampled at the live position. */
  getState(): EnsembleState {
    const pos01 = this.getPos();
    const params = computeParams(pos01);
    const beatDur = lerp(SLOW_BEAT, FAST_BEAT, params.tempo);
    return {
      pos01,
      actName: actAt(pos01).name,
      tensionTarget: targetTension(pos01),
      tensionLive: realizedTension(params, this.curChord.weight),
      tempoBpm: Math.round(60 / beatDur),
      chordName: this.curChord.name,
      description: runDescribe(pos01, params, this.curChord),
      params,
    };
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();

    const master = ctx.createGain();
    master.gain.value = 0.0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;

    // Warm algorithmic reverb from a deterministically generated impulse.
    const reverb = ctx.createConvolver();
    reverb.buffer = this.makeImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;

    master.connect(comp);
    master.connect(reverb);
    reverb.connect(wet);
    wet.connect(comp);
    comp.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.wet = wet;
    return ctx;
  }

  private makeImpulse(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 2.4);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const r = mulberry32(hashSeed(this.seed, 777));
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const decay = Math.pow(1 - t, 3.2);
        data[i] = (r() * 2 - 1) * decay;
      }
    }
    return buf;
  }

  async start(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    if (this.playing) return;
    this.playing = true;
    // resume the clock from wherever the playhead is
    this.beatJourneySec = this.posSec;
    this.nextBeatCtx = ctx.currentTime + 0.06;
    this.curSlot = -1;
    if (this.master) {
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.setValueAtTime(this.master.gain.value, ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 1.2);
    }
    this.timer = window.setInterval(() => this.runScheduler(), TICK_MS);
  }

  pause(): void {
    if (!this.ctx || !this.playing) return;
    this.posSec = this.getPos() * DURATION_S;
    this.playing = false;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0.0, t + 0.4);
    }
  }

  /** Jump to a normalised position (scrub). */
  seek(pos01: number): void {
    const p = Math.max(0, Math.min(1, pos01));
    this.posSec = p * DURATION_S;
    this.beatJourneySec = this.posSec;
    this.curSlot = -1;
    if (this.ctx && this.playing) {
      this.nextBeatCtx = this.ctx.currentTime + 0.06;
    }
    // update the reported chord immediately even while paused
    this.curChord = chordForSlot(slotAt(p), this.seed);
  }

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  // ── scheduler ────────────────────────────────────────────────────────────
  private runScheduler(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const now = ctx.currentTime;

    while (this.nextBeatCtx < now + LOOKAHEAD) {
      const pos01 = Math.max(0, Math.min(1, this.beatJourneySec / DURATION_S));
      this.scheduleBeat(this.nextBeatCtx, pos01);
      const params = computeParams(pos01);
      const beatDur = lerp(SLOW_BEAT, FAST_BEAT, params.tempo);
      this.beatJourneySec += beatDur;
      this.nextBeatCtx += beatDur;
      if (this.beatJourneySec >= DURATION_S) {
        this.beatJourneySec = 0; // loop the journey from the exposition
        this.curSlot = -1;
      }
    }
    this.posSec = this.beatJourneySec - (this.nextBeatCtx - now);
  }

  private scheduleBeat(t: number, pos01: number): void {
    const params = computeParams(pos01);
    const slot = slotAt(pos01);
    const tau = targetTension(pos01);

    // New harmony → swell the pad and re-articulate the bass.
    if (slot !== this.curSlot) {
      this.curSlot = slot;
      this.curChord = chordForSlot(slot, this.seed);
      const chordDur = (DURATION_S / 60) * 1.15;
      this.triggerPad(t, this.curChord, params, chordDur);
      this.triggerBass(t, this.curChord, params, chordDur);
    }
    const chord = this.curChord;

    // Deterministic per-position RNG so scrubbing is reproducible.
    const rng = mulberry32(hashSeed(this.seed, Math.floor(pos01 * 1_000_003)));

    // Felt-piano onsets — probability = onset density.
    if (rng() < params.density) {
      const octShift = Math.round(lerp(-1, 1, params.register)) * 12;
      const count = 1 + Math.floor(params.density * 2 + rng() * 1.4);
      const beatDur = lerp(SLOW_BEAT, FAST_BEAT, params.tempo);
      for (let i = 0; i < count; i++) {
        const tone = chord.tones[Math.floor(rng() * chord.tones.length)];
        const sparkle = tau > 0.7 && rng() < 0.4 ? 12 : 0;
        const midi = TENSION_MIDI_TONIC + tone + octShift + sparkle;
        const vel = 0.05 + params.loudness * 0.13 * (0.7 + 0.3 * rng());
        this.playFM(t + (i / count) * beatDur * 0.9, mtof(midi), 2.4, vel);
      }
    }

    // Percussion enters in the rising action and grows with density.
    if (tau > 0.34 && rng() < params.density * 0.55) {
      this.playTick(t, 0.04 + params.loudness * 0.05, tau);
    }
  }

  // ── voices ─────────────────────────────────────────────────────────────
  private playFM(time: number, freq: number, dur: number, vel: number): void {
    const ctx = this.ctx!;
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const amp = ctx.createGain();

    carrier.type = "sine";
    mod.type = "sine";
    mod.frequency.value = freq * 2.0; // bell-ish ratio for a felt attack
    modGain.gain.setValueAtTime(freq * 1.6, time);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.02, time + dur * 0.6);
    carrier.frequency.value = freq;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // soft attack, long felt decay
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(vel, time + 0.018);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    carrier.connect(amp);
    amp.connect(this.master!);
    carrier.start(time);
    mod.start(time);
    carrier.stop(time + dur + 0.05);
    mod.stop(time + dur + 0.05);
  }

  private triggerPad(time: number, chord: Chord, params: Params, dur: number): void {
    const ctx = this.ctx!;
    const cutoff = 400 + params.register * 2600 + params.loudness * 800;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.6;
    const amp = ctx.createGain();
    const peak = 0.05 + params.loudness * 0.055;
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(peak, time + 0.6);
    amp.gain.setValueAtTime(peak, time + dur * 0.55);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    filter.connect(amp);
    amp.connect(this.master!);

    // top three chord tones, an octave up, gently detuned
    const tones = chord.tones.slice(1);
    for (const tone of tones) {
      const f = mtof(TENSION_MIDI_TONIC + tone + 12);
      for (const det of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = det;
        osc.connect(filter);
        osc.start(time);
        osc.stop(time + dur + 0.1);
      }
    }
  }

  private triggerBass(time: number, chord: Chord, params: Params, dur: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 320 + params.loudness * 260;
    osc.type = "triangle";
    sub.type = "sine";
    const f = mtof(TENSION_MIDI_TONIC + chord.bass - 24);
    osc.frequency.value = f;
    sub.frequency.value = f / 2;
    const peak = 0.09 + params.loudness * 0.05;
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(peak, time + 0.25);
    amp.gain.setValueAtTime(peak, time + dur * 0.6);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(amp);
    amp.connect(this.master!);
    osc.start(time);
    sub.start(time);
    osc.stop(time + dur + 0.1);
    sub.stop(time + dur + 0.1);
  }

  private playTick(time: number, gain: number, tau: number): void {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.09);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const r = mulberry32(hashSeed(this.seed, Math.floor(time * 1000)));
    for (let i = 0; i < len; i++) {
      data[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900 + tau * 2200;
    filter.Q.value = 1.1;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.master!);
    src.start(time);
    src.stop(time + 0.12);
  }
}
