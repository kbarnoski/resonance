// audio.ts — Bell/marimba synthesis engine for 317-kids-color-bells
// D major hexachord: D E F# G A B (warm colors low → cool colors high)
// No external dependencies — pure Web Audio API.

// ─── Scale ────────────────────────────────────────────────────────────────────
// D major hexachord: D3 E3 F#3 G3 A3 B3 (rainbow ascending: warm→cool)
export const BELL_HZ: readonly number[] = [
  146.83, // D3  — red
  164.81, // E3  — orange
  185.00, // F#3 — yellow
  196.00, // G3  — green
  220.00, // A3  — blue
  246.94, // B3  — violet
];

export const HUE_COLORS: readonly string[] = [
  "#ef4444", // red
  "#f97316", // orange
  "#facc15", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // violet
];

export const HUE_LABELS: readonly string[] = [
  "Red", "Orange", "Yellow", "Green", "Blue", "Violet",
];

// ─── Audio context wrapper ────────────────────────────────────────────────────

export interface BellAudio {
  ctx: AudioContext;
  masterGain: GainNode;
  compressor: DynamicsCompressorNode;
  padGain: GainNode;
  stopPad: () => void;
  ringBell: (colorIdx: number) => void;
  close: () => void;
}

function buildReverb(ctx: AudioContext): ConvolverNode {
  // Synthesize a small room IR from decaying noise
  const sampleRate = ctx.sampleRate;
  const dur = 1.2; // seconds
  const len = Math.floor(sampleRate * dur);
  const ir = ctx.createBuffer(2, len, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // exponential decay + random noise + slight high-cut (average neighbours)
      const decay = Math.pow(1 - i / len, 2.2);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  return conv;
}

export function buildBellAudio(): BellAudio {
  const CtxCtor =
    (typeof window !== "undefined" &&
      (window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)) ||
    null;
  if (!CtxCtor) throw new Error("No AudioContext");

  const ctx = new CtxCtor();

  // Signal chain: sources → dry gain → compressor → master
  //                       → reverb → wet gain → compressor → master
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 8;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  comp.connect(master);

  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.7;
  dryGain.connect(comp);

  const reverb = buildReverb(ctx);
  reverb.connect(comp);

  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.28;
  wetGain.connect(reverb);

  // ── Gentle always-on pad (D3 + A3 fifth) ─────────────────────────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0;
  padGain.connect(dryGain);

  const padOscs: OscillatorNode[] = [];
  ([146.83, 220.0, 293.66] as const).forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.18 : i === 1 ? 0.12 : 0.06;
    o.connect(g);
    g.connect(padGain);
    o.start();
    padOscs.push(o);
  });

  // Fade pad in gently
  padGain.gain.setValueAtTime(0, ctx.currentTime);
  padGain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 2.5);

  // ── Bell synthesis (sine + 2nd partial FM) ────────────────────────────────
  function ringBell(colorIdx: number): void {
    const hz = BELL_HZ[colorIdx] ?? BELL_HZ[0];
    const t = ctx.currentTime;

    // Carrier sine — warm fundamental
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = hz;

    // Modulator for FM bell shimmer
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(hz * 3.5, t);
    modGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = hz * 2.756; // inharmonic FM ratio — bell timbre
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // Bright 2nd partial
    const partial = ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = hz * 2.0;
    const partialG = ctx.createGain();
    partialG.gain.setValueAtTime(0.22, t);
    partialG.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    partial.connect(partialG);

    // Envelope
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.7, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, t + 1.6);

    carrier.connect(env);
    partialG.connect(env);
    env.connect(dryGain);
    env.connect(wetGain);

    carrier.start(t);
    mod.start(t);
    partial.start(t);
    carrier.stop(t + 1.65);
    mod.stop(t + 0.25);
    partial.stop(t + 0.65);
  }

  function stopPad(): void {
    const t = ctx.currentTime;
    padGain.gain.setValueAtTime(padGain.gain.value, t);
    padGain.gain.linearRampToValueAtTime(0, t + 1.0);
    setTimeout(() => padOscs.forEach((o) => { try { o.stop(); } catch { /* ignore */ } }), 1200);
  }

  function close(): void {
    stopPad();
    setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 1300);
  }

  return { ctx, masterGain: master, compressor: comp, padGain, stopPad, ringBell, close };
}
