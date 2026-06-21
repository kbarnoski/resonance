// ── Waveguide Mesh · audio engine ──────────────────────────────────────────
// Primary path: an AudioWorklet running a real audio-rate 2-D FDTD membrane.
// The worklet IS the sound (pickup-node displacement) and posts the displacement
// field to the main thread so the canvas shows exactly what you hear.
//
// Fallback path (no AudioWorklet): a matched modal-resonator bank — damped sine
// partials at the membrane's eigenfrequencies, excited per strike — paired with
// a main-thread control-rate FDTD mesh that drives the SAME field callback, so
// the visual stays coupled to the audio even in fallback.
//
// Master chain: master gain → lowpass (≤12 kHz safety) → DynamicsCompressor →
// destination.

import { WORKLET_SOURCE } from "./worklet-source";
import {
  NX,
  NY,
  N,
  midiToTension,
  midiToDamping,
  midiToFreq,
  clamp,
} from "./mesh";

export type FieldCallback = (field: Float32Array, nx: number, ny: number, level: number) => void;

export interface StrikeOpts {
  midi: number;
  velocity: number; // 0..1
  x?: number; // fractional 0..1; default centred-ish
  y?: number;
}

export class MeshAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private blobUrl: string | null = null;

  // fallback state
  private useFallback = false;
  private fallbackMesh: FallbackMesh | null = null;

  private fieldCb: FieldCallback | null = null;
  ready = false;
  mode: "worklet" | "fallback" | "none" = "none";

  onField(cb: FieldCallback) {
    this.fieldCb = cb;
  }

  async init(): Promise<void> {
    if (this.ready) {
      if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }

    const Ctor =
      (window.AudioContext as typeof AudioContext) ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    // Master chain.
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 12000;
    lowpass.Q.value = 0.4;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 24;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    master.connect(lowpass).connect(comp).connect(ctx.destination);
    this.master = master;
    this.lowpass = lowpass;
    this.comp = comp;

    // Try the AudioWorklet (real audio-rate mesh).
    let workletOk = false;
    if (ctx.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        this.blobUrl = url;
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, "waveguide-mesh-processor", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        node.port.onmessage = (e: MessageEvent) => {
          const m = e.data as { type: string; nx?: number; ny?: number; level?: number; data?: ArrayBuffer };
          if (m.type === "field" && m.data && this.fieldCb) {
            this.fieldCb(new Float32Array(m.data), m.nx ?? NX, m.ny ?? NY, m.level ?? 0);
          }
        };
        node.connect(master);
        this.worklet = node;
        workletOk = true;
        this.mode = "worklet";
      } catch {
        workletOk = false;
      }
    }

    if (!workletOk) {
      this.useFallback = true;
      this.mode = "fallback";
      this.fallbackMesh = new FallbackMesh(ctx, master, (f, l) => {
        if (this.fieldCb) this.fieldCb(f, NX, NY, l);
      });
      this.fallbackMesh.start();
    }

    if (ctx.state === "suspended") await ctx.resume();
    this.ready = true;
  }

  setIdle(on: boolean) {
    if (this.worklet) this.worklet.port.postMessage({ type: "idle", on });
    if (this.fallbackMesh) this.fallbackMesh.setIdle(on);
  }

  strike(opts: StrikeOpts) {
    const x = opts.x ?? 0.5;
    const y = opts.y ?? 0.5;
    const amp = clamp(opts.velocity, 0.05, 1);
    const c = midiToTension(opts.midi);
    const damping = midiToDamping(opts.midi);
    if (this.worklet) {
      this.worklet.port.postMessage({ type: "strike", x, y, amp, c, damping });
    } else if (this.fallbackMesh) {
      this.fallbackMesh.strike(x, y, amp, opts.midi);
    }
  }

  async resume() {
    if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
  }

  dispose() {
    if (this.fallbackMesh) this.fallbackMesh.stop();
    try {
      this.worklet?.disconnect();
    } catch {
      /* noop */
    }
    try {
      this.master?.disconnect();
      this.lowpass?.disconnect();
      this.comp?.disconnect();
    } catch {
      /* noop */
    }
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    if (this.ctx) {
      const c = this.ctx;
      this.ctx = null;
      c.close().catch(() => {});
    }
    this.ready = false;
  }
}

// ── Fallback: control-rate FDTD mesh (visual) + modal resonator bank (audio) ──
// Runs the same wave equation at ~control rate to drive the field callback, and
// fires a short bank of damped sine partials tuned to the membrane's first few
// eigenfrequencies so the audio matches what the mesh is doing.
class FallbackMesh {
  private ctx: AudioContext;
  private dest: AudioNode;
  private cb: (field: Float32Array, level: number) => void;

  private uPrev = new Float32Array(N);
  private uCur = new Float32Array(N);
  private uNext = new Float32Array(N);
  private C = 0.5;
  private targetC = 0.5;
  private damping = 0.9988;

  private raf = 0;
  private running = false;
  private idleEnabled = true;
  private idleTimer = 0;
  private last = 0;
  private level = 0;

  constructor(ctx: AudioContext, dest: AudioNode, cb: (field: Float32Array, level: number) => void) {
    this.ctx = ctx;
    this.dest = dest;
    this.cb = cb;
  }

  setIdle(on: boolean) {
    this.idleEnabled = on;
  }

  start() {
    this.running = true;
    this.last = performance.now();
    this.idleTimer = 1000;
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      const dt = now - this.last;
      this.last = now;
      // Run several FDTD substeps per frame for a lively control-rate sim.
      const steps = 6;
      for (let s = 0; s < steps; s++) this.step();
      // Idle auto-strike.
      if (this.idleEnabled) {
        this.idleTimer -= dt;
        if (this.idleTimer <= 0) {
          this.idleTimer = 2600 + Math.random() * 1400;
          this.struckVisualOnly(0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4, 0.18, 60);
        }
      }
      this.cb(this.uCur, this.level);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  private step() {
    this.C += (this.targetC - this.C) * 0.02;
    const c2 = this.C * this.C;
    const damp = this.damping;
    const uPrev = this.uPrev;
    const uCur = this.uCur;
    const uNext = this.uNext;
    let energy = 0;
    for (let y = 1; y < NY - 1; y++) {
      const yb = y * NX;
      for (let x = 1; x < NX - 1; x++) {
        const i = yb + x;
        const lap = uCur[i - 1] + uCur[i + 1] + uCur[i - NX] + uCur[i + NX] - 4 * uCur[i];
        let v = 2 * uCur[i] - uPrev[i] + c2 * lap;
        v *= damp;
        uNext[i] = v;
        energy += v * v;
      }
    }
    for (let i = 0; i < N; i++) {
      uPrev[i] = uCur[i];
      uCur[i] = uNext[i];
    }
    this.level = Math.sqrt(energy / N);
  }

  private depositImpulse(fx: number, fy: number, amp: number) {
    const cx = fx * (NX - 1);
    const cy = fy * (NY - 1);
    const sigma = 1.6;
    const s2 = 2 * sigma * sigma;
    const A = amp * 7.0;
    const r = 4;
    for (let dy = -r; dy <= r; dy++) {
      const y = Math.round(cy) + dy;
      if (y < 1 || y >= NY - 1) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(cx) + dx;
        if (x < 1 || x >= NX - 1) continue;
        const ex = x - cx,
          ey = y - cy;
        const g = A * Math.exp(-(ex * ex + ey * ey) / s2);
        const i = y * NX + x;
        this.uCur[i] += g;
        this.uPrev[i] += g * 0.6;
      }
    }
  }

  private struckVisualOnly(fx: number, fy: number, amp: number, midi: number) {
    this.targetC = midiToTension(midi);
    this.depositImpulse(fx, fy, amp);
  }

  strike(fx: number, fy: number, amp: number, midi: number) {
    // Visual: deposit into the mesh.
    this.targetC = midiToTension(midi);
    this.idleTimer = 2600;
    this.depositImpulse(fx, fy, amp);
    // Audio: matched modal bank (membrane eigenfrequencies ~ f0 * sqrt of
    // Bessel-zero ratios). We use the first several drum modes.
    const f0 = midiToFreq(midi);
    const MODES = [1.0, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.5];
    const t0 = this.ctx.currentTime;
    const bus = this.ctx.createGain();
    bus.gain.value = amp * 0.5;
    bus.connect(this.dest);
    for (let k = 0; k < MODES.length; k++) {
      const f = f0 * MODES[k];
      if (f > 11000) continue;
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      const partialGain = (1 / (k + 1)) * (0.9 + Math.random() * 0.2);
      // Higher modes decay faster (like a real membrane).
      const decay = clamp(1.6 - k * 0.16, 0.2, 1.6);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(partialGain, t0 + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      osc.connect(g).connect(bus);
      osc.start(t0);
      osc.stop(t0 + decay + 0.05);
    }
    // Auto-disconnect the bus.
    window.setTimeout(() => {
      try {
        bus.disconnect();
      } catch {
        /* noop */
      }
    }, 2000);
  }
}
