// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the field sonifies itself.
//
// A just-intonation drone bed (the shared `startDroneBank`) whose brightness and
// level track DRIVE (mic amplitude → distance across the bifurcation). On top of
// the bed sits ONE extra "regime partial": a bright upper voice that fades IN as
// the pattern walks toward hexagons/honeycombs and OUT toward stripes/tunnels, so
// the ear tracks the same symmetry-class morph the eye is watching. No network,
// no new deps, full teardown on unmount.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";

export interface FieldAudio {
  resume(): Promise<void>;
  running(): boolean;
  /** DRIVE 0..1 → drone brightness/level. */
  setDrive(d: number): void;
  /** Regime blend 0..1 (0 = stripes/tunnels, 1 = hexagons/honeycomb). */
  setRegime(x: number): void;
  dispose(): void;
}

export function makeFieldAudio(): FieldAudio {
  let ctx: AudioContext | null = null;
  let bank: DroneBank | null = null;
  let master: GainNode | null = null;
  let partialOsc: OscillatorNode | null = null;
  let partialGain: GainNode | null = null;
  let started = false;
  let disposed = false;

  const ensure = (): AudioContext => {
    if (ctx) return ctx;
    const Ctx: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    // just-intonation bed — a low violet drone
    bank = startDroneBank(ctx, master, {
      root: 55,
      ratios: [1, 3 / 2, 2, 5 / 2],
      cutoffLow: 180,
      cutoffHigh: 2400,
      peakGain: 0.3,
    });

    // regime partial: a pure high fifth (3:1 · 3:2 ≈ 6th harmonic) that the
    // honeycomb regime lights up. Starts silent.
    partialOsc = ctx.createOscillator();
    partialOsc.type = "sine";
    partialOsc.frequency.value = 55 * 6; // 330 Hz-ish bright partial
    partialGain = ctx.createGain();
    partialGain.gain.value = 0.0001;
    partialOsc.connect(partialGain);
    partialGain.connect(master);
    partialOsc.start();

    return ctx;
  };

  return {
    async resume() {
      if (disposed) return;
      const c = ensure();
      if (c.state === "suspended") await c.resume();
      started = true;
    },
    running() {
      return started && !disposed && ctx?.state === "running";
    },
    setDrive(d: number) {
      if (!bank) return;
      bank.setDrive(Math.min(1, Math.max(0, d)));
    },
    setRegime(x: number) {
      if (!ctx || !partialGain) return;
      const g = 0.0001 + 0.11 * Math.min(1, Math.max(0, x));
      partialGain.gain.setTargetAtTime(g, ctx.currentTime, 0.25);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      started = false;
      try {
        bank?.stop();
        if (partialOsc && ctx) {
          partialGain?.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
          partialOsc.stop(ctx.currentTime + 0.4);
        }
      } catch {
        /* ctx closing */
      }
      const c = ctx;
      window.setTimeout(() => {
        try {
          void c?.close();
        } catch {
          /* already closed */
        }
      }, 600);
      ctx = null;
      bank = null;
      master = null;
      partialOsc = null;
      partialGain = null;
    },
  };
}
