/**
 * The grit engine — BITCRUSH as the headline instrument.
 *
 * Amplitude quantization (bit-depth reduction) + sample-rate hold /
 * decimation, applied per-sample in a ScriptProcessorNode. Deprecated but
 * fully self-contained (no separately served AudioWorklet module), so it runs
 * everywhere including the headless review box.
 *
 * Conceptually: bitcrush is amplitude quantization — the audible-artifact
 * ancestor of the Residual-Vector-Quantization (codebook quantization) at the
 * heart of every 2024–26 AI music generator. This makes that grit playable.
 */

import { clamp, gritToParams } from "./dsp";

const BUFFER_SIZE = 2048;

export interface CrushEngine {
  /** Feed this node with the source (file or carrier). */
  input: GainNode;
  /** Tap for the visuals — post-crush spectrum. */
  analyser: AnalyserNode;
  /** Master output gain (safety). */
  master: GainNode;
  /** 0..1 grit amount. */
  setGrit(g: number): void;
  /** Raise master for a loaded file, lower for the carrier. */
  setMaster(v: number, t: number): void;
  dispose(): void;
}

export function createCrushEngine(ctx: AudioContext): CrushEngine {
  const input = ctx.createGain();
  input.gain.value = 1;

  const processor = ctx.createScriptProcessor(BUFFER_SIZE, 2, 2);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.72;

  // safety chain: crusher → analyser → compressor → low master → out
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;

  const master = ctx.createGain();
  master.gain.value = 0.12;

  input.connect(processor);
  processor.connect(analyser);
  analyser.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);

  // live-tunable params read inside the audio callback
  let bits = 12;
  let hold = 1;
  let wet = 0.35;

  // per-channel sample-hold state
  const held: number[] = [0, 0];
  const counter: number[] = [0, 0];

  processor.onaudioprocess = (e: AudioProcessingEvent) => {
    const inBuf = e.inputBuffer;
    const outBuf = e.outputBuffer;
    const levels = Math.pow(2, bits);
    const scale = (levels - 1) / 2;
    const channels = outBuf.numberOfChannels;
    for (let c = 0; c < channels; c++) {
      const src = inBuf.getChannelData(Math.min(c, inBuf.numberOfChannels - 1));
      const dst = outBuf.getChannelData(c);
      let h = held[c];
      let k = counter[c];
      for (let i = 0; i < dst.length; i++) {
        const dry = src[i];
        if (k <= 0) {
          // quantize amplitude to `bits` levels across [-1, 1]
          const q = Math.round((dry + 1) * scale) / scale - 1;
          h = q;
          k = hold;
        }
        k--;
        const crushed = h;
        dst[i] = dry * (1 - wet) + crushed * wet;
      }
      held[c] = h;
      counter[c] = k;
    }
  };

  function setGrit(g: number): void {
    const p = gritToParams(g);
    bits = p.bits;
    hold = p.hold;
    wet = p.wet;
  }

  function setMaster(v: number, t: number): void {
    master.gain.setTargetAtTime(clamp(v, 0, 0.25), t, 0.1);
  }

  function dispose(): void {
    try {
      processor.onaudioprocess = null;
      input.disconnect();
      processor.disconnect();
      analyser.disconnect();
      comp.disconnect();
      master.disconnect();
    } catch {
      /* already torn down */
    }
  }

  return { input, analyser, master, setGrit, setMaster, dispose };
}
