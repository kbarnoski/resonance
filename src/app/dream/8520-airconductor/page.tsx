"use client";

// 8520 · Air Conductor
// "What if you could CONDUCT a small consonant ensemble with your bare hands in
//  the air, over a webcam — height shaping dynamics, a beat-gesture cutting a
//  section in?"
//
// The verb is CONDUCTING, not painting. The hands are a controller:
//   · Left hand HEIGHT      → a global dynamics field (raise = swell, lower = hush)
//   · Right hand HORIZONTAL → which section of the fan is foregrounded
//   · Right-hand DOWN-FLICK → a CUE fires on that section (DTW/velocity beat detector)
//   · Pinch (thumb↔index)   → articulation / brightness (tight = staccato+bright)
//
// Wired subsystems:
//   1. Camera       — getUserMedia → hidden <video>
//   2. Landmarks    — MediaPipe Tasks-Vision HandLandmarker (CDN runtime, webpackIgnore)
//   3. Recognizer   — BeatDetector: right-wrist velocity ring buffer + tiny DTW
//   4. Ensemble     — 7 struck/bowed FM voices (Web Audio), NO drone bed
//   5. Instrument   — Canvas2D conductor's fan, warm cue-light on graphite
//
// Degrades gracefully: a seeded "phantom conductor" drives the ensemble on load
// with zero permissions; the mouse is a pointer-fallback right hand.

import { useCallback, useEffect, useRef, useState } from "react";
import { makeHandLandmarker, type HandLandmarkerLike } from "./handLoader";
import { ConductorAudio } from "./audio";
import {
  BeatDetector,
  GhostConductor,
  VOICE_COUNT,
  type ConductState,
} from "./conductor";

// --- warm cue-light on graphite (canvas art palette — hex is fine here) ---
const BG_TOP = "#1b1e24";
const BG_BOT = "#0d0f12";
const BAR_IDLE = "#3a3f49";
const CUE_HOT = "#ff7a1a";
const CUE_MID = "#ffb24d";
const CUE_SOFT = "#ffe3b0";
const BATON = "#ffd9a0";

interface Readout {
  dynamics: number;
  section: number;
  pinch: number;
  source: ConductState["source"];
  beats: number;
  confidence: number;
  cameraHands: number;
}

interface Baton {
  x: number;
  y: number;
}

interface View {
  dynamics: number;
  sectionFrac: number;
  pinch: number;
  flash: number;
  confidence: number;
  source: ConductState["source"];
  cueLevels: number[];
  leftPresent: boolean;
  leftY: number;
  rightPresent: boolean;
  rightX: number;
  rightY: number;
  batonTrail: Baton[];
  reduced: boolean;
}

const NOTES = `AIR CONDUCTOR — design notes

You are not painting pixels; you are CONDUCTING a small choir of seven consonant
voices (a two-octave major triad — harmonics 4·5·6, a subset of the overtone
series). The hands are a controller.

THE MAPPING
· Left hand HEIGHT  → a global dynamics field. Raise it and the whole ensemble
  swells; lower it and it hushes. Watch the DYN meter on the left.
· Right hand across → which section of the fan leans in (brightens).
· Right-hand DOWN-FLICK → a beat. A cue fires on the foregrounded section: it
  strikes and its neighbours arpeggiate in — a phrase, never a drone.
· Pinch (thumb↔index) → articulation. Tight = staccato + bright; open = legato.

THE BEAT DETECTOR
A short ring buffer of the right wrist's vertical velocity is matched against a
canonical downbeat template with a tiny dynamic-time-warping distance, gated by a
robust velocity-peak + direction-reversal trigger (Gesture2Music-style).

DEGRADES
· No camera / no permission → a seeded "phantom conductor" (mulberry32 0x8520)
  drives invisible hands through a ~28s arc so the instrument plays on load.
· No webcam → the mouse is a pointer-fallback right hand: move to aim a section,
  click for a downbeat.
· Real hands, once detected, take over from the ghost; drop them and it resumes.

REFERENCES
· Gesture2Music (arXiv:2511.00793, Nov 2025) — real-time conducting-gesture
  recognition via dynamic time warping.
· Michel Waisvisz, "The Hands" (STEIM, 1984).
· Imogen Heap, Mi.Mu gloves.`;

// ---------------------------------------------------------------------------
// Pure canvas drawing (module scope — not a hook)
// ---------------------------------------------------------------------------
function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  v: View,
) {
  // Backdrop — graphite wash + vignette.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOT);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Global beat pulse.
  if (v.flash > 0.001) {
    ctx.fillStyle = `rgba(255,150,60,${v.flash * (v.reduced ? 0.03 : 0.07)})`;
    ctx.fillRect(0, 0, W, H);
  }

  const N = VOICE_COUNT;
  const fx = W * 0.5;
  const fy = H * 1.08;
  const innerR = H * 0.16;
  const outerR = H * 0.66;
  const angSpan = 0.84; // ~48°
  const thick = Math.max(7, H * 0.014);

  const angOf = (i: number) => -angSpan + (2 * angSpan * i) / (N - 1);
  const ptAt = (r: number, a: number) => ({
    x: fx + Math.sin(a) * r,
    y: fy - Math.cos(a) * r,
  });

  // Foreground wedges (drawn first, behind bars).
  for (let i = 0; i < N; i++) {
    const dist = i - v.sectionFrac;
    const fg = Math.exp(-(dist * dist) / (2 * 0.5 * 0.5));
    if (fg < 0.03) continue;
    const a0 = angOf(i) - angSpan / (N - 1) * 0.7;
    const a1 = angOf(i) + angSpan / (N - 1) * 0.7;
    const q0 = ptAt(outerR * 1.02, a0);
    const q1 = ptAt(outerR * 1.02, a1);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(q0.x, q0.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,170,80,${(0.05 + 0.12 * v.dynamics) * fg})`;
    ctx.fill();
  }

  // Voice bars.
  for (let i = 0; i < N; i++) {
    const a = angOf(i);
    const act = v.cueLevels[i];
    const dist = i - v.sectionFrac;
    const fg = Math.exp(-(dist * dist) / (2 * 0.5 * 0.5));
    const lenFrac = Math.min(
      1,
      0.42 + v.dynamics * 0.3 + act * 0.5 + fg * 0.08,
    );
    const lenR = innerR + (outerR - innerR) * lenFrac;
    const p0 = ptAt(innerR, a);
    const p1 = ptAt(lenR, a);

    const w = thick * (0.7 + fg * 0.7 + act * 0.4);
    ctx.lineCap = "round";
    ctx.lineWidth = w;

    // Idle graphite bar.
    ctx.strokeStyle = BAR_IDLE;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Warm cue-light overlay.
    const warm = Math.min(1, act * 0.95 + fg * 0.28 * v.dynamics);
    if (warm > 0.02) {
      const grad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      grad.addColorStop(0, CUE_HOT);
      grad.addColorStop(0.55, CUE_MID);
      grad.addColorStop(1, CUE_SOFT);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = warm;
      ctx.shadowBlur = v.reduced ? 6 : 10 + act * 30;
      ctx.shadowColor = CUE_HOT;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Tip glyph.
    const tipR = w * 0.55 + act * (v.reduced ? 4 : 12);
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, tipR, 0, Math.PI * 2);
    ctx.fillStyle = warm > 0.15 ? CUE_SOFT : "#6a7078";
    ctx.globalAlpha = 0.35 + warm * 0.65;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Focal cue-light at the conductor's point.
  const focalGlow = 0.2 + v.dynamics * 0.5 + v.flash * 0.4;
  const fgGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, innerR * 1.4);
  fgGrad.addColorStop(0, `rgba(255,140,50,${0.5 * focalGlow})`);
  fgGrad.addColorStop(1, "rgba(255,140,50,0)");
  ctx.fillStyle = fgGrad;
  ctx.beginPath();
  ctx.arc(fx, fy, innerR * 1.4, 0, Math.PI * 2);
  ctx.fill();

  // Dynamics meter (left).
  const mx = Math.max(18, W * 0.045);
  const mtop = H * 0.2;
  const mbot = H * 0.84;
  const mw = Math.max(10, W * 0.018);
  const mh = mbot - mtop;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, mx, mtop, mw, mh, mw / 2);
  ctx.fill();
  const fillH = mh * v.dynamics;
  const mg = ctx.createLinearGradient(0, mbot, 0, mbot - fillH);
  mg.addColorStop(0, CUE_HOT);
  mg.addColorStop(1, CUE_SOFT);
  ctx.fillStyle = mg;
  roundRect(ctx, mx, mbot - fillH, mw, fillH, mw / 2);
  ctx.fill();
  // caret at current dynamics top
  ctx.fillStyle = BATON;
  ctx.beginPath();
  ctx.arc(mx + mw / 2, mbot - fillH, mw * 0.7, 0, Math.PI * 2);
  ctx.fill();
  // label
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `600 ${Math.max(9, W * 0.011)}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.fillText("DYN", mx + mw / 2, mtop - 10);

  // Left-hand presence marker on the meter.
  if (v.leftPresent) {
    const ly = mtop + mh * v.leftY;
    ctx.strokeStyle = "rgba(255,217,160,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - 6, ly);
    ctx.lineTo(mx + mw + 6, ly);
    ctx.stroke();
  }

  // Baton (right hand) — trail + head + flash ring.
  if (v.batonTrail.length > 1) {
    ctx.lineCap = "round";
    for (let i = 1; i < v.batonTrail.length; i++) {
      const p = v.batonTrail[i];
      const q = v.batonTrail[i - 1];
      const a = i / v.batonTrail.length;
      ctx.strokeStyle = `rgba(255,154,60,${a * 0.5})`;
      ctx.lineWidth = 2 + a * 5;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }
  if (v.rightPresent) {
    const bx = v.rightX * W;
    const by = v.rightY * H;
    if (v.flash > 0.01) {
      const ring = (1 - v.flash) * H * 0.12 + 6;
      ctx.strokeStyle = `rgba(255,150,60,${v.flash * 0.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx, by, ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = v.reduced ? 4 : 16;
    ctx.shadowColor = CUE_HOT;
    ctx.fillStyle = BATON;
    ctx.beginPath();
    ctx.arc(bx, by, 8 + v.pinch * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // pinch ring
    ctx.strokeStyle = `rgba(255,227,176,${0.3 + v.pinch * 0.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, 14 + (1 - v.pinch) * 14, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AirConductorPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const audioRef = useRef<ConductorAudio | null>(null);
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ghostRef = useRef<GhostConductor | null>(null);
  const beatRef = useRef<BeatDetector | null>(null);

  const rafRef = useRef<number | null>(null);
  const prevTimeRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const monoRef = useRef(0);
  const lastHandTimeRef = useRef(-1e9);

  const dynRef = useRef(0.5);
  const sectionFracRef = useRef(3);
  const pinchRef = useRef(0.4);
  const flashRef = useRef(0);
  const cueLevelsRef = useRef<number[]>(new Array(VOICE_COUNT).fill(0));
  const batonTrailRef = useRef<Baton[]>([]);
  const beatCountRef = useRef(0);
  const reducedRef = useRef(false);
  const readoutTimerRef = useRef(0);

  const pointerRef = useRef({ active: false, x: 0.5, y: 0.5, down: false });
  const cameraOnRef = useRef(false);
  const camHoldRef = useRef<{
    left?: { x: number; y: number; pinch: number };
    right?: { x: number; y: number; pinch: number };
    count: number;
  }>({ count: 0 });

  const [audioOn, setAudioOn] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<
    "off" | "loading" | "on"
  >("off");
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    dynamics: 0.5,
    section: 3,
    pinch: 0.4,
    source: "ghost",
    beats: 0,
    confidence: 0,
    cameraHands: 0,
  });

  // --- read up to two hands from the live MediaPipe result -----------------
  const readCameraHands = useCallback((): {
    left?: { x: number; y: number; pinch: number };
    right?: { x: number; y: number; pinch: number };
    count: number;
  } => {
    const lm = landmarkerRef.current;
    const video = videoRef.current;
    if (!lm || !video || video.readyState < 2) return { count: 0 };
    if (video.currentTime === lastVideoTimeRef.current) return { count: -1 };
    lastVideoTimeRef.current = video.currentTime;
    monoRef.current = Math.max(monoRef.current + 1, performance.now());
    let result;
    try {
      result = lm.detectForVideo(video, monoRef.current);
    } catch {
      return { count: -1 };
    }
    const hands = result.landmarks ?? [];
    const parsed = hands.map((h) => {
      const wrist = h[0];
      const thumb = h[4];
      const index = h[8];
      const x = 1 - wrist.x; // mirror for natural control
      const y = wrist.y;
      const dx = thumb.x - index.x;
      const dy = thumb.y - index.y;
      const d = Math.hypot(dx, dy);
      const pinch = 1 - Math.min(1, Math.max(0, (d - 0.02) / 0.16));
      return { x, y, pinch };
    });
    if (parsed.length === 0) return { count: 0 };
    if (parsed.length === 1) {
      const h = parsed[0];
      // Assign by screen side: far-left hand = dynamics, else = baton.
      if (h.x < 0.4) return { left: h, count: 1 };
      return { right: h, count: 1 };
    }
    parsed.sort((a, b) => a.x - b.x);
    return { left: parsed[0], right: parsed[parsed.length - 1], count: 2 };
  }, []);

  // --- one animation frame -------------------------------------------------
  const frame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const ghost = ghostRef.current;
    const beat = beatRef.current;
    if (!canvas || !ctx || !ghost || !beat) {
      rafRef.current = requestAnimationFrame(frame);
      return;
    }

    const now = performance.now();
    const dt = Math.min(64, now - prevTimeRef.current || 16);
    prevTimeRef.current = now;
    const tSec = (now - startTimeRef.current) / 1000;

    // Base = ghost, overridden by camera / pointer.
    const state: ConductState = ghost.update(tSec);

    if (cameraOnRef.current) {
      const cam = readCameraHands();
      if (cam.count > 0) {
        // Fresh detection with hands → refresh the hold + grace timer.
        lastHandTimeRef.current = now;
        camHoldRef.current = {
          left: cam.left,
          right: cam.right,
          count: cam.count,
        };
      } else if (cam.count === 0) {
        // Fresh frame, genuinely no hands → stop refreshing the grace timer so
        // the ghost resumes after ~1.2s. (count === -1 is a stale frame: hold.)
        camHoldRef.current.count = 0;
      }
    }

    const handsRecent = now - lastHandTimeRef.current < 1200;
    const usingCamera = cameraOnRef.current && handsRecent;
    const cameraCount = usingCamera ? camHoldRef.current.count : 0;
    if (usingCamera) {
      const hold = camHoldRef.current;
      if (hold.left) {
        state.leftPresent = true;
        state.leftX = hold.left.x;
        state.leftY = hold.left.y;
        state.pinch = hold.left.pinch;
      }
      if (hold.right) {
        state.rightPresent = true;
        state.rightX = hold.right.x;
        state.rightY = hold.right.y;
        state.pinch = hold.right.pinch;
      }
      state.source = "camera";
    }

    // Pointer fallback (only when camera isn't actively driving).
    const p = pointerRef.current;
    if (!usingCamera && p.active) {
      state.rightPresent = true;
      state.rightX = p.x;
      state.rightY = p.y;
      state.source = "pointer";
    }

    // --- smoothed control fields ---
    // Left height → dynamics (raised hand = smaller y = louder).
    const dynTarget = clamp01((0.82 - state.leftY) / (0.82 - 0.2));
    dynRef.current += (dynTarget - dynRef.current) * 0.08;
    const secTarget = state.rightX * (VOICE_COUNT - 1);
    sectionFracRef.current += (secTarget - sectionFracRef.current) * 0.18;
    pinchRef.current += (state.pinch - pinchRef.current) * 0.14;
    const section = Math.round(sectionFracRef.current);

    const audio = audioRef.current;
    if (audio) {
      audio.setDynamics(dynRef.current);
      audio.setBrightness(pinchRef.current);
    }

    // --- beat detection ---
    let fired = 0;
    if (state.source === "pointer") {
      if (p.down) {
        fired = 1;
        p.down = false;
      }
    } else {
      fired = beat.push(state.rightY, now, dt);
    }
    if (fired > 0) {
      beatCountRef.current += 1;
      flashRef.current = 1;
      const s = Math.max(0, Math.min(VOICE_COUNT - 1, section));
      cueLevelsRef.current[s] = Math.min(1.4, cueLevelsRef.current[s] + fired);
      if (s - 1 >= 0)
        cueLevelsRef.current[s - 1] = Math.min(
          1,
          cueLevelsRef.current[s - 1] + fired * 0.4,
        );
      if (s + 1 < VOICE_COUNT)
        cueLevelsRef.current[s + 1] = Math.min(
          1,
          cueLevelsRef.current[s + 1] + fired * 0.4,
        );
      if (audio) audio.cue(s, fired);
    }

    // --- decays ---
    flashRef.current *= reducedRef.current ? 0.9 : 0.86;
    for (let i = 0; i < VOICE_COUNT; i++) {
      cueLevelsRef.current[i] *= reducedRef.current ? 0.97 : 0.93;
      if (cueLevelsRef.current[i] < 0.001) cueLevelsRef.current[i] = 0;
    }

    // --- baton trail ---
    if (state.rightPresent) {
      batonTrailRef.current.push({
        x: state.rightX * canvas.clientWidth,
        y: state.rightY * canvas.clientHeight,
      });
      const maxTrail = reducedRef.current ? 6 : 16;
      while (batonTrailRef.current.length > maxTrail)
        batonTrailRef.current.shift();
    }

    // --- draw ---
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (
      canvas.width !== Math.round(W * dpr) ||
      canvas.height !== Math.round(H * dpr)
    ) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const view: View = {
      dynamics: dynRef.current,
      sectionFrac: sectionFracRef.current,
      pinch: pinchRef.current,
      flash: flashRef.current,
      confidence: beat.confidence,
      source: usingCamera
        ? "camera"
        : p.active
          ? "pointer"
          : "ghost",
      cueLevels: cueLevelsRef.current,
      leftPresent: state.leftPresent,
      leftY: state.leftY,
      rightPresent: state.rightPresent,
      rightX: state.rightX,
      rightY: state.rightY,
      batonTrail: batonTrailRef.current,
      reduced: reducedRef.current,
    };
    drawFrame(ctx, W, H, view);

    // --- throttled DOM readout ---
    if (now - readoutTimerRef.current > 110) {
      readoutTimerRef.current = now;
      setReadout({
        dynamics: dynRef.current,
        section,
        pinch: pinchRef.current,
        source: view.source,
        beats: beatCountRef.current,
        confidence: beat.confidence,
        cameraHands: cameraCount,
      });
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [readCameraHands]);

  // --- init: ghost + detector + loop (runs on mount, silent until audio) ---
  useEffect(() => {
    ghostRef.current = new GhostConductor(0x8520);
    beatRef.current = new BeatDetector();
    reducedRef.current =
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    startTimeRef.current = performance.now();
    prevTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audioRef.current?.close();
      audioRef.current = null;
      try {
        landmarkerRef.current?.close();
      } catch {
        /* ignore */
      }
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [frame]);

  // --- pointer fallback wiring ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const toNorm = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: clamp01((e.clientX - r.left) / r.width),
        y: clamp01((e.clientY - r.top) / r.height),
      };
    };
    const onMove = (e: PointerEvent) => {
      const n = toNorm(e);
      pointerRef.current.active = true;
      pointerRef.current.x = n.x;
      pointerRef.current.y = n.y;
    };
    const onDown = (e: PointerEvent) => {
      const n = toNorm(e);
      pointerRef.current.active = true;
      pointerRef.current.x = n.x;
      pointerRef.current.y = n.y;
      pointerRef.current.down = true;
    };
    const onLeave = () => {
      pointerRef.current.active = false;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // --- start audio (gated behind user gesture) ---
  const startAudio = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new ConductorAudio();
    await audioRef.current.resume();
    setAudioOn(true);
  }, []);

  // --- camera ---
  const startCamera = useCallback(async () => {
    setSensorError(null);
    setCameraStatus("loading");
    await startAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      try {
        landmarkerRef.current = await makeHandLandmarker();
      } catch (err) {
        setSensorError(
          "Hand model failed to load (CDN blocked?). The phantom conductor keeps playing.",
        );
        console.error(err);
      }
      cameraOnRef.current = true;
      setCameraStatus("on");
    } catch (err) {
      setSensorError(
        "Camera unavailable or permission denied. Use the mouse as a baton — the phantom conductor keeps playing.",
      );
      setCameraStatus("off");
      console.error(err);
    }
  }, [startAudio]);

  const stopCamera = useCallback(() => {
    cameraOnRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      landmarkerRef.current?.close();
    } catch {
      /* ignore */
    }
    landmarkerRef.current = null;
    lastVideoTimeRef.current = -1;
    setCameraStatus("off");
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Title + description */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-md sm:left-6 sm:top-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Air Conductor
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Conduct a seven-voice consonant ensemble with your bare hands — height
          swells the dynamics, a downbeat flick cuts a section in.
        </p>
      </div>

      {/* Notes button */}
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <button
          onClick={() => setNotesOpen(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* Live readout */}
      <div className="pointer-events-none absolute bottom-24 left-4 flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:left-6">
        <span>
          L: dynamics {readout.dynamics.toFixed(2)}
        </span>
        <span>R: section {readout.section + 1}</span>
        <span>
          artic {readout.pinch > 0.5 ? "staccato" : "legato"}{" "}
          {readout.pinch.toFixed(2)}
        </span>
        <span>
          beats {readout.beats} · dtw {readout.confidence.toFixed(2)}
        </span>
        <span>
          src {readout.source}
          {readout.source === "camera" ? ` · hands ${readout.cameraHands}` : ""}
        </span>
      </div>

      {/* Controls */}
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        {sensorError && (
          <p className="max-w-sm px-3 text-center text-sm text-destructive">
            {sensorError}
          </p>
        )}
        <div className="flex items-center gap-2">
          {!audioOn ? (
            <button
              onClick={startAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Play
            </button>
          ) : (
            <span className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-2.5 text-sm text-muted-foreground">
              Sound on
            </span>
          )}
          {cameraStatus !== "on" ? (
            <button
              onClick={startCamera}
              disabled={cameraStatus === "loading"}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {cameraStatus === "loading" ? "Starting camera…" : "Start camera"}
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop camera
            </button>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          No camera needed to start — a phantom conductor is already playing. Move
          the mouse to aim a section, click for a downbeat.
        </p>
      </div>

      {/* Notes modal */}
      {notesOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Air Conductor
              </h2>
              <button
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-muted-foreground">
              {NOTES}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
