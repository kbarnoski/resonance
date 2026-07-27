// ── 3192-bow · Bowed-string friction waveguide ────────────────────────────
// A digital-waveguide bowed string driven by a nonlinear stick–slip friction
// junction — the McIntyre, Woodhouse & Schumacher model ("On the oscillations
// of musical instruments", JASA 74, 1983), in the Smith / STK velocity-wave
// formulation.
//
//   two delay lines  → the string on either side of the bow (nut side + bridge
//                       side); together they set the pitch.
//   reflection filter → gentle low-pass loss at the bridge (string damping).
//   friction junction → the nonlinearity. Each sample it reads the string
//                       velocity at the bow, forms the RELATIVE velocity
//                       (bow − string), and a friction curve decides how much
//                       the bow drags the string. Near-zero relative velocity =
//                       stick (bow and string move together); large relative
//                       velocity = slip (bow skates over the string). The
//                       stick↔slip alternation IS the tone.
//
// Bow speed and bow force reach the junction as `maxVel` (bow velocity) and
// `slope` (width of the friction capture region). Those two knobs — and only a
// friction nonlinearity between them — are what turn a thin surface whistle
// into a singing tone into a raucous crunch. No filter sweep fakes it.
//
// The same algorithm exists twice: as this TypeScript class (used by the
// ScriptProcessor fallback and, headless, to sanity-run the model) and as an
// inlined string in worklet-source.ts (the preferred AudioWorklet path). Keep
// the two in sync.

/** Fractional delay line (linear interpolation) — sets the string length. */
class DelayLine {
  private buf: Float32Array;
  private mask: number;
  private writeIdx = 0;
  private delay = 2;

  constructor(maxLen: number) {
    let n = 4;
    while (n < maxLen) n <<= 1;
    this.buf = new Float32Array(n);
    this.mask = n - 1;
  }

  setDelay(d: number): void {
    this.delay = Math.max(1, Math.min(d, this.buf.length - 2));
  }

  read(): number {
    const readPos = this.writeIdx - this.delay + this.buf.length;
    const i0 = Math.floor(readPos);
    const frac = readPos - i0;
    const a = this.buf[i0 & this.mask];
    const b = this.buf[(i0 + 1) & this.mask];
    return a + (b - a) * frac;
  }

  write(x: number): void {
    // guard against numeric blow-up in the raucous regime
    this.buf[this.writeIdx & this.mask] = x < -3 ? -3 : x > 3 ? 3 : x;
    this.writeIdx = (this.writeIdx + 1) & this.mask;
  }

  clear(): void {
    this.buf.fill(0);
  }
}

/**
 * The friction curve. Returns a coupling coefficient in (0,1]: 1 = fully
 * stuck (bow drags string completely), →0 = slipping free. `slope` is the bow
 * force: small slope = wide sticking region (heavy bow), large slope = narrow
 * (light bow). Shape after STK's BowTable, itself a fit to the MWS friction
 * characteristic.
 */
export function bowFriction(deltaV: number, slope: number): number {
  const sample = (deltaV + 0.001) * slope;
  let v = Math.abs(sample) + 0.75;
  v = v * v; // ^2
  v = v * v; // ^4
  v = 1 / v; // ^-4
  return v > 1 ? 1 : v;
}

export interface BowParams {
  maxVel: number; // bow velocity amplitude
  slope: number; // friction-curve slope (bow force)
  force: number; // normalized bow force 0..1 (loop gain + slip breakdown)
  active: boolean; // is the bow on the string?
}

/** One bowed string. `render` fills an output block sample-by-sample. */
export class BowedString {
  private bridge = new DelayLine(2048);
  private neck = new DelayLine(2048);
  private filtState = 0;
  private dcX = 0;
  private dcY = 0;
  private sr: number;

  // control targets (smoothed per sample to avoid zipper noise)
  private tMaxVel = 0;
  private tSlope = 3;
  private tForce = 0;
  private cMaxVel = 0;
  private cSlope = 3;
  private cForce = 0;
  private cActive = 0;

  // seeded bow-hair noise (deterministic; no Math.random)
  private noiseState = 0x31920b70 >>> 0;

  private rms = 0;

  constructor(sampleRate: number, freq = 196) {
    this.sr = sampleRate;
    this.setFrequency(freq);
  }

  setFrequency(freq: number): void {
    // total loop delay = one period; split by bow–bridge distance β ≈ 0.12
    const total = this.sr / freq - 2;
    const beta = 0.12;
    this.bridge.setDelay(Math.max(2, total * beta));
    this.neck.setDelay(Math.max(2, total * (1 - beta)));
  }

  setParams(p: BowParams): void {
    this.tMaxVel = p.maxVel;
    this.tSlope = p.slope;
    this.tForce = p.force;
    this.cActive = p.active ? 1 : 0;
  }

  reset(): void {
    this.bridge.clear();
    this.neck.clear();
    this.filtState = 0;
    this.dcX = 0;
    this.dcY = 0;
    this.rms = 0;
  }

  getRms(): number {
    return this.rms;
  }

  private noise(): number {
    // xorshift32 — deterministic bow-hair scratch
    let x = this.noiseState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noiseState = x >>> 0;
    return (this.noiseState / 0xffffffff) * 2 - 1;
  }

  private step(): number {
    // one-pole control smoothing
    this.cMaxVel += 0.002 * (this.tMaxVel - this.cMaxVel);
    this.cSlope += 0.002 * (this.tSlope - this.cSlope);
    this.cForce += 0.002 * (this.tForce - this.cForce);

    const bowVel = this.cMaxVel * this.cActive;
    const force = this.cForce;
    // more bow force → less bridge damping (the string is driven harder). This
    // is what makes a LIGHT bow unable to sustain full amplitude (thin surface
    // sound) while a firm bow overcomes the loss and sings.
    const bridgeGain = Math.min(1.0, 0.88 + force * 0.135);
    // above the Schelleng max-force line the stick–slip breaks into irregular
    // multi-slipping — modeled as a slip perturbation that grows with force and
    // string energy, turning the tone raucous. Zero in the singing band.
    const rough = Math.max(0, force - 0.7) * 3.0 * this.cActive;

    // reflection at bridge: low-pass loss (string damping)
    const neckOut = this.neck.read();
    this.filtState = 0.7 * neckOut + 0.3 * this.filtState;
    const bridgeRefl = -bridgeGain * this.filtState;

    // reflection at nut: (near) lossless inversion
    const nutRefl = -0.997 * this.bridge.read();

    // string velocity at the bow = superposition of the two travelling waves
    const stringVel = bridgeRefl + nutRefl;

    // THE NONLINEARITY: relative velocity → friction coupling → injected velocity
    const deltaV = bowVel - stringVel;
    const coeff = bowFriction(deltaV, this.cSlope);
    // bow-hair scratch: physical friction noise, loudest while slipping
    const scratch = this.noise() * 0.06 * (1 - coeff) * bowVel;
    let newVel = deltaV * coeff + scratch;
    if (rough > 0) {
      newVel += this.noise() * rough * (0.15 + 0.5 * Math.abs(stringVel));
    }
    if (newVel > 1) newVel = 1;
    else if (newVel < -1) newVel = -1;

    // scatter the injected velocity back into both delay lines
    this.neck.write(nutRefl + newVel);
    this.bridge.write(bridgeRefl + newVel);

    // pick up sound at the bridge, remove DC
    const x = bridgeRefl;
    this.dcY = x - this.dcX + 0.995 * this.dcY;
    this.dcX = x;
    return this.dcY;
  }

  render(out: Float32Array, gain: number): void {
    let acc = 0;
    for (let i = 0; i < out.length; i++) {
      let s = this.step() * gain;
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      out[i] = s;
      acc += s * s;
    }
    this.rms = Math.sqrt(acc / out.length);
  }
}

// ── Engine: wires the string into a safe Web Audio graph ───────────────────

import { WORKLET_SOURCE } from "./worklet-source";

export type AudioBackend = "worklet" | "scriptprocessor" | "none";

export interface EngineState {
  backend: AudioBackend;
  rms: number;
}

const OUTPUT_GAIN = 2.4; // pre-limiter makeup so a captured tone is audible

export class BowEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private script: ScriptProcessorNode | null = null;
  private fallbackString: BowedString | null = null;
  private blobUrl: string | null = null;

  backend: AudioBackend = "none";
  rms = 0;

  private params: BowParams = { maxVel: 0, slope: 3, force: 0, active: false };
  private freq = 196;

  /** Create + resume the graph. MUST be called from a user gesture. */
  async start(): Promise<AudioBackend> {
    if (this.ctx) {
      await this.ctx.resume().catch(() => {});
      return this.backend;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    // safety chain: source → master(≤0.15) → limiter → destination
    const master = ctx.createGain();
    master.gain.value = 0.12;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    this.master = master;
    this.limiter = limiter;

    let ok = false;
    try {
      const blob = new Blob([WORKLET_SOURCE], {
        type: "application/javascript",
      });
      this.blobUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(this.blobUrl);
      const node = new AudioWorkletNode(ctx, "bowed-string-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.port.onmessage = (e: MessageEvent) => {
        const d = e.data as { rms?: number };
        if (typeof d.rms === "number") this.rms = d.rms;
      };
      node.port.postMessage({
        type: "init",
        sampleRate: ctx.sampleRate,
        freq: this.freq,
        outputGain: OUTPUT_GAIN,
      });
      node.port.postMessage({ type: "params", ...this.params });
      node.connect(master);
      this.worklet = node;
      this.backend = "worklet";
      ok = true;
    } catch {
      ok = false;
    }

    if (!ok) {
      // fallback: ScriptProcessor running the TS model (works everywhere)
      try {
        const str = new BowedString(ctx.sampleRate, this.freq);
        str.setParams(this.params);
        this.fallbackString = str;
        const node = ctx.createScriptProcessor(512, 0, 1);
        node.onaudioprocess = (e: AudioProcessingEvent) => {
          const out = e.outputBuffer.getChannelData(0);
          str.render(out, OUTPUT_GAIN);
          this.rms = str.getRms();
        };
        node.connect(master);
        this.script = node;
        this.backend = "scriptprocessor";
      } catch {
        this.backend = "none";
      }
    }

    await ctx.resume().catch(() => {});
    return this.backend;
  }

  setParams(p: BowParams): void {
    this.params = p;
    this.worklet?.port.postMessage({ type: "params", ...p });
    this.fallbackString?.setParams(p);
  }

  setFrequency(freq: number): void {
    this.freq = freq;
    this.worklet?.port.postMessage({ type: "freq", freq });
    this.fallbackString?.setFrequency(freq);
  }

  async stop(): Promise<void> {
    try {
      this.worklet?.disconnect();
      this.worklet?.port.close();
    } catch {
      /* ignore */
    }
    try {
      if (this.script) this.script.onaudioprocess = null;
      this.script?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.master?.disconnect();
      this.limiter?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    const ctx = this.ctx;
    this.ctx = null;
    this.worklet = null;
    this.script = null;
    this.fallbackString = null;
    this.master = null;
    this.limiter = null;
    this.backend = "none";
    if (ctx && ctx.state !== "closed") {
      await ctx.close().catch(() => {});
    }
  }
}
