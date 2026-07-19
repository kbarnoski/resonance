// ─────────────────────────────────────────────────────────────────────────────
// chain.ts — the lab's first ≥2-model AI pipeline, running $0 in the browser.
//
//   Model 1 (ASR):        microphone audio → text   (Xenova/whisper-tiny.en)
//   Model 2 (embedding):  text → 384-dim vector      (Xenova/all-MiniLM-L6-v2)
//
// Both models are Transformers.js pipelines fetched at RUNTIME from a CDN via a
// dynamic import marked `/* webpackIgnore: true */`, so nothing lands in
// package.json (this mirrors the proven depth-well / hand-loom loaders). The
// embedding is then REDUCED — by fixed random projections — into a small set of
// control params that drive BOTH the WebGL2 field and the Web Audio timbre.
// Semantically similar phrases project to nearby params, so they look & sound
// alike; different words paint the room differently.
// ─────────────────────────────────────────────────────────────────────────────

const CDN_TRANSFORMERS =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js";

export const EMBED_DIM = 384;
export const N_PARTIALS = 6;

/** A phrase reduced to visual + harmonic control params. Shared by gl + audio. */
export interface SemanticField {
  label: string; // the phrase itself
  hue: number; // 0..1 base hue for the field
  hueSpread: number; // 0.08..0.42 secondary hue offset
  turbulence: number; // 0..1 domain-warp turbulence
  symmetry: number; // 1..6 mirror-fold count
  warp: number; // 0.3..1.9 warp scale
  speed: number; // 0.25..1.35 flow speed
  brightness: number; // 0..1 spectral tilt (dark ↔ bright)
  inharm: number; // 0..1 FM inharmonicity depth
  root: number; // ~90..270 Hz fundamental
  ratios: number[]; // N_PARTIALS partial ratios (non-lattice, word-derived)
}

export type EmbedPipe = (text: string) => Promise<Float32Array>;
export type AsrPipe = (audio: Float32Array) => Promise<string>;

export interface Progress {
  stage: string; // human label
  pct: number; // 0..1 (may be indeterminate → -1)
}

type AnyMod = {
  pipeline: (task: string, model: string, opts?: unknown) => Promise<unknown>;
  env: { allowLocalModels: boolean; allowRemoteModels?: boolean };
};

let modCache: AnyMod | null = null;

async function loadModule(): Promise<AnyMod> {
  if (modCache) return modCache;
  const mod = await import(
    /* webpackIgnore: true */ /* @vite-ignore */ CDN_TRANSFORMERS as string
  ).catch(() => null);
  if (!mod) throw new Error("Transformers.js CDN import failed");
  const m = mod as AnyMod;
  m.env.allowLocalModels = false;
  modCache = m;
  return m;
}

/** Load the embedding model (Model 2). Cheap-ish (~25MB); the fallback path
 *  needs ONLY this, so it loads first. */
export async function loadEmbedder(
  onProgress?: (p: Progress) => void,
): Promise<EmbedPipe> {
  const { pipeline } = await loadModule();
  onProgress?.({ stage: "sentence embedder", pct: -1 });
  const pipe = (await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
    {
      progress_callback: (d: { status?: string; progress?: number }) => {
        if (d?.status === "progress" && typeof d.progress === "number") {
          onProgress?.({ stage: "sentence embedder", pct: d.progress / 100 });
        }
      },
    },
  )) as (text: string, opts: unknown) => Promise<{ data: Float32Array }>;

  return async (text: string) => {
    const out = await pipe(text, { pooling: "mean", normalize: true });
    return out.data instanceof Float32Array
      ? out.data
      : new Float32Array(out.data as ArrayLike<number>);
  };
}

/** Load the ASR model (Model 1). Larger (~40MB); only needed for the voice
 *  path, so it loads lazily after the embedder. */
export async function loadAsr(
  onProgress?: (p: Progress) => void,
): Promise<AsrPipe> {
  const { pipeline } = await loadModule();
  onProgress?.({ stage: "speech recogniser", pct: -1 });
  const pipe = (await pipeline(
    "automatic-speech-recognition",
    "Xenova/whisper-tiny.en",
    {
      progress_callback: (d: { status?: string; progress?: number }) => {
        if (d?.status === "progress" && typeof d.progress === "number") {
          onProgress?.({ stage: "speech recogniser", pct: d.progress / 100 });
        }
      },
    },
  )) as (audio: Float32Array, opts?: unknown) => Promise<{ text: string }>;

  return async (audio: Float32Array) => {
    const out = await pipe(audio, { chunk_length_s: 30 });
    return (out?.text ?? "").trim();
  };
}

// ── embedding → params reduction ────────────────────────────────────────────

/** A fixed random projection of the embedding: dot(v, w) where w is a
 *  deterministic pseudo-random {-1,1}-ish vector seeded by `seed`. Because v is
 *  unit-normalised, the result is a small, roughly-Gaussian scalar that we
 *  squash into 0..1. Same seed → same axis of meaning every run. */
function project(v: Float32Array, seed: number): number {
  let s = 0;
  let r = (seed * 2654435761) >>> 0;
  for (let i = 0; i < v.length; i++) {
    r = (r * 1664525 + 1013904223) >>> 0;
    const w = (r / 4294967296) * 2 - 1;
    s += w * v[i];
  }
  return s;
}

/** squash a projection (~[-0.3,0.3]) into a well-spread 0..1. */
function squash(x: number): number {
  return 0.5 + 0.5 * Math.tanh(x * 6.0);
}

/** Reduce a 384-dim embedding into the shared control field. Deterministic:
 *  the SAME phrase always paints the SAME room, and near phrases land near. */
export function reduceField(
  embedding: Float32Array,
  label: string,
): SemanticField {
  const p = (seed: number) => squash(project(embedding, seed));

  const brightness = p(6);
  const inharm = p(7);

  // A continuously-varying, non-lattice partial set: each interval is chosen by
  // the meaning, so the "scale" itself is different for every phrase.
  const ratios: number[] = [1];
  let acc = 1;
  for (let i = 0; i < N_PARTIALS - 1; i++) {
    const step = 1.17 + 0.7 * p(20 + i); // 1.17..1.87
    acc *= step;
    ratios.push(acc);
  }

  return {
    label,
    hue: p(0),
    hueSpread: 0.08 + 0.34 * p(1),
    turbulence: p(2),
    symmetry: 1 + Math.round(5 * p(3)),
    warp: 0.3 + 1.6 * p(4),
    speed: 0.25 + 1.1 * p(5),
    brightness,
    inharm,
    root: 90 * Math.pow(2, 1.55 * p(8)), // ~90..264 Hz
    ratios,
  };
}

/** A gentle neutral field for the pre-load "ghost", so the room is never blank
 *  or silent before any model has spoken. */
export function seedField(label = "resonance"): SemanticField {
  return {
    label,
    hue: 0.72,
    hueSpread: 0.18,
    turbulence: 0.4,
    symmetry: 3,
    warp: 0.9,
    speed: 0.6,
    brightness: 0.45,
    inharm: 0.25,
    root: 132,
    ratios: [1, 1.5, 2.02, 2.68, 3.4, 4.5],
  };
}

/** Example phrases that auto-cycle so the mapping demonstrates itself. Chosen to
 *  be semantically far apart → visibly & audibly distinct fields. */
export const SEED_PHRASES = [
  "ocean at midnight",
  "a bright brass fanfare",
  "quiet snow",
  "deep red forest",
];
