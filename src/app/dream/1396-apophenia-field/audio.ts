// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the just-intonation sonification engine for 1396-apophenia-field.
//
//   A faint filtered-noise bed + a low just drone sit under a growing chord of
//   everything the visitor has "recognised". Each recognised sign STRIKES a JI
//   chord (fast attack / long tail through the void reverb) and then holds a
//   sustained pad until it is forgotten — so the soundscape grows from hiss
//   toward a full consonant chord as signs accumulate.
//
//   AudioContext is gesture-gated (created only in begin(), from a click/tap).
//   Master ≤ 0.22, ramped up from silence (never a click) → limiter → out.
//   Sustained voices are capped and the oldest sign is stolen past the cap.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

const MASTER_PEAK = 0.2; // ≤ 0.22 ceiling
const MAX_GROUPS = 6; // sustained sign-pads on screen at once (≤ 12 sustained notes)

interface VoiceGroup {
  id: number;
  oscs: OscillatorNode[]; // sustained oscillators only
  gains: GainNode[];
}

export interface ApopheniaAudio {
  begin(): Promise<void>;
  /** Ring a sign's chord and hold its pad, keyed by the caller's sign id. */
  strike(id: number, notes: number[], intensity: number): void;
  /** Release a sign's sustained pad (its ring tail may still be sounding). */
  forget(id: number): void;
  /** Grow the bed as more signs accumulate (0..1-ish). */
  setDrive(signCount: number): void;
  dispose(): void;
}

/** The page owns sign ids and stays authoritative over the sign lifecycle; the
 *  engine simply keys its sustained pads by those ids. */
export function createAudio(): ApopheniaAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let drone: DroneBank | null = null;
  let verb: VoidReverb | null = null;
  let noiseSrc: AudioBufferSourceNode | null = null;
  let noiseGain: GainNode | null = null;
  const groups: VoiceGroup[] = [];
  let disposed = false;

  async function begin(): Promise<void> {
    if (ctx || disposed) return;
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* resumes on first node */
      }
    }
    const now = ctx.currentTime;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 2.2);
    master.connect(limiter);

    verb = createVoidReverb(ctx, { seconds: 5, decay: 2.6, wet: 0.6 });
    verb.output.connect(master);

    drone = startDroneBank(ctx, master, {
      root: 55,
      ratios: [1, 3 / 2, 2, 5 / 2, 3],
      peakGain: 0.1,
      cutoffLow: 150,
      cutoffHigh: 2200,
    });
    drone.setDrive(0);

    // Faint deterministic noise bed (the "hiss" the chord emerges from).
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let s = 0x1396abcd >>> 0;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = (s / 0xffffffff) * 2 - 1;
    }
    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buf;
    noiseSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1100;
    bp.Q.value = 0.5;
    noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.setTargetAtTime(0.05, now, 1.6);
    noiseSrc.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(master);
    if (verb) noiseGain.connect(verb.input);
    noiseSrc.start();
  }

  function strike(id: number, notes: number[], intensity: number): void {
    if (!ctx || !master || !verb || disposed) return;
    // Replace any existing pad with this id (re-recognition of the same sign).
    if (groups.some((g) => g.id === id)) forget(id);
    const now = ctx.currentTime;
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const list = notes.slice(0, 5);
    const topIdx = list.length - 1;

    list.forEach((f, i) => {
      // Root and the top colour tone sustain as the pad; the middle notes are
      // struck transients (the "ring") that decay away.
      const sustain = i === 0 || i === topIdx;
      const peak = (0.13 / Math.sqrt(i + 1)) * intensity;
      for (const det of [-3.5, 3.5]) {
        const osc = ctx!.createOscillator();
        osc.type = i === 0 ? "sine" : "triangle";
        osc.frequency.value = f;
        osc.detune.value = det;
        const g = ctx!.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0006, peak), now + 0.02);
        osc.connect(g);
        g.connect(verb!.input);
        g.connect(master!); // a touch dry for presence
        osc.start(now);
        if (sustain) {
          g.gain.exponentialRampToValueAtTime(
            Math.max(0.0004, peak * 0.3),
            now + 1.0,
          );
          oscs.push(osc);
          gains.push(g);
        } else {
          g.gain.exponentialRampToValueAtTime(0.0004, now + 2.8);
          osc.stop(now + 3.1);
        }
      }
    });

    groups.push({ id, oscs, gains });
    // Steal the oldest pad past the cap.
    while (groups.length > MAX_GROUPS) {
      const oldest = groups[0];
      forget(oldest.id);
    }
  }

  function forget(id: number): void {
    if (!ctx) return;
    const gi = groups.findIndex((g) => g.id === id);
    if (gi < 0) return;
    const group = groups[gi];
    groups.splice(gi, 1);
    const now = ctx.currentTime;
    for (const g of group.gains) {
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(0.0004, g.gain.value), now);
        g.gain.exponentialRampToValueAtTime(0.0003, now + 1.6);
      } catch {
        /* ctx closing */
      }
    }
    for (const o of group.oscs) {
      try {
        o.stop(now + 1.8);
      } catch {
        /* already stopped */
      }
    }
  }

  function setDrive(signCount: number): void {
    if (disposed) return;
    const d = Math.min(1, signCount / MAX_GROUPS);
    drone?.setDrive(d);
    if (noiseGain && ctx) {
      noiseGain.gain.setTargetAtTime(0.05 - 0.02 * d, ctx.currentTime, 0.6);
    }
    verb?.setWet(0.6 + 0.15 * d);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    const c = ctx;
    for (const group of [...groups]) forget(group.id);
    groups.length = 0;
    try {
      drone?.stop();
    } catch {
      /* noop */
    }
    try {
      noiseSrc?.stop();
    } catch {
      /* noop */
    }
    if (c) {
      window.setTimeout(() => {
        try {
          master?.disconnect();
          verb?.output.disconnect();
          noiseGain?.disconnect();
          void c.close();
        } catch {
          /* noop */
        }
      }, 300);
    }
    ctx = null;
  }

  return { begin, strike, forget, setDrive, dispose };
}
