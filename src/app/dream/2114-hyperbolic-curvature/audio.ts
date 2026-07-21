// ─────────────────────────────────────────────────────────────────────────────
// 2114 · Hyperbolic Curvature — Web Audio FM voice engine.
//
// Struck / plucked voices via 2-operator FM synthesis (carrier + harmonic
// modulator, integer ratio → harmonic, musical spectrum). Pitches come from a
// JUST major-pentatonic scale mapped across the computer keyboard, NOT the
// banned inharmonic Chladni ratio set. A short percussive envelope with a
// decaying modulation index gives a jeweled mallet/pluck timbre.
//
// A tiny feedback-delay "shimmer" gives the field some air. Master bus ends in
// a soft WaveShaper limiter so stacked chords never clip.
// ─────────────────────────────────────────────────────────────────────────────

// Just major pentatonic ratios (1, 9/8, 5/4, 3/2, 5/3) — clean, musical.
const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const BASE_HZ = 174.61; // ~F3, warm floor

/** Deterministic PRNG for the autopilot — never Math.random / Date.now. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Frequency for scale degree `i` (0-based) across stacked pentatonic octaves. */
export function freqForDegree(i: number): number {
  const octave = Math.floor(i / PENTA.length);
  const step = ((i % PENTA.length) + PENTA.length) % PENTA.length;
  return BASE_HZ * PENTA[step] * Math.pow(2, octave);
}

/** Normalized pitch 0..1 across the playable range (for the shader palette). */
export function pitchNorm(i: number, total: number): number {
  return total <= 1 ? 0.5 : i / (total - 1);
}

export class HyperbolicAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private shimmerIn: GainNode;

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;

    // soft limiter so chords + autopilot never clip
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = makeSoftCurve();
    shaper.oversample = "2x";

    // feedback-delay shimmer (gentle air, not a wash)
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.26;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.34;
    const damp = this.ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2600;
    this.shimmerIn = this.ctx.createGain();
    this.shimmerIn.gain.value = 0.5;

    this.shimmerIn.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(this.master);

    this.master.connect(shaper);
    shaper.connect(this.ctx.destination);
  }

  resume(): Promise<void> {
    return this.ctx.state === "suspended"
      ? this.ctx.resume()
      : Promise.resolve();
  }

  /** Strike one FM voice. velocity 0..1. Returns nothing (voices self-release). */
  strike(freq: number, velocity = 0.9): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vel = Math.max(0.05, Math.min(1, velocity));

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 2.0; // integer ratio → harmonic, musical FM

    // decaying modulation index → bright attack, mellow tail (pluck/mallet)
    const modGain = ctx.createGain();
    const idxStart = freq * (2.4 + vel * 2.2);
    modGain.gain.setValueAtTime(idxStart, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.35, t + 0.35);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + 1.4);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // amplitude envelope — fast strike, exponential decay
    const amp = ctx.createGain();
    const peak = 0.22 * vel;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);

    // gentle per-voice tilt so highs don't get harsh
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = Math.min(9000, freq * 8);

    carrier.connect(amp);
    amp.connect(tone);
    tone.connect(this.master);
    tone.connect(this.shimmerIn);

    carrier.start(t);
    mod.start(t);
    carrier.stop(t + 2.0);
    mod.stop(t + 2.0);
  }

  dispose(): void {
    try {
      this.master.disconnect();
    } catch {
      /* already gone */
    }
    if (this.ctx.state !== "closed") {
      void this.ctx.close();
    }
  }
}

function makeSoftCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6);
  }
  return curve;
}
