// 2952-tabla — engine.ts
// Audio wiring for the membrane. Preferred path: an AudioWorklet whose source
// is a Blob-URL'd string (worklet.ts). Fallback: a ScriptProcessorNode running
// the SAME MembraneMesh (mesh.ts) on the main thread. Either way the public
// surface is identical — strike / press / releasePress — so page.tsx never
// cares which one is live.

import { WORKLET_SOURCE } from "./worklet";
import { MembraneMesh, type MeshConfig } from "./mesh";

/** Shared membrane parameters for the audio-rate mesh (both worklet + fallback). */
export const AUDIO_CFG: MeshConfig = {
  size: 42,
  baseC2: 0.2, // ~410 Hz fundamental at 48 kHz — a dayan-ish pitch
  maxTension: 0.3, // full press glides toward the c² = 0.49 ceiling (~a 5th up)
  loss: 0.99996, // ~0.4 s ring
  tensionEase: 0.02, // ~130 ms glide UP under the palm
  tensionRelax: 0.99, // ~0.2 s glide back DOWN on release
};

/** tanh input drive for the audio path (output is hard-capped at 0.12). */
const AUDIO_DRIVE = 16;

type Mode = "worklet" | "fallback";

export class TablaEngine {
  readonly ctx: AudioContext;
  mode: Mode = "fallback";

  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private master: GainNode | null = null;
  private url: string | null = null;

  // fallback-only state
  private mesh: MembraneMesh | null = null;
  private lp = 0;
  private dcx = 0;
  private dcy = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /** Wire the graph. Resolves once audio is producing (worklet or fallback). */
  async init(): Promise<void> {
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = 1; // per-sample tanh already caps the signal at 0.12
    master.connect(ctx.destination);
    this.master = master;

    if (ctx.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        this.url = url;
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, "tabla-mesh-processor", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          processorOptions: { ...AUDIO_CFG, drive: AUDIO_DRIVE },
        });
        node.connect(master);
        this.node = node;
        this.mode = "worklet";
        return;
      } catch {
        // fall through to ScriptProcessor
      }
    }
    this.initFallback();
  }

  private initFallback(): void {
    const ctx = this.ctx;
    const mesh = new MembraneMesh(AUDIO_CFG);
    this.mesh = mesh;
    const node = ctx.createScriptProcessor(1024, 0, 1);
    node.onaudioprocess = (e: AudioProcessingEvent) => {
      const chL = e.outputBuffer.getChannelData(0);
      const n = chL.length;
      // Sub-block control update to keep the press glide responsive.
      const sub = 128;
      for (let s = 0; s < n; s++) {
        if (s % sub === 0) mesh.updateControl();
        const raw = mesh.step();
        const y = raw - this.dcx + 0.995 * this.dcy;
        this.dcx = raw;
        this.dcy = y;
        this.lp += (y - this.lp) * 0.4;
        chL[s] = Math.tanh(this.lp * AUDIO_DRIVE) * 0.12;
      }
    };
    if (this.master) node.connect(this.master);
    this.node = node;
    this.mode = "fallback";
  }

  strike(nx: number, ny: number, vel: number, width: number): void {
    if (this.mode === "worklet") {
      (this.node as AudioWorkletNode).port.postMessage({ t: "strike", x: nx, y: ny, vel, width });
    } else if (this.mesh) {
      this.mesh.strike(nx, ny, vel, width);
    }
  }

  press(nx: number, ny: number, amount: number, radius: number): void {
    if (this.mode === "worklet") {
      (this.node as AudioWorkletNode).port.postMessage({ t: "press", x: nx, y: ny, amount, radius });
    } else if (this.mesh) {
      this.mesh.setPress(nx, ny, amount, radius);
    }
  }

  releasePress(): void {
    if (this.mode === "worklet") {
      (this.node as AudioWorkletNode).port.postMessage({ t: "release" });
    } else if (this.mesh) {
      this.mesh.releasePress();
    }
  }

  dispose(): void {
    if (this.node) {
      try {
        this.node.disconnect();
      } catch {
        /* ignore */
      }
      if (this.node instanceof ScriptProcessorNode) this.node.onaudioprocess = null;
    }
    if (this.master) {
      try {
        this.master.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.node = null;
    this.master = null;
    this.mesh = null;
    this.url = null;
  }
}
