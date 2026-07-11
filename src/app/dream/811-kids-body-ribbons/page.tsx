"use client";

/**
 * 811-kids-body-ribbons
 *
 * What if a 4-year-old's whole BODY is a continuous musical score — they wave
 * their arms and dance, and their moving hands draw glowing ribbons across the
 * screen that sing as they move, the way Xenakis's UPIC turned a child's
 * drawing into music?
 *
 * INPUT  : MediaPipe Pose (camera), fallback ghost-body auto-demo
 * OUTPUT : inline SVG ribbons (NOT Canvas2D / three.js / WebGL)
 * VIBE   : calm-playful, warm, magical
 */

import { useEffect, useRef, useState } from "react";
import {
  createLandmarker,
  bodyFromLandmarks,
  makeGhostBody,
  LM,
  type Body,
  type PoseLandmarkerInst,
} from "./pose";

// ── SVG viewBox: centred, y-up matches Body coordinate space ─────────────────
// Body coords: x,y ∈ roughly [-1,1], y UP-positive.
// SVG viewBox: x ∈ [-1,1], y ∈ [-1.2,1.2] (flip y via transform on g element)
const VB = "-1 -1.2 2 2.4"; // viewBox string

// ── C-major pentatonic, 2 octaves from C3 ────────────────────────────────────
// MIDI notes: C3=48, D3=50, E3=52, G3=55, A3=57, C4=60, D4=62, E4=64, G4=67, A4=69
const PENTATONIC_MIDI = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69];

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Map y ∈ [-1,1] (up-positive Body space) to pentatonic MIDI note
function yToPentatonic(y: number): number {
  // y=-1 (low) → lowest note; y=1 (high) → highest note
  const norm = Math.max(0, Math.min(1, (y + 1) / 2));
  const idx = Math.round(norm * (PENTATONIC_MIDI.length - 1));
  return PENTATONIC_MIDI[Math.max(0, Math.min(PENTATONIC_MIDI.length - 1, idx))];
}

// ── Trail point ───────────────────────────────────────────────────────────────
interface TrailPt {
  x: number; // SVG body-space x
  y: number; // SVG body-space y (up-positive)
  t: number; // timestamp ms
}

// ── Audio engine ──────────────────────────────────────────────────────────────
// Shared audio graph: master(≤0.3) → lowpass(7000Hz) → compressor → destination
interface WristVoice {
  osc: OscillatorNode;
  vibOsc: OscillatorNode;
  vibGain: GainNode;
  gain: GainNode;
}

interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  left: WristVoice;
  right: WristVoice;
  droneOscs: OscillatorNode[];
  shimmerOsc: OscillatorNode;
  shimmerGain: GainNode;
}

function buildAudioEngine(): AudioEngine {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();

  // kids-safe master chain
  const master = ctx.createGain();
  master.gain.value = 0.28;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7000;
  lowpass.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.knee.value = 6;
  comp.attack.value = 0.012;
  comp.release.value = 0.18;

  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  // always-on gentle drone: C2 + G2
  const droneFreqs = [midiToHz(36), midiToHz(43)]; // C2, G2
  const droneOscs: OscillatorNode[] = droneFreqs.map((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.06 / (i + 1), ctx.currentTime + 0.2, 1.5);
    osc.connect(g);
    g.connect(master);
    osc.start();
    return osc;
  });

  // shimmer voice (nose/sparkle chord) — very soft
  const shimmerOsc = ctx.createOscillator();
  shimmerOsc.type = "sine";
  shimmerOsc.frequency.value = midiToHz(64); // E4
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0;
  shimmerOsc.connect(shimmerGain);
  shimmerGain.connect(master);
  shimmerOsc.start();

  // build one wrist voice
  const makeWristVoice = (initMidi: number): WristVoice => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiToHz(initMidi);

    // gentle vibrato: LFO modulating pitch ±3 Hz
    const vibOsc = ctx.createOscillator();
    vibOsc.type = "sine";
    vibOsc.frequency.value = 5.2; // 5.2 Hz vibrato rate
    const vibGain = ctx.createGain();
    vibGain.gain.value = 2.5; // ±2.5 Hz depth
    vibOsc.connect(vibGain);
    vibGain.connect(osc.frequency);
    vibOsc.start();

    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    return { osc, vibOsc, vibGain, gain };
  };

  const left = makeWristVoice(55); // G3
  const right = makeWristVoice(60); // C4

  return { ctx, master, lowpass, comp, left, right, droneOscs, shimmerOsc, shimmerGain };
}

function teardownAudioEngine(eng: AudioEngine): void {
  const t = eng.ctx.currentTime;
  eng.master.gain.setTargetAtTime(0, t, 0.1);
  const stopAt = t + 0.5;
  [eng.left, eng.right].forEach((v) => {
    try { v.osc.stop(stopAt); } catch { /* already stopped */ }
    try { v.vibOsc.stop(stopAt); } catch { /* already stopped */ }
  });
  eng.droneOscs.forEach((o) => { try { o.stop(stopAt); } catch { /* already stopped */ } });
  try { eng.shimmerOsc.stop(stopAt); } catch { /* already stopped */ }
  setTimeout(() => { eng.ctx.close().catch(() => {}); }, 600);
}

// Apply wrist position to a voice: smooth pitch glide + volume by speed
function applyWristVoice(
  voice: WristVoice,
  ctx: AudioContext,
  y: number,           // body-space y (up-positive)
  speed: number,       // 0..1 movement speed
  pan: number,         // not used for spatial pan (no panner node) but affects timbre
): void {
  const t = ctx.currentTime;
  const midi = yToPentatonic(y);
  const hz = midiToHz(midi);
  // portamento ~80ms
  voice.osc.frequency.setTargetAtTime(hz, t, 0.08);
  // speed → loudness, sustain min 0.06
  const amp = 0.06 + speed * 0.18;
  voice.gain.gain.setTargetAtTime(amp, t, 0.04);
  // horizontal pan subtly shifts vibrato depth for timbre
  voice.vibGain.gain.setTargetAtTime(2.5 + Math.abs(pan) * 2, t, 0.1);
}

// ── SVG ribbon path helpers ────────────────────────────────────────────────────
// Build a smoothed SVG path from a trail of points (cubic catmull-rom)
function buildRibbonPath(pts: TrailPt[]): string {
  if (pts.length < 2) return "";
  // SVG coords: x same as Body x, y is flipped (SVG y-down, but we'll flip via transform)
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(3)},${pts[0].y.toFixed(3)} L ${pts[1].x.toFixed(3)},${pts[1].y.toFixed(3)}`;
  }
  let d = `M ${pts[0].x.toFixed(3)},${pts[0].y.toFixed(3)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    // cubic bezier control points (catmull-rom approximation)
    const cp1x = p1.x - (p2.x - p0.x) / 6;
    const cp1y = p1.y - (p2.y - p0.y) / 6;
    const cp2x = p1.x + (p2.x - p0.x) / 6;
    const cp2y = p1.y + (p2.y - p0.y) / 6;
    d += ` C ${cp1x.toFixed(3)},${cp1y.toFixed(3)} ${cp2x.toFixed(3)},${cp2y.toFixed(3)} ${p1.x.toFixed(3)},${p1.y.toFixed(3)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x.toFixed(3)},${last.y.toFixed(3)}`;
  return d;
}

// ── Sparkle particle ──────────────────────────────────────────────────────────
interface Sparkle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  born: number;
  life: number; // ms
  hue: number;
}

// ── Component state shape (mutable ref, not React state) ──────────────────────
interface RunState {
  // body tracking
  landmarker: PoseLandmarkerInst | null;
  videoEl: HTMLVideoElement | null;
  stream: MediaStream | null;
  isGhostMode: boolean;
  // audio
  audio: AudioEngine | null;
  // trails: ring buffers per wrist
  leftTrail: TrailPt[];
  rightTrail: TrailPt[];
  // velocity tracking
  leftPrev: { x: number; y: number; t: number } | null;
  rightPrev: { x: number; y: number; t: number } | null;
  leftSpeed: number;
  rightSpeed: number;
  // sparkles
  sparkles: Sparkle[];
  lastSparkleCheck: number;
  // animation frame
  rafId: number;
}

// ── SVG segment IDs ───────────────────────────────────────────────────────────
// We build many SVG path segments; store them imperatively in a container ref.
// We use multiple <path> elements managed imperatively via DOM refs for perf.

const TRAIL_DURATION_MS = 7000; // ribbons live 7 seconds
const MAX_TRAIL_PTS = 120;       // max points per trail

// ── COMPONENT ─────────────────────────────────────────────────────────────────
export default function KidsBodyRibbons() {
  const [phase, setPhase] = useState<"idle" | "loading" | "running">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  // DOM refs for imperative SVG management
  const svgRef = useRef<SVGSVGElement>(null);
  const leftGroupRef = useRef<SVGGElement>(null);
  const rightGroupRef = useRef<SVGGElement>(null);
  const sparkleGroupRef = useRef<SVGGElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // mutable run-state ref (never triggers re-renders)
  const runRef = useRef<RunState>({
    landmarker: null, videoEl: null, stream: null, isGhostMode: false,
    audio: null,
    leftTrail: [], rightTrail: [],
    leftPrev: null, rightPrev: null, leftSpeed: 0, rightSpeed: 0,
    sparkles: [], lastSparkleCheck: 0,
    rafId: 0,
  });

  // SVG path element pools: we keep a fixed set of path elements in the DOM
  // and update their `d` attributes imperatively each frame.
  const leftPathsRef = useRef<SVGPathElement[]>([]);
  const rightPathsRef = useRef<SVGPathElement[]>([]);

  // ── full teardown ─────────────────────────────────────────────────────────
  const teardown = (): void => {
    const s = runRef.current;
    cancelAnimationFrame(s.rafId);
    s.rafId = 0;
    s.stream?.getTracks().forEach((t) => t.stop());
    s.stream = null;
    if (s.videoEl) {
      s.videoEl.srcObject = null;
    }
    try { s.landmarker?.close(); } catch { /* ignore */ }
    s.landmarker = null;
    if (s.audio) {
      teardownAudioEngine(s.audio);
      s.audio = null;
    }
    s.leftTrail = [];
    s.rightTrail = [];
    s.sparkles = [];
  };

  // ── update speed estimate from wrist position ─────────────────────────────
  const computeSpeed = (
    now: number,
    x: number,
    y: number,
    prev: { x: number; y: number; t: number } | null,
  ): { speed: number; nextPrev: { x: number; y: number; t: number } } => {
    if (!prev) return { speed: 0, nextPrev: { x, y, t: now } };
    const dt = Math.max(1, now - prev.t) / 1000;
    const dx = x - prev.x;
    const dy = y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = Math.min(1, dist / dt / 1.5); // normalize: 1.5 body-units/s = full
    return { speed, nextPrev: { x, y, t: now } };
  };

  // ── manage SVG path element pool ──────────────────────────────────────────
  const ensurePaths = (
    group: SVGGElement,
    pool: SVGPathElement[],
    needed: number,
    strokeColor: string,
  ): void => {
    while (pool.length < needed) {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", strokeColor);
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      group.appendChild(p);
      pool.push(p);
    }
  };

  // ── draw ribbon segments for one wrist ────────────────────────────────────
  // We segment the trail into multiple overlapping paths with varying opacity
  // to create a glow effect and age-based fade, using ONLY SVG attributes.
  const drawRibbon = (
    now: number,
    trail: TrailPt[],
    group: SVGGElement,
    pool: SVGPathElement[],
    baseHue: string, // CSS hsl hue value
    speed: number,
  ): void => {
    if (trail.length < 2) {
      // hide all pool paths
      pool.forEach((p) => p.setAttribute("d", ""));
      return;
    }

    // We draw multiple overlapping passes: outer glow (thick, transparent) → inner bright
    // Each pass is one <path> element; we need 3 passes × 1 segment = 3 elements.
    // But for a fading trail we need to split by age and vary opacity.
    // Strategy: draw the trail as ONE path per pass, vary stroke-opacity by age segments.
    // Actually: use multiple short path segments bucketed into age quintiles.

    const SEG_COUNT = 5; // age buckets
    const PASSES = 2;    // glow pass + bright pass
    const NEEDED = SEG_COUNT * PASSES;
    ensurePaths(group, pool, NEEDED, "transparent");

    // Partition trail into age quintiles
    const segSize = Math.ceil(trail.length / SEG_COUNT);

    for (let seg = 0; seg < SEG_COUNT; seg++) {
      const start = seg * segSize;
      const end = Math.min(trail.length, start + segSize + 1); // +1 for overlap
      const chunk = trail.slice(start, end);
      if (chunk.length < 1) {
        for (let pass = 0; pass < PASSES; pass++) {
          const idx = seg * PASSES + pass;
          if (idx < pool.length) pool[idx].setAttribute("d", "");
        }
        continue;
      }

      // Age of this segment (0 = newest, 1 = oldest)
      const midIdx = Math.floor((start + end) / 2);
      const ageFrac = midIdx < trail.length
        ? (now - trail[midIdx].t) / TRAIL_DURATION_MS
        : 1;
      const aliveness = Math.max(0, 1 - ageFrac); // 1=new, 0=old

      const d = chunk.length >= 2 ? buildRibbonPath(chunk) : "";

      // Pass 0: outer glow (thick, low opacity)
      const glowIdx = seg * PASSES + 0;
      if (glowIdx < pool.length) {
        const glowEl = pool[glowIdx];
        glowEl.setAttribute("d", d);
        const glowOpacity = aliveness * 0.35 * (0.5 + speed * 0.5);
        const glowWidth = (0.04 + speed * 0.035) * aliveness;
        glowEl.setAttribute("stroke", `hsla(${baseHue}, 90%, 75%, ${glowOpacity.toFixed(3)})`);
        glowEl.setAttribute("stroke-width", glowWidth.toFixed(4));
        glowEl.setAttribute("filter", "url(#ribbon-blur)");
      }

      // Pass 1: bright core line
      const coreIdx = seg * PASSES + 1;
      if (coreIdx < pool.length) {
        const coreEl = pool[coreIdx];
        coreEl.setAttribute("d", d);
        const coreOpacity = aliveness * (0.5 + speed * 0.4);
        const coreWidth = (0.012 + speed * 0.012) * aliveness;
        coreEl.setAttribute("stroke", `hsla(${baseHue}, 100%, 88%, ${coreOpacity.toFixed(3)})`);
        coreEl.setAttribute("stroke-width", coreWidth.toFixed(4));
        coreEl.removeAttribute("filter");
      }
    }

    // hide any unused pool elements
    for (let i = NEEDED; i < pool.length; i++) {
      pool[i].setAttribute("d", "");
    }
  };

  // ── draw sparkles ─────────────────────────────────────────────────────────
  const drawSparkles = (now: number): void => {
    const s = runRef.current;
    const group = sparkleGroupRef.current;
    if (!group) return;

    // update positions
    s.sparkles = s.sparkles.filter((sp) => now - sp.born < sp.life);
    s.sparkles.forEach((sp) => {
      const dt = (now - sp.born) / 1000;
      sp.x += sp.vx * dt * 0.016;
      sp.y += sp.vy * dt * 0.016;
    });

    // sync DOM: ensure enough circle elements
    const circles = group.querySelectorAll("circle");
    const circleArr = Array.from(circles) as SVGCircleElement[];

    // add more if needed
    while (circleArr.length < s.sparkles.length) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      group.appendChild(c);
      circleArr.push(c);
    }

    // update circles
    s.sparkles.forEach((sp, i) => {
      const c = circleArr[i];
      const age = (now - sp.born) / sp.life;
      const alpha = (1 - age) * 0.9;
      c.setAttribute("cx", sp.x.toFixed(3));
      c.setAttribute("cy", sp.y.toFixed(3));
      c.setAttribute("r", (sp.r * (1 - age * 0.5)).toFixed(3));
      c.setAttribute("fill", `hsla(${sp.hue}, 90%, 90%, ${alpha.toFixed(3)})`);
    });

    // hide excess circles
    for (let i = s.sparkles.length; i < circleArr.length; i++) {
      circleArr[i].setAttribute("r", "0");
    }
  };

  // ── emit sparkles when both hands are high ────────────────────────────────
  const maybeSparkle = (now: number, leftY: number, rightY: number): void => {
    const s = runRef.current;
    // both wrists above 0.4 in body space
    if (leftY > 0.4 && rightY > 0.4 && now - s.lastSparkleCheck > 200) {
      s.lastSparkleCheck = now;
      const count = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.3 + Math.random() * 0.5;
        const cx = (leftY > rightY ? runRef.current.leftTrail.at(-1)?.x : runRef.current.rightTrail.at(-1)?.x) ?? 0;
        const cy = (leftY + rightY) / 2;
        s.sparkles.push({
          x: cx + (Math.random() - 0.5) * 0.3,
          y: cy + (Math.random() - 0.5) * 0.2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 0.015 + Math.random() * 0.02,
          born: now,
          life: 800 + Math.random() * 400,
          hue: 45 + Math.random() * 60, // gold to warm white
        });
      }
    }
  };

  // ── main animation/detection loop ────────────────────────────────────────
  const startLoop = (): void => {
    const s = runRef.current;

    const frame = (nowMs: number): void => {
      s.rafId = requestAnimationFrame(frame);

      const tSec = nowMs / 1000;
      let body: Body;

      // get body from landmarker or ghost
      if (!s.isGhostMode && s.landmarker && s.videoEl && s.videoEl.readyState >= 2) {
        try {
          const res = s.landmarker.detectForVideo(s.videoEl, nowMs);
          const lm = res.landmarks?.[0];
          if (lm && lm.length >= 17) {
            body = bodyFromLandmarks(lm);
          } else {
            body = makeGhostBody(tSec);
          }
        } catch {
          body = makeGhostBody(tSec);
        }
      } else {
        body = makeGhostBody(tSec);
      }

      const lw = body[LM.leftWrist];
      const rw = body[LM.rightWrist];

      if (lw && rw) {
        // compute speeds
        const lSpeedResult = computeSpeed(nowMs, lw.x, lw.y, s.leftPrev);
        const rSpeedResult = computeSpeed(nowMs, rw.x, rw.y, s.rightPrev);
        s.leftPrev = lSpeedResult.nextPrev;
        s.rightPrev = rSpeedResult.nextPrev;

        // smooth speed with low-pass
        s.leftSpeed = s.leftSpeed + (lSpeedResult.speed - s.leftSpeed) * 0.25;
        s.rightSpeed = s.rightSpeed + (rSpeedResult.speed - s.rightSpeed) * 0.25;

        // add to trails
        s.leftTrail.push({ x: lw.x, y: lw.y, t: nowMs });
        s.rightTrail.push({ x: rw.x, y: rw.y, t: nowMs });

        // trim old points
        const cutoff = nowMs - TRAIL_DURATION_MS;
        s.leftTrail = s.leftTrail.filter((p) => p.t > cutoff);
        s.rightTrail = s.rightTrail.filter((p) => p.t > cutoff);

        // also cap max points (subsample if too many)
        if (s.leftTrail.length > MAX_TRAIL_PTS) {
          s.leftTrail = s.leftTrail.filter((_, i) => i % 2 === 0 || i === s.leftTrail.length - 1);
        }
        if (s.rightTrail.length > MAX_TRAIL_PTS) {
          s.rightTrail = s.rightTrail.filter((_, i) => i % 2 === 0 || i === s.rightTrail.length - 1);
        }

        // update audio
        if (s.audio) {
          const eng = s.audio;
          applyWristVoice(eng.left, eng.ctx, lw.y, s.leftSpeed, lw.x);
          applyWristVoice(eng.right, eng.ctx, rw.y, s.rightSpeed, rw.x);

          // shimmer: nose position adds subtle shimmer voice
          const nose = body[LM.nose];
          if (nose) {
            const shimmerHz = midiToHz(yToPentatonic(nose.y) + 12);
            eng.shimmerOsc.frequency.setTargetAtTime(shimmerHz, eng.ctx.currentTime, 0.12);
            const shimmerAmp = 0.03 + Math.abs(nose.x) * 0.04;
            eng.shimmerGain.gain.setTargetAtTime(shimmerAmp, eng.ctx.currentTime, 0.2);
          }
        }

        // sparkle when both hands are high
        maybeSparkle(nowMs, lw.y, rw.y);
      }

      // draw ribbons
      const lg = leftGroupRef.current;
      const rg = rightGroupRef.current;
      if (lg && leftPathsRef.current !== null) {
        drawRibbon(nowMs, s.leftTrail, lg, leftPathsRef.current, "38", s.leftSpeed);
      }
      if (rg && rightPathsRef.current !== null) {
        drawRibbon(nowMs, s.rightTrail, rg, rightPathsRef.current, "300", s.rightSpeed);
      }

      drawSparkles(nowMs);
    };

    s.rafId = requestAnimationFrame(frame);
  };

  // ── start handler (called inside first user tap) ──────────────────────────
  const handleStart = (): void => {
    if (phase !== "idle") return;
    setPhase("loading");

    void (async () => {
      const s = runRef.current;

      // 1. AudioContext inside gesture (iOS requirement)
      try {
        const eng = buildAudioEngine();
        if (eng.ctx.state === "suspended") {
          await eng.ctx.resume();
        }
        s.audio = eng;
      } catch {
        setNotice("Audio could not start — visuals only.");
      }

      // 2. Camera inside gesture (also iOS requirement)
      let cameraOk = false;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          s.stream = stream;
          s.videoEl = video;
          cameraOk = true;
          setCameraActive(true);
        }
      } catch {
        s.isGhostMode = true;
        setCameraActive(false);
        setNotice("Camera off — playing on its own");
      }

      // 3. Load MediaPipe (async — ghost mode while loading)
      if (cameraOk) {
        setPhase("running");
        startLoop();

        // load landmarker in background; ghost fills in until ready
        createLandmarker().then((lm) => {
          runRef.current.landmarker = lm;
          runRef.current.isGhostMode = false;
        }).catch(() => {
          runRef.current.isGhostMode = true;
          setNotice("Camera off — playing on its own");
        });
      } else {
        setPhase("running");
        startLoop();
      }
    })();
  };

  // ── unmount cleanup ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => { teardown(); };
  }, []);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <main className="relative w-full min-h-screen overflow-hidden bg-[#0d0a1a] select-none touch-none">

      {/* ── full-screen SVG ribbon canvas ─────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={VB}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
        style={{ transform: "scaleY(-1)" }} // flip y so up is up
      >
        <defs>
          {/* gaussian blur for ribbon glow */}
          <filter id="ribbon-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.025" />
          </filter>
          {/* radial gradient for ambient pulse */}
          <radialGradient id="ambient" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#3a1a5a" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0d0a1a" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ambient warm pulse */}
        <ellipse cx="0" cy="0" rx="1.2" ry="0.8" fill="url(#ambient)" />

        {/* left wrist ribbon group (amber/gold) */}
        <g ref={leftGroupRef} />

        {/* right wrist ribbon group (rose/violet) */}
        <g ref={rightGroupRef} />

        {/* sparkle group */}
        <g ref={sparkleGroupRef} />
      </svg>

      {/* hidden camera video */}
      <video
        ref={videoRef}
        className="absolute bottom-3 right-3 w-20 rounded-lg opacity-20 pointer-events-none"
        style={{ display: cameraActive ? "block" : "none", transform: "scaleX(-1)" }}
        playsInline
        muted
      />

      {/* ── idle/start screen ─────────────────────────────────────────────── */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 px-6 text-center">
          {/* warm glow rings (pure CSS, no canvas) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-72 rounded-full bg-violet-500/5 blur-3xl" />
            <div className="absolute w-48 h-48 rounded-full bg-violet-500/5 blur-2xl" />
          </div>

          <div className="relative z-10 flex flex-col items-center gap-5">
            <h1 className="text-3xl font-bold text-foreground leading-tight max-w-xs">
              Body Ribbons
            </h1>
            <p className="text-base text-muted-foreground max-w-sm leading-relaxed">
              Move your arms and draw glowing ribbons that sing.
              High arms = high notes. Move fast = louder and brighter.
            </p>
            <p className="text-base text-muted-foreground max-w-xs leading-relaxed">
              Stand back so your whole body shows.
            </p>

            <button
              type="button"
              onClick={handleStart}
              className="min-h-[72px] px-8 py-4 rounded-3xl bg-violet-500/90 hover:bg-violet-400 text-foreground text-2xl font-bold transition-colors shadow-lg shadow-violet-900/40"
            >
              Start
            </button>

            <p className="text-base text-muted-foreground">
              Camera stays in your browser. No wrong notes.
            </p>
          </div>
        </div>
      )}

      {/* ── loading overlay ────────────────────────────────────────────────── */}
      {phase === "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <p className="text-xl text-muted-foreground">Waking up…</p>
        </div>
      )}

      {/* ── running HUD ───────────────────────────────────────────────────── */}
      {phase === "running" && (
        <>
          {/* notice (camera off, etc.) */}
          {notice && (
            <div className="absolute top-0 inset-x-0 z-30 flex justify-center pt-4 pointer-events-none">
              <p className="text-base text-violet-300 bg-black/40 px-4 py-2 rounded-full">
                {notice}
              </p>
            </div>
          )}

          {/* hint bar */}
          <div className="absolute bottom-0 inset-x-0 z-10 flex justify-center pb-5 pointer-events-none">
            <p className="text-base text-muted-foreground">
              raise arms = high notes · move fast = louder
            </p>
          </div>

          {/* design notes link */}
          <a
            href="./README.md"
            className="absolute top-4 right-4 z-20 text-base text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            target="_blank"
            rel="noreferrer"
          >
            Read the design notes
          </a>

          {/* left wrist label */}
          <div className="absolute top-4 left-4 z-10 pointer-events-none">
            <span className="text-base text-violet-300/70 font-medium">
              left arm
            </span>
          </div>
          {/* right wrist label */}
          <div className="absolute top-10 left-4 z-10 pointer-events-none">
            <span className="text-base text-violet-300/70 font-medium">
              right arm
            </span>
          </div>
        </>
      )}
    </main>
  );
}
