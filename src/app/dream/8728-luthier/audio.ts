// AudioContext + AudioWorklet bootstrap for THE LUTHIER.
//
// The processor source (engine.ts::buildWorkletSource) is inlined and loaded
// from a Blob URL so nothing lives outside this folder. Safety chain:
//   mi-processor -> gain(<=0.5) -> DynamicsCompressor(limiter) -> destination

import { buildWorkletSource, modelToTopo, uiToK, uiToM, uiToZ } from "./engine";
import type { Model } from "./engine";

export type AudioRig = {
  ctx: AudioContext;
  node: AudioWorkletNode;
  sendTopology: (model: Model) => void;
  sendMaterial: (kUI: number, zUI: number, mUI: number) => void;
  pluck: (i: number, vx: number, vy: number) => void;
  grab: (i: number) => void;
  grabMove: (i: number, x: number, y: number) => void;
  release: (i: number, vx: number, vy: number) => void;
  setListener: (i: number) => void;
  reset: () => void;
  destroy: () => Promise<void>;
};

let blobUrl: string | null = null;
function workletUrl(): string {
  if (!blobUrl) {
    const blob = new Blob([buildWorkletSource()], {
      type: "application/javascript",
    });
    blobUrl = URL.createObjectURL(blob);
  }
  return blobUrl;
}

export async function makeAudioRig(
  model: Model,
  kUI: number,
  zUI: number,
  mUI: number,
  onSnapshot: (positions: Float32Array) => void
): Promise<AudioRig> {
  const Ctor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor({ latencyHint: "interactive" });
  await ctx.audioWorklet.addModule(workletUrl());
  if (ctx.state === "suspended") await ctx.resume();

  const node = new AudioWorkletNode(ctx, "mi-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 18;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  node.connect(gain).connect(comp).connect(ctx.destination);

  node.port.onmessage = (e) => {
    if (e.data instanceof Float32Array) onSnapshot(e.data);
  };

  const post = (msg: unknown) => node.port.postMessage(msg);

  const rig: AudioRig = {
    ctx,
    node,
    sendTopology: (m) => post(modelToTopo(m)),
    sendMaterial: (kui, zui, mui) =>
      post({ type: "material", k: uiToK(kui), z: uiToZ(zui), m: uiToM(mui) }),
    pluck: (i, vx, vy) => post({ type: "pluck", i, vx, vy }),
    grab: (i) => post({ type: "grab", i }),
    grabMove: (i, x, y) => post({ type: "grabmove", i, x, y }),
    release: (i, vx, vy) => post({ type: "release", i, vx, vy }),
    setListener: (i) => post({ type: "listener", i }),
    reset: () => post({ type: "reset" }),
    destroy: async () => {
      try {
        node.port.onmessage = null;
        node.disconnect();
        gain.disconnect();
        comp.disconnect();
      } catch {
        /* ignore */
      }
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    },
  };

  // prime the worklet with the current build + material
  rig.sendTopology(model);
  rig.sendMaterial(kUI, zUI, mUI);
  return rig;
}
