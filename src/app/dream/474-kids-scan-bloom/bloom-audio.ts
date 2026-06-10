/**
 * bloom-audio.ts
 *
 * Audio engine for 474-kids-scan-bloom.
 * Scanned Synthesis — Mathews, Verplank, Shaw, ICMC 2000.
 *
 * Boots an AudioWorklet (inlined as a Blob URL) running BloomProcessor.
 * Falls back to ScriptProcessorNode if AudioWorklet is unavailable.
 *
 * Public API:
 *   bootBloomAudio()  → BloomAudioEngine
 *   engine.squeeze(index, strength)   — inject a Gaussian bump
 *   engine.setPitch(hz)               — change scan frequency (pitch)
 *   engine.onFrame(cb)                — register r[] callback (~33fps)
 *   engine.dispose()                  — tear down all audio nodes
 */

import { BLOOM_WORKLET_SRC } from "./bloom-worklet-src";

export interface BloomAudioEngine {
  squeeze: (index: number, strength: number) => void;
  setPitch: (hz: number) => void;
  onFrame: (cb: (r: Float32Array) => void) => void;
  dispose: () => void;
  ctx: AudioContext;
}

// ── ScriptProcessor fallback (identical mass-spring physics) ──────────────────

function runScriptProcessorFallback(
  ctx: AudioContext,
  dest: AudioNode,
  N: number,
): {
  node: ScriptProcessorNode;
  r: Float32Array;
  v: Float32Array;
  squeezeFn: (i0: number, str: number) => void;
  setPitchFn: (hz: number) => void;
} {
  const r = new Float32Array(N);
  const v = new Float32Array(N);
  let scanFreq = 261.63;
  let phase = 0;

  const Kn   = 0.25;
  const Kc   = 0.002;
  const damp = 0.04;
  const dt   = 1.0;

  // Seed 5-petal hum
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * Math.PI * 2;
    r[i] = Math.sin(5 * theta) * 0.06 + Math.sin(theta) * 0.015;
  }

  function stepPhysics() {
    for (let i = 0; i < N; i++) {
      const prev  = (i - 1 + N) % N;
      const next  = (i + 1) % N;
      const accel = Kn * (r[prev] + r[next] - 2 * r[i]) - Kc * r[i] - damp * v[i];
      v[i] += accel * dt;
      r[i] += v[i] * dt;
      if (r[i] >  1) { r[i] =  1; v[i] *= -0.15; }
      if (r[i] < -1) { r[i] = -1; v[i] *= -0.15; }
    }
  }

  const sp = ctx.createScriptProcessor(512, 0, 1);
  sp.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    const dPhase = scanFreq / ctx.sampleRate;
    stepPhysics();
    for (let n = 0; n < out.length; n++) {
      const pos = phase * N;
      const i0  = Math.floor(pos) % N;
      const i1  = (i0 + 1) % N;
      const frac = pos - Math.floor(pos);
      out[n] = 0.55 * (r[i0] + frac * (r[i1] - r[i0]));
      phase += dPhase;
      if (phase >= 1) phase -= 1;
    }
  };
  sp.connect(dest);

  const squeezeFn = (i0: number, str: number) => {
    const sigma = N * 0.07;
    for (let i = 0; i < N; i++) {
      let d = i - i0;
      if (d >  N / 2) d -= N;
      if (d < -N / 2) d += N;
      const g = Math.exp(-(d * d) / (2 * sigma * sigma));
      v[i] += str * g;
      r[i] += str * 0.25 * g;
      if (r[i] >  1) r[i] =  1;
      if (r[i] < -1) r[i] = -1;
    }
  };

  const setPitchFn = (hz: number) => { scanFreq = hz; };

  return { node: sp, r, v, squeezeFn, setPitchFn };
}

// ── Main boot function ────────────────────────────────────────────────────────

export async function bootBloomAudio(): Promise<BloomAudioEngine> {
  const ctx  = new AudioContext({ latencyHint: "interactive", sampleRate: 44100 });
  const N    = 128;

  // Brick-wall limiter — kids-safe
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value      = 3;
  comp.ratio.value     = 20;
  comp.attack.value    = 0.003;
  comp.release.value   = 0.25;
  comp.connect(ctx.destination);

  const frameCallbacks: Array<(r: Float32Array) => void> = [];

  let squeezeFn: (i: number, s: number) => void;
  let setPitchFn: (hz: number) => void;
  let disposeNodes: () => void;

  // ── Try AudioWorklet ───────────────────────────────────────────────────────
  let useWorklet = false;
  if (ctx.audioWorklet?.addModule) {
    try {
      const blob = new Blob([BLOOM_WORKLET_SRC], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      const worklet = new AudioWorkletNode(ctx, "bloom-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      worklet.connect(comp);

      worklet.port.onmessage = (e) => {
        if (e.data?.type === "state") {
          const snap = e.data.r as Float32Array;
          frameCallbacks.forEach((cb) => cb(snap));
        }
      };

      squeezeFn  = (i, s) => worklet.port.postMessage({ type: "squeeze", index: i, strength: s });
      setPitchFn = (hz) => {
        const p = worklet.parameters.get("scanFreq");
        if (p) p.setValueAtTime(hz, ctx.currentTime);
      };
      disposeNodes = () => {
        worklet.disconnect();
        comp.disconnect();
      };
      useWorklet = true;
    } catch {
      useWorklet = false;
    }
  }

  // ── ScriptProcessor fallback ───────────────────────────────────────────────
  if (!useWorklet) {
    const fb = runScriptProcessorFallback(ctx, comp, N);

    // Poll r[] at ~33fps from main thread for renderer
    let rafId = 0;
    let lastReport = 0;
    const poll = (ts: number) => {
      if (ts - lastReport > 30) {
        lastReport = ts;
        const snap = new Float32Array(fb.r);
        frameCallbacks.forEach((cb) => cb(snap));
      }
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);

    squeezeFn  = fb.squeezeFn;
    setPitchFn = fb.setPitchFn;
    disposeNodes = () => {
      cancelAnimationFrame(rafId);
      fb.node.disconnect();
      comp.disconnect();
    };
  }

  return {
    ctx,
    squeeze: squeezeFn!,
    setPitch: setPitchFn!,
    onFrame: (cb) => frameCallbacks.push(cb),
    dispose: () => {
      disposeNodes();
      ctx.close().catch(() => {/* ignore */});
    },
  };
}
