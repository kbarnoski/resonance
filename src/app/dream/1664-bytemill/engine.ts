// Bytebeat audio engine.
//
// Synthesises raw 8-bit "bytebeat" PCM by evaluating an integer expression of a
// running sample counter `t`. The heavy lifting happens in an AudioWorklet whose
// processor source lives in the inline string below — it is turned into a Blob
// URL at runtime and loaded via `audioContext.audioWorklet.addModule`, so the
// whole engine stays self-contained (no files served from /public).
//
// The worklet steps `t` at an authentic lo-fi rate (~2k–16k Hz) independently of
// the AudioContext sample rate by accumulating a fractional counter and holding
// the last computed byte between ticks. That sample-and-hold is what gives
// bytebeat its harsh aliased character.
//
// Master safety chain: worklet → soft-clip waveshaper → dynamics compressor →
// low master gain (≤ 0.12) → destination. Bytebeat can be brutally loud, so the
// grit is tamed before it reaches the speakers.

const PROCESSOR_NAME = "bytemill-bytebeat-processor";

// Source of the AudioWorkletProcessor, kept as a string so it can be loaded from
// a Blob URL. `sampleRate` is a global inside AudioWorkletGlobalScope.
const WORKLET_SOURCE = `
class BytebeatProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.t = 0;
    this.acc = 0;
    this.tRate = 8000;
    this.k = 0;
    this.fn = function () { return 0; };
    this.lastByte = 0;
    this.RING = 1024;
    this.ring = new Uint8Array(this.RING);
    this.ringPos = 0;
    this.blocks = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (typeof d.formula === "string") {
        try {
          // Compiled from a fixed, curated library plus a numeric constant k —
          // the visitor cannot inject code, only pick a formula and bend k.
          this.fn = new Function("t", "k", "return (" + d.formula + ")|0;");
        } catch (err) {
          this.fn = function () { return 0; };
        }
      }
      if (typeof d.k === "number") this.k = d.k | 0;
      if (typeof d.tRate === "number") this.tRate = d.tRate;
      if (d.reset) { this.t = 0; this.acc = 0; }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const ch0 = out[0];
    const n = ch0.length;
    const sr = sampleRate;
    const step = this.tRate / sr;
    for (let i = 0; i < n; i++) {
      this.acc += step;
      while (this.acc >= 1) {
        this.acc -= 1;
        this.t = (this.t + 1) | 0;
        let v = 0;
        try { v = this.fn(this.t, this.k) | 0; } catch (err) { v = 0; }
        this.lastByte = v & 255;
        this.ring[this.ringPos] = this.lastByte;
        this.ringPos = (this.ringPos + 1) % this.RING;
      }
      const s = (this.lastByte / 255) * 2 - 1;
      for (let c = 0; c < out.length; c++) out[c][i] = s * 0.9;
    }
    this.blocks++;
    // ~ every 8 blocks (~46 Hz) hand a byte snapshot to the main thread for the
    // oscilloscope + bitfield visuals.
    if ((this.blocks & 7) === 0) {
      const snap = new Uint8Array(this.RING);
      for (let j = 0; j < this.RING; j++) {
        snap[j] = this.ring[(this.ringPos + j) % this.RING];
      }
      this.port.postMessage({ bytes: snap }, [snap.buffer]);
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(PROCESSOR_NAME)}, BytebeatProcessor);
`;

function makeSoftClipCurve() {
  const len = 1024;
  const curve = new Float32Array(len);
  const amount = 2.2;
  for (let i = 0; i < len; i++) {
    const x = (i / (len - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x);
  }
  return curve;
}

export type BytesListener = (bytes: Uint8Array) => void;

export class BytebeatEngine {
  private ctx: AudioContext;
  private node: AudioWorkletNode | null = null;
  private shaper: WaveShaperNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private master: GainNode | null = null;
  private blobUrl: string | null = null;
  private onBytes: BytesListener;
  private disposed = false;

  constructor(ctx: AudioContext, onBytes: BytesListener) {
    this.ctx = ctx;
    this.onBytes = onBytes;
  }

  async init(): Promise<void> {
    const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
    this.blobUrl = URL.createObjectURL(blob);
    await this.ctx.audioWorklet.addModule(this.blobUrl);
    if (this.disposed) return;

    this.node = new AudioWorkletNode(this.ctx, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.port.onmessage = (e: MessageEvent) => {
      const data = e.data as { bytes?: Uint8Array };
      if (data && data.bytes) this.onBytes(data.bytes);
    };

    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = makeSoftClipCurve();
    this.shaper.oversample = "4x";

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.2;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.11; // hard ceiling well under 0.12

    this.node.connect(this.shaper);
    this.shaper.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  setFormula(expr: string): void {
    this.node?.port.postMessage({ formula: expr, reset: true });
  }

  setK(k: number): void {
    this.node?.port.postMessage({ k });
  }

  setTRate(rate: number): void {
    this.node?.port.postMessage({ tRate: rate });
  }

  dispose(): void {
    this.disposed = true;
    if (this.node) {
      this.node.port.onmessage = null;
      try {
        this.node.disconnect();
      } catch {
        /* ignore */
      }
    }
    try {
      this.shaper?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.compressor?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.master?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    this.node = null;
    this.shaper = null;
    this.compressor = null;
    this.master = null;
  }
}
