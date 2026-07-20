// ─────────────────────────────────────────────────────────────────────────────
// ml.ts — the two-model in-browser inference chain for 2004-oracle-echo.
//
//   Model 1 (ASR):  Xenova/whisper-tiny.en  — live mic → text
//   Model 2 (SST):  Xenova/distilbert-base-uncased-finetuned-sst-2-english
//                   — text → POSITIVE/NEGATIVE + score → musical valence
//
//   Both run entirely client-side via Transformers.js v4, dynamic-imported from
//   a CDN ESM URL at RUNTIME (never bundled, never in package.json). The magic
//   comments keep the bundlers from trying to resolve the URL; the specifier is
//   also a variable, so `import()` is typed `any` and TS never module-resolves
//   it. If the network / WASM / WebGPU is missing, load() throws and the caller
//   drops to the Web-Audio spectral-feature fallback (see audio.ts).
// ─────────────────────────────────────────────────────────────────────────────

const CDN_PRIMARY = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.0";
const CDN_FALLBACK = "https://esm.sh/@huggingface/transformers@4";

type InferFn = (input: unknown, opts?: unknown) => Promise<unknown>;

export interface Sentiment {
  label: string;
  score: number;
  /** Mapped musical valence: 0 = dark/minor, 1 = bright/major. */
  valence: number;
}

// Whisper reliably hallucinates these on silence / room tone — drop them so the
// oracle stays quiet instead of chanting YouTube outros at an empty room.
const HALLUCINATIONS = new Set([
  "you",
  "thank you",
  "thank you.",
  "thanks for watching",
  "thanks for watching!",
  "please subscribe",
  "bye",
  "bye.",
  "the",
  "so",
  ".",
  "yeah",
]);

/** Strip bracketed tags and stray symbols from raw ASR output. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\w\s'’.,!?-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if a cleaned transcript is worth showing / scoring. */
export function isMeaningful(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.length < 2) return false;
  if (!/[a-z]/.test(t)) return false;
  return !HALLUCINATIONS.has(t.replace(/[.!?]+$/, ""));
}

export class OracleML {
  private asr: InferFn | null = null;
  private clf: InferFn | null = null;
  /** Guards against overlapping inference on the single WASM/GPU backend. */
  busy = false;

  async load(onStatus?: (s: string) => void): Promise<void> {
    onStatus?.("loading transformers.js…");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let TF: any;
    try {
      TF = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ CDN_PRIMARY);
    } catch {
      TF = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ CDN_FALLBACK);
    }
    // Pull models from the HF hub rather than a (non-existent) local path.
    try {
      if (TF?.env) TF.env.allowLocalModels = false;
    } catch {
      /* env not present in this build — ignore */
    }

    onStatus?.("loading whisper-tiny.en…");
    this.asr = await this.buildAsr(TF);

    onStatus?.("loading distilbert sentiment…");
    this.clf = (await TF.pipeline(
      "text-classification",
      "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
    )) as InferFn;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async buildAsr(TF: any): Promise<InferFn> {
    try {
      return (await TF.pipeline(
        "automatic-speech-recognition",
        "Xenova/whisper-tiny.en",
      )) as InferFn;
    } catch {
      return (await TF.pipeline(
        "automatic-speech-recognition",
        "onnx-community/whisper-tiny.en",
      )) as InferFn;
    }
  }

  ready(): boolean {
    return !!this.asr && !!this.clf;
  }

  /** Transcribe a mono Float32 window already resampled to 16 kHz. */
  async transcribe(pcm16k: Float32Array): Promise<string> {
    if (!this.asr) return "";
    const out = (await this.asr(pcm16k)) as { text?: string } | undefined;
    return (out?.text ?? "").trim();
  }

  async sentiment(text: string): Promise<Sentiment> {
    if (!this.clf) return { label: "NEUTRAL", score: 0.5, valence: 0.5 };
    const res = (await this.clf(text)) as
      | Array<{ label: string; score: number }>
      | { label: string; score: number };
    const first = Array.isArray(res) ? res[0] : res;
    const label = first?.label ?? "NEUTRAL";
    const score = first?.score ?? 0.5;
    const positive = label.toUpperCase().startsWith("POS");
    const valence = positive ? 0.5 + score * 0.5 : 0.5 - score * 0.5;
    return { label, score, valence };
  }
}
