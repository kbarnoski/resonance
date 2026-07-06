// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — builds the Web Audio graph for scanned synthesis.
//
// Primary path: an AudioWorkletProcessor (see worklet-src.ts) that holds the
// live 128-sample wavetable and does per-voice phase-accumulator scanning.
//
// Fallback (no AudioWorklet): additive resynthesis. We take a cheap 16-harmonic
// DFT of the ring shape every frame and drive a per-note bank of 16 oscillators
// whose gains are refreshed live — an approximation of the same morphing timbre.
//
// Master chain: (worklet or banks) → master GainNode (ramped up from 0) →
// DynamicsCompressor limiter → destination.
// ─────────────────────────────────────────────────────────────────────────────

import { LOOM_WORKLET_SRC } from "./worklet-src";

export interface LoomAudio {
  mode: "worklet" | "additive";
  noteOn: (freq: number) => void;
  pushTable: (table: Float32Array) => void;
  setMaster: (value: number) => void;
  stop: () => void;
}

function makeLimiter(ctx: AudioContext): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-3, ctx.currentTime);
  limiter.knee.setValueAtTime(0, ctx.currentTime);
  limiter.ratio.setValueAtTime(20, ctx.currentTime);
  limiter.attack.setValueAtTime(0.002, ctx.currentTime);
  limiter.release.setValueAtTime(0.08, ctx.currentTime);
  return limiter;
}

export async function buildAudio(): Promise<LoomAudio> {
  const ctx = new AudioContext();
  await ctx.resume();

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 1.2);
  const limiter = makeLimiter(ctx);
  master.connect(limiter);
  limiter.connect(ctx.destination);

  const hasWorklet = typeof ctx.audioWorklet !== "undefined";

  if (hasWorklet) {
    try {
      const blob = new Blob([LOOM_WORKLET_SRC], {
        type: "application/javascript",
      });
      const url = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      const node = new AudioWorkletNode(ctx, "loom-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      node.connect(master);

      return {
        mode: "worklet",
        noteOn: (freq: number) =>
          node.port.postMessage({ type: "noteOn", freq }),
        pushTable: (table: Float32Array) => {
          const t = new Float32Array(table);
          node.port.postMessage({ type: "table", table: t }, [t.buffer]);
        },
        setMaster: (value: number) =>
          node.port.postMessage({ type: "master", value }),
        stop: () => {
          try { node.disconnect(); } catch { /* ok */ }
          try { master.disconnect(); } catch { /* ok */ }
          try { limiter.disconnect(); } catch { /* ok */ }
          ctx.close().catch(() => { /* ok */ });
        },
      };
    } catch {
      // fall through to additive fallback
    }
  }

  // ── Additive fallback ──────────────────────────────────────────────────────
  const HARM = 16;
  const MAX_BANKS = 4;
  const mags = new Float32Array(HARM);

  interface Bank {
    oscs: OscillatorNode[];
    gains: GainNode[];
    env: GainNode;
    dead: boolean;
  }
  const banks: Bank[] = [];

  function computeMags(table: Float32Array): void {
    const N = table.length;
    let mean = 0;
    for (let i = 0; i < N; i++) mean += table[i];
    mean /= N;
    for (let k = 1; k <= HARM; k++) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < N; i++) {
        const ph = (-2 * Math.PI * k * i) / N;
        const v = table[i] - mean;
        re += v * Math.cos(ph);
        im += v * Math.sin(ph);
      }
      mags[k - 1] = (Math.sqrt(re * re + im * im) * 2) / N;
    }
  }

  function refreshBankGains(): void {
    const now = ctx.currentTime;
    for (const b of banks) {
      if (b.dead) continue;
      for (let h = 0; h < HARM; h++) {
        b.gains[h].gain.setTargetAtTime(mags[h] * 0.9, now, 0.03);
      }
    }
  }

  function killBank(b: Bank): void {
    if (b.dead) return;
    b.dead = true;
    for (const o of b.oscs) {
      try { o.stop(); } catch { /* ok */ }
      try { o.disconnect(); } catch { /* ok */ }
    }
    for (const g of b.gains) {
      try { g.disconnect(); } catch { /* ok */ }
    }
    try { b.env.disconnect(); } catch { /* ok */ }
  }

  function additiveNoteOn(freq: number): void {
    if (banks.length >= MAX_BANKS) {
      const old = banks.shift();
      if (old) killBank(old);
    }
    const now = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.25, now + 0.006);
    env.gain.setTargetAtTime(0, now + 0.03, 0.9);
    env.connect(master);

    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    for (let h = 1; h <= HARM; h++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * h, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(mags[h - 1] * 0.9, now);
      osc.connect(g);
      g.connect(env);
      osc.start(now);
      osc.stop(now + 3.2);
      oscs.push(osc);
      gains.push(g);
    }
    const bank: Bank = { oscs, gains, env, dead: false };
    banks.push(bank);
    window.setTimeout(() => {
      const idx = banks.indexOf(bank);
      if (idx >= 0) banks.splice(idx, 1);
      killBank(bank);
    }, 3300);
  }

  return {
    mode: "additive",
    noteOn: additiveNoteOn,
    pushTable: (table: Float32Array) => {
      computeMags(table);
      refreshBankGains();
    },
    setMaster: (value: number) => {
      master.gain.setTargetAtTime(value, ctx.currentTime, 0.1);
    },
    stop: () => {
      for (const b of banks) killBank(b);
      banks.length = 0;
      try { master.disconnect(); } catch { /* ok */ }
      try { limiter.disconnect(); } catch { /* ok */ }
      ctx.close().catch(() => { /* ok */ });
    },
  };
}
