// Audio graph + AudioWorklet bootstrap.
//
// Master safety chain:  source -> gain(<=0.3) -> lowpass(~7kHz)
//                              -> DynamicsCompressor(-12dB, ~16:1) -> destination
//
// The worklet module source is inlined (worklet-src.ts) and loaded via a Blob
// URL so nothing lives outside this folder.

import { WORKLET_SRC } from "./worklet-src";

export type AudioRig = {
  ctx: AudioContext;
  master: GainNode;
  // GPU path: one shared pickup player fed from main thread
  gpuNode: AudioWorkletNode | null;
  // CPU path: one worklet per plate, each its own FD sim
  cpuNodes: AudioWorkletNode[];
  destroy: () => Promise<void>;
};

let blobUrl: string | null = null;
function workletUrl(): string {
  if (!blobUrl) {
    const blob = new Blob([WORKLET_SRC], { type: "application/javascript" });
    blobUrl = URL.createObjectURL(blob);
  }
  return blobUrl;
}

export async function makeAudioRig(useGpuPath: boolean, cpuPlateCount: number, cpuTunings: CpuTuning[]): Promise<AudioRig> {
  const Ctor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor({ latencyHint: "interactive" });
  await ctx.audioWorklet.addModule(workletUrl());

  // master safety chain
  const master = ctx.createGain();
  master.gain.value = 0.28;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7000;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 6;
  comp.ratio.value = 16;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  master.connect(lp).connect(comp).connect(ctx.destination);

  let gpuNode: AudioWorkletNode | null = null;
  const cpuNodes: AudioWorkletNode[] = [];

  if (useGpuPath) {
    gpuNode = new AudioWorkletNode(ctx, "gpu-pickup", { outputChannelCount: [2] });
    gpuNode.connect(master);
  } else {
    for (let i = 0; i < cpuPlateCount; i++) {
      const t = cpuTunings[i];
      const node = new AudioWorkletNode(ctx, "cpu-plate", {
        outputChannelCount: [2],
        processorOptions: {
          N: 34,
          kappa: t.kappa,
          s0: t.s0,
          s1: t.s1,
          beta: t.beta,
          gain: 1.0,
        },
      });
      node.connect(master);
      cpuNodes.push(node);
    }
  }

  const destroy = async () => {
    try { gpuNode?.disconnect(); } catch { /* ignore */ }
    for (const n of cpuNodes) { try { n.disconnect(); } catch { /* ignore */ } }
    try { master.disconnect(); } catch { /* ignore */ }
    try { await ctx.close(); } catch { /* ignore */ }
  };

  return { ctx, master, gpuNode, cpuNodes, destroy };
}

export type CpuTuning = { kappa: number; s0: number; s1: number; beta: number };
