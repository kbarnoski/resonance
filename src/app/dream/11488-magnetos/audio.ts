// audio.ts — the magnetosphere as an evolving drone. Every voice runs through a
// master limiter before the destination; nothing touches ctx.destination raw.
//
// Mapping (musical, not a meter):
//  • solar-wind speed  → filter cutoff + root glide (opens the harmony up)
//  • proton density    → granular noise bed (grain/turbulence)
//  • southward Bz      → downward detune tension on the harmony
//  • Kp                → shimmer: upper partials + a slow Shepard-ish rise
//  • X-ray flare       → a soft bright bell + swell (ramped, never a stab)
// Fixed natural-minor scale; the ROOT glides with the storm's build.

import type { Drive } from "./mapping";

// A-minor-ish drone degrees (Hz), one low octave; root glides between them.
const ROOTS = [55.0, 61.74, 65.41, 73.42]; // A1, B1, C2, D2

interface Partial {
  osc: OscillatorNode;
  gain: GainNode;
  ratio: number;
}

export class MagnetoAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private filter: BiquadFilterNode;

  private partials: Partial[] = [];
  private detune: number = 0;

  private noiseSrc: AudioBufferSourceNode | null = null;
  private noiseBP: BiquadFilterNode;
  private noiseGain: GainNode;

  private shimmer: OscillatorNode[] = [];
  private shimmerGain: GainNode;

  // Shepard-ish rising layer
  private rise: { osc: OscillatorNode; gain: GainNode }[] = [];
  private riseBus: GainNode;
  private riseBase: number = 110;

  private started = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const c = this.ctx;

    // master chain: everything → filter → master gain → limiter → destination
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 14;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;

    this.master = c.createGain();
    this.master.gain.value = 0.0; // fade in on start

    this.filter = c.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 500;
    this.filter.Q.value = 0.8;

    this.filter.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(c.destination);

    // granular noise bed
    this.noiseBP = c.createBiquadFilter();
    this.noiseBP.type = "bandpass";
    this.noiseBP.frequency.value = 800;
    this.noiseBP.Q.value = 0.7;
    this.noiseGain = c.createGain();
    this.noiseGain.gain.value = 0;
    this.noiseBP.connect(this.noiseGain);
    this.noiseGain.connect(this.filter);

    // shimmer bus (upper partials)
    this.shimmerGain = c.createGain();
    this.shimmerGain.gain.value = 0;
    this.shimmerGain.connect(this.master); // shimmer bypasses the lowpass

    // rising Shepard bus
    this.riseBus = c.createGain();
    this.riseBus.gain.value = 0;
    this.riseBus.connect(this.master);
  }

  get context(): AudioContext {
    return this.ctx;
  }

  async start(rand: () => number): Promise<void> {
    if (this.started) return;
    this.started = true;
    const c = this.ctx;
    if (c.state === "suspended") await c.resume();
    const t = c.currentTime;

    // drone partials over the root
    const ratios = [1, 1.5, 2, 3, 4.02];
    const gains = [0.5, 0.28, 0.2, 0.12, 0.07];
    ratios.forEach((r, i) => {
      const osc = c.createOscillator();
      osc.type = i < 2 ? "sawtooth" : "sine";
      osc.frequency.value = ROOTS[0] * r;
      const g = c.createGain();
      g.gain.value = gains[i];
      osc.connect(g);
      g.connect(this.filter);
      osc.start(t);
      this.partials.push({ osc, gain: g, ratio: r });
    });

    // noise buffer (pink-ish) for the granular bed
    const len = Math.floor(c.sampleRate * 2);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const wnoise = rand() * 2 - 1;
      last = (last + 0.02 * wnoise) / 1.02;
      d[i] = last * 3.5;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.noiseBP);
    src.start(t);
    this.noiseSrc = src;

    // shimmer partials (high, add on Kp)
    [6.01, 8.03, 10.98, 12.02].forEach((r) => {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = ROOTS[0] * r;
      const g = c.createGain();
      g.gain.value = 0.05;
      osc.connect(g);
      g.connect(this.shimmerGain);
      osc.start(t);
      this.shimmer.push(osc);
    });

    // Shepard-ish rising layer: 4 octave-spaced oscillators gliding upward,
    // amplitude-windowed over log frequency so the rise never "arrives".
    for (let i = 0; i < 4; i++) {
      const osc = c.createOscillator();
      osc.type = "triangle";
      const g = c.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(this.riseBus);
      osc.start(t);
      this.rise.push({ osc, gain: g });
    }

    // fade master up to a calm level
    this.master.gain.setTargetAtTime(0.16, t, 1.2);
  }

  /** Called ~each frame with smoothed drive params. */
  update(d: Drive, memory: number): void {
    if (!this.started) return;
    const c = this.ctx;
    const t = c.currentTime;
    const tau = 0.15;

    // root glides up the scale as the storm builds
    const idx = Math.min(
      ROOTS.length - 1,
      Math.floor(d.level * ROOTS.length * 0.999),
    );
    const root = ROOTS[idx];

    // southward Bz → downward detune tension (cents)
    this.detune = -d.south * 22 - (memory * 8);

    this.partials.forEach((p) => {
      p.osc.frequency.setTargetAtTime(root * p.ratio, t, 0.3);
      p.osc.detune.setTargetAtTime(this.detune, t, tau);
    });

    // speed opens the filter
    const cutoff = 260 + d.flow * 2600 + d.level * 900;
    this.filter.frequency.setTargetAtTime(cutoff, t, tau);

    // density → granular noise
    this.noiseGain.gain.setTargetAtTime(0.02 + d.thickness * 0.16, t, tau);
    this.noiseBP.frequency.setTargetAtTime(500 + d.flow * 2500, t, tau);

    // Kp → shimmer + upper-partial energy; keep partials locked to root ratios
    this.shimmerGain.gain.setTargetAtTime(d.kp * 0.09 * (0.6 + memory), t, tau);
    const sr = [6.01, 8.03, 10.98, 12.02];
    this.shimmer.forEach((o, i) => {
      o.frequency.setTargetAtTime(root * sr[i], t, 0.5);
    });

    // Shepard rise gain follows the build (breakthrough tension)
    this.riseBus.gain.setTargetAtTime(d.level * 0.11, t, 0.4);

    // overall calm ceiling: nudge master with level but stay safe
    this.master.gain.setTargetAtTime(0.14 + d.level * 0.06, t, 0.6);
  }

  /** Advance the Shepard glide; call each frame with dt seconds. */
  tickRise(dt: number, level: number): void {
    if (!this.started || this.rise.length === 0) return;
    const c = this.ctx;
    const t = c.currentTime;
    const rate = 0.03 + level * 0.05; // octaves per second
    this.riseBase *= Math.pow(2, rate * dt);
    if (this.riseBase > 220) this.riseBase /= 2; // wrap an octave
    this.rise.forEach((r, i) => {
      const f = this.riseBase * Math.pow(2, i);
      // window over audible log-range: peak mid, fade at edges
      const lf = Math.log2(f / 55) / Math.log2(3520 / 55); // 0..1
      const win = Math.exp(-Math.pow((lf - 0.5) / 0.34, 2));
      r.osc.frequency.setTargetAtTime(f, t, 0.05);
      r.gain.gain.setTargetAtTime(win * 0.5, t, 0.1);
    });
  }

  /**
   * Flare → a soft bright bell swell. `intensity` 0..1. The amplitude ramps up
   * over ≥350ms and rings out — never a hard transient (audio-safe, matches
   * the visual reconnection burst).
   */
  triggerFlare(intensity: number): void {
    if (!this.started) return;
    const c = this.ctx;
    const t = c.currentTime;
    const amp = 0.05 + intensity * 0.12;

    // bell = carrier + inharmonic partials with an exp swell/decay
    const carrier = 440 * (1 + intensity * 0.5);
    [1, 2.76, 5.4].forEach((r, i) => {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = carrier * r;
      const g = c.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(this.master);
      const a0 = amp * (i === 0 ? 1 : 0.4 / i);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(a0, t + 0.35); // ramp ≥300ms
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2 + i);
      osc.start(t);
      osc.stop(t + 3.4 + i);
      osc.onended = () => {
        g.disconnect();
      };
    });
  }

  stop(): void {
    const c = this.ctx;
    const t = c.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.0001, t, 0.15);
    } catch {
      /* noop */
    }
    const stopOsc = (o: OscillatorNode) => {
      try {
        o.stop(t + 0.4);
      } catch {
        /* already stopped */
      }
    };
    this.partials.forEach((p) => stopOsc(p.osc));
    this.shimmer.forEach(stopOsc);
    this.rise.forEach((r) => stopOsc(r.osc));
    try {
      this.noiseSrc?.stop(t + 0.4);
    } catch {
      /* noop */
    }
    setTimeout(() => {
      try {
        this.master.disconnect();
        this.limiter.disconnect();
        this.filter.disconnect();
        this.noiseGain.disconnect();
        this.shimmerGain.disconnect();
        this.riseBus.disconnect();
      } catch {
        /* noop */
      }
      if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
    }, 500);
  }
}
