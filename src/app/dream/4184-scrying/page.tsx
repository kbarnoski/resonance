"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  makeEngine,
  readColumn,
  drawProcedural,
  mulberry32,
  N_PARTIALS,
  F_MIN,
  F_MAX,
  type SonEngine,
} from "./sonify";

// Offscreen sonification buffer resolution — the "image" we actually read.
const OFF_W = 200;
const OFF_H = 256;
const SEED = 0x4184;

type Source = "camera" | "procedural";

const AXIS_TICKS = [80, 200, 500, 1000, 2000, 4000] as const;

function fmtHz(f: number): string {
  return f >= 1000 ? `${(f / 1000).toFixed(f % 1000 === 0 ? 0 : 1)}k` : `${f}`;
}

export default function ScryingPage() {
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [source, setSource] = useState<Source>("procedural");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.7);
  const [sweepSec, setSweepSec] = useState(4);
  const [showNotes, setShowNotes] = useState(false);

  // ── refs (mutable engine + loop state) ──────────────────────────────────────
  const engineRef = useRef<SonEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const magsRef = useRef<Float32Array>(new Float32Array(N_PARTIALS));
  const startMsRef = useRef(0);
  const sourceRef = useRef<Source>("procedural");
  const sweepRef = useRef(4);
  const volRef = useRef(0.7);
  const loopRef = useRef<() => void>(() => {});

  useEffect(() => {
    sweepRef.current = sweepSec;
  }, [sweepSec]);
  useEffect(() => {
    volRef.current = volume;
    engineRef.current?.setMaster(running ? volume : 0);
  }, [volume, running]);

  // ── the render + sonify loop ─────────────────────────────────────────────────
  const step = useCallback(() => {
    const eng = engineRef.current;
    const canvas = canvasRef.current;
    const off = offRef.current;
    if (!eng || !canvas || !off) return;

    const octx = off.getContext("2d", { willReadFrequently: true });
    const vctx = canvas.getContext("2d");
    if (!octx || !vctx) return;

    const now = performance.now();
    const tSec = (now - startMsRef.current) / 1000;

    // 1) draw the SOURCE into the offscreen buffer (the image we read).
    if (sourceRef.current === "camera" && videoRef.current) {
      const v = videoRef.current;
      if (v.readyState >= 2 && v.videoWidth > 0) {
        // cover-fit the video into OFF_W×OFF_H
        const vr = v.videoWidth / v.videoHeight;
        const br = OFF_W / OFF_H;
        let sw = v.videoWidth;
        let sh = v.videoHeight;
        let sx = 0;
        let sy = 0;
        if (vr > br) {
          sw = v.videoHeight * br;
          sx = (v.videoWidth - sw) / 2;
        } else {
          sh = v.videoWidth / br;
          sy = (v.videoHeight - sh) / 2;
        }
        octx.drawImage(v, sx, sy, sw, sh, 0, 0, OFF_W, OFF_H);
      }
    } else {
      drawProcedural(octx, OFF_W, OFF_H, tSec, mulberry32(SEED), 7);
    }

    // 2) scan column position — slow left→right sweep, looping.
    const frac = (tSec / sweepRef.current) % 1;
    const px = Math.min(OFF_W - 1, Math.max(0, Math.floor(frac * OFF_W)));

    // 3) read that column as a magnitude spectrum → drive the additive bank.
    const colImg = octx.getImageData(px, 0, 1, OFF_H).data;
    const mags = magsRef.current;
    readColumn(colImg, OFF_H, mags);
    eng.applySpectrum(mags, 1);

    // 4) paint the visible canvas — dimmed grayscale frame + glowing scan column.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    const w = canvas.width;
    const h = canvas.height;

    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.globalCompositeOperation = "source-over";
    vctx.filter = "grayscale(1) brightness(0.5) contrast(1.05)";
    vctx.drawImage(off, 0, 0, w, h);
    vctx.filter = "none";

    // subtle vignette to seat the frame
    const vg = vctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    vctx.fillStyle = vg;
    vctx.fillRect(0, 0, w, h);

    const scanX = frac * w;

    // active-partial dots along the scan column (bottom = low freq).
    vctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < N_PARTIALS; i++) {
      const m = mags[i];
      if (m < 0.015) continue;
      const y = (1 - i / (N_PARTIALS - 1)) * h;
      const a = Math.min(1, m * 2.4);
      const r = (2 + m * 6) * dpr;
      vctx.fillStyle = `rgba(150, 210, 255, ${a})`;
      vctx.beginPath();
      vctx.arc(scanX, y, r, 0, Math.PI * 2);
      vctx.fill();
    }

    // glow halo + crisp core of the scan line
    const halo = 26 * dpr;
    const g = vctx.createLinearGradient(scanX - halo, 0, scanX + halo, 0);
    g.addColorStop(0, "rgba(120,190,255,0)");
    g.addColorStop(0.5, "rgba(150,210,255,0.35)");
    g.addColorStop(1, "rgba(120,190,255,0)");
    vctx.fillStyle = g;
    vctx.fillRect(scanX - halo, 0, halo * 2, h);
    vctx.fillStyle = "rgba(220,240,255,0.9)";
    vctx.fillRect(scanX - 1 * dpr, 0, 2 * dpr, h);

    // 5) log-frequency axis (left edge). Raw color allowed inside the art.
    vctx.globalCompositeOperation = "source-over";
    vctx.font = `${10 * dpr}px ui-monospace, monospace`;
    vctx.textBaseline = "middle";
    const logSpan = Math.log(F_MAX / F_MIN);
    for (const tick of AXIS_TICKS) {
      const norm = Math.log(tick / F_MIN) / logSpan;
      const y = (1 - norm) * h;
      vctx.fillStyle = "rgba(180,200,220,0.28)";
      vctx.fillRect(0, y, 8 * dpr, 1 * dpr);
      vctx.fillStyle = "rgba(200,215,230,0.5)";
      vctx.fillText(`${fmtHz(tick)}`, 12 * dpr, y);
    }

    rafRef.current = requestAnimationFrame(loopRef.current);
  }, []);

  useEffect(() => {
    loopRef.current = step;
  }, [step]);

  // ── teardown (idempotent) ────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    engineRef.current?.stop();
    engineRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── start (inside the user gesture) ──────────────────────────────────────────
  const start = useCallback(async () => {
    if (starting || running) return;
    setStarting(true);
    setCameraError(null);

    // AudioContext created inside the gesture (iOS policy).
    let eng: SonEngine;
    try {
      eng = makeEngine();
    } catch {
      setCameraError("Web Audio is unavailable in this browser.");
      setStarting(false);
      return;
    }
    engineRef.current = eng;
    if (eng.ctx.state === "suspended") {
      await eng.ctx.resume().catch(() => {});
    }

    // Request the rear camera; fall back to the procedural self-demo on denial.
    let src: Source = "procedural";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.muted = true;
        v.playsInline = true;
        await v.play().catch(() => {});
      }
      src = "camera";
    } catch {
      setCameraError(
        "Camera unavailable — playing a seeded procedural image instead.",
      );
      src = "procedural";
    }
    sourceRef.current = src;
    setSource(src);

    // Reduced-motion users get a slower sweep (calmer, safer scan drift).
    if (prefersReducedMotion()) {
      setSweepSec((s) => Math.max(s, 7));
      sweepRef.current = Math.max(sweepRef.current, 7);
    }

    startMsRef.current = performance.now();
    eng.setMaster(volRef.current);
    setRunning(true);
    setStarting(false);
    rafRef.current = requestAnimationFrame(loopRef.current);
  }, [starting, running]);

  const stop = useCallback(() => {
    teardown();
    setRunning(false);
  }, [teardown]);

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <PrototypeNav slugs={["4184-scrying"]} />

      {/* hidden capture element */}
      <video ref={videoRef} className="hidden" playsInline muted aria-hidden />

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10 pb-28">
        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream Lab · 4184
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Scrying — hear what the camera sees
          </h1>
          <p className="max-w-prose text-base text-muted-foreground">
            A vertical scan-line sweeps the live frame. The pixel column beneath
            it is read literally as a magnitude spectrum — bottom of the image is
            low pitch, top is high — and inverse-transformed back into sound by an
            additive bank of {N_PARTIALS} sine partials. A bright horizontal band
            becomes a sustained tone; texture becomes noise; motion sweeps the
            pitch. You see exactly the slice you hear.
          </p>
        </header>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-black">
          <canvas ref={canvasRef} className="h-full w-full" />
          <canvas ref={offRef} width={OFF_W} height={OFF_H} className="hidden" />
          {!running && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {starting ? "Opening the eye…" : "Press Start to scry"}
              </p>
            </div>
          )}
        </div>

        {cameraError && (
          <p className="text-sm text-destructive" role="status">
            {cameraError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={start}
              disabled={starting}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {starting ? "Starting…" : "Start"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>

          {running && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {source === "camera" ? "live camera" : "procedural image"}
            </span>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Volume · {Math.round(volume * 100)}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="accent-primary"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Sweep · {sweepSec.toFixed(1)}s
            </span>
            <input
              type="range"
              min={3}
              max={9}
              step={0.5}
              value={sweepSec}
              onChange={(e) => setSweepSec(parseFloat(e.target.value))}
              className="accent-primary"
            />
          </label>
        </div>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Most audio software draws sound as a picture. This does the
                inverse: it treats a picture as sound. A vertical column of the
                live frame is a magnitude spectrum. We resample that column to{" "}
                {N_PARTIALS} bins mapped logarithmically to pitch ({F_MIN} Hz at
                the bottom of the image, {F_MAX} Hz at the top), and each bin&apos;s
                brightness sets the gain of a sine partial at that frequency —
                a real-time inverse short-time Fourier read-out.
              </p>
              <p>
                Gains glide with <code>setTargetAtTime</code> so the sound never
                clicks, and a compressor keeps the summed bank from clipping.
                Deny the camera and a seeded procedural image (drifting bands + a
                moving blob, from <code>mulberry32(0x4184)</code>) is sonified
                identically, so it self-demos with no permissions.
              </p>
              <p>
                Lineage: Chen, Ryu et al., &ldquo;Images that Sound&rdquo;
                (arXiv:2405.12221); the spectrogram-art tradition of Aphex Twin
                (&ldquo;Equation&rdquo; / ΔMᵢ⁻¹), Venetian Snares (&ldquo;Songs
                About My Cats&rdquo;) and Nine Inch Nails; and the ANS
                photosonic synthesizer that read drawn images as sound.
              </p>
              <p>
                Photosensitive safety: the scan-line is a slow drift (≥3&nbsp;s a
                sweep), never a strobe, and reduced-motion preference slows it
                further.
              </p>
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
    </main>
  );
}
