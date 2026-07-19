"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1992 · Semantic Choir — sing WORDS and the room is painted with their MEANING.
// The lab's first ≥2-model AI pipeline chain, running $0 in the browser:
//   voice → text (Whisper-tiny.en) → 384-dim embedding (all-MiniLM-L6-v2)
//   → reduced control params → WebGL2 field + Web Audio timbre.
// The embedding of the sung language is the brush (cf. Akten, Anadol).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { ChoirAudio } from "./audio";
import {
  AsrPipe,
  EmbedPipe,
  Progress,
  SEED_PHRASES,
  SemanticField,
  loadAsr,
  loadEmbedder,
  reduceField,
  seedField,
} from "./chain";
import { SemanticGL, hasWebGL2 } from "./gl";
import { capturePhrase } from "./mic";

type Phase =
  | "intro"
  | "listening"
  | "transcribing"
  | "thinking"
  | "live"
  | "typing";

interface Disp {
  hue: number;
  hueSpread: number;
  turb: number;
  sym: number;
  warp: number;
  speed: number;
  bright: number;
  morph: number;
}

// Hand-authored, deliberately-distinct fields so the room is alive & self-
// demoing BEFORE any model loads. Once the embedder is ready these are swapped
// for the REAL reduced embeddings of the same phrases.
const GHOST_FIELDS: SemanticField[] = [
  {
    label: "ocean at midnight",
    hue: 0.6,
    hueSpread: 0.14,
    turbulence: 0.3,
    symmetry: 2,
    warp: 0.7,
    speed: 0.45,
    brightness: 0.2,
    inharm: 0.15,
    root: 98,
    ratios: [1, 1.5, 2.01, 2.66, 3.38, 4.2],
  },
  {
    label: "a bright brass fanfare",
    hue: 0.11,
    hueSpread: 0.3,
    turbulence: 0.55,
    symmetry: 4,
    warp: 1.3,
    speed: 1.05,
    brightness: 0.92,
    inharm: 0.5,
    root: 176,
    ratios: [1, 1.49, 2.02, 2.5, 3.01, 3.98],
  },
  {
    label: "quiet snow",
    hue: 0.54,
    hueSpread: 0.1,
    turbulence: 0.14,
    symmetry: 6,
    warp: 0.5,
    speed: 0.32,
    brightness: 0.7,
    inharm: 0.1,
    root: 208,
    ratios: [1, 1.53, 2.31, 3.02, 3.9, 5.1],
  },
  {
    label: "deep red forest",
    hue: 0.99,
    hueSpread: 0.22,
    turbulence: 0.62,
    symmetry: 3,
    warp: 1.05,
    speed: 0.6,
    brightness: 0.4,
    inharm: 0.32,
    root: 118,
    ratios: [1, 1.42, 1.98, 2.71, 3.5, 4.6],
  },
];

const NOTES = [
  "Sing or speak a short phrase. A first AI model (Whisper) turns your voice into words; a second (MiniLM) turns those words into a 384-dimension meaning-vector. That vector is reduced — by fixed random projections — into the hue, turbulence, symmetry and flow of the WebGL2 field, and into the fundamental, partial set, brightness and inharmonicity of the sound.",
  "Because the mapping is deterministic, the same phrase always paints the same room, and phrases that MEAN similar things land near each other — 'quiet snow' and 'soft white silence' drift toward the same corner of colour and timbre; 'brass fanfare' and 'red forest' pull genuinely different hues.",
  "The harmonic model is derived from the meaning itself — a word-chosen, continuously-varying partial set with FM inharmonicity — not a fixed just-intonation lattice. Reference points: Memo Akten's Learning to See (latent-space perceptual mapping) and Refik Anadol's data-as-pigment work; the fresh move here is that the semantic embedding of sung language is the brush.",
  "Both models download once from a CDN (~40–80MB) and run entirely in your browser — no server, no API keys. Rough edges: Whisper-tiny mishears short/sung fragments, the projection axes are arbitrary (meaningful relative distances, not absolute 'blue = sad'), and first load is slow on the ASR model.",
];

function lerpHue(a: number, b: number, t: number): number {
  let d = b - a;
  d -= Math.round(d);
  let h = a + d * t;
  h -= Math.floor(h);
  return h;
}

export default function SemanticChoirPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<SemanticGL | null>(null);
  const audioRef = useRef<ChoirAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  const targetRef = useRef<SemanticField>(seedField());
  const dispRef = useRef<Disp>({
    hue: 0.72,
    hueSpread: 0.18,
    turb: 0.4,
    sym: 3,
    warp: 0.9,
    speed: 0.6,
    bright: 0.45,
    morph: 1,
  });
  const cycleFieldsRef = useRef<SemanticField[]>(GHOST_FIELDS);
  const cycleIdxRef = useRef(0);
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const micLevelRef = useRef<() => number>(() => 0);

  const embedderRef = useRef<Promise<EmbedPipe> | null>(null);
  const asrRef = useRef<Promise<AsrPipe> | null>(null);

  const [phase, setPhase] = useState<Phase>("intro");
  const [webglOk, setWebglOk] = useState(true);
  const [label, setLabel] = useState<string>(seedField().label);
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [typed, setTyped] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── set the active field (visual target + audio) ──────────────────────────
  const setField = useCallback((f: SemanticField) => {
    targetRef.current = f;
    dispRef.current.morph = 0;
    setLabel(f.label);
    audioRef.current?.applyField(f);
  }, []);

  const stopCycle = useCallback(() => {
    if (cycleTimerRef.current !== null) {
      clearInterval(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
  }, []);

  const startCycle = useCallback(() => {
    if (cycleTimerRef.current !== null) return;
    setField(cycleFieldsRef.current[cycleIdxRef.current % cycleFieldsRef.current.length]);
    cycleTimerRef.current = setInterval(() => {
      cycleIdxRef.current += 1;
      const arr = cycleFieldsRef.current;
      setField(arr[cycleIdxRef.current % arr.length]);
    }, 7000);
  }, [setField]);

  // ── lazy model loaders (cached) ───────────────────────────────────────────
  const ensureEmbedder = useCallback((): Promise<EmbedPipe> => {
    if (!embedderRef.current) {
      embedderRef.current = loadEmbedder((p) => setProgress(p)).then((e) => {
        setProgress(null);
        // upgrade the ghost cycle to REAL embeddings of the seed phrases
        Promise.all(SEED_PHRASES.map((ph) => e(ph)))
          .then((vecs) => {
            cycleFieldsRef.current = vecs.map((v, i) =>
              reduceField(v, SEED_PHRASES[i]),
            );
          })
          .catch(() => {});
        return e;
      });
      embedderRef.current.catch(() => {
        embedderRef.current = null;
      });
    }
    return embedderRef.current;
  }, []);

  const ensureAsr = useCallback((): Promise<AsrPipe> => {
    if (!asrRef.current) {
      asrRef.current = loadAsr((p) => setProgress(p)).then((a) => {
        setProgress(null);
        return a;
      });
      asrRef.current.catch(() => {
        asrRef.current = null;
      });
    }
    return asrRef.current;
  }, []);

  // ── start audio on the first user gesture ─────────────────────────────────
  const ensureAudio = useCallback(async () => {
    if (!audioRef.current) {
      audioRef.current = new ChoirAudio();
      audioRef.current.applyField(targetRef.current);
    }
    await audioRef.current.start();
  }, []);

  // ── embed a phrase of text and paint with it ──────────────────────────────
  const runPhrase = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      stopCycle();
      setPhase("thinking");
      setStatus(`embedding "${clean}"`);
      try {
        const embed = await ensureEmbedder();
        const vec = await embed(clean);
        setField(reduceField(vec, clean));
        setStatus("");
        setPhase("live");
      } catch {
        setErrorMsg("The embedding model could not load. Check your connection.");
        setPhase("intro");
      }
    },
    [ensureEmbedder, setField, stopCycle],
  );

  // ── the voice path: mic → whisper → embedding ─────────────────────────────
  const runVoice = useCallback(async () => {
    setErrorMsg(null);
    await ensureAudio();
    let mic;
    try {
      mic = await capturePhrase(3.8);
    } catch {
      // mic denied / unavailable → fall back to typed input, keep everything
      setErrorMsg("No microphone — type a phrase instead.");
      setPhase("typing");
      ensureEmbedder();
      return;
    }
    stopCycle();
    micLevelRef.current = mic.level;
    setPhase("listening");
    setStatus("listening…");
    try {
      // kick off model loads while we record
      const asrP = ensureAsr();
      const embP = ensureEmbedder();
      const samples = await mic.done;
      micLevelRef.current = () => 0;
      setPhase("transcribing");
      setStatus("transcribing…");
      const asr = await asrP;
      const text = await asr(samples);
      if (!text || text.length < 2) {
        setStatus("didn't catch that — try again");
        setPhase("live");
        return;
      }
      setPhase("thinking");
      setStatus(`heard "${text}" — embedding`);
      const embed = await embP;
      const vec = await embed(text);
      setField(reduceField(vec, text));
      setStatus("");
      setPhase("live");
    } catch {
      micLevelRef.current = () => 0;
      setErrorMsg("Models failed to load — type a phrase instead.");
      setPhase("typing");
      ensureEmbedder();
    }
  }, [ensureAsr, ensureAudio, ensureEmbedder, setField, stopCycle]);

  const onType = useCallback(async () => {
    setErrorMsg(null);
    await ensureAudio();
    setPhase("typing");
    ensureEmbedder();
  }, [ensureAudio, ensureEmbedder]);

  const submitTyped = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const t = typed;
      setTyped("");
      await ensureAudio();
      await runPhrase(t);
    },
    [ensureAudio, runPhrase, typed],
  );

  // ── boot: GL + render loop + ghost cycle ──────────────────────────────────
  useEffect(() => {
    if (!hasWebGL2()) {
      setWebglOk(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    let gl: SemanticGL;
    try {
      gl = new SemanticGL(canvas);
    } catch {
      setWebglOk(false);
      return;
    }
    glRef.current = gl;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      gl.resize(window.innerWidth, window.innerHeight, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    startCycle();

    const frame = (ts: number) => {
      const dt = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0.016;
      lastTsRef.current = ts;

      const tgt = targetRef.current;
      const d = dispRef.current;
      const k = Math.min(1, dt * 2.2); // smoothing toward target
      d.hue = lerpHue(d.hue, tgt.hue, k);
      d.hueSpread += (tgt.hueSpread - d.hueSpread) * k;
      d.turb += (tgt.turbulence - d.turb) * k;
      d.sym += (tgt.symmetry - d.sym) * k;
      d.warp += (tgt.warp - d.warp) * k;
      d.speed += (tgt.speed - d.speed) * k;
      d.bright += (tgt.brightness - d.bright) * k;
      d.morph = Math.min(1, d.morph + dt / 1.3);

      const audio = audioRef.current;
      const level = audio ? audio.level() : 0;

      // recording meter
      if (meterRef.current) {
        const ml = micLevelRef.current();
        meterRef.current.style.transform = `scaleX(${Math.max(0.02, ml)})`;
      }

      gl.render({
        hue: d.hue,
        hueSpread: d.hueSpread,
        turb: d.turb,
        sym: d.sym,
        warp: d.warp,
        speed: d.speed,
        bright: d.bright,
        level,
        morph: d.morph,
      });
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stopCycle();
      gl.dispose();
      glRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [startCycle, stopCycle]);

  const busy =
    phase === "listening" || phase === "transcribing" || phase === "thinking";

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      {webglOk ? (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-muted-foreground">
            This piece needs WebGL2, which your browser or device does not
            expose. Try a recent desktop Chrome, Edge, or Firefox.
          </p>
        </div>
      )}

      {/* top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-5 sm:p-7">
        <div className="max-w-xl">
          <h1 className="font-semibold text-2xl leading-tight tracking-tight text-foreground sm:text-3xl">
            Semantic Choir
          </h1>
          <p className="mt-1.5 text-base text-muted-foreground">
            Sing a phrase — a two-model AI chain turns your words into their
            meaning, and the meaning paints the room with light and sound.
          </p>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            now painting · {label}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* bottom control dock */}
      {webglOk && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-5 sm:p-7">
          {(progress || status || errorMsg) && (
            <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2 rounded-md border border-border bg-background/70 px-4 py-3 backdrop-blur-sm">
              {errorMsg && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}
              {status && (
                <p className="text-sm text-foreground">{status}</p>
              )}
              {progress && (
                <div className="flex flex-col gap-1">
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    loading {progress.stage}
                    {progress.pct >= 0
                      ? ` · ${Math.round(progress.pct * 100)}%`
                      : " · …"}
                  </p>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full origin-left bg-primary transition-transform"
                      style={{
                        transform: `scaleX(${progress.pct >= 0 ? progress.pct : 0.35})`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === "listening" && (
            <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md border border-border bg-background/70 px-4 py-3 backdrop-blur-sm">
              <span className="text-sm text-foreground">Listening</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  ref={meterRef}
                  className="h-full origin-left bg-primary"
                  style={{ transform: "scaleX(0.02)" }}
                />
              </div>
            </div>
          )}

          {phase === "typing" && (
            <form
              onSubmit={submitTyped}
              className="pointer-events-auto flex w-full max-w-md gap-2"
            >
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="type a phrase — e.g. warm brass, quiet snow…"
                className="min-h-[44px] flex-1 rounded-md border border-border bg-background/70 px-4 text-base text-foreground backdrop-blur-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={!typed.trim()}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                Paint
              </button>
            </form>
          )}

          {(phase === "intro" || phase === "live" || phase === "typing") && (
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={runVoice}
                disabled={busy}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {phase === "live" ? "Sing again" : "Start singing"}
              </button>
              {phase !== "typing" && (
                <button
                  type="button"
                  onClick={onType}
                  disabled={busy}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                >
                  Type a phrase
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-2xl tracking-tight text-foreground">
              Semantic Choir
            </h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              voice → text → embedding → light + sound
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {NOTES.map((n, i) => (
                <p
                  key={i}
                  className="text-sm leading-relaxed text-muted-foreground"
                >
                  {n}
                </p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
