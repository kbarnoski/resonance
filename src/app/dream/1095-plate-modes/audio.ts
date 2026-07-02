// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — modal resonator bank driven by the SAME plate field as the visual.
//
//   One sine voice per spatial eigenmode φ_mn (see modes.ts). Its pitch is fixed
//   at f = F0·√(m²+n²) — the plate's own modal frequency — and its LOUDNESS is
//   the amplitude with which that mode is currently present in the field, read
//   back from the GPU every frame and projected onto the eigenbasis. So the plate
//   literally sings the modes whose nodal lines you see. As the swept driver rings
//   up successive modes, the visible figure reorganizes and the chord shifts with
//   it. A tap adds a bright noise-burst strike that rings and decays with the
//   plate's damping. Everything sums through a soft-clip bus so nothing clips.
// ─────────────────────────────────────────────────────────────────────────────

import { MODES } from "./modes";

const F0 = 104; // plate fundamental (Hz); modal voices sit at F0·√(m²+n²)

function makeSoftClipCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(1.6 * x);
  }
  return c;
}

export class PlateAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private bus: GainNode;
  private shaper: WaveShaperNode;
  private oscs: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private sub: OscillatorNode | null = null;
  private subGain: GainNode;
  private started = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // soft-clip safety bus
    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = makeSoftClipCurve();
    this.shaper.oversample = "2x";
    this.shaper.connect(this.master);

    this.bus = this.ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(this.shaper);

    // one voice per eigenmode
    for (const mode of MODES) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = Math.min(8000, F0 * mode.q);
      const g = this.ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(this.bus);
      this.oscs.push(osc);
      this.gains.push(g);
    }

    // gentle sub for body (the plate fundamental)
    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0;
    this.subGain.connect(this.bus);
    this.sub = this.ctx.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = F0;
    this.sub.connect(this.subGain);
  }

  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.started) return;
    this.started = true;
    for (const o of this.oscs) o.start();
    if (this.sub) this.sub.start();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(0.85, now + 1.1);
  }

  get running(): boolean {
    return this.started && this.ctx.state === "running";
  }

  /**
   * Set each modal voice's loudness from the projected modal amplitudes.
   * `amps` is |c_mn| per mode (same order as MODES); `activity` is the overall
   * plate vibration level (0..1). Voices are distributed proportionally so the
   * mix follows the field without ever summing to a clipping level.
   */
  update(amps: Float32Array, activity: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    let sum = 0;
    for (let k = 0; k < amps.length; k++) sum += amps[k];
    const inv = sum > 1e-6 ? 1 / sum : 0;

    // overall level: compressed function of energy, keeps idle quiet-alive
    const level = 0.06 + 0.5 * Math.min(1, activity);

    for (let k = 0; k < this.gains.length; k++) {
      const share = amps[k] * inv; // 0..1, sums to ~1
      const target = level * share;
      this.gains[k].gain.setTargetAtTime(target, now, 0.08);
    }
    this.subGain.gain.setTargetAtTime(0.10 * Math.min(1, activity), now, 0.12);
  }

  /** A physical strike: bright transient + ring that decays with `decay` (s). */
  strike(intensity: number, decay: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const amp = Math.min(0.7, 0.25 + intensity * 0.5);

    // short noise burst through a resonant bandpass = the "tap" click/ring
    const len = Math.floor(this.ctx.sampleRate * 0.35);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900 + Math.random() * 1400;
    bp.Q.value = 6;

    const g = this.ctx.createGain();
    const ring = Math.max(0.12, Math.min(1.6, decay));
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0004, now + ring);

    src.connect(bp).connect(g).connect(this.bus);
    src.start(now);
    src.stop(now + ring + 0.05);
    src.onended = () => {
      try {
        src.disconnect();
        bp.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  dispose(): void {
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.12);
    } catch {
      /* ignore */
    }
    const stop = () => {
      for (const o of this.oscs) {
        try {
          o.stop();
        } catch {
          /* not started */
        }
      }
      try {
        this.sub?.stop();
      } catch {
        /* not started */
      }
      this.ctx.close().catch(() => {
        /* ignore */
      });
    };
    window.setTimeout(stop, 200);
  }
}
