"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Latent Listening Room (441)
//
// THE ONE QUESTION: What if a piece of music could continuously dream a picture
// of itself — an AI image regenerated every few seconds, shaped by the music's
// changing spectral character, and whose returning colors then bend the music back?
//
// Loop: Web Audio generative pad+arpeggio → FFT spectral analysis → text prompt →
//       FAL flux/schnell → image → pixel-sample → audio feedback → audio …
//
// Degrades: no FAL_KEY → synthesized plasma/particle field driven by same analysis.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { buildAudioEngine, type AudioEngine, type SpectralFrame } from "./audio";
import { initField, type FieldRenderer } from "./field";

// ── Pitch-class names (A=0 … G#=11) ─────────────────────────────────────────
const PC_NAMES = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"] as const;

// ── Palette / density words driven by spectral analysis ──────────────────────
function buildPrompt(frame: SpectralFrame): string {
  const { energy, centroid, pitchClass } = frame;

  // Brightness → palette
  const palette =
    centroid < 0.25
      ? "deep indigo and midnight violet, subterranean shadow"
      : centroid < 0.45
        ? "cool cerulean and slate-blue, dim luminescence"
        : centroid < 0.65
          ? "warm amber-gold and dusty rose, soft interior glow"
          : "luminous gold and pale aureate, blazing radiance";

  // Energy → density
  const density =
    energy < 0.12
      ? "ethereal sparse mist, barely-there vapour threads"
      : energy < 0.28
        ? "drifting haze, slow cloud tendrils"
        : energy < 0.5
          ? "layered volumetric fog, swelling turbulent mass"
          : "swirling turbulence, dense chromatic storm";

  // Pitch-class → hue accent
  const pcHues: Record<number, string> = {
    0: "blue-grey",
    1: "deep blue",
    2: "teal",
    3: "violet",
    4: "purple",
    5: "magenta",
    6: "rose",
    7: "crimson",
    8: "orange-red",
    9: "amber",
    10: "gold-green",
    11: "emerald-teal",
  };
  const hueAccent = pcHues[pitchClass] ?? "indigo";

  const style =
    "abstract volumetric light, latent dreamscape, soft caustics, Refik-Anadol-like data-pigment, cinematic, 4k";

  return `${palette}, ${density}, dominant hue ${hueAccent}, ${style}`;
}

// ── Sample average color from an image drawn to a tiny canvas ──────────────
function sampleImageColor(
  img: HTMLImageElement | HTMLCanvasElement,
): { brightness: number; hue: number; warmth: number } | null {
  try {
    const tiny = document.createElement("canvas");
    tiny.width = 8;
    tiny.height = 6;
    const g = tiny.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, 8, 6);
    const data = g.getImageData(0, 0, 8, 6).data;
    let sumR = 0, sumG = 0, sumB = 0;
    const px = 8 * 6;
    for (let i = 0; i < px; i++) {
      sumR += data[i * 4];
      sumG += data[i * 4 + 1];
      sumB += data[i * 4 + 2];
    }
    const r = sumR / px / 255;
    const g2 = sumG / px / 255;
    const b = sumB / px / 255;

    const brightness = 0.299 * r + 0.587 * g2 + 0.114 * b;

    // Hue from dominant channel
    let hue = 0;
    if (r >= g2 && r >= b) {
      hue = (60 * ((g2 - b) / Math.max(r - Math.min(r, g2, b), 0.001))) % 360;
    } else if (g2 >= r && g2 >= b) {
      hue = 60 * ((b - r) / Math.max(g2 - Math.min(r, g2, b), 0.001)) + 120;
    } else {
      hue = 60 * ((r - g2) / Math.max(b - Math.min(r, g2, b), 0.001)) + 240;
    }
    if (hue < 0) hue += 360;

    const warmth = r > b ? (r - b) : 0;
    return { brightness, hue, warmth };
  } catch {
    return null; // CORS taint or other error — skip loop-back
  }
}

// ── Cross-fade state ──────────────────────────────────────────────────────────
interface XfadeState {
  imgA: HTMLImageElement | null;
  imgB: HTMLImageElement | null;
  alpha: number; // 0=A, 1=B
  transitioning: boolean;
  // Ken-Burns state
  panX: number;
  panY: number;
  scale: number;
  targetPanX: number;
  targetPanY: number;
  targetScale: number;
  kbTimer: number;
}

const README_TEXT = `## Latent Listening Room

**The question:** What if a piece of music could continuously dream a picture of itself — an AI image regenerated every few seconds, shaped by the music's changing spectral character, and whose returning colors then bend the music back?

### The audio→prompt→image→audio loop

1. **Audio (Web Audio API, fully synthesized):** A generative cinematic ambient pad + arpeggio plays in expressive equal temperament (12-TET), cycling through a chord progression every 15–25 s. An AnalyserNode (FFT 2048) feeds per-second extraction of: energy/RMS, spectral centroid (brightness), and dominant pitch-class via a simplified chromagram.

2. **Spectral → prompt mapping:** Every ~6 s a text prompt is assembled from the live analysis: centroid → palette words (dark indigo ↔ luminous gold), energy → density words (sparse mist ↔ swirling turbulence), pitch-class → hue accent. A fixed base style anchors it in the "abstract volumetric light / Refik-Anadol-like data-pigment / cinematic" aesthetic.

3. **AI image pipeline (FAL flux/schnell):** The prompt POSTs to /dream/441-latent-listening-room/api, which calls fal-ai/flux/schnell (4 steps). When an image URL returns, it is preloaded and cross-faded over the previous image on a full-bleed canvas with a Ken-Burns drift. Never more than 1 request in flight; paced ~1 per 7 s.

4. **Loop-back — the image shapes the audio:** On each new image arrival, 8×6 pixels are sampled from an off-screen canvas (img.crossOrigin = "anonymous") to extract average brightness, hue, and warmth. These bend: master lowpass cutoff (brighter → more open/airy), shimmer-layer gain (brighter → more high-freq sparkle), and reverb wet gain (warmer hue → longer tail).

5. **Graceful degradation:** With no FAL_KEY the API route returns 501. On any failure (501 / 429 / network / CORS), the prototype falls back to a locally-synthesized plasma + radial-gradient + particle-flow field driven by the same spectral data. Status shown: amber "live image unavailable — showing synthesized field" / emerald "dreaming live".

### Named references
- **Refik Anadol** — *Unsupervised* and *Machine Hallucinations* latent/data-pigment corpus. The prompt explicitly names the aesthetic.
- **Memo Akten** — *Learning to See* (2017): real-time neural re-description of audio-visual streams, direct conceptual ancestor of the feedback loop.
- **Real-time latent-diffusion co-performance** — the line from Infinite Nature (2022) through StreamDiffusion (2023) to arXiv 2604.07612 (Apr 2026), live latent-diffusion as musical instrument.

### What is unverified in this sandbox
- **No FAL_KEY** — the AI image path runs 100% as fallback synthesized field in CI/build/sandbox. The loop logic is present and correct but untested end-to-end.
- **No audio autoplay** — browsers require a user gesture; the "Begin" button satisfies this.
- **No GPU (WebGPU)** — this prototype uses Canvas 2D throughout; no GPU compute required.`;

type AppStatus = "idle" | "loading" | "running" | "error";
type ImageStatus = "none" | "live" | "fallback";

export default function LatentListeningRoomPage() {
  const [appStatus, setAppStatus] = useState<AppStatus>("idle");
  const [imageStatus, setImageStatus] = useState<ImageStatus>("none");
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  const [chordName, setChordName] = useState<string>("");
  const [pitchClass, setPitchClass] = useState<number>(0);
  const [showNotes, setShowNotes] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const fieldRef = useRef<FieldRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  // Spectral analysis — updated each rAF, read by scheduler
  const frameRef = useRef<SpectralFrame | null>(null);

  // Image pipeline state
  const xfadeRef = useRef<XfadeState>({
    imgA: null, imgB: null, alpha: 0, transitioning: false,
    panX: 0, panY: 0, scale: 1,
    targetPanX: 0, targetPanY: 0, targetScale: 1, kbTimer: 0,
  });
  const inFlightRef = useRef(false);
  const lastRequestRef = useRef(0);
  const REQUEST_INTERVAL_MS = 7000; // ~7s between requests

  // Prompt update scheduler
  const promptTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track abort controller for in-flight image fetch
  const abortRef = useRef<AbortController | null>(null);

  // ── Prompt scheduler (runs every 5-7s, sampling latest frame) ──────────
  const schedulePromptRef = useRef<(() => void) | null>(null);

  // ── Fetch one AI image ───────────────────────────────────────────────────
  const fetchImage = useCallback(async (prompt: string) => {
    if (inFlightRef.current) return;
    const now = performance.now();
    if (now - lastRequestRef.current < REQUEST_INTERVAL_MS) return;

    inFlightRef.current = true;
    lastRequestRef.current = now;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/dream/441-latent-listening-room/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        // 501 = no FAL_KEY, 429 = rate-limited, etc.
        setImageStatus("fallback");
        return;
      }

      const json = (await res.json()) as { url?: string; error?: string };
      if (!json.url) {
        setImageStatus("fallback");
        return;
      }

      // Preload image
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image load error"));
        img.src = json.url as string;
      });

      // Install as next frame
      const xf = xfadeRef.current;
      xf.imgB = img;
      xf.alpha = 0;
      xf.transitioning = true;

      // Sample image color for audio feedback
      const color = sampleImageColor(img);
      if (color && engineRef.current) {
        engineRef.current.applyImageFeedback(color.brightness, color.hue, color.warmth);
      }

      setImageStatus("live");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setImageStatus("fallback");
      }
    } finally {
      inFlightRef.current = false;
      abortRef.current = null;
    }
  }, []);

  // ── Canvas draw loop ──────────────────────────────────────────────────────
  const drawAiLayer = useCallback((canvas: HTMLCanvasElement, dt: number) => {
    const ctxOrNull = canvas.getContext("2d");
    if (!ctxOrNull) return;
    const ctx: CanvasRenderingContext2D = ctxOrNull;
    const W = canvas.width;
    const H = canvas.height;
    if (W === 0 || H === 0) return;

    const xf = xfadeRef.current;

    // Ken-Burns drift update
    xf.kbTimer -= dt;
    if (xf.kbTimer <= 0) {
      xf.targetPanX = (Math.random() - 0.5) * W * 0.06;
      xf.targetPanY = (Math.random() - 0.5) * H * 0.06;
      xf.targetScale = 1.03 + Math.random() * 0.05;
      xf.kbTimer = 10 + Math.random() * 8;
    }
    xf.panX += (xf.targetPanX - xf.panX) * dt * 0.12;
    xf.panY += (xf.targetPanY - xf.panY) * dt * 0.12;
    xf.scale += (xf.targetScale - xf.scale) * dt * 0.1;

    // Cross-fade progress
    if (xf.transitioning) {
      xf.alpha = Math.min(1, xf.alpha + dt * 0.4); // ~2.5s fade
      if (xf.alpha >= 1) {
        xf.imgA = xf.imgB;
        xf.imgB = null;
        xf.alpha = 1;
        xf.transitioning = false;
      }
    }

    // Draw fill background
    ctx.fillStyle = "#060612";
    ctx.fillRect(0, 0, W, H);

    function drawImg(img: HTMLImageElement, alpha: number): void {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const aspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = W / H;
      let dw: number, dh: number;
      if (aspect > canvasAspect) {
        dh = H * xf.scale;
        dw = dh * aspect;
      } else {
        dw = W * xf.scale;
        dh = dw / aspect;
      }
      const dx = (W - dw) / 2 + xf.panX;
      const dy = (H - dh) / 2 + xf.panY;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    }

    if (xf.imgA) drawImg(xf.imgA, xf.transitioning ? 1 - xf.alpha * 0.6 : 1);
    if (xf.imgB && xf.transitioning) drawImg(xf.imgB, xf.alpha);

    // Subtle overlay vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }, []);

  // ── Main rAF loop ─────────────────────────────────────────────────────────
  const lastTRef = useRef(0);

  const runLoop = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.08, (now - lastTRef.current) / 1000) || 0.016;
    lastTRef.current = now;

    const engine = engineRef.current;
    const canvas = canvasRef.current;

    if (engine && canvas) {
      const frame = engine.readFrame();
      frameRef.current = frame;

      // Resize canvas if needed
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(canvas.clientWidth * dpr);
      const H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }

      // Determine render path: if any AI image has arrived (imgA set), draw AI layer.
      // Otherwise use the synthesized field as background.
      const hasAiImage = xfadeRef.current.imgA !== null || xfadeRef.current.imgB !== null;

      if (hasAiImage) {
        drawAiLayer(canvas, dt);
      } else if (fieldRef.current) {
        fieldRef.current.drawFrame(frame, now, dt);
      }

      // Throttle UI state updates to ~8 Hz
      if ((now | 0) % 125 < 18) {
        setChordName(frame.chordName);
        setPitchClass(frame.pitchClass);
      }
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, [drawAiLayer]);

  // Start/restart rAF loop when running state or runLoop identity changes
  useEffect(() => {
    if (appStatus !== "running") return;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runLoop);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [appStatus, runLoop]);

  // ── Prompt interval (every 5-7s) ──────────────────────────────────────────
  const triggerPromptCycle = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const prompt = buildPrompt(frame);
    setCurrentPrompt(prompt);
    void fetchImage(prompt);
  }, [fetchImage]);

  useEffect(() => {
    schedulePromptRef.current = triggerPromptCycle;
  }, [triggerPromptCycle]);

  // ── Teardown ──────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (promptTimerRef.current != null) {
      clearInterval(promptTimerRef.current);
      promptTimerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
    if (fieldRef.current) {
      fieldRef.current.destroy();
      fieldRef.current = null;
    }
    // Reset xfade
    xfadeRef.current = {
      imgA: null, imgB: null, alpha: 0, transitioning: false,
      panX: 0, panY: 0, scale: 1,
      targetPanX: 0, targetPanY: 0, targetScale: 1, kbTimer: 0,
    };
    inFlightRef.current = false;
    frameRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── Begin ─────────────────────────────────────────────────────────────────
  const handleBegin = useCallback(async () => {
    if (appStatus === "loading" || appStatus === "running") return;
    setAppStatus("loading");
    setErrorMsg(null);

    try {
      const engine = buildAudioEngine();
      engineRef.current = engine;
      await engine.ctx.resume();

      // Init fallback field renderer
      if (canvasRef.current) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = Math.round(canvasRef.current.clientWidth * dpr);
        const H = Math.round(canvasRef.current.clientHeight * dpr);
        canvasRef.current.width = Math.max(1, W);
        canvasRef.current.height = Math.max(1, H);
        fieldRef.current = initField(canvasRef.current);
      }

      setAppStatus("running");
      setImageStatus("fallback"); // start in fallback; real images arrive async

      // Kick off first prompt after a short delay so first audio frame is populated
      lastTRef.current = performance.now();
      setTimeout(() => {
        schedulePromptRef.current?.();
      }, 600);

      // Repeat every ~6-7s (jittered to feel organic)
      promptTimerRef.current = setInterval(() => {
        schedulePromptRef.current?.();
      }, 6500);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to start audio");
      setAppStatus("error");
      teardown();
    }
  }, [appStatus, teardown]);

  const handleStop = useCallback(() => {
    teardown();
    setAppStatus("idle");
    setImageStatus("none");
    setCurrentPrompt("");
    setChordName("");
    setErrorMsg(null);
  }, [teardown]);

  // ── Window resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const statusBadge =
    appStatus === "running"
      ? imageStatus === "live"
        ? { text: "dreaming live", cls: "text-violet-300/95 border-violet-400/30 bg-violet-400/5" }
        : { text: "live image unavailable — showing synthesized field", cls: "text-violet-300/95 border-violet-400/30 bg-violet-400/5" }
      : null;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06060e] text-foreground">
      {/* Full-bleed canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Design notes toggle — top-right corner */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md bg-black/40 px-3 py-2 font-mono text-base text-muted-foreground backdrop-blur transition hover:text-foreground"
      >
        {showNotes ? "Hide notes" : "Read the design notes"}
      </button>

      {/* Design notes panel */}
      {showNotes && (
        <div className="pointer-events-auto absolute inset-x-4 top-16 z-30 mx-auto max-w-2xl overflow-y-auto rounded-2xl border border-border bg-black/80 p-5 backdrop-blur sm:right-4 sm:left-auto sm:w-[520px]"
          style={{ maxHeight: "70vh" }}>
          <h2 className="text-xl font-medium text-foreground">Design notes</h2>
          <div className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">
            {README_TEXT}
          </div>
        </div>
      )}

      {/* Live prompt display — bottom-left */}
      {appStatus === "running" && currentPrompt && (
        <div className="pointer-events-none absolute bottom-28 left-5 z-10 max-w-xs sm:max-w-sm">
          <p className="font-mono text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
            {currentPrompt}
          </p>
        </div>
      )}

      {/* Main overlay UI */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-5 sm:p-8">
        {/* Header */}
        <header className="max-w-xl">
          <h1 className="font-semibold text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Latent Listening Room
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            A generative ambient piece that{" "}
            <span className="text-violet-300">continuously dreams its own image</span>
            {" "}— AI-generated every few seconds from the music&rsquo;s live spectral character,
            whose returning colors bend the sound back.
          </p>

          {statusBadge && (
            <div
              className={`mt-3 inline-block rounded-full border px-3 py-1 text-base ${statusBadge.cls}`}
            >
              {statusBadge.text}
            </div>
          )}
        </header>

        {/* Footer: status + controls */}
        <footer className="flex flex-col gap-3">
          {/* Live analysis readout */}
          {appStatus === "running" && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-base text-muted-foreground">
              <span>
                chord:{" "}
                <span className="font-mono text-violet-300">{chordName}</span>
              </span>
              <span className="text-muted-foreground">
                pitch:{" "}
                <span className="font-mono">{PC_NAMES[pitchClass]}</span>
              </span>
            </div>
          )}

          {/* Buttons */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-3">
            {appStatus === "idle" || appStatus === "error" ? (
              <button
                onClick={() => void handleBegin()}
                className="min-h-[44px] rounded-xl bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground transition hover:bg-violet-400"
              >
                Begin
              </button>
            ) : appStatus === "loading" ? (
              <button
                disabled
                className="min-h-[44px] rounded-xl bg-violet-500/50 px-4 py-2.5 text-base font-medium text-muted-foreground cursor-not-allowed"
              >
                Starting…
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="min-h-[44px] rounded-xl border border-border bg-muted px-4 py-2.5 text-base font-medium text-foreground transition hover:bg-accent"
              >
                Stop
              </button>
            )}

            {errorMsg && (
              <span className="text-base text-violet-300">{errorMsg}</span>
            )}
          </div>
        </footer>
      </div>
    </main>
  );
}
