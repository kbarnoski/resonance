"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 9368 · Afterglow — the recording remembers itself.
//
// THE ONE QUESTION: What if Karel's real piano recording never just played back
// — but slowly disintegrated, and a granular cloud regrew the lost material from
// remembered grains, so the piece dissolves from HIM into the MEMORY of him?
//
// On "Begin the memory" we fetch Karel's *Welcome Home* piano, decode it, and
// hand it to the disintegration engine (audio.ts): the clean recording erodes
// band by band while a granular cloud (grains.ts) — reading the pristine buffer,
// biased toward its opening — rises to fill the gaps. If the fetch/decode fails
// we synthesise a seeded warm-piano phrase (synth.ts) and disintegrate THAT
// instead; the piece is never silent. Drop an audio file to override the source.
//
// The visual is an inline-SVG afterglow cloud of warm blobs whose brightness
// maps to the live spectrum and whose diffusion/softening tracks the
// disintegration. On mount a seeded no-audio demo blooms the cloud within ~1s so
// a muted glance already sees the art alive.
//
// References (see README): William Basinski, *The Disintegration Loops*; Curtis
// Roads, *Microsound* (granular resynthesis).
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { mulberry32, SEED } from "./rng";
import {
  loadSourceBuffer,
  decodeFileBuffer,
  createMemoryEngine,
  type MemoryEngine,
  type SourceMode,
} from "./audio";

const DEFAULT_UUID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

const VIEW_W = 1000;
const VIEW_H = 600;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const N_BLOBS = 42; // spectral blobs — his notes
const N_MOTES = 34; // remembered grains — the memory of him

type Status = "idle" | "loading" | "running" | "error";

interface Blob {
  angle: number;
  baseR: number;
  size: number;
  bin: number; // spectrum bin this blob listens to
  speed: number;
  phase: number;
  fill: string; // gradient id
}

interface Mote {
  angle: number;
  baseR: number;
  size: number;
  speed: number;
  phase: number;
  fill: string;
}

interface LiveEngine {
  ctx: AudioContext;
  master: SafeMaster;
  engine: MemoryEngine;
  freq: Uint8Array<ArrayBuffer>;
}

export default function AfterglowPage() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const blobEls = useRef<(SVGCircleElement | null)[]>([]);
  const moteEls = useRef<(SVGCircleElement | null)[]>([]);
  const coreEl = useRef<SVGCircleElement | null>(null);
  const blurEl = useRef<SVGFEGaussianBlurElement | null>(null);

  const blobsRef = useRef<Blob[]>([]);
  const motesRef = useRef<Mote[]>([]);
  const rafRef = useRef<number>(0);
  const loopStartRef = useRef<number>(0);
  const liveRef = useRef<LiveEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reducedRef = useRef<boolean>(false);

  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<SourceMode>("real");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [progressPct, setProgressPct] = useState<number>(0);
  const [showNotes, setShowNotes] = useState(false);
  const [dragging, setDragging] = useState(false);

  // ── Build the deterministic particle field once ────────────────────────────
  if (blobsRef.current.length === 0) {
    const rand = mulberry32(SEED);
    const emberGoldCream = (ring: number) =>
      ring < 0.4 ? "gEmber" : ring < 0.75 ? "gGold" : "gCream";
    const blobs: Blob[] = [];
    for (let i = 0; i < N_BLOBS; i++) {
      const ring = rand();
      blobs.push({
        angle: rand() * Math.PI * 2,
        baseR: 26 + ring * 250,
        size: 26 + rand() * 66,
        bin: Math.floor(ring * 30),
        speed: (0.03 + rand() * 0.09) * (rand() < 0.5 ? -1 : 1),
        phase: rand() * Math.PI * 2,
        fill: emberGoldCream(ring),
      });
    }
    const motes: Mote[] = [];
    for (let i = 0; i < N_MOTES; i++) {
      const ring = rand();
      motes.push({
        angle: rand() * Math.PI * 2,
        baseR: 50 + ring * 380,
        size: 12 + rand() * 38,
        speed: (0.02 + rand() * 0.06) * (rand() < 0.5 ? -1 : 1),
        phase: rand() * Math.PI * 2,
        fill: rand() < 0.7 ? "gCream" : "gGold",
      });
    }
    blobsRef.current = blobs;
    motesRef.current = motes;
  }

  // Seeded pseudo-spectrum for the muted no-audio demo: smooth, band-limited.
  const demoSpectrum = useRef<(bin: number, t: number) => number>(() => 0);
  // Build the demo spectrum function once (seeded), before the loop starts.
  if (loopStartRef.current === 0) {
    const rand = mulberry32(SEED ^ 0xa17e);
    const A: number[] = [];
    const B: number[] = [];
    const P: number[] = [];
    for (let i = 0; i < 32; i++) {
      A.push(0.15 + rand() * 0.35);
      B.push(0.35 + rand() * 0.5);
      P.push(rand() * Math.PI * 2);
    }
    demoSpectrum.current = (bin: number, t: number) => {
      const i = bin % 32;
      const slow = 0.5 + 0.5 * Math.sin(t * A[i] + P[i]);
      const fast = 0.5 + 0.5 * Math.sin(t * B[i] * 1.7 + P[i] * 2.3);
      return Math.min(1, slow * fast * 1.15);
    };
  }

  // ── Teardown (idempotent) ──────────────────────────────────────────────────
  const teardownAudio = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const live = liveRef.current;
    if (!live) return;
    liveRef.current = null;
    try {
      live.engine.stop();
    } catch {
      /* ok */
    }
    try {
      live.master.disconnect();
    } catch {
      /* ok */
    }
    if (live.ctx.state !== "closed") {
      live.ctx.close().catch(() => {});
    }
  }, []);

  // ── The render loop (drives the SVG imperatively — no per-frame React) ──────
  const renderFrame = useCallback(() => {
    const now = performance.now();
    const t = (now - loopStartRef.current) / 1000;
    const fadeIn = Math.min(1, ((now - loopStartRef.current) / 800) || 0);
    const reduced = reducedRef.current;
    const driftK = reduced ? 0.4 : 1;

    const live = liveRef.current;
    let p: number; // disintegration progress 0..1
    let mem: number; // memory presence 0..1
    let spectrum: (bin: number) => number;

    if (live) {
      live.master.analyser.getByteFrequencyData(live.freq);
      const bins = live.freq.length;
      spectrum = (bin: number) => {
        // Map our 0..31 logical bins onto the low ~half of the FFT (musical).
        const lo = Math.floor((bin / 32) * bins * 0.55);
        const hi = Math.min(bins, lo + Math.max(2, Math.floor(bins * 0.02)));
        let s = 0;
        for (let k = lo; k < hi; k++) s += live.freq[k];
        return Math.min(1, s / ((hi - lo) * 255) * 1.4);
      };
      p = live.engine.progress();
      mem = p;
    } else {
      // Muted seeded demo: the cloud breathes between him and memory.
      p = 0.12 + 0.34 * (0.5 + 0.5 * Math.sin(t * 0.05));
      mem = 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.04 + 1.3));
      const fn = demoSpectrum.current;
      spectrum = (bin: number) => fn(bin, t);
    }

    const blobs = blobsRef.current;
    for (let i = 0; i < blobs.length; i++) {
      const el = blobEls.current[i];
      if (!el) continue;
      const b = blobs[i];
      const e = spectrum(b.bin);
      const drift = t * b.speed * driftK + b.phase;
      const radius = b.baseR * (1 + p * 0.5) + e * 30 + Math.sin(t * 0.5 + b.phase) * 8;
      const cx = CX + Math.cos(b.angle + drift * 0.3) * radius;
      const cy = CY + Math.sin(b.angle + drift * 0.3) * radius * 0.62;
      const rr = b.size * (0.7 + e * 1.1) * (1 + p * 0.5);
      // His notes: bright early, dissolving (dimmer) as disintegration advances.
      const op = (0.1 + e * 0.7) * (1 - p * 0.45) * fadeIn;
      el.setAttribute("cx", cx.toFixed(1));
      el.setAttribute("cy", cy.toFixed(1));
      el.setAttribute("r", Math.max(1, rr).toFixed(1));
      el.setAttribute("opacity", Math.max(0, op).toFixed(3));
    }

    const motes = motesRef.current;
    for (let i = 0; i < motes.length; i++) {
      const el = moteEls.current[i];
      if (!el) continue;
      const m = motes[i];
      const shimmer = 0.5 + 0.5 * Math.sin(t * (0.2 + Math.abs(m.speed) * 4) + m.phase);
      const drift = t * m.speed * driftK + m.phase;
      // Remembered grains diffuse OUTWARD as the memory takes over.
      const radius = m.baseR * (1 + p * 0.7) + shimmer * 18;
      const cx = CX + Math.cos(m.angle + drift * 0.25) * radius;
      const cy = CY + Math.sin(m.angle + drift * 0.25) * radius * 0.62;
      const rr = m.size * (1 + p * 0.6);
      // The cloud grows to fill what he loses.
      const op = mem * (0.1 + shimmer * 0.24) * fadeIn;
      el.setAttribute("cx", cx.toFixed(1));
      el.setAttribute("cy", cy.toFixed(1));
      el.setAttribute("r", Math.max(1, rr).toFixed(1));
      el.setAttribute("opacity", Math.max(0, op).toFixed(3));
    }

    // Breathing afterglow core.
    if (coreEl.current) {
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.18);
      coreEl.current.setAttribute("r", (120 + breathe * 40 + p * 60).toFixed(1));
      coreEl.current.setAttribute(
        "opacity",
        (0.18 + breathe * 0.12 * (1 - p * 0.4)).toFixed(3)
      );
    }

    // Literal softening / afterglow: the whole cloud blurs out as it dissolves.
    if (blurEl.current) {
      const base = reduced ? 2.2 : 1.6;
      const sd = base + p * (reduced ? 4 : 6.5);
      blurEl.current.setAttribute("stdDeviation", sd.toFixed(2));
    }

    if (live) {
      const pct = Math.round(p * 100);
      setProgressPct((prev) => (prev !== pct ? pct : prev));
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // ── Mount: start the seeded muted demo immediately; full teardown on unmount ─
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    loopStartRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      teardownAudio();
    };
  }, [renderFrame, teardownAudio]);

  // ── Begin the memory (user gesture) ────────────────────────────────────────
  const begin = useCallback(
    async (fileOverride?: File) => {
      if (status === "loading" || status === "running") return;
      setStatus("loading");
      setErrorMsg("");
      setStatusMsg(
        fileOverride
          ? "Decoding your recording…"
          : "Fetching Karel's recording…"
      );

      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();

      // Master chain — everything routes through the ear-safety bus at ~0.18.
      const master = createSafeMaster(ctx, { gain: 0.18 });

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      let buffer: AudioBuffer;
      let srcMode: SourceMode = "real";
      let note = "";
      let hardError = "";
      try {
        if (fileOverride) {
          buffer = await decodeFileBuffer(ctx, fileOverride);
          srcMode = "real";
          note = "Your recording is playing — and beginning to remember itself.";
        } else {
          const loaded = await loadSourceBuffer(ctx, DEFAULT_UUID, ctrl.signal);
          buffer = loaded.buffer;
          srcMode = loaded.mode;
          note = loaded.note;
          hardError = loaded.hardError;
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          ctx.close().catch(() => {});
          return; // unmounted during load
        }
        // Last-resort: a dropped file that failed to decode → seeded synth.
        try {
          const loaded = await loadSourceBuffer(ctx, "__bad__", ctrl.signal);
          buffer = loaded.buffer;
          srcMode = loaded.mode;
          note = "That file couldn't be decoded — a seeded warm piano is playing instead.";
        } catch {
          setStatus("error");
          setErrorMsg("Could not start audio.");
          ctx.close().catch(() => {});
          return;
        }
      }

      const engine = createMemoryEngine(
        ctx,
        master.input,
        buffer,
        SEED,
        reducedRef.current
      );

      liveRef.current = {
        ctx,
        master,
        engine,
        freq: new Uint8Array(master.analyser.frequencyBinCount),
      };

      setMode(srcMode);
      setStatusMsg(note);
      setErrorMsg(hardError);
      setStatus("running");
    },
    [status]
  );

  // ── Stop → return to the muted demo ────────────────────────────────────────
  const stop = useCallback(() => {
    teardownAudio();
    setStatus("idle");
    setProgressPct(0);
    setStatusMsg("");
    setErrorMsg("");
  }, [teardownAudio]);

  // ── Drag-and-drop source override ──────────────────────────────────────────
  const onDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("audio")) {
        setErrorMsg("Please drop an audio file.");
        return;
      }
      if (status === "running") teardownAudio();
      setStatus("idle");
      // Begin fresh with the dropped file.
      void begin(file);
    },
    [begin, status, teardownAudio]
  );

  const running = status === "running";

  return (
    <div
      className="relative w-full min-h-[calc(100vh-3rem)] overflow-hidden bg-background"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* ── Full-bleed afterglow cloud (inline SVG art layer) ──────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="gBg" cx="50%" cy="46%" r="75%">
            <stop offset="0%" stopColor="#160c05" />
            <stop offset="55%" stopColor="#0c0703" />
            <stop offset="100%" stopColor="#050301" />
          </radialGradient>
          <radialGradient id="gEmber" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffb25c" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#e88f38" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#e88f38" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gGold" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f7cd78" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#f0b24e" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f0b24e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gCream" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#faf0d2" stopOpacity="0.85" />
            <stop offset="45%" stopColor="#f6e4b8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f6e4b8" stopOpacity="0" />
          </radialGradient>
          <filter id="soften" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur ref={blurEl} in="SourceGraphic" stdDeviation="1.6" />
          </filter>
        </defs>

        {/* Warm near-black ground */}
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#gBg)" />

        {/* Softened, glowing cloud */}
        <g filter="url(#soften)" style={{ mixBlendMode: "screen" }}>
          <circle
            ref={coreEl}
            cx={CX}
            cy={CY}
            r={140}
            fill="url(#gEmber)"
            opacity={0.2}
          />
          {blobsRef.current.map((b, i) => (
            <circle
              key={`b${i}`}
              ref={(el) => {
                blobEls.current[i] = el;
              }}
              cx={CX}
              cy={CY}
              r={b.size}
              fill={`url(#${b.fill})`}
              opacity={0}
            />
          ))}
          {motesRef.current.map((m, i) => (
            <circle
              key={`m${i}`}
              ref={(el) => {
                moteEls.current[i] = el;
              }}
              cx={CX}
              cy={CY}
              r={m.size}
              fill={`url(#${m.fill})`}
              opacity={0}
            />
          ))}
        </g>
      </svg>

      {/* Drop hint overlay */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <p className="rounded-lg border border-border bg-background/90 px-6 py-4 text-base font-medium text-foreground">
            Drop an audio file to remember it instead
          </p>
        </div>
      )}

      {/* ── Chrome ─────────────────────────────────────────────────────────── */}
      <div
        className={`relative z-10 mx-auto flex max-w-2xl flex-col gap-5 px-6 ${
          running ? "pt-8" : "min-h-[calc(100vh-3rem)] justify-center py-16"
        }`}
      >
        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            9368 · Afterglow
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            The recording remembers itself
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-foreground">
            Begin the memory: Karel&apos;s <em>Welcome Home</em> piano loads and
            plays — then slowly disintegrates, band by band, while a granular
            cloud regrows the lost material from remembered grains. Over a minute
            or so the piece dissolves from <em>him</em> into the memory of him.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              onClick={() => void begin()}
              disabled={status === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {status === "loading" ? "Loading…" : "Begin the memory"}
            </button>
          ) : (
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Let it rest
            </button>
          )}

          {running && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${
                mode === "real"
                  ? "border-primary/50 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  mode === "real" ? "bg-primary" : "bg-muted-foreground"
                }`}
              />
              {mode === "real" ? "HIS RECORDING" : "SEEDED PIANO"}
            </span>
          )}

          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* Disintegration progress (only while running) */}
        {running && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>him</span>
              <span>the memory of him</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary/70 transition-[width] duration-700 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {statusMsg && !errorMsg && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {statusMsg}
          </p>
        )}
        {errorMsg && (
          <p className="text-sm leading-relaxed text-destructive">{errorMsg}</p>
        )}

        {!running && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Or drop your own audio file anywhere to let it disintegrate instead.
          </p>
        )}
      </div>

      {/* ── Design-notes modal ─────────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="prose max-h-[70vh] space-y-3 overflow-y-auto text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The recording remembers
                itself.</span> Karel&apos;s real <em>Welcome Home</em> piano is
                looped and worn thin: a clean dry path fades out first, then a
                bank of bandpass filters loses gain and flickers into gaps on a
                seeded schedule — spectral bands drop out, the tape wears thin.
              </p>
              <p>
                Meanwhile a <span className="text-foreground">granular cloud</span>{" "}
                reads the <em>pristine</em> buffer — biased toward its opening,
                the least-eroded material — and rises to fill the gaps. Total
                energy stays roughly constant while the material migrates from
                his real notes to a soft cloud of remembered fragments: him into
                the memory of him.
              </p>
              <p>
                After{" "}
                <span className="text-foreground">
                  William Basinski, <em>The Disintegration Loops</em>
                </span>{" "}
                (a tape loop that erodes with every pass) and{" "}
                <span className="text-foreground">
                  Curtis Roads, <em>Microsound</em>
                </span>{" "}
                (granular resynthesis).
              </p>
              <p>
                If the recording can&apos;t be fetched or decoded, a seeded warm
                piano is synthesised and disintegrates just the same — the piece
                is never silent. A muted glance sees a seeded no-audio demo of
                the cloud within a second. Photosensitive-safe: only slow
                luminance drift, no strobing.
              </p>
              <p className="text-xs">
                The full README with limitations lives at{" "}
                <span className="font-mono">
                  src/app/dream/9368-afterglow/README.md
                </span>
                .
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["9368-afterglow"]} />
    </div>
  );
}
