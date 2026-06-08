/**
 * audio.ts — Web Audio engine for the comma pump prototype
 *
 * Provides:
 *   - SynthEngine class: create/destroy audio context, schedule chord voices
 *   - Additive pad synth (sine + triangle partials, slow attack/release)
 *   - Simple feedback-delay reverb + DynamicsCompressor on master bus
 */

import { buildChordFreqs, type ChordVoicing } from "./tuning";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActiveVoice {
  gainNode: GainNode;
  oscs: OscillatorNode[];
  targetFreqs: number[];  // Hz of each partial when fully sounding
  startTime: number;
  rootHz: number;
}

// ── Partial recipe for the pad timbre ─────────────────────────────────────────
// Each entry: [frequencyMultiplier relative to fundamental, amplitude weight, waveform]
// Using a mix of sine and (soft) triangle partials for a warm, beating-free pad.

type WaveKind = "sine" | "triangle";
interface Partial { mult: number; amp: number; wave: WaveKind }

const PAD_PARTIALS: Partial[] = [
  { mult: 1,   amp: 0.55, wave: "sine" },
  { mult: 2,   amp: 0.20, wave: "sine" },
  { mult: 3,   amp: 0.10, wave: "triangle" },
  { mult: 4,   amp: 0.06, wave: "sine" },
  { mult: 5,   amp: 0.04, wave: "triangle" },
];

const ATTACK_S  = 0.65;
const RELEASE_S = 1.8;
const VOICE_GAIN = 0.18;   // per-chord voice level (4 voices → ~0.72 before compressor)

// ── Reverb impulse (synthetic Schroeder-style) ────────────────────────────────

function buildReverbImpulse(ctx: AudioContext, duration = 2.2, decay = 2.0): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.round(sr * duration);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // Exponentially decaying white noise → diffuse reverb tail
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

// ── SynthEngine ───────────────────────────────────────────────────────────────

export class SynthEngine {
  readonly ctx: AudioContext;
  private masterGain: GainNode;
  private reverbSend: GainNode;
  private compressor: DynamicsCompressorNode;
  private convolver: ConvolverNode;

  private voices: ActiveVoice[] = [];

  constructor() {
    this.ctx = new AudioContext();

    // Build signal chain: masterGain → compressor → destination
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 20;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    this.compressor.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.72;
    this.masterGain.connect(this.compressor);

    // Reverb convolver
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = buildReverbImpulse(this.ctx);
    this.convolver.connect(this.masterGain);

    // Reverb send (wet mix)
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(this.convolver);
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  /**
   * Play a chord. Releases any currently sounding voices with a short fade.
   */
  playChord(rootHz: number, voicing: ChordVoicing, useET: boolean): void {
    const now = this.ctx.currentTime;

    // Release existing voices
    for (const v of this.voices) {
      this.releaseVoice(v, now);
    }
    this.voices = [];

    // Build one voice per chord tone
    const freqs = buildChordFreqs(rootHz, voicing, useET);

    for (const fundamental of freqs) {
      const voice = this.buildPadVoice(fundamental, now);
      this.voices.push(voice);
    }
  }

  /**
   * Build a single pad voice: several partials → gainNode → master + reverb send
   */
  private buildPadVoice(fundamental: number, now: number): ActiveVoice {
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(VOICE_GAIN, now + ATTACK_S);
    gainNode.connect(this.masterGain);
    gainNode.connect(this.reverbSend);

    const oscs: OscillatorNode[] = [];
    const targetFreqs: number[] = [];

    for (const { mult, amp, wave } of PAD_PARTIALS) {
      const osc = this.ctx.createOscillator();
      osc.type = wave;
      osc.frequency.value = fundamental * mult;
      targetFreqs.push(fundamental * mult);

      const pGain = this.ctx.createGain();
      pGain.gain.value = amp;

      osc.connect(pGain);
      pGain.connect(gainNode);
      osc.start(now);
      oscs.push(osc);
    }

    return {
      gainNode,
      oscs,
      targetFreqs,
      startTime: now,
      rootHz: fundamental,
    };
  }

  private releaseVoice(voice: ActiveVoice, now: number): void {
    const { gainNode, oscs } = voice;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0, now + RELEASE_S);
    for (const osc of oscs) {
      try { osc.stop(now + RELEASE_S + 0.1); } catch { /* already stopped */ }
    }
  }

  releaseAll(): void {
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      this.releaseVoice(v, now);
    }
    this.voices = [];
  }

  /** Current voice frequencies — used by the visualiser */
  getVoiceFreqs(): number[] {
    return this.voices.map((v) => v.rootHz);
  }

  async close(): Promise<void> {
    this.releaseAll();
    await this.ctx.close();
  }
}
