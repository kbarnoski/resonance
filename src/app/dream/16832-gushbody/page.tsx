"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16832-gushbody — Karel's piano as a luminous fluid you stir with your hands.
//
// PRIMARY input: Karel's real "Welcome Home" / "Snowflake" recordings, played
// through the shared safeMaster bus. SECONDARY input: the webcam, from which we
// estimate optical flow each frame and use it to advect (push / smear) a WebGL2
// feedback field. His music injects warm ink into that field; your motion stirs
// it. Ported technique: Adam Ferriss' *Gush* (Andrew Benson's Horn–Schunck flow
// shader in a feedback loop).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLLECTIONS,
  loadRealTrackBuffer,
  REAL_TRACKS,
} from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  type TrackChord,
} from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { createRenderer, type Renderer } from "./gl";

const CAM_W = 160;
const CAM_H = 120;

// ── warm-ember tint from a chord (or spectral centroid) ─────────────────────
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return [r + m, g + m, b + m];
}

// Keep every tint inside a warm ember band (deep red → gold), harmonically
// ordered around the circle of fifths so near keys sit near each other.
function tintFromRoot(pc: number, minor: boolean): [number, number, number] {
  const fifth = (pc * 7) % 12;
  const hue = 10 + (fifth / 11) * 38; // 10° (embers) → 48° (gold)
  const sat = minor ? 0.95 : 0.8;
  const val = minor ? 0.85 : 1.0;
  return hsvToRgb(hue, sat, val);
}

function tintFromCentroid(centroid01: number): [number, number, number] {
  const hue = 8 + centroid01 * 40;
  return hsvToRgb(hue, 0.85, 1.0);
}

export default function GushBody() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const startTimeRef = useRef(0);
  const chordsRef = useRef<TrackChord[]>([]);
  const chordCursorRef = useRef(0);

  // gl + camera
  const rendererRef = useRef<Renderer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevLumRef = useRef<Float32Array | null>(null);
  const motionRef = useRef(0);
  const hasCamRef = useRef(false);

  // loop
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const specRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // ui
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [camNote, setCamNote] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [title, setTitle] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);
  const [glOk, setGlOk] = useState(true);

  // ── the render loop ───────────────────────────────────────────────────────
  const frame = useCallback(() => {
    if (!runningRef.current) return;
    const renderer = rendererRef.current;
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    if (!renderer || !ctx || !safe) return;

    // 1. camera → texture + CPU motion estimate
    const video = videoRef.current;
    const camCanvas = camCanvasRef.current;
    if (hasCamRef.current && video && camCanvas && video.readyState >= 2) {
      const c2d = camCanvas.getContext("2d");
      if (c2d) {
        c2d.drawImage(video, 0, 0, CAM_W, CAM_H);
        renderer.uploadCamera(camCanvas);
        // coarse motion magnitude from luminance temporal difference
        const img = c2d.getImageData(0, 0, CAM_W, CAM_H).data;
        const n = CAM_W * CAM_H;
        const prev = prevLumRef.current;
        const cur = new Float32Array(n);
        let motion = 0;
        for (let i = 0; i < n; i++) {
          const p = i << 2;
          const l = (img[p] * 0.299 + img[p + 1] * 0.587 + img[p + 2] * 0.114) / 255;
          cur[i] = l;
          if (prev) motion += Math.abs(l - prev[i]);
        }
        prevLumRef.current = cur;
        motionRef.current = prev ? Math.min(1, (motion / n) * 14) : 0;
      }
    }

    // 2. audio spectrum → loudness + injection + chord tint
    const spec = specRef.current!;
    safe.analyser.getByteFrequencyData(spec);
    let sum = 0;
    let bass = 0;
    let cSum = 0;
    let cWeight = 0;
    const bins = 256;
    for (let i = 0; i < bins; i++) {
      const v = spec[i];
      sum += v;
      if (i >= 1 && i <= 12) bass += v;
      cSum += v * i;
      cWeight += v;
    }
    const loud = Math.min(1, sum / bins / 200);
    const bassE = Math.min(1, bass / 12 / 200);
    const centroid = cWeight > 0 ? cSum / cWeight / bins : 0.3;
    renderer.updateSpectrum(spec.subarray(0, 256));

    // sounding chord → warm tint (fall back to spectral centroid)
    let tint: [number, number, number];
    const chords = chordsRef.current;
    if (chords.length > 0) {
      const pos = ctx.currentTime - startTimeRef.current;
      let cur = chordCursorRef.current;
      while (cur + 1 < chords.length && chords[cur + 1].time <= pos) cur++;
      while (cur > 0 && chords[cur].time > pos) cur--;
      chordCursorRef.current = cur;
      const sym = chords[cur].chord;
      const root = chordRoot(sym);
      tint = root === null
        ? tintFromCentroid(centroid)
        : tintFromRoot(root, chordIsMinor(sym));
    } else {
      tint = tintFromCentroid(centroid);
    }

    // 3. motion gently opens the lowpass on his recording (always audible)
    const filter = filterRef.current;
    if (filter) {
      const cutoff = 700 + motionRef.current * 7000;
      filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.12);
    }

    // 4. drive the GPU feedback advection
    const hasCam = hasCamRef.current;
    renderer.render({
      ink: 0.12 + loud * 0.95,
      tint,
      procStrength: hasCam ? 0.35 : 0.75 + bassE * 1.3,
      flowScale: 1.4 + motionRef.current * 1.2,
      hasCam,
      time: ctx.currentTime,
    });

    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ── size the canvas to the viewport ─────────────────────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    renderer?.resize(w, h);
  }, []);

  // ── camera (secondary, degrades gracefully) ─────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: CAM_W * 2, height: CAM_H * 2 },
      });
      streamRef.current = stream;
      const vid = document.createElement("video");
      vid.srcObject = stream;
      vid.playsInline = true;
      vid.muted = true;
      await vid.play();
      videoRef.current = vid;
      const cc = document.createElement("canvas");
      cc.width = CAM_W;
      cc.height = CAM_H;
      camCanvasRef.current = cc;
      hasCamRef.current = true;
      setCamNote(null);
    } catch {
      hasCamRef.current = false;
      setCamNote(
        "Camera unavailable — the fluid is being stirred by the music itself. Karel's piano still plays.",
      );
    }
  }, []);

  // ── play (user gesture) ─────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    if (status === "loading" || status === "playing") return;
    setStatus("loading");
    setErrorMsg(null);

    // renderer first, so a WebGL2 failure is caught before we touch audio
    if (!rendererRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        rendererRef.current = createRenderer(canvas);
        resize();
      } catch {
        setGlOk(false);
        setStatus("error");
        setErrorMsg("WebGL2 is unavailable in this browser, so the fluid can't be rendered.");
        return;
      }
    }

    try {
      const ctx = new AudioContext();
      await ctx.resume();
      ctxRef.current = ctx;
      const safe = createSafeMaster(ctx);
      safeRef.current = safe;
      specRef.current = new Uint8Array(safe.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

      const [{ buffer, title: loadedTitle }] = await Promise.all([
        loadRealTrackBuffer(ctx, trackId),
        loadTrackAnalysis(trackId).then((a) => {
          chordsRef.current = a?.chords ?? [];
          chordCursorRef.current = 0;
        }),
      ]);
      setTitle(loadedTitle);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 4000;
      filter.Q.value = 0.7;
      src.connect(filter);
      filter.connect(safe.input);
      src.start();
      srcRef.current = src;
      filterRef.current = filter;
      startTimeRef.current = ctx.currentTime;

      // camera is secondary — kick it off but don't block playback on it
      void startCamera();

      runningRef.current = true;
      setStatus("playing");
      rafRef.current = requestAnimationFrame(frame);
    } catch {
      setStatus("error");
      setErrorMsg("Could not load Karel's recording. Check the connection and try again.");
    }
  }, [status, trackId, resize, startCamera, frame]);

  // ── stop / teardown ─────────────────────────────────────────────────────────
  const teardownAudio = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    try {
      srcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    srcRef.current = null;
    filterRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    videoRef.current = null;
    camCanvasRef.current = null;
    prevLumRef.current = null;
    hasCamRef.current = false;
    safeRef.current?.disconnect();
    safeRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    ctx?.close().catch(() => {});
  }, []);

  const handleStop = useCallback(() => {
    teardownAudio();
    setStatus("idle");
    setCamNote(null);
  }, [teardownAudio]);

  // resize listener + full unmount cleanup
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      teardownAudio();
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [resize, teardownAudio]);

  const playing = status === "playing";

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ opacity: playing ? 1 : 0, transition: "opacity 600ms ease" }}
      />

      {/* Idle / loading / error panel */}
      {!playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="max-w-xl">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Optical flow · feedback advection
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Gush Body
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              Stir the visual body of Karel&apos;s recording with your own motion — his
              piano becomes a luminous fluid you push around with your hands, in front
              of the webcam.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Recording
            </label>
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              disabled={status === "loading"}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-foreground transition-colors hover:bg-accent"
            >
              {COLLECTIONS.map((col) => (
                <optgroup key={col.name} label={col.name}>
                  {col.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <button
            onClick={handlePlay}
            disabled={status === "loading" || !glOk}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {status === "loading" ? "Loading recording…" : "Play & stir"}
          </button>

          <p className="max-w-md text-base text-muted-foreground">
            Allow the camera to smear the light with your hands. If you decline, the
            music still plays and stirs the fluid on its own.
          </p>

          {errorMsg && (
            <p className="max-w-md text-base text-destructive">{errorMsg}</p>
          )}
        </div>
      )}

      {/* Playing HUD */}
      {playing && (
        <>
          <div className="pointer-events-none absolute left-4 top-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Now stirring
            </p>
            <p className="text-base text-foreground">{title}</p>
          </div>

          <button
            onClick={handleStop}
            className="absolute right-4 top-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop
          </button>

          {camNote && (
            <div className="pointer-events-none absolute inset-x-0 top-16 mx-auto w-fit max-w-md rounded-md border border-border bg-background/70 px-4 py-2 text-center text-base text-muted-foreground backdrop-blur-sm">
              {camNote}
            </div>
          )}
        </>
      )}

      {/* Design-notes affordance */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute bottom-4 right-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Gush Body — design notes
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Karel&apos;s real piano recording is the primary voice; the webcam is a
              secondary control layer. Each frame the shader estimates optical flow
              from the camera (a Horn–Schunck-style brightness-gradient + temporal
              difference) and uses that flow field to advect a luminous feedback
              field on the GPU. His music injects warm ink into the field — louder
              passages glow brighter, and the sounding chord tints the ember hue —
              while your body and hand motion smear and push that ink around.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Subsystems: the shared catalog loader (Welcome Home / Snowflake) feeds
              the safeMaster ear-safety bus and its FFT analyser; a chord tracker
              walks the track&apos;s analysed harmony against playback position; the
              camera pipeline computes flow; and a raw WebGL2 ping-pong FBO renderer
              accumulates the fluid. Vigorous motion gently lifts a lowpass filter on
              the recording, so moving also &quot;opens&quot; the sound.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Reference: Adam Ferriss&apos; <em>Gush</em> (Experiments with Google),
              which wraps Andrew Benson&apos;s GLSL Horn–Schunck optical-flow shader
              in a WebGL feedback loop so a webcam smears into accumulating motion
              trails. Here that motion→feedback-advection technique is driven by
              Karel&apos;s audio instead of the raw camera image.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              If the camera is denied or unavailable, a procedural rotating flow —
              its strength following the beat — stirs the fluid instead, so the piece
              never goes dead.
            </p>
            <button
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
