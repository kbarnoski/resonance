// ─────────────────────────────────────────────────────────────────────────────
// 5816-astrolabe · resonant voices
//
// Each star is a plucked resonant string built with a Karplus–Strong feedback
// loop: a brief burst of (seeded) noise is injected into a delay line tuned to
// the pitch's period, fed back through a low-pass so the tone decays from bright
// to dark — the characteristic "plucked / bowed string" timbre. Crossing a star
// with the beam plucks it; how centred the beam is sets how loud and how long it
// rings. Under everything sits a barely-there just-tuned drone so the sky is
// never truly silent.
//
// Determinism: excitation noise is drawn from a fixed-seed mulberry32. Timing
// uses ctx.currentTime / setTimeout (wall-clock teardown), never Date.now in
// render logic. No Math.random.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, clamp01 } from "./rng";

const BASE_DRONE = 130.81; // C3

export class AstrolabeAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private spaceIn: GainNode;
  private noise: () => number;
  private drone: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;
  private muted = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.noise = mulberry32(0x5816);

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    // A soft, short feedback "space" — celestial reverb tail without a convolver.
    this.spaceIn = ctx.createGain();
    this.spaceIn.gain.value = 0.28;
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2600;
    this.spaceIn.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(this.master);

    this.master.connect(ctx.destination);
  }

  start(): void {
    if (this.droneGain) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 2.5); // fade the drone in
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 620;
    // slow filter breathing — well under 3 Hz, contemplative
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    // tonic + just fifth, faintly detuned for a slow shimmer
    for (const [ratio, det] of [
      [1, 0],
      [1.5, 0.6],
      [2, -0.5],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = BASE_DRONE * ratio;
      o.detune.value = det;
      o.connect(g);
      o.start();
      this.drone.push(o);
    }
    this.drone.push(lfo);
    g.connect(lp);
    lp.connect(this.master);
    this.droneGain = g;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, t, 0.05);
  }

  /**
   * Pluck a resonant string.
   * @param freq   pitch in Hz
   * @param amp    0..1 — how centred the beam was on the star
   */
  pluck(freq: number, amp: number): void {
    if (this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const a = clamp01(amp);
    const period = 1 / freq;

    // Feedback closer to 1 for lower notes → long sustain; higher notes decay
    // faster and stay bright but brief (twinkling high stars).
    const feedback = freq < 400 ? 0.988 : freq < 900 ? 0.978 : 0.965;
    const decaySec = freq < 400 ? 5.5 : freq < 900 ? 3.2 : 2.0;

    // --- excitation: a few ms of seeded noise ---
    const burstLen = 0.012;
    const n = Math.max(1, Math.ceil(ctx.sampleRate * burstLen));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const w = 1 - i / n; // fade the burst
      data[i] = (this.noise() * 2 - 1) * w;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    // --- Karplus–Strong loop ---
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = period;
    const loopLp = ctx.createBiquadFilter();
    loopLp.type = "lowpass";
    loopLp.frequency.value = Math.min(freq * 6 + 800, 9000);
    const fb = ctx.createGain();
    fb.gain.value = feedback;

    src.connect(delay);
    delay.connect(loopLp);
    loopLp.connect(fb);
    fb.connect(delay);

    // --- amplitude shaping ---
    const out = ctx.createGain();
    const peak = 0.16 + 0.5 * a;
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, now + decaySec);

    delay.connect(out);
    out.connect(this.master);
    out.connect(this.spaceIn);

    src.start(now);
    src.stop(now + burstLen);

    const life = (decaySec + 0.3) * 1000;
    setTimeout(() => {
      try {
        src.disconnect();
        delay.disconnect();
        loopLp.disconnect();
        fb.disconnect();
        out.disconnect();
      } catch {
        // already torn down
      }
    }, life);
  }

  stop(): void {
    const t = this.ctx.currentTime;
    if (this.droneGain) {
      this.droneGain.gain.setTargetAtTime(0, t, 0.2);
    }
    const drone = this.drone;
    this.drone = [];
    setTimeout(() => {
      for (const o of drone) {
        try {
          o.stop();
          o.disconnect();
        } catch {
          // ignore
        }
      }
    }, 600);
    this.droneGain = null;
  }
}
