// audio.ts — warm SATB pad synthesis with portamento voice-leading glides.
//
// Four sustained voices (Bass/Tenor/Alto/Soprano) each = a small detuned
// sine+triangle stack through a per-voice soft lowpass with slow vibrato. When
// the harmony engine re-voices the chord, only the moving voice(s) change pitch;
// every voice glides (portamento, ~120–300ms) so transitions are smooth, never
// clicky. A low root drone bed sits underneath for warmth.
//
// Master chain (per the lab rules, never harsh / never sudden-loud):
//   sumGain (≤0.28) → lowpass (~7kHz) → DynamicsCompressor → destination
//
// Synthesis is additive/subtractive (NOT granular). Soft attacks (≥40ms).

import { midiToHz, type Voicing } from "./harmony";

interface PadVoice {
  // two detuned oscillators per voice + a sub for the bass voice.
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  vibrato: OscillatorNode;
  vibratoGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  currentHz: number;
}

const VOICE_GAINS = [0.22, 0.16, 0.15, 0.17]; // bass, tenor, alto, soprano
const VOICE_GLIDE = [0.3, 0.22, 0.18, 0.14]; // seconds — lower voices glide slower

export class HarmonicRoom {
  readonly ctx: AudioContext;
  private master: GainNode;
  private masterLp: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private voices: PadVoice[] = [];
  private drone: { osc: OscillatorNode; sub: OscillatorNode; gain: GainNode } | null =
    null;
  private started = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -22;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.3;

    this.masterLp = this.ctx.createBiquadFilter();
    this.masterLp.type = "lowpass";
    this.masterLp.frequency.value = 7000;
    this.masterLp.Q.value = 0.5;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // fade in on start

    this.master.connect(this.masterLp);
    this.masterLp.connect(this.comp);
    this.comp.connect(this.ctx.destination);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;

    // four pad voices
    for (let i = 0; i < 4; i++) {
      const oscA = this.ctx.createOscillator();
      const oscB = this.ctx.createOscillator();
      oscA.type = "sine";
      oscB.type = i === 0 ? "sine" : "triangle";
      oscB.detune.value = 6 + i * 1.5; // gentle chorus

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = i === 0 ? 1200 : 2600 - i * 200;
      filter.Q.value = 0.4;

      const gain = this.ctx.createGain();
      gain.gain.value = VOICE_GAINS[i];

      // slow vibrato (LFO → detune)
      const vibrato = this.ctx.createOscillator();
      vibrato.type = "sine";
      vibrato.frequency.value = 0.18 + i * 0.05;
      const vibratoGain = this.ctx.createGain();
      vibratoGain.gain.value = 3.5; // cents-ish depth
      vibrato.connect(vibratoGain);
      vibratoGain.connect(oscA.detune);
      vibratoGain.connect(oscB.detune);

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      const startHz = midiToHz([41, 55, 62, 67][i]);
      oscA.frequency.value = startHz;
      oscB.frequency.value = startHz;

      oscA.start(now);
      oscB.start(now);
      vibrato.start(now);

      this.voices.push({
        oscA,
        oscB,
        vibrato,
        vibratoGain,
        filter,
        gain,
        currentHz: startHz,
      });
    }

    // warm root drone bed
    {
      const osc = this.ctx.createOscillator();
      const sub = this.ctx.createOscillator();
      osc.type = "sine";
      sub.type = "sine";
      const gain = this.ctx.createGain();
      gain.gain.value = 0.07;
      osc.connect(gain);
      sub.connect(gain);
      gain.connect(this.master);
      const f = midiToHz(29); // ~F1
      osc.frequency.value = f;
      sub.frequency.value = f / 2;
      osc.start(now);
      sub.start(now);
      this.drone = { osc, sub, gain };
    }

    // soft master fade-in (≥40ms, gentle)
    this.master.gain.setValueAtTime(0.0, now);
    this.master.gain.linearRampToValueAtTime(0.26, now + 1.2);
  }

  /** Re-voice the chord. Only changed voices move; all glide (portamento). */
  setVoicing(v: Voicing, nearEnergy: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const voice = this.voices[i];
      const targetHz = midiToHz(v.midi[i]);
      if (Math.abs(targetHz - voice.currentHz) < 0.01) continue;
      const glide = VOICE_GLIDE[i];
      // exponential glide = musical portamento; clamp to avoid 0 Hz.
      const safe = Math.max(20, targetHz);
      voice.oscA.frequency.cancelScheduledValues(now);
      voice.oscB.frequency.cancelScheduledValues(now);
      voice.oscA.frequency.setValueAtTime(Math.max(20, voice.currentHz), now);
      voice.oscB.frequency.setValueAtTime(Math.max(20, voice.currentHz), now);
      voice.oscA.frequency.exponentialRampToValueAtTime(safe, now + glide);
      voice.oscB.frequency.exponentialRampToValueAtTime(safe, now + glide);
      voice.currentHz = targetHz;
    }

    // openness: lean in opens the upper filters (brighter) + lifts soprano gain.
    const open = Math.max(0, Math.min(1, nearEnergy));
    for (let i = 1; i < 4; i++) {
      const f = this.voices[i].filter;
      const base = 2600 - i * 200;
      f.frequency.setTargetAtTime(base + open * 2200, now, 0.25);
    }
    // drone follows bass root for harmonic glue.
    if (this.drone) {
      const rootHz = midiToHz(v.midi[0]) / 2;
      this.drone.osc.frequency.setTargetAtTime(rootHz, now, 0.4);
      this.drone.sub.frequency.setTargetAtTime(rootHz / 2, now, 0.4);
    }
  }

  /** Per-frame shimmer: motion adds a touch of master brightness/attack. */
  setMotion(motion: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const cutoff = 6200 + Math.max(0, Math.min(1, motion)) * 2600;
    this.masterLp.frequency.setTargetAtTime(cutoff, now, 0.15);
  }

  close(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(0.0001, now + 0.25);
    } catch {
      /* noop */
    }
    const stopAll = () => {
      for (const v of this.voices) {
        try {
          v.oscA.stop();
          v.oscB.stop();
          v.vibrato.stop();
          v.oscA.disconnect();
          v.oscB.disconnect();
          v.vibrato.disconnect();
          v.vibratoGain.disconnect();
          v.filter.disconnect();
          v.gain.disconnect();
        } catch {
          /* noop */
        }
      }
      if (this.drone) {
        try {
          this.drone.osc.stop();
          this.drone.sub.stop();
          this.drone.osc.disconnect();
          this.drone.sub.disconnect();
          this.drone.gain.disconnect();
        } catch {
          /* noop */
        }
      }
      try {
        this.master.disconnect();
        this.masterLp.disconnect();
        this.comp.disconnect();
      } catch {
        /* noop */
      }
      this.ctx.close().catch(() => {});
    };
    // let the fade finish, then teardown.
    window.setTimeout(stopAll, 320);
  }
}
