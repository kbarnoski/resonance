// audio.ts — the spatial Web Audio instrument for 1590 · Body Mirror.
//
// The body is the controller. Each hand owns a continuous, breathing voice
// whose PITCH follows hand HEIGHT and whose STEREO POSITION follows hand X
// through a real StereoPannerNode. Raising both hands swells a warm pad chord.
// A pinch fires a plucked note placed in 3-D space through a real PannerNode.
//
// Signal path:
//   hand voice osc  → gain → StereoPannerNode ┐
//   pad oscillators → padGain ────────────────┼→ master(≤0.26) → limiter → out
//   pluck osc → env → PannerNode(HRTF) ────────┘
//
// Everything is synthesised (no samples). Master is capped behind a limiter
// and faded on start/stop; every node is torn down on stop().

const ROOT = 220; // A3
// Minor-pentatonic degrees (semitones) — warm, always-consonant.
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];

function midiRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/** Map a normalized height (0 = bottom, 1 = top) to a scale frequency. */
function heightToFreq(height: number): number {
  const h = Math.max(0, Math.min(1, height));
  const idx = Math.min(SCALE.length - 1, Math.floor(h * SCALE.length));
  return ROOT * midiRatio(SCALE[idx]);
}

interface HandVoice {
  osc: OscillatorNode;
  sub: OscillatorNode;
  gain: GainNode;
  pan: StereoPannerNode;
}

export class BodyAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private hands: HandVoice[] = [];
  private padOscs: OscillatorNode[] = [];
  private padGain: GainNode;
  private running = false;
  private lastPluck: number[] = [0, 0];

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;

    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // Two continuous hand voices.
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = ROOT;
      const sub = this.ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = ROOT / 2;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = i === 0 ? -0.6 : 0.6;
      osc.connect(gain);
      sub.connect(gain);
      gain.connect(pan);
      pan.connect(this.master);
      osc.start();
      sub.start();
      this.hands.push({ osc, sub, gain, pan });
    }

    // Warm pad — a stacked chord that swells when both hands rise.
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0;
    this.padGain.connect(this.master);
    const chord = [0, 7, 10, 15, 19]; // root, 5th, m7, 9th, higher
    for (const semi of chord) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = ROOT * midiRatio(semi);
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = this.ctx.createGain();
      g.gain.value = 0.14;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      o.connect(g);
      g.connect(lp);
      lp.connect(this.padGain);
      o.start();
      this.padOscs.push(o);
    }
  }

  get contextState(): AudioContextState {
    return this.ctx.state;
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.running = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.26, t + 1.4);
  }

  /** Continuous per-hand update, called every frame.
   *  x: 0 (left) → 1 (right); height: 0 (bottom) → 1 (top). */
  setHand(index: number, present: boolean, x: number, height: number): void {
    const v = this.hands[index];
    if (!v) return;
    const t = this.ctx.currentTime;
    const target = present ? 0.16 : 0;
    v.gain.gain.setTargetAtTime(target, t, 0.08);
    if (present) {
      const freq = heightToFreq(height);
      v.osc.frequency.setTargetAtTime(freq, t, 0.06);
      v.sub.frequency.setTargetAtTime(freq / 2, t, 0.06);
      v.pan.pan.setTargetAtTime(x * 2 - 1, t, 0.05);
    }
  }

  /** Both-hands-raised chord swell, 0 → 1. */
  setSwell(amount: number): void {
    const t = this.ctx.currentTime;
    this.padGain.gain.setTargetAtTime(Math.max(0, Math.min(1, amount)) * 0.5, t, 0.2);
  }

  /** Fire a spatially-placed plucked note. x/y are normalized screen coords. */
  pluck(index: number, x: number, y: number): void {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    // Debounce per hand so a held pinch doesn't machine-gun.
    if (now - (this.lastPluck[index] ?? 0) < 0.14) return;
    this.lastPluck[index] = now;

    const height = 1 - y;
    const freq = heightToFreq(height) * 2; // an octave up — bright pluck

    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const osc2 = this.ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2.001;

    const env = this.ctx.createGain();
    env.gain.value = 0;

    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    // Place the pluck in space: X left↔right, Y up↔down, slightly in front.
    const px = (x * 2 - 1) * 4;
    const py = (0.5 - y) * 3;
    if (panner.positionX) {
      panner.positionX.setValueAtTime(px, now);
      panner.positionY.setValueAtTime(py, now);
      panner.positionZ.setValueAtTime(-1.5, now);
    } else {
      // Older Safari fallback.
      panner.setPosition(px, py, -1.5);
    }

    osc.connect(env);
    osc2.connect(env);
    env.connect(panner);
    panner.connect(this.master);

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.5, now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0008, now + 1.1);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 1.2);
    osc2.stop(now + 1.2);
    osc.onended = () => {
      osc.disconnect();
      osc2.disconnect();
      env.disconnect();
      panner.disconnect();
    };
  }

  stop(): void {
    if (!this.running) {
      void this.ctx.close();
      return;
    }
    this.running = false;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.4);
    window.setTimeout(() => {
      for (const v of this.hands) {
        try {
          v.osc.stop();
          v.sub.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const o of this.padOscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
      void this.ctx.close();
    }, 500);
  }
}
