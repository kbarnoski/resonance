// audio.ts — the disintegration engine for 9368-afterglow.
//
// THE MECHANIC. A decoded AudioBuffer — Karel's real *Welcome Home* piano, or
// the seeded synth stand-in — is looped, and over a long arc it is worn thin:
//
//   • a DRY path carries the clean recording at the start and fades out first,
//     so the opening genuinely sounds like him;
//   • a parallel FILTERBANK (a bank of bandpass filters) carries the rest, and
//     each band slowly loses gain and flickers into gaps on its own seeded
//     schedule — spectral bands drop out, the "tape wears thin";
//   • meanwhile the GRAIN CLOUD (grains.ts) reads the pristine buffer and rises
//     to fill the opening gaps.
//
// Total energy stays roughly constant while the MATERIAL migrates from his real
// notes to a soft cloud of remembered fragments: him -> the memory of him.
//
// This is not a full FFT resynth — a filterbank erosion + per-band gain
// automation reads the idea clearly and cannot glitch. After William Basinski,
// *The Disintegration Loops* (a tape loop that erodes with every pass).
//
// Deterministic: the per-band erosion schedule is drawn from mulberry32. The one
// clock we read is the audio clock (ctx.currentTime), which is allowed — it is
// not wall-clock time and does not vary run to run for a given render.

import { mulberry32 } from "./rng";
import { createGrainCloud, type GrainCloud } from "./grains";
import { synthesizeWelcomeHome } from "./synth";

/** Full disintegration arc, seconds. Him -> memory over this span. */
export const DURATION_SEC = 78;

export type SourceMode = "real" | "synth";

export interface SourceLoad {
  buffer: AudioBuffer;
  mode: SourceMode;
  /** Human status line for the chrome. */
  note: string;
  /** Non-empty only on a genuine load error (shown in destructive red). */
  hardError: string;
}

// The proven fetch idiom (see 4264-lucent/page.tsx lines 144–155): a 4s aborting
// fetch of the read-only audio endpoint, then decodeAudioData. Any failure falls
// soft to the seeded synth so the piece is never silent.
export async function loadSourceBuffer(
  ctx: AudioContext,
  uuid: string,
  externalSignal?: AbortSignal
): Promise<SourceLoad> {
  try {
    if (typeof ctx.decodeAudioData !== "function") {
      throw new Error("decodeAudioData unsupported");
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    // Abort our fetch if the caller (unmount) aborts too.
    if (externalSignal) {
      if (externalSignal.aborted) ctrl.abort();
      else externalSignal.addEventListener("abort", () => ctrl.abort());
    }
    try {
      const metaRes = await fetch(`/api/audio/${uuid}`, { signal: ctrl.signal });
      if (!metaRes.ok) throw new Error(`audio API ${metaRes.status}`);
      const meta = (await metaRes.json()) as { url?: string };
      if (!meta.url) throw new Error("no url in response");

      const audioRes = await fetch(meta.url, { signal: ctrl.signal });
      if (!audioRes.ok) throw new Error(`audio file ${audioRes.status}`);
      const buf = await audioRes.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      clearTimeout(t);
      return {
        buffer: decoded,
        mode: "real",
        note: "Karel's Welcome Home piano is playing — and beginning to remember itself.",
        hardError: "",
      };
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError" && externalSignal?.aborted) {
      throw err; // unmounted mid-load — let the caller bail
    }
    const buffer = synthesizeWelcomeHome(ctx);
    const msg = err instanceof Error ? err.message : String(err);
    const missing =
      msg.includes("404") ||
      msg.includes("no url") ||
      msg.includes("audio API 4") ||
      msg.includes("audio file 4");
    return {
      buffer,
      mode: "synth",
      note: missing
        ? "Recording unavailable — a seeded warm piano is playing instead, and disintegrating just the same."
        : "Playing a seeded warm-piano stand-in — it disintegrates and regrows exactly like the real take.",
      hardError: missing ? "" : `Audio load failed: ${msg.slice(0, 80)}`,
    };
  }
}

/** Decode an arbitrary dropped audio file into a buffer (source override). */
export async function decodeFileBuffer(
  ctx: AudioContext,
  file: File
): Promise<AudioBuffer> {
  const arr = await file.arrayBuffer();
  return ctx.decodeAudioData(arr.slice(0));
}

export interface MemoryEngine {
  /** 0..1 over the disintegration arc; holds at 1 once fully dissolved. */
  progress(): number;
  /** Grains spawned so far (visual density signal). */
  grainCount(): number;
  stop(): void;
}

// Bandpass centres spanning the piano's body (Hz). Parallel bandpass gains,
// summed, roughly reconstitute the signal; dropping bands opens real gaps.
const BANDS = [110, 196, 330, 550, 900, 1500, 2600, 4400];

export function createMemoryEngine(
  ctx: AudioContext,
  master: AudioNode,
  buffer: AudioBuffer,
  seed: number,
  reduced: boolean
): MemoryEngine {
  const rand = mulberry32(seed ^ 0x1055);

  // Looping source of the (immutable) recording.
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // DRY path: the clean recording, present at the start, first to go.
  const dry = ctx.createGain();
  dry.gain.value = 0.9;
  source.connect(dry);
  dry.connect(master);

  // FILTERBANK erosion path.
  interface Band {
    gainNode: GainNode;
    deathFrac: number; // arc fraction at which this band is essentially gone
    // slow gap wobble state
    gapTarget: number;
    gapNextAt: number;
    speed: number; // how fast this band re-picks its gap target (slower = calmer)
  }
  const bands: Band[] = BANDS.map((hz) => {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = hz;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    source.connect(bp);
    bp.connect(g);
    g.connect(master);
    return {
      gainNode: g,
      deathFrac: 0.3 + rand() * 0.6, // bands die between 30% and 90% of the arc
      gapTarget: 1,
      gapNextAt: 0,
      speed: 1.5 + rand() * 2.0, // seconds between gap re-targets
    };
  });

  // The remembered-material cloud (reads the pristine buffer, bypasses erosion).
  const grains: GrainCloud = createGrainCloud(ctx, buffer, master, seed);

  const startedAt = ctx.currentTime;
  source.start();

  // Control loop on setInterval; all changes are slow setTargetAtTime ramps so
  // nothing strobes and nothing clicks. (Audio-clock timing only.)
  let stopped = false;
  const CONTROL_MS = 180;
  // Slower motion under reduced-motion preference (calmer gap flicker).
  const gapDepth = reduced ? 0.55 : 0.25; // higher floor = fewer/gentler gaps
  const speedScale = reduced ? 1.8 : 1;

  function tick(): void {
    if (stopped) return;
    const now = ctx.currentTime;
    const p = Math.min(1, (now - startedAt) / DURATION_SEC);

    // Dry clean recording fades out first (gone by ~42% of the arc).
    dry.gain.setTargetAtTime(Math.max(0, 1 - p * 2.4) * 0.9, now, 0.7);

    // Each band thins, then dies past its death fraction, and flickers gaps.
    const baseFade = Math.max(0, 1 - p * 0.8);
    for (const b of bands) {
      if (now >= b.gapNextAt) {
        // Re-pick a slow gap target: sometimes near-open, sometimes a deep gap.
        const deep = rand() < 0.35 + p * 0.4; // gaps get more frequent late
        b.gapTarget = deep ? gapDepth + rand() * 0.25 : 0.7 + rand() * 0.3;
        b.gapNextAt = now + b.speed * speedScale * (0.7 + rand() * 0.9);
      }
      const dead = p > b.deathFrac ? Math.max(0, 1 - (p - b.deathFrac) * 6) : 1;
      const target = baseFade * b.gapTarget * dead * 0.6;
      // Slow ramp — no strobe. Reduced motion ramps even slower.
      b.gainNode.gain.setTargetAtTime(target, now, reduced ? 1.1 : 0.7);
    }

    // Grain cloud rises to fill the vacated material and softens as it takes over.
    grains.setLevel(Math.min(0.95, p * 1.25));
    grains.setTone(Math.max(0, (p - 0.15) * 1.3));
  }

  const timer = window.setInterval(tick, CONTROL_MS);
  tick();

  return {
    progress() {
      return Math.min(1, (ctx.currentTime - startedAt) / DURATION_SEC);
    },
    grainCount() {
      return grains.grainCount();
    },
    stop() {
      stopped = true;
      window.clearInterval(timer);
      grains.stop();
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
        dry.disconnect();
        for (const b of bands) b.gainNode.disconnect();
      } catch {
        /* ctx closing */
      }
    },
  };
}
