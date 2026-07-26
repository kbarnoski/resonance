"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2808-palimpsest — "What if your movement DREW a musical score you can see?"
//
// A slit-scan graphical score in the Ryoji Ikeda / Iannis Xenakis (UPIC)
// lineage. The webcam reads your body one column at a time as a moving
// spectrogram: motion in the frame accretes into a persistent 96×128 buffer of
// "score energy". A vertical PLAYHEAD sweeps across that score; whichever column
// it is over is turned into sound — each of 32 additive sine partials takes its
// frequency from a CONTINUOUS log mapping of vertical position (top = high) and
// its amplitude from that column's energy. Reading the drawn score IS the sound.
//
// Past scans do not vanish: the palimpsest decays slowly, so gestures you drew
// a minute ago are still faintly present and audibly RETURN as the playhead
// re-crosses them — a self-canon of your own drawing (Steve Reich's returning
// material, but graphical). A slow "breathing" fades the oldest strata so the
// score never fully saturates, giving a genuine beginning → middle → end over
// several minutes.
//
// Degrades gracefully: if the camera is denied/unavailable a deterministic
// "virtual performer" (mulberry32 seeded 0x2808 + performance.now) paints the
// score so the full piece self-demos with no camera. Canvas2D + Web Audio only.
// See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clamp01,
  COLS,
  makeMulberry32,
  N_PARTIALS,
  PalimpsestAudio,
  rampColor,
  ROWS,
  ROWS_PER_PARTIAL,
} from "./engine";

type CameraStatus = "idle" | "loading" | "on" | "off";

// Playhead sweep: full width every ~13s → a slow, readable scan.
const SWEEP_SECONDS = 13;

export default function PalimpsestPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const audioRef = useRef<PalimpsestAudio | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  // score + capture buffers (persist across frames)
  const scoreRef = useRef<Float32Array>(new Float32Array(ROWS * COLS));
  const prevLumRef = useRef<Float32Array>(new Float32Array(ROWS * COLS));
  const motionRef = useRef<Float32Array>(new Float32Array(ROWS * COLS));
  const capCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const playheadRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const modeRef = useRef<"demo" | "camera">("demo");
  const rngRef = useRef<() => number>(makeMulberry32(0x2808));

  const [started, setStarted] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // ── The animation loop. One-shot; reads everything from refs. ───────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // small offscreen canvases: capture (downsample) + score image
    const cap = document.createElement("canvas");
    cap.width = COLS;
    cap.height = ROWS;
    capCanvasRef.current = cap;
    const capCtx = cap.getContext("2d", { willReadFrequently: true });

    const img = document.createElement("canvas");
    img.width = COLS;
    img.height = ROWS;
    imgCanvasRef.current = img;
    const imgCtx = img.getContext("2d");
    const imageData = imgCtx ? imgCtx.createImageData(COLS, ROWS) : null;

    // demo "virtual performer" brushes — deterministic smooth strokes
    const rng = rngRef.current;
    const brushes = Array.from({ length: 4 }, () => ({
      wx: 0.05 + rng() * 0.22,
      wy: 0.05 + rng() * 0.22,
      px: rng() * Math.PI * 2,
      py: rng() * Math.PI * 2,
      ax: 0.28 + rng() * 0.16,
      ay: 0.24 + rng() * 0.16,
      cx: 0.5 + (rng() - 0.5) * 0.3,
      cy: 0.5 + (rng() - 0.5) * 0.3,
      sig: 2.5 + rng() * 2.5,
    }));

    const colOut: [number, number, number] = [0, 0, 0];
    const energies = new Float32Array(N_PARTIALS);
    let prevT = performance.now();

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const score = scoreRef.current;
    const prevLum = prevLumRef.current;
    const motion = motionRef.current;

    const onFrame = (now: number) => {
      rafRef.current = requestAnimationFrame(onFrame);
      const dt = Math.min(0.05, (now - prevT) / 1000);
      prevT = now;
      const tSec =
        startedAtRef.current > 0 ? (now - startedAtRef.current) / 1000 : 0;

      // ── 1. Build the motion field for this frame ──────────────────────────
      motion.fill(0);
      if (modeRef.current === "camera" && capCtx && videoRef.current) {
        const v = videoRef.current;
        if (v.readyState >= 2) {
          // mirror horizontally so it reads like a mirror
          capCtx.save();
          capCtx.scale(-1, 1);
          capCtx.drawImage(v, -COLS, 0, COLS, ROWS);
          capCtx.restore();
          const data = capCtx.getImageData(0, 0, COLS, ROWS).data;
          for (let i = 0; i < ROWS * COLS; i++) {
            const p = i * 4;
            const lum =
              (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) /
              255;
            const d = Math.abs(lum - prevLum[i]);
            prevLum[i] = lum;
            // motion is the driver; a whisper of luminance lets still poses register
            motion[i] = d * 5.5 + lum * 0.06;
          }
        }
      } else {
        // virtual performer — deterministic smooth strokes paint the score
        const tt = now / 1000;
        for (const b of brushes) {
          const bx = b.cx + b.ax * Math.sin(tt * b.wx * 6.283 + b.px);
          const by = b.cy + b.ay * Math.sin(tt * b.wy * 6.283 + b.py);
          const amp = 0.55 + 0.45 * Math.sin(tt * 0.9 + b.px);
          const ccx = bx * COLS;
          const ccy = by * ROWS;
          const rad = Math.ceil(b.sig * 3);
          const c0 = Math.max(0, Math.floor(ccx - rad));
          const c1 = Math.min(COLS - 1, Math.ceil(ccx + rad));
          const r0 = Math.max(0, Math.floor(ccy - rad));
          const r1 = Math.min(ROWS - 1, Math.ceil(ccy + rad));
          const inv = 1 / (2 * b.sig * b.sig);
          for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
              const dx = c - ccx;
              const dy = r - ccy;
              motion[r * COLS + c] += amp * Math.exp(-(dx * dx + dy * dy) * inv);
            }
          }
        }
      }

      // ── 2. Long-form arc: density opens up, breathing fades old strata ─────
      // sparse & literal at first → dense & layered by minute ~3.
      const density = 0.35 + 0.9 * clamp01(tSec / 200);
      // slow breathing (~95s) so the oldest layers periodically recede.
      const breath = 0.5 + 0.5 * Math.sin((tSec / 95) * Math.PI * 2);
      const decay = 1 - (0.010 + 0.018 * breath) * (dt * 60);
      const gate = 0.10 * (1 - clamp01(tSec / 240)); // motion floor lowers over time

      for (let i = 0; i < score.length; i++) {
        let s = score[i] * decay;
        const m = motion[i] - gate;
        if (m > 0) s += m * density * 0.08;
        score[i] = s > 1.2 ? 1.2 : s;
      }

      // ── 3. Advance the playhead; read its column into the additive bank ────
      const speed = (COLS / SWEEP_SECONDS) * dt;
      let ph = playheadRef.current + speed;
      if (ph >= COLS) ph -= COLS;
      playheadRef.current = ph;
      const readCol = Math.floor(ph);

      if (audioRef.current) {
        for (let k = 0; k < N_PARTIALS; k++) {
          let sum = 0;
          const rStart = Math.floor(k * ROWS_PER_PARTIAL);
          const rEnd = Math.floor((k + 1) * ROWS_PER_PARTIAL);
          for (let r = rStart; r < rEnd; r++) sum += score[r * COLS + readCol];
          energies[k] = sum / Math.max(1, rEnd - rStart);
        }
        audioRef.current.setColumn(energies);
        // brighten the bus as the score fills — evolving warmth
        audioRef.current.setBrightness(900 + density * 2600);
      }

      // ── 4. Render the score image (violet ramp) then scale to the canvas ──
      if (imgCtx && imageData) {
        const px = imageData.data;
        for (let i = 0; i < score.length; i++) {
          // gentle tone-map so faint strata stay visible
          const v = 1 - Math.exp(-score[i] * 2.2);
          rampColor(v, colOut);
          const p = i * 4;
          px[p] = colOut[0];
          px[p + 1] = colOut[1];
          px[p + 2] = colOut[2];
          px[p + 3] = 255;
        }
        imgCtx.putImageData(imageData, 0, 0);
      }

      const W = canvas.width;
      const H = canvas.height;
      ctx.imageSmoothingEnabled = true;
      if (imgCtx) ctx.drawImage(img, 0, 0, W, H);

      // faint live video underlay (camera mode only) — data-like, low alpha
      if (modeRef.current === "camera" && videoRef.current) {
        const v = videoRef.current;
        if (v.readyState >= 2) {
          ctx.save();
          ctx.globalAlpha = 0.06;
          ctx.globalCompositeOperation = "lighter";
          ctx.translate(W, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(v, 0, 0, W, H);
          ctx.restore();
        }
      }

      // ── 5. The playhead: a crisp bright column + a soft leading glow ──────
      const colW = W / COLS;
      const x = ph * colW;
      ctx.save();
      const glow = ctx.createLinearGradient(x - colW * 8, 0, x + colW * 2, 0);
      glow.addColorStop(0, "rgba(167,139,250,0)");
      glow.addColorStop(1, "rgba(167,139,250,0.22)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - colW * 8, 0, colW * 10, H);
      ctx.fillStyle = "rgba(237,233,254,0.92)";
      ctx.fillRect(x, 0, Math.max(1.5, colW), H);
      ctx.restore();

      // hairline frame
      ctx.strokeStyle = "rgba(167,139,250,0.10)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    };

    rafRef.current = requestAnimationFrame(onFrame);

    // HUD tick (kept off the rAF path)
    const hud = window.setInterval(() => {
      if (startedAtRef.current > 0) {
        setElapsed((performance.now() - startedAtRef.current) / 1000);
      }
    }, 500);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.clearInterval(hud);
      window.removeEventListener("resize", resize);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
    };
    // one-shot: the loop is self-contained and reads live state via refs.
  }, []);

  const beginAudio = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const audio = new PalimpsestAudio();
      await audio.start();
      audioRef.current = audio;
    } catch {
      setNotice(
        "Web Audio could not start in this browser — the score still draws, but silently.",
      );
    }
  }, []);

  // Primary action: start the piece (audio + virtual performer immediately).
  const onStart = useCallback(async () => {
    if (!started) {
      startedAtRef.current = performance.now();
      setStarted(true);
    }
    await beginAudio();
  }, [started, beginAudio]);

  // Try to hand the drawing over to the live camera.
  const onEnableCamera = useCallback(async () => {
    if (cameraStatus === "loading" || cameraStatus === "on") return;
    setNotice(null);
    setCameraStatus("loading");
    if (!started) {
      startedAtRef.current = performance.now();
      setStarted(true);
    }
    await beginAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
      prevLumRef.current.fill(0);
      modeRef.current = "camera";
      setCameraStatus("on");
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      modeRef.current = "demo";
      setCameraStatus("off");
      const denied =
        err instanceof DOMException && err.name === "NotAllowedError";
      setNotice(
        denied
          ? "Camera permission denied — the virtual performer is drawing the score instead. You can retry any time."
          : "No camera available — the virtual performer is drawing the score instead.",
      );
    }
  }, [cameraStatus, started, beginAudio]);

  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60);
  const phase =
    elapsed < 60
      ? "sparse · literal"
      : elapsed < 180
        ? "accreting · layering"
        : "dense · self-canon";

  return (
    <main className="relative flex min-h-[calc(100vh-3rem)] flex-col items-center justify-start gap-6 overflow-hidden bg-background px-4 py-8">
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      <header className="mt-2 max-w-2xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Palimpsest
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Your movement draws a musical score you can see — a slit-scan
          spectrogram the camera reads one column at a time, where reading the
          drawn score back is the sound.
        </p>
      </header>

      {/* hidden capture feed */}
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      <canvas
        ref={canvasRef}
        className="aspect-[4/3] w-[min(72vh,94vw)] max-w-full touch-none rounded-md border border-border bg-black shadow-lg"
        aria-label="Slit-scan palimpsest score — a bright playhead sweeps across accreted strata of your movement"
      />

      {/* readouts */}
      <div className="flex w-[min(72vh,94vw)] max-w-full flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            input
          </span>
          <span className="text-sm text-foreground">
            {cameraStatus === "on" ? "live camera" : "virtual performer"}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            score arc
          </span>
          <span className="font-mono text-sm text-primary">{phase}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            elapsed
          </span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {mm}:{ss.toString().padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {!started ? (
          <button
            onClick={onStart}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start
          </button>
        ) : (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            the playhead is reading the score aloud
          </span>
        )}
        <button
          onClick={onEnableCamera}
          disabled={cameraStatus === "loading" || cameraStatus === "on"}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {cameraStatus === "on"
            ? "Camera drawing"
            : cameraStatus === "loading"
              ? "Starting camera…"
              : cameraStatus === "off"
                ? "Retry camera"
                : "Start camera"}
        </button>
      </div>

      {notice && (
        <p className="max-w-md text-center text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Palimpsest — design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  The score
                </span>
                <br />
                The webcam is downsampled to a {ROWS}×{COLS} grid and read like a
                moving spectrogram. Motion in each cell accretes into a
                persistent buffer of <em>score energy</em> that decays slowly —
                so what you drew a minute ago is still faintly there.
              </p>
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Reading it back
                </span>
                <br />
                A vertical playhead sweeps the score. Whichever column it is over
                drives {N_PARTIALS} additive sine partials: each partial&apos;s
                frequency is a <em>continuous</em> log mapping of vertical
                position (top of frame = high), its amplitude is that
                column&apos;s energy. Pitch is never snapped to a scale. Reading
                the drawn score is the sound.
              </p>
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  The arc
                </span>
                <br />
                It begins sparse and literal. Over minutes the score densifies
                and layers, and a slow &ldquo;breathing&rdquo; fades the oldest
                strata so it never saturates. As the playhead re-crosses old
                gestures they sound again — a self-canon of your own drawing.
              </p>
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Lineage
                </span>
                <br />
                Ryoji Ikeda&apos;s data-crisp monochrome; Iannis Xenakis&apos;
                UPIC, where a drawn curve becomes sound; Steve Reich&apos;s
                returning material — but drawn. Deny the camera and a
                deterministic virtual performer draws the whole piece.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
