"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 20400-lenticule — Lenticule
//
// ONE question: what if two of Karel's recordings were woven into a single
// lenticular print — and sweeping the viewing angle (head/hand or drag) made the
// woven IMAGE and the SOUND crossfade from one piece to the other?
//
// The whole piece turns on a SINGLE scalar `a ∈ [0,1]`:
//   · VISUAL  — two animated audio-reactive "images" (track A = a warm
//               horizontal interference field; track B = a cooler radial /
//               concentric field) are interlaced as FINE vertical strips on one
//               Canvas2D. Each lenticule (a repeating run of strips) carries a
//               sub-strip ramp of flip-thresholds; `a` selects which image each
//               strip shows, with a soft cross-blend band — so as `a` sweeps you
//               get the characteristic lenticular flip/shimmer, and at a≈0.5 the
//               two images weave into one interference print.
//   · AUDIBLE — `a` is an EQUAL-POWER crossfade between the two looping buffers:
//               gainA = cos(a·π/2), gainB = sin(a·π/2). The image you SEE
//               resolving to B is exactly the sound you HEAR fading to B. At
//               a≈0.5 you see both woven and hear both at equal power.
//
// Both buffers play continuously (looping) through the SAME createSafeMaster
// bus; the angle moves the blend, never restarts playback. Each field's
// reactivity is tapped off its own pre-crossfade analyser.
//
// POINTER-FIRST: pointer X / arrow keys drive the IDENTICAL `a` target as the
// one-hand camera (hand cx). No webcam needed — fully self-verifiable. Idle
// (no camera, no pointer) auto-sweeps `a` back and forth so the print shimmers
// and the mix breathes on its own.
//
// Canvas2D ONLY (no WebGL). Audio terminates at safeMaster.input, never
// ctx.destination. No oscillators — every voice is HIS buffer. No noise overlay.
//
// Reference: lenticular printing / integral ("fly's-eye") imaging — the ridged-
// lens print that shows a different picture depending on your viewing angle.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { COLLECTIONS, REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── interlace constants ──────────────────────────────────────────────────────
const STRIP_CSS = 4; // base strip width in CSS px (scaled by dpr)
const LENTICULE_STRIPS = 11; // strips per lenticule (the repeating sub-strip ramp)
const BLEND_BAND = 0.16; // soft cross-blend width → the lenticular shimmer

// ── default pairing (two distinct, verified recordings) ──────────────────────
const DEFAULT_A = "d57cfae6-f234-4d24-85fe-72a8ad93a44a"; // Interplay (Welcome Home)
const DEFAULT_B = "734a09ce-84df-4f1f-93c1-11b08d303681"; // Snowflake (Snowflake EP)

const DESCRIPTION =
  "Two of Karel's recordings woven into one lenticular print — sweep the viewing angle (hand, drag or arrow keys) and the woven image and the sound crossfade from one piece to the other.";
const HOW_TO = [
  "Press Play to sound both recordings at once",
  "Sweep left ↔ right across the print to tilt the viewing angle",
  "Left edge resolves to the first piece; right edge to the second",
  "The middle weaves both images and plays both at equal power",
  "No camera? The pointer and arrow keys do everything the hand does",
];

type Phase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "denied" | "failed";

// ── small math helpers (NOT hooks) ────────────────────────────────────────────
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
}

interface Engine {
  ctx: AudioContext;
  master: SafeMaster;
  srcA: AudioBufferSourceNode | null;
  srcB: AudioBufferSourceNode | null;
  gainA: GainNode;
  gainB: GainNode;
  analyserA: AnalyserNode;
  analyserB: AnalyserNode;
  bufA: Uint8Array<ArrayBuffer>;
  bufB: Uint8Array<ArrayBuffer>;
  onlyOne: boolean; // degraded: only one track loaded
  breath: number; // idle auto-sweep phase
  aVis: number; // smoothed visual angle (0..1)
  lastMs: number;
}

// ── field A: warm horizontal interference / stripe field (audio-reactive) ─────
function drawFieldA(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  spec: Uint8Array<ArrayBuffer>,
  energy: number,
) {
  // opaque near-black violet ground so interlaced strips fully replace.
  g.fillStyle = "#070510";
  g.fillRect(0, 0, W, H);

  const rows = 150;
  const band = H / rows;
  g.globalCompositeOperation = "lighter";
  for (let r = 0; r < rows; r++) {
    const yN = r / rows;
    const y = yN * H;
    // spectrum drives low→high bands bottom→top
    const bin = Math.floor(yN * (spec.length * 0.6));
    const level = spec[bin] / 255;
    // two travelling horizontal sines = interference beating
    const interf =
      Math.sin(yN * Math.PI * 14 + t * 0.9) * Math.sin(yN * Math.PI * 5 - t * 0.5);
    const bright = clamp01(0.1 + level * 0.9) * (0.45 + 0.55 * (interf * 0.5 + 0.5));
    // warm (magenta-leaning) violet
    const hue = 292 - level * 10;
    const light = 20 + bright * 48;
    g.fillStyle = `hsla(${hue}, 72%, ${light}%, ${0.5 + bright * 0.4})`;
    g.fillRect(0, y - band * 0.5, W, band * 1.15);

    // bone crest where a band peaks — the "print" highlight
    if (level > 0.62 && interf > 0.5) {
      g.fillStyle = `rgba(236, 232, 222, ${0.08 + energy * 0.22})`;
      g.fillRect(0, y - band * 0.3, W, band * 0.6);
    }
  }
  g.globalCompositeOperation = "source-over";
}

// ── field B: cool radial / concentric field (audio-reactive) ──────────────────
function drawFieldB(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  spec: Uint8Array<ArrayBuffer>,
  energy: number,
) {
  g.fillStyle = "#05060f";
  g.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.hypot(W, H) * 0.52;
  const rings = 90;
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  for (let i = rings; i >= 0; i--) {
    const rN = i / rings;
    const bin = Math.floor(rN * (spec.length * 0.7));
    const level = spec[bin] / 255;
    // breathing concentric radius + audio swell
    const r = rN * maxR * (1 + 0.04 * Math.sin(t * 0.7 - rN * 8)) + level * 26;
    const bright = clamp01(0.08 + level * 0.95);
    const hue = 258 + rN * 8; // cool blue-violet
    const light = 22 + bright * 46;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.strokeStyle = `hsla(${hue}, 78%, ${light}%, ${0.1 + bright * 0.5})`;
    g.lineWidth = 1 + bright * (maxR / rings) * 0.9;
    g.stroke();

    if (level > 0.6) {
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.strokeStyle = `rgba(236, 232, 222, ${0.05 + energy * 0.2})`;
      g.lineWidth = 0.8;
      g.stroke();
    }
  }
  g.globalCompositeOperation = "source-over";
}

// ── interlace the two field images into one lenticular print on the main 2D ───
// Each lenticule = LENTICULE_STRIPS strips; within it the flip-threshold ramps
// 0→1, so `a` reveals B sub-strip by sub-strip (the classic lenticular ramp),
// repeated every lenticule → fine vertical interlace texture + a shimmer band.
function applyLenticule(
  g: CanvasRenderingContext2D,
  offA: HTMLCanvasElement,
  offB: HTMLCanvasElement,
  W: number,
  H: number,
  stripW: number,
  a: number,
) {
  // base layer: image A everywhere.
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.drawImage(offA, 0, 0, W, H, 0, 0, W, H);

  // overlay B strip-by-strip, with a soft per-strip flip weight.
  let i = 0;
  for (let x = 0; x < W; x += stripW, i++) {
    const w = Math.min(stripW, W - x);
    // sub-strip position inside its lenticule → ramp threshold 0..1
    const theta = (i % LENTICULE_STRIPS) / (LENTICULE_STRIPS - 1);
    // B wins this strip once `a` passes theta, with a soft blend band.
    const wB = smoothstep(theta - BLEND_BAND, theta + BLEND_BAND, a);
    if (wB <= 0.002) continue;
    g.globalAlpha = wB;
    g.drawImage(offB, x, 0, w, H, x, 0, w, H);
  }
  g.globalAlpha = 1;
}

export default function LenticulePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offARef = useRef<HTMLCanvasElement | null>(null);
  const offBRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef<number>(0);

  // control inputs (refs so the render loop never restarts)
  const pointerActiveRef = useRef(false);
  const pointerXRef = useRef(0.5);
  const camWantRef = useRef(false);
  const handSeenRef = useRef(false);
  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const camStateRef = useRef<CamState>("off");

  const [phase, setPhase] = useState<Phase>("idle");
  const [idA, setIdA] = useState(DEFAULT_A);
  const [idB, setIdB] = useState(DEFAULT_B);
  const [titleA, setTitleA] = useState("");
  const [titleB, setTitleB] = useState("");
  const [camState, setCamState] = useState<CamState>("off");
  const [handSeen, setHandSeen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [degraded, setDegraded] = useState(false);
  const [driver, setDriver] = useState<"camera" | "pointer" | "idle">("idle");
  const [angle, setAngle] = useState(0.5);

  const driverRef = useRef<"camera" | "pointer" | "idle">("idle");
  const angleShownRef = useRef(0.5);

  const { immersive, toggle } = useImmersive();

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    camStateRef.current = camState;
  }, [camState]);

  // ── the render loop — camera / pointer / idle all converge on ONE `a` ───────
  const runFrame = useCallback((nowMs: number) => {
    const eng = engineRef.current;
    const canvas = canvasRef.current;
    const offA = offARef.current;
    const offB = offBRef.current;
    if (!eng || !canvas || !offA || !offB) {
      rafRef.current = requestAnimationFrame(runFrame);
      return;
    }
    const g = canvas.getContext("2d");
    const gA = offA.getContext("2d");
    const gB = offB.getContext("2d");
    if (!g || !gA || !gB) {
      rafRef.current = requestAnimationFrame(runFrame);
      return;
    }

    const dt = eng.lastMs ? Math.min(0.05, (nowMs - eng.lastMs) / 1000) : 1 / 60;
    eng.lastMs = nowMs;
    eng.breath += dt * 0.12;

    // DPR-aware sizing for main + both offscreen buffers.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const W = Math.max(1, Math.floor(cw * dpr));
    const H = Math.max(1, Math.floor(ch * dpr));
    for (const el of [canvas, offA, offB]) {
      if (el.width !== W || el.height !== H) {
        el.width = W;
        el.height = H;
      }
    }

    // ── resolve the SINGLE control target from ONE of three drivers ──
    let nextDriver: "camera" | "pointer" | "idle" = "idle";
    let aTarget = 0.5;

    let handThisFrame = false;
    const video = videoRef.current;
    if (camWantRef.current && trackerRef.current && video && video.readyState >= 2) {
      let res: { landmarks: { x: number; y: number; z: number }[][] } | null = null;
      try {
        res = trackerRef.current.detectForVideo(video, nowMs);
      } catch {
        res = null;
      }
      if (res && res.landmarks && res.landmarks[0]) {
        const f = computeHandFeatures(res.landmarks[0]);
        handThisFrame = true;
        nextDriver = "camera";
        // hand cx (mirrored center, ~[-1.2,1.2]) → viewing angle [0,1]
        aTarget = clamp01(f.cx * 0.5 + 0.5);
      }
    }
    if (!handThisFrame) {
      if (camStateRef.current === "live") {
        // camera on but no hand — hold the last angle (don't jump).
        nextDriver = "camera";
        aTarget = eng.aVis;
      } else if (pointerActiveRef.current) {
        // IDENTICAL control chain as the camera, driven by pointer/keyboard.
        nextDriver = "pointer";
        aTarget = clamp01(pointerXRef.current);
      } else {
        // idle: auto-sweep so the print shimmers and the mix breathes.
        nextDriver = "idle";
        aTarget = 0.5 + 0.5 * Math.sin(eng.breath);
      }
    }
    if (handThisFrame !== handSeenRef.current) {
      handSeenRef.current = handThisFrame;
      setHandSeen(handThisFrame);
    }
    if (nextDriver !== driverRef.current) {
      driverRef.current = nextDriver;
      setDriver(nextDriver);
    }

    // ── smooth `a` with a ~0.12s time constant (visual lerp) ──
    const k = 1 - Math.exp(-dt / 0.12);
    eng.aVis += (aTarget - eng.aVis) * k;
    const a = eng.aVis;

    // ── drive the audio crossfade from the SAME scalar (equal power) ──
    // (skip when degraded to a single track: the lone buffer stays at full.)
    if (!eng.onlyOne) {
      const now = eng.ctx.currentTime;
      eng.gainA.gain.setTargetAtTime(Math.cos((a * Math.PI) / 2) * 0.92, now, 0.12);
      eng.gainB.gain.setTargetAtTime(Math.sin((a * Math.PI) / 2) * 0.92, now, 0.12);
    }

    // ── read each field's own spectrum + a shared energy for crests ──
    eng.analyserA.getByteFrequencyData(eng.bufA);
    eng.analyserB.getByteFrequencyData(eng.bufB);
    let sum = 0;
    for (let i = 0; i < eng.bufA.length; i++) sum += eng.bufA[i] + eng.bufB[i];
    const energy = clamp01(sum / (eng.bufA.length * 2) / 255);

    // ── render both images, then interlace into the lenticular print ──
    const t = nowMs / 1000;
    drawFieldA(gA, W, H, t, eng.bufA, energy);
    drawFieldB(gB, W, H, t, eng.bufB, energy);
    const stripW = Math.max(2, Math.round(STRIP_CSS * dpr));
    applyLenticule(g, offA, offB, W, H, stripW, a);

    // ── throttled angle readout (the see==hear coupling, made explicit) ──
    if (Math.abs(a - angleShownRef.current) > 0.012) {
      angleShownRef.current = a;
      setAngle(a);
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── start: audio first (must always work), then the loop ────────────────────
  const start = useCallback(async () => {
    if (phaseRef.current === "loading" || phaseRef.current === "running") return;
    setErrMsg("");
    setDegraded(false);
    setPhase("loading");

    let ctx: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      await ctx.resume();
    } catch {
      setErrMsg("Web Audio is unavailable in this browser — the print cannot sound here.");
      setPhase("error");
      return;
    }

    // load BOTH recordings; tolerate one failing (degrade, never crash).
    const [resA, resB] = await Promise.allSettled([
      loadRealTrackBuffer(ctx, idA),
      loadRealTrackBuffer(ctx, idB),
    ]);
    const okA = resA.status === "fulfilled" ? resA.value : null;
    const okB = resB.status === "fulfilled" ? resB.value : null;

    if (!okA && !okB) {
      setErrMsg("Neither recording could load — check the connection and press Play again.");
      void ctx.close();
      setPhase("error");
      return;
    }

    const master = createSafeMaster(ctx);

    // per-track pre-crossfade gain + its own analyser tap (image reactivity).
    const gainA = ctx.createGain();
    const gainB = ctx.createGain();
    const analyserA = ctx.createAnalyser();
    const analyserB = ctx.createAnalyser();
    analyserA.fftSize = 512;
    analyserB.fftSize = 512;
    analyserA.smoothingTimeConstant = 0.78;
    analyserB.smoothingTimeConstant = 0.78;
    gainA.connect(analyserA); // passive tap
    gainB.connect(analyserB);
    gainA.connect(master.input);
    gainB.connect(master.input);

    const onlyOne = !okA || !okB;

    // Build sources. If a track is missing, feed BOTH fields from the one that
    // loaded so the visual weave still lives (honest: audio won't crossfade).
    let srcA: AudioBufferSourceNode | null = null;
    let srcB: AudioBufferSourceNode | null = null;
    const bufferA = okA?.buffer ?? okB?.buffer ?? null;
    const bufferB = okB?.buffer ?? okA?.buffer ?? null;
    if (bufferA) {
      srcA = ctx.createBufferSource();
      srcA.buffer = bufferA;
      srcA.loop = true;
      srcA.connect(gainA);
    }
    if (bufferB) {
      srcB = ctx.createBufferSource();
      srcB.buffer = bufferB;
      srcB.loop = true;
      srcB.connect(gainB);
    }

    setTitleA(okA?.title ?? okB?.title ?? "");
    setTitleB(okB?.title ?? okA?.title ?? "");

    if (onlyOne) {
      // degraded: the single loaded track plays at full through gainA.
      gainA.gain.value = 0.9;
      gainB.gain.value = 0.0001;
      setDegraded(true);
    } else {
      // equal-power start at the current angle (mid by default).
      const a0 = 0.5;
      gainA.gain.value = Math.cos((a0 * Math.PI) / 2) * 0.92;
      gainB.gain.value = Math.sin((a0 * Math.PI) / 2) * 0.92;
    }

    const eng: Engine = {
      ctx,
      master,
      srcA,
      srcB,
      gainA,
      gainB,
      analyserA,
      analyserB,
      bufA: new Uint8Array(analyserA.frequencyBinCount),
      bufB: new Uint8Array(analyserB.frequencyBinCount),
      onlyOne,
      breath: 0,
      aVis: 0.5,
      lastMs: 0,
    };

    // both start together, looping — the angle only ever moves the blend.
    const t0 = ctx.currentTime + 0.06;
    try {
      srcA?.start(t0);
      srcB?.start(t0);
    } catch {
      /* already started — ignore */
    }

    engineRef.current = eng;
    setPhase("running");
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(runFrame);
  }, [idA, idB, runFrame]);

  // ── camera opt-in (enhancement) — pointer/keyboard remain the real path ─────
  const enableCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("failed");
      return;
    }
    setCamState("requesting");
    setErrMsg("");
    try {
      const tracker = await createHandTracker(1);
      trackerRef.current = tracker;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      const stream = await startCamera(video);
      streamRef.current = stream;
      camWantRef.current = true;
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((tk) => tk.stop());
      streamRef.current = null;
      const msg = e instanceof Error ? e.message : "";
      setCamState(/denied|Permission|NotAllowed/i.test(msg) ? "denied" : "failed");
    }
  }, []);

  // ── pointer fallback (drives the IDENTICAL `a` target as the camera) ────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (camStateRef.current === "live") return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pointerXRef.current = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    pointerActiveRef.current = true;
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (camStateRef.current === "live") return;
      onPointerMove(e);
    },
    [onPointerMove],
  );
  const onPointerLeave = useCallback(() => {
    pointerActiveRef.current = false;
  }, []);

  // ── keyboard conducting (a11y) — same control chain as the pointer ──────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (
        tgt &&
        (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT")
      )
        return;
      let handled = false;
      if (e.key === "ArrowLeft") {
        pointerXRef.current = clamp01(pointerXRef.current - 0.04);
        handled = true;
      } else if (e.key === "ArrowRight") {
        pointerXRef.current = clamp01(pointerXRef.current + 0.04);
        handled = true;
      }
      if (handled && camStateRef.current !== "live") {
        pointerActiveRef.current = true;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const eng = engineRef.current;
      if (eng) {
        for (const s of [eng.srcA, eng.srcB]) {
          try {
            s?.stop();
          } catch {
            /* already stopped */
          }
        }
        const nodes: (AudioNode | null)[] = [
          eng.srcA,
          eng.srcB,
          eng.gainA,
          eng.gainB,
          eng.analyserA,
          eng.analyserB,
        ];
        for (const nd of nodes) {
          try {
            nd?.disconnect();
          } catch {
            /* noop */
          }
        }
        eng.master.disconnect();
        if (eng.ctx.state !== "closed") void eng.ctx.close();
      }
      streamRef.current?.getTracks().forEach((tk) => tk.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  // ── derived UI state ──────────────────────────────────────────────────────
  const running = phase === "running";
  const camLive = camState === "live" && handSeen;
  const camLost = camState === "live" && !handSeen;
  const camBad = camState === "denied" || camState === "failed";

  const statusText = camLive
    ? "tracking · live — hand sweeps the viewing angle"
    : camLost
      ? "no hand — show one hand, palm to camera"
      : running && driver === "pointer"
        ? "pointer · live — drag or arrow-keys to tilt the angle"
        : running
          ? "idle · auto-sweeping the print"
          : "";

  const titleFor = (id: string) => REAL_TRACKS.find((trk) => trk.id === id)?.title ?? "";
  const pct = Math.round(angle * 100);

  const labelCls = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";
  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      {/* the lenticular print IS the page */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ background: "#05040e", cursor: camState === "live" ? "default" : "ew-resize" }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerLeave={onPointerLeave}
      />

      {/* mirrored camera preview — small, corner, only when live */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute right-3 top-3 z-20 h-24 w-32 scale-x-[-1] rounded-md border border-border/40 object-cover opacity-70"
        style={{ display: camState === "live" ? "block" : "none" }}
        playsInline
        muted
      />

      {/* live viewing-angle readout — the see==hear coupling, made explicit */}
      {running && (
        <div className={`pointer-events-none absolute left-4 top-4 z-30 ${labelCls} text-primary`}>
          angle {pct}% · {100 - pct}% {titleA || "A"} / {pct}% {titleB || "B"}
        </div>
      )}

      {/* tracking / fallback status — functional, stays in immersive too */}
      {statusText && (
        <div
          className={`pointer-events-none absolute left-4 top-10 z-30 ${labelCls} ${
            camLost ? "text-destructive" : camLive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {statusText}
        </div>
      )}
      {running && degraded && (
        <div className="absolute left-4 top-16 z-30 max-w-xs text-sm text-destructive">
          Only one recording loaded — showing the woven print of that one piece (no audio
          crossfade). Press Play to retry both.
        </div>
      )}
      {phase === "error" && (
        <div className="absolute left-4 top-16 z-30 max-w-xs text-sm text-destructive">
          {errMsg || "Could not start audio."} Press Play to retry.
        </div>
      )}
      {camBad && (
        <div className="absolute left-4 top-16 z-30 max-w-xs text-sm text-muted-foreground">
          {camState === "denied" ? "Camera denied" : "Camera unavailable"} — tilt the angle with
          the pointer (drag) or arrow keys instead.
        </div>
      )}

      {/* FULL write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/70 to-transparent p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-xl">
              <p className={labelCls}>Lenticular interlace · two recordings, one print</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                Lenticule
              </h1>
              <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                Two of Karel&rsquo;s recordings woven into a single lenticular print — sweep the
                viewing angle and the woven image and the sound crossfade from one piece to the
                other.
                {running && titleA && titleB && (
                  <span className="text-muted-foreground/70">
                    {" "}
                    Woven: {titleA} ↔ {titleB}.
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className={`${btnGhost} shrink-0`}
            >
              Read the design notes
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!running ? (
              <button type="button" onClick={start} className={btnPrimary} disabled={phase === "loading"}>
                {phase === "loading" ? "Loading…" : "Play"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>live · weaving</span>
            )}

            {camState !== "live" ? (
              <button
                type="button"
                onClick={enableCamera}
                className={btnGhost}
                disabled={camState === "requesting"}
              >
                {camState === "requesting" ? "Starting camera…" : "Use camera (one hand)"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>camera · live</span>
            )}

            <label className={`${labelCls} flex items-center gap-2`}>
              <span className="sr-only">First piece</span>
              <select
                value={idA}
                onChange={(e) => setIdA(e.target.value)}
                disabled={running || phase === "loading"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
              >
                {COLLECTIONS.map((grp) => (
                  <optgroup key={grp.name} label={grp.name}>
                    {grp.tracks.map((trk) => (
                      <option key={trk.id} value={trk.id}>
                        {trk.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className={`${labelCls} flex items-center gap-2`}>
              <span className="sr-only">Second piece</span>
              <select
                value={idB}
                onChange={(e) => setIdB(e.target.value)}
                disabled={running || phase === "loading"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
              >
                {COLLECTIONS.map((grp) => (
                  <optgroup key={grp.name} label={grp.name}>
                    {grp.tracks.map((trk) => (
                      <option key={trk.id} value={trk.id}>
                        {trk.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <ImmersiveHud
              immersive={immersive}
              onToggle={toggle}
              title="Lenticule"
              description={DESCRIPTION}
              howTo={HOW_TO}
            />
          </div>
          {!running && (
            <p className="text-sm text-muted-foreground/70">
              Pick two different pieces above, then Play. {titleFor(idA)} and {titleFor(idB)} are
              loaded by default.
            </p>
          )}
        </div>
      )}

      {/* While immersive: only art + status + HUD. A minimal Play if not sounding. */}
      {immersive && !running && phase !== "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button type="button" onClick={start} className={btnPrimary}>
            Play
          </button>
        </div>
      )}
      {immersive && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Lenticule"
          description={DESCRIPTION}
          howTo={HOW_TO}
        />
      )}

      {/* design-notes modal (mirrors README.md) */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Lenticule — design notes
              </h2>
              <button type="button" onClick={() => setNotesOpen(false)} className={btnGhost} aria-label="Close">
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Two of Karel&rsquo;s recordings each render to their own animated,
                audio-reactive <span className="text-foreground">image</span>: the first a warm
                horizontal interference field, the second a cooler radial / concentric field. They
                are <span className="text-foreground">interlaced as fine vertical strips</span> on a
                single Canvas2D — a lenticular print.
              </p>
              <p>
                There is <span className="text-foreground">one scalar a ∈ [0,1]</span>, the viewing
                angle, and it voices both sides. Each lenticule (a run of strips) carries a sub-strip
                ramp of flip-thresholds; as <span className="text-foreground">a</span> sweeps, each
                strip flips from the first image to the second with a soft cross-blend band — the
                characteristic lenticular flip/shimmer — and at{" "}
                <span className="text-foreground">a ≈ 0.5</span> the two images weave into one
                interference print. The same <span className="text-foreground">a</span> is an{" "}
                <span className="text-foreground">equal-power audio crossfade</span>:{" "}
                gainA = cos(a·π/2), gainB = sin(a·π/2). So the image you{" "}
                <span className="text-foreground">see</span> resolving to the second piece is exactly
                the sound you <span className="text-foreground">hear</span> fading to it. Both
                buffers loop continuously through one safeMaster bus — the angle only ever moves the
                blend, never restarts playback.
              </p>
              <p>
                It is <span className="text-foreground">pointer-first</span>: pointer X and the
                arrow keys drive the identical <span className="text-foreground">a</span> target as
                the one-hand camera (hand cx → angle), so the whole piece is self-verifiable with no
                webcam. With no camera and no pointer it goes{" "}
                <span className="text-foreground">idle</span> and auto-sweeps a back and forth, so
                the print shimmers and the mix breathes on its own. Camera denied/failed, a track
                missing, audio unavailable: each degrades to a visible notice and keeps the art
                alive.
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
                Reference
              </p>
              <p>
                After <span className="text-foreground">lenticular printing</span> and integral
                (&ldquo;fly&rsquo;s-eye&rdquo;) imaging — the ridged-lens print that shows a
                different picture depending on your viewing angle. Here the two pictures are two of
                Karel&rsquo;s pieces, and the angle is yours to sweep.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
