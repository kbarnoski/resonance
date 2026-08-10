// audio.ts — the ambient synth for 9560 · Handflux, driven by the FLOW near the
// hands, routed through the shared ear-safety master bus.
//
// Mapping (flow drives sound, not just static position):
//   hand height        → register / root note
//   flow SPEED near a hand (how fast it stirs) → voice swell + shimmer depth
//   two-hand distance  → reverb wet depth + brightness
//   density near hands → lowpass filter cutoff
//   pinch              → plucked note (with the visual burst)
//   fast downward sweep → an ACCENT: louder, brighter transient
//
// Additive harmonic + shimmer bed with a slow cosmic attack; plucks/accents are
// faster. Everything feeds createSafeMaster — no hand-rolled limiter.

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { mulberry32 } from "./rng";

// Two-octave minor-pentatonic (semitones) for an always-consonant register sweep.
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
const ROOT = 110; // A2

function heightToFreq(height: number): number {
  const h = Math.max(0, Math.min(1, height));
  const idx = Math.min(SCALE.length - 1, Math.floor(h * SCALE.length));
  return ROOT * Math.pow(2, SCALE[idx] / 12);
}

export interface HandFlow {
  active: boolean;
  x: number; // 0 left → 1 right
  height: number; // 0 bottom → 1 top
  flowSpeed: number; // stir speed near the hand, 0..~1
}

export interface FlowState {
  hands: [HandFlow, HandFlow];
  handDistance: number; // 0..~1.4 between the two hands (0 if <2 present)
  density: number; // proxy for particle density near hands, 0..1
}

interface HandVoice {
  osc: OscillatorNode;
  harm: OscillatorNode;
  shimmer: OscillatorNode;
  shimmerGain: GainNode;
  gain: GainNode;
  lp: BiquadFilterNode;
  pan: StereoPannerNode;
  send: GainNode;
}

function makeReverbIR(ctx: AudioContext, seconds: number, seed: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  const rng = mulberry32(seed);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      data[i] = (rng() * 2 - 1) * decay;
    }
  }
  return buf;
}

export class HandfluxAudio {
  private ctx: AudioContext;
  private master: SafeMaster;
  private hands: HandVoice[] = [];
  private reverb: ConvolverNode;
  private reverbWet: GainNode;
  private reverbTone: BiquadFilterNode;
  private running = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.master = createSafeMaster(this.ctx, { gain: 0.18 });

    // Shared reverb — wet level & tone track two-hand distance.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = makeReverbIR(this.ctx, 3.2, 0x9560);
    this.reverbTone = this.ctx.createBiquadFilter();
    this.reverbTone.type = "lowpass";
    this.reverbTone.frequency.value = 1400;
    this.reverbWet = this.ctx.createGain();
    this.reverbWet.gain.value = 0;
    this.reverb.connect(this.reverbTone);
    this.reverbTone.connect(this.reverbWet);
    this.reverbWet.connect(this.master.input);

    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = ROOT;
      const harm = this.ctx.createOscillator();
      harm.type = "sine";
      harm.frequency.value = ROOT * 2;
      const shimmer = this.ctx.createOscillator();
      shimmer.type = "sine";
      shimmer.frequency.value = ROOT * 4;
      shimmer.detune.value = i === 0 ? 6 : -6;

      const shimmerGain = this.ctx.createGain();
      shimmerGain.gain.value = 0.0;
      const harmGain = this.ctx.createGain();
      harmGain.gain.value = 0.25;

      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 700;
      lp.Q.value = 0.6;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = i === 0 ? -0.5 : 0.5;
      const send = this.ctx.createGain();
      send.gain.value = 0.5;

      osc.connect(gain);
      harm.connect(harmGain);
      harmGain.connect(gain);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(gain);
      gain.connect(lp);
      lp.connect(pan);
      pan.connect(this.master.input);
      pan.connect(send);
      send.connect(this.reverb);

      osc.start();
      harm.start();
      shimmer.start();
      this.hands.push({ osc, harm, shimmer, shimmerGain, gain, lp, pan, send });
    }
  }

  get contextState(): AudioContextState {
    return this.ctx.state;
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.running = true;
  }

  /** Continuous flow-driven update, called every frame. */
  update(state: FlowState): void {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const v = this.hands[i];
      const h = state.hands[i];
      const target = h.active ? 0.14 + h.flowSpeed * 0.12 : 0;
      // slow cosmic attack for the bed
      v.gain.gain.setTargetAtTime(target, t, h.active ? 0.5 : 0.8);
      if (h.active) {
        const freq = heightToFreq(h.height);
        v.osc.frequency.setTargetAtTime(freq, t, 0.25);
        v.harm.frequency.setTargetAtTime(freq * 2, t, 0.25);
        v.shimmer.frequency.setTargetAtTime(freq * 4, t, 0.25);
        v.pan.pan.setTargetAtTime(h.x * 2 - 1, t, 0.15);
        // density near hands → filter cutoff
        const cutoff = 500 + state.density * 2600 + h.flowSpeed * 1200;
        v.lp.frequency.setTargetAtTime(cutoff, t, 0.2);
        // flow speed → shimmer depth
        v.shimmerGain.gain.setTargetAtTime(h.flowSpeed * 0.12, t, 0.3);
      }
    }
    // two-hand distance → reverb depth + brightness
    const dist = Math.max(0, Math.min(1, state.handDistance / 1.1));
    this.reverbWet.gain.setTargetAtTime(0.12 + dist * 0.5, t, 0.4);
    this.reverbTone.frequency.setTargetAtTime(900 + dist * 3200, t, 0.4);
  }

  /** Pinch → a plucked note placed by hand position. */
  pluck(x: number, height: number, strength: number): void {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const freq = heightToFreq(height) * 2;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    const peak = 0.12 + strength * 0.1;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.9);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = x * 2 - 1;
    osc.connect(g);
    g.connect(lp);
    lp.connect(pan);
    pan.connect(this.master.input);
    pan.connect(this.reverb);
    osc.start(t);
    osc.stop(t + 1.2);
  }

  /** Fast downward sweep → a louder, brighter transient ACCENT. */
  accent(x: number, height: number, strength: number): void {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const base = heightToFreq(height);
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(base * 2, t);
    osc.frequency.exponentialRampToValueAtTime(base, t + 0.4);
    const g = this.ctx.createGain();
    const peak = 0.16 + strength * 0.16;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.7);
    lp.Q.value = 1.2;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = x * 2 - 1;
    osc.connect(g);
    g.connect(lp);
    lp.connect(pan);
    pan.connect(this.master.input);
    pan.connect(this.reverb);
    osc.start(t);
    osc.stop(t + 1.0);
  }

  stop(): void {
    this.running = false;
    const t = this.ctx.currentTime;
    for (const v of this.hands) {
      try {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setTargetAtTime(0, t, 0.2);
      } catch {
        /* closing */
      }
    }
    window.setTimeout(() => {
      try {
        this.master.disconnect();
        void this.ctx.close();
      } catch {
        /* already closed */
      }
    }, 400);
  }
}
