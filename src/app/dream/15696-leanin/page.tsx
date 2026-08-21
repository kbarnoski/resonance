"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15696-leanin — "the music rewards intimacy".
//
// One of Karel's real takes plays continuously, but its PRESENCE is governed by
// how physically CLOSE you are to the screen. Lean in and the piece blooms —
// the lowpass sweeps open, gain swells, the distant wash tightens to an intimate
// dry room, and the ember field draws inward and brightens to warm gold. Sit
// back and it recedes — muffled, quiet, far, the field collapsing to a cold
// oxblood point. Proximity is the whole instrument.
//
// Two proximity paths, BOTH implemented so the piece is always demoable:
//   • camera  — MediaPipe Tasks-Vision FaceDetector loaded at RUNTIME from the
//               CDN (no npm dep); the face bounding-box AREA is the signal.
//   • pointer — a focal "hearth" at canvas centre; nearness of the pointer to it
//               is the signal. Works with no camera at all.
//
// AUDIO RULE: the only audible sound is Karel's real decoded AudioBuffer. Zero
// synthesis. "Space" is a short feedback delay of HIS OWN filtered signal — no
// convolver, no oscillator, no generated tone.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── MediaPipe Tasks-Vision (runtime CDN — never resolved at build time) ───────
const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.task";

interface BBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}
interface Detection {
  boundingBox?: BBox;
}
interface DetectResult {
  detections: Detection[];
}
interface FaceDetectorInst {
  detectForVideo(video: HTMLVideoElement, ts: number): DetectResult;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  FaceDetector: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        minDetectionConfidence?: number;
      },
    ): Promise<FaceDetectorInst>;
  };
}

async function createFaceDetector(): Promise<FaceDetectorInst> {
  // Indirect dynamic import: the CDN module ships no types and must not be
  // resolved by the bundler, so it is loaded through `new Function`.
  const mod = (await (new Function(
    `return import("${MEDIAPIPE_CDN}")`,
  )() as Promise<unknown>)) as unknown as MediaPipeVision;
  const fileset = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  return mod.FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.4,
  });
}

// ── Proximity sensors — both expose read()→raw 0..1 (1 = closest) ─────────────
type ProximityMode = "camera" | "pointer";

interface ProximitySensor {
  mode: ProximityMode;
  /** Raw, unsmoothed proximity 0..1 (heavy smoothing happens in the loop). */
  read(): number;
  stop(): void;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface CameraDeps {
  detector: FaceDetectorInst;
  video: HTMLVideoElement;
  stream: MediaStream;
}

// Face-area fraction of the frame maps to proximity. A far face fills a few
// percent; a lean-in face fills a third or more of the frame.
const FACE_AREA_FAR = 0.03;
const FACE_AREA_NEAR = 0.32;

function makeCameraSensor(deps: CameraDeps): ProximitySensor {
  const { detector, video, stream } = deps;
  let raw = 0;
  let lastTs = -1;
  let lost = 0;

  return {
    mode: "camera",
    read() {
      try {
        const ts = performance.now();
        if (ts !== lastTs) {
          lastTs = ts;
          const res = detector.detectForVideo(video, ts);
          const bb = res.detections[0]?.boundingBox;
          if (bb && video.videoWidth > 0 && video.videoHeight > 0) {
            const frac =
              (bb.width * bb.height) / (video.videoWidth * video.videoHeight);
            raw = clamp01(
              (frac - FACE_AREA_FAR) / (FACE_AREA_NEAR - FACE_AREA_FAR),
            );
            lost = 0;
          } else {
            // No face in frame — treat as having stepped away (recede).
            lost += 1;
            if (lost > 20) raw = 0;
          }
        }
      } catch {
        /* detection hiccup — hold last raw, loop keeps gliding */
      }
      return raw;
    },
    stop() {
      try {
        detector.close();
      } catch {
        /* noop */
      }
      for (const t of stream.getTracks()) t.stop();
      video.srcObject = null;
    },
  };
}

function makePointerSensor(getPointer: () => { nx: number; ny: number } | null): ProximitySensor {
  return {
    mode: "pointer",
    read() {
      const p = getPointer();
      if (!p) return 0; // pointer left the field → far
      // Hearth is the canvas centre (0.5, 0.5). Nearness falls off with
      // distance, reaching 0 at ~0.55 of the normalized field.
      const dx = p.nx - 0.5;
      const dy = p.ny - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return clamp01(1 - dist / 0.5);
    },
    stop() {},
  };
}

interface SensorStart {
  sensor: ProximitySensor;
  /** Non-null when we fell back to pointer, with the reason for the notice. */
  fallbackReason: string | null;
}

async function startProximity(
  getPointer: () => { nx: number; ny: number } | null,
): Promise<SensorStart> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return {
      sensor: makePointerSensor(getPointer),
      fallbackReason:
        "No camera API on this device — using the pointer hearth. Move the pointer to the centre and hold to lean in.",
    };
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch {
    return {
      sensor: makePointerSensor(getPointer),
      fallbackReason:
        "Camera access was denied or unavailable — using the pointer hearth instead. Move the pointer to the centre and hold to lean in.",
    };
  }

  const video = document.createElement("video");
  video.style.display = "none";
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.videoWidth > 0) {
        resolve();
        return;
      }
      const onReady = () => {
        video.removeEventListener("loadeddata", onReady);
        resolve();
      };
      video.addEventListener("loadeddata", onReady);
    });
  } catch {
    for (const t of stream.getTracks()) t.stop();
    return {
      sensor: makePointerSensor(getPointer),
      fallbackReason:
        "The camera stream could not start — using the pointer hearth instead.",
    };
  }

  let detector: FaceDetectorInst;
  try {
    detector = await createFaceDetector();
  } catch {
    for (const t of stream.getTracks()) t.stop();
    return {
      sensor: makePointerSensor(getPointer),
      fallbackReason:
        "The face-detection model failed to load — using the pointer hearth instead.",
    };
  }

  return {
    sensor: makeCameraSensor({ detector, video, stream }),
    fallbackReason: null,
  };
}

// ── Audio: Karel's real buffer, proximity-enveloped. Zero synthesis. ──────────
interface ProximityAudio {
  source: AudioBufferSourceNode;
  /** Glide every param toward the target set by proximity p (0 far..1 near). */
  apply(p: number): void;
  stop(): void;
}

function buildProximityAudio(
  ctx: AudioContext,
  buffer: AudioBuffer,
  master: SafeMaster,
): ProximityAudio {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true; // ambient continuous presence — still 100% his audio

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.Q.value = 0.6;
  lowpass.frequency.value = 320;

  const gain = ctx.createGain();
  gain.gain.value = 0.1;

  // "Space" — a short feedback delay of HIS OWN filtered signal. When you are
  // far this wash is prominent (distant, roomy); as you lean in it dries out to
  // an intimate present sound. No convolver, no generated impulse.
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.26;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.5;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;

  // dry path
  source.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(master.input);
  // wet (space) path, fed pre-gain so distance keeps its wash even when quiet
  lowpass.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(master.input);

  source.start();

  const apply = (p: number) => {
    const now = ctx.currentTime;
    const tc = 0.18; // heavy glide so the proximity envelope never zippers
    // lowpass: log-lerp 320 Hz (far) → 15 kHz (near)
    const fHz = 320 * Math.pow(15000 / 320, p);
    lowpass.frequency.setTargetAtTime(fHz, now, tc);
    // gain: bare whisper (far) → full presence (near)
    gain.gain.setTargetAtTime(0.1 + 0.9 * p, now, tc);
    // wet: roomy wash (far) → intimate dry (near)
    wet.gain.setTargetAtTime(0.55 - 0.5 * p, now, tc);
    // feedback: long distant tail (far) → tight (near)
    feedback.gain.setTargetAtTime(0.55 - 0.36 * p, now, tc);
  };

  const stop = () => {
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    for (const n of [source, lowpass, gain, delay, feedback, wet]) {
      try {
        n.disconnect();
      } catch {
        /* ctx closing */
      }
    }
  };

  return { source, apply, stop };
}

// ── Canvas2D breathing ember-bloom field ──────────────────────────────────────
// Warm ember duotone: deep oxblood (hsl ~12 70% 22%) → warm gold (hsl ~38 85%
// 62%) on near-black. Proximity draws the field inward and brightens it; sitting
// back collapses it to a cold distant point.
function drawBloom(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: number,
  freq: Uint8Array<ArrayBuffer>,
  level: number,
  t: number,
  reduced: boolean,
): void {
  const cx = w / 2;
  const cy = h / 2;

  // Motion-blur trail (calm to a hard clear under reduced-motion).
  g.globalCompositeOperation = "source-over";
  g.fillStyle = reduced ? "rgb(11,8,6)" : "rgba(11,8,6,0.22)";
  g.fillRect(0, 0, w, h);

  const breath = reduced ? 1 : 1 + Math.sin(t * 0.6) * 0.05 * (0.4 + p * 0.6);
  const scale = (0.12 + p * 0.88) * breath; // far → tiny point, near → fills
  const maxDim = Math.min(w, h);
  const baseR = maxDim * 0.42 * scale;

  // Ember duotone lerp: oxblood (far) → gold (near).
  const hue = 12 + (38 - 12) * p;
  const sat = 70 + (85 - 70) * p;
  const lig = 22 + (62 - 22) * p;

  g.globalCompositeOperation = "lighter";

  // Core glow.
  const coreR = Math.max(1, baseR * (0.9 + level * 0.5));
  const coreA = 0.22 + p * 0.62;
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  grad.addColorStop(0, `hsla(${hue + 6},${sat}%,${Math.min(82, lig + 20)}%,${coreA})`);
  grad.addColorStop(0.4, `hsla(${hue},${sat}%,${lig}%,${coreA * 0.5})`);
  grad.addColorStop(1, `hsla(${hue - 4},${sat}%,${lig * 0.5}%,0)`);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, coreR, 0, Math.PI * 2);
  g.fill();

  // Concentric rings of embers, pulsing on the spectrum.
  const rings = 5;
  const bins = freq.length;
  for (let ri = 0; ri < rings; ri++) {
    const rf = (ri + 1) / rings;
    const rr = baseR * (0.35 + rf * 0.95);
    const dots = 10 + ri * 6;
    const spin = reduced ? 0 : t * 0.05 * (ri % 2 ? -1 : 1);
    for (let d = 0; d < dots; d++) {
      const a = (d / dots) * Math.PI * 2 + spin;
      const bin = freq[(d * 3 + ri * 7) % bins] / 255;
      const wob = 1 + bin * 0.5 * (0.3 + p * 0.7);
      const x = cx + Math.cos(a) * rr * wob;
      const y = cy + Math.sin(a) * rr * wob;
      const sz = Math.max(0.4, (1.2 + bin * 3.2) * (0.5 + p * 0.9));
      const dl = Math.min(85, lig + bin * 22 + 8);
      const da = (0.12 + p * 0.55) * (0.5 + bin * 0.5);
      g.fillStyle = `hsla(${hue + bin * 10},${sat}%,${dl}%,${da})`;
      g.beginPath();
      g.arc(x, y, sz, 0, Math.PI * 2);
      g.fill();
    }
  }

  g.globalCompositeOperation = "source-over";
}

type Phase = "idle" | "starting" | "running" | "error";

export default function LeanInPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const audioRef = useRef<ProximityAudio | null>(null);
  const sensorRef = useRef<ProximitySensor | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const proxRef = useRef<number>(0); // smoothed proximity
  const pointerRef = useRef<{ nx: number; ny: number } | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const notchRef = useRef<number>(-1);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<ProximityMode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proximity, setProximity] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [selectedId, setSelectedId] = useState(
    COLLECTIONS[0].tracks[2].id, // "Welcome Home"
  );
  const [trackTitle, setTrackTitle] = useState<string | null>(null);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const g = canvas.getContext("2d");
    if (g) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "rgb(11,8,6)";
      g.fillRect(0, 0, rect.width, rect.height);
    }
  }, []);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    audioRef.current?.stop();
    audioRef.current = null;
    sensorRef.current?.stop();
    sensorRef.current = null;
    masterRef.current?.disconnect();
    masterRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {
        /* already closed */
      });
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resizeCanvas]);

  // Pointer tracking (feeds the pointer hearth; harmless in camera mode).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pointerRef.current = {
        nx: (e.clientX - rect.left) / rect.width,
        ny: (e.clientY - rect.top) / rect.height,
      };
    };
    const onLeave = () => {
      pointerRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onMove);
    window.addEventListener("pointerup", onLeave);
    window.addEventListener("pointercancel", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      window.removeEventListener("pointerup", onLeave);
      window.removeEventListener("pointercancel", onLeave);
    };
  }, []);

  const begin = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    setPhase("starting");
    setErrorMsg(null);
    setNotice(null);

    resizeCanvas();
    const canvas = canvasRef.current;
    if (!canvas) {
      setPhase("error");
      setErrorMsg("Could not mount the canvas.");
      return;
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // Audio context.
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      setPhase("error");
      setErrorMsg("Web Audio is unavailable on this device.");
      return;
    }
    ctxRef.current = ctx;

    const master = createSafeMaster(ctx);
    masterRef.current = master;
    const freq = new Uint8Array(master.analyser.frequencyBinCount);
    freqRef.current = freq;

    // Load Karel's real take.
    try {
      const { buffer, title } = await loadRealTrackBuffer(ctx, selectedId);
      setTrackTitle(title);
      audioRef.current = buildProximityAudio(ctx, buffer, master);
    } catch {
      teardown();
      setPhase("error");
      setErrorMsg(
        "Could not load Karel's recording. Check your connection and try again.",
      );
      return;
    }

    // Proximity sensor (camera preferred, pointer fallback — always resolves).
    const { sensor, fallbackReason } = await startProximity(
      () => pointerRef.current,
    );
    sensorRef.current = sensor;
    setMode(sensor.mode);
    if (fallbackReason) setNotice(fallbackReason);

    setPhase("running");
    proxRef.current = 0;
    lastRef.current = performance.now();

    const loop = () => {
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);

      const sensorNow = sensorRef.current;
      const audioNow = audioRef.current;
      const masterNow = masterRef.current;
      const canvas = canvasRef.current;
      const g = canvas?.getContext("2d");

      if (sensorNow && audioNow && masterNow && canvas && g && freqRef.current) {
        const rawP = sensorNow.read();
        // Heavy asymmetric smoothing: blooming is earned (slow rise ~1.4s),
        // receding is quicker (~0.9s) — intimacy must be sustained.
        let sm = proxRef.current;
        const rising = rawP > sm;
        const tau = rising ? 1.4 : 0.9;
        const k = 1 - Math.exp(-dt / tau);
        sm += (rawP - sm) * k;
        sm = clamp01(sm);
        proxRef.current = sm;

        audioNow.apply(sm);

        masterNow.analyser.getByteFrequencyData(freqRef.current);
        let sum = 0;
        for (let i = 0; i < freqRef.current.length; i++) sum += freqRef.current[i];
        const level = sum / (freqRef.current.length * 255);

        const rect = canvas.getBoundingClientRect();
        drawBloom(g, rect.width, rect.height, sm, freqRef.current, level, now / 1000, reduced);

        // Throttle React re-renders to meter notches.
        const notch = Math.round(sm * 20);
        if (notch !== notchRef.current) {
          notchRef.current = notch;
          setProximity(sm);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [phase, selectedId, resizeCanvas, teardown]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* Idle / start panel */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-2xl border border-border bg-background/70 p-8 backdrop-blur-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream lab · proxemics
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Lean In
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Karel&apos;s recording plays continuously, but it only opens up
              when you physically lean CLOSE to the screen. Approach and the
              piece blooms — the full band arrives, the distant wash tightens to
              an intimate room, and the ember field draws inward and brightens.
              Sit back and it recedes to a bare, far whisper. Your closeness is
              the whole instrument.
            </p>

            <label className="mt-6 block">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Take
              </span>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={phase === "starting"}
                className="mt-2 block w-full rounded-md border border-border bg-muted px-3 py-2 text-base text-foreground"
              >
                {COLLECTIONS.map((c) => (
                  <optgroup key={c.name} label={c.name}>
                    {c.tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={begin}
              disabled={phase === "starting"}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "starting" ? "Opening…" : "Enable camera · begin"}
            </button>

            {errorMsg && (
              <p className="mt-4 text-base text-destructive">{errorMsg}</p>
            )}

            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              The camera runs only in your browser to sense how close your face
              is — nothing is recorded or sent anywhere. With no camera (or if
              you decline), a pointer &ldquo;hearth&rdquo; takes over: move to the
              centre and hold to lean in. Use headphones; respects
              reduced-motion.
            </p>
          </div>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-6 top-6 max-w-xs select-none">
          <h1 className="text-xl font-semibold tracking-tight">Lean In</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {mode === "camera" ? "● camera · lean close" : "● pointer · hold at centre"}
            {trackTitle ? ` · ${trackTitle}` : ""}
          </p>
          {notice && (
            <p className="mt-2 text-base text-destructive">{notice}</p>
          )}
          <p className="mt-2 text-base text-muted-foreground">
            {mode === "camera"
              ? "Lean toward the screen to bloom the take; sit back to let it recede."
              : "Move the pointer to the centre and hold to bloom the take; drift away to recede."}
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                presence
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {Math.round(proximity * 100)}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-150"
                style={{ width: `${Math.round(proximity * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Design-notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-6 top-6 inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-md transition hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-background/85 px-6 py-16 backdrop-blur-md">
          <div className="max-w-2xl text-muted-foreground">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              The music rewards intimacy
            </h2>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The question.</span> What if a
              recording only opened up when you physically leaned close to the
              screen — blooming to full presence as you approach, receding to a
              bare distant whisper when you sit back? Closeness becomes the whole
              instrument: a committing bodily posture, not a click, and not
              movement through any virtual space.
            </p>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Technique.</span> One smoothed
              proximity scalar drives a proximity-envelope map: a lowpass filter
              sweeps 320&nbsp;Hz&nbsp;→&nbsp;15&nbsp;kHz, gain swells from a bare
              whisper to full, and a short feedback delay of Karel&apos;s own
              filtered signal loosens into a distant wash when you are far and
              tightens to an intimate dry room as you lean in. The same scalar
              draws the Canvas2D ember field inward and warms it from cold
              oxblood to gold. Proximity is sensed two ways: the webcam face
              bounding-box AREA (MediaPipe FaceDetector, loaded at runtime from
              the CDN), or a pointer &ldquo;hearth&rdquo; fallback that always
              works.
            </p>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Reference.</span> Edward
              T.&nbsp;Hall&apos;s proxemics and the intimate-distance zone; the
              &ldquo;webcam intimate-distance paradox&rdquo; (video-call faces sit
              at intimate distance while peripersonal space stays a flexible,
              multisensory zone); and Janet Cardiff&apos;s intimacy-of-presence
              installations. This piece makes physical closeness the control.
            </p>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Honest scope.</span> Every
              audible sound is Karel&apos;s real decoded take — zero synthesis.
              The &ldquo;space&rdquo; is only a feedback delay of his own signal.
              The fresh move is mapping a sustained intimate distance to a
              presence envelope, so the take is literally only fully there when
              you are.
            </p>
          </div>
        </div>
      )}

      <PrototypeNav
        slugs={["15696-leanin", "15152-pulse", "15600-keepsake", "15536-antiphon"]}
      />
    </main>
  );
}
