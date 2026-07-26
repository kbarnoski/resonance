// Position-locked warm accompaniment (Web Audio).
//
// The accompaniment fires EVENT-DRIVEN from the DTW head crossing beat
// boundaries — never from a click track — so pads, bass and arps breathe with
// the singer's rubato. Everything is soft: layered/detuned oscillators → gentle
// lowpass → a delay "room" → a master gain capped at 0.15. Pitch is continuous
// log-frequency; nothing is snapped to a grid.
//
// The same engine can sonify the seeded virtual singer (a soft sung voice) so
// the headless demo is audible.

import type { ChordSeg } from "./reference";
import { midiToHz } from "./pitch";

export class Accompanist {
  private master: GainNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private wet: GainNode;

  // Persistent virtual-singer voice (created lazily).
  private voiceOsc?: OscillatorNode;
  private voiceOsc2?: OscillatorNode;
  private voiceGain?: GainNode;
  private voiceStarted = false;

  constructor(private ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0.15; // hard cap on total loudness
    this.master.connect(ctx.destination);

    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.26;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.32;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.5;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.master);
  }

  private send(node: AudioNode): void {
    node.connect(this.master);
    node.connect(this.delay);
  }

  /** Sustained pad in a warm triad. Spawn-and-forget with a slow swell + tail. */
  pad(chord: ChordSeg, when: number): void {
    const life = 3.6;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 1050;
    filt.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.05, when + 0.6);
    g.gain.setValueAtTime(0.05, when + life - 1.4);
    g.gain.exponentialRampToValueAtTime(0.0001, when + life);
    filt.connect(g);
    this.send(g);

    for (const midi of chord.padMidis) {
      const hz = midiToHz(midi);
      for (const detune of [-6, 7]) {
        const osc = this.ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = hz;
        osc.detune.value = detune;
        osc.connect(filt);
        osc.start(when);
        osc.stop(when + life + 0.05);
      }
    }
  }

  /** Rounded bass note under the chord. */
  bass(midi: number, when: number): void {
    const life = 2.0;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.09, when + 0.04);
    g.gain.exponentialRampToValueAtTime(0.02, when + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, when + life);
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiToHz(midi);
    osc.connect(filt);
    filt.connect(g);
    this.send(g);
    osc.start(when);
    osc.stop(when + life + 0.05);
  }

  /** Short bell-ish arp pluck fired on each beat crossing. */
  arp(midi: number, when: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.05, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.45);
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiToHz(midi);
    osc.connect(g);
    this.send(g);
    osc.start(when);
    osc.stop(when + 0.5);
  }

  /** Continuous sung voice for the virtual performer. `midi = null` → silence. */
  setVoice(midi: number | null): void {
    if (!this.voiceStarted) {
      const filt = this.ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 1500;
      filt.Q.value = 0.8;
      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = 0.0001;
      this.voiceOsc = this.ctx.createOscillator();
      this.voiceOsc.type = "sawtooth";
      this.voiceOsc2 = this.ctx.createOscillator();
      this.voiceOsc2.type = "triangle";
      this.voiceOsc2.detune.value = 6;
      this.voiceOsc.connect(filt);
      this.voiceOsc2.connect(filt);
      filt.connect(this.voiceGain);
      this.send(this.voiceGain);
      const t0 = this.ctx.currentTime;
      this.voiceOsc.start(t0);
      this.voiceOsc2.start(t0);
      this.voiceStarted = true;
    }
    const now = this.ctx.currentTime;
    const g = this.voiceGain!;
    if (midi === null) {
      g.gain.setTargetAtTime(0.0001, now, 0.03);
    } else {
      const hz = midiToHz(midi);
      this.voiceOsc!.frequency.setTargetAtTime(hz, now, 0.02);
      this.voiceOsc2!.frequency.setTargetAtTime(hz, now, 0.02);
      g.gain.setTargetAtTime(0.06, now, 0.03);
    }
  }

  dispose(): void {
    try {
      const now = this.ctx.currentTime;
      this.voiceOsc?.stop(now + 0.05);
      this.voiceOsc2?.stop(now + 0.05);
    } catch {
      // already stopped
    }
    try {
      this.master.disconnect();
    } catch {
      // already disconnected
    }
  }
}
