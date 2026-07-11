"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  makeHandLandmarker,
  type HandLandmarkerLike,
  type HandResult,
  type HandLandmark,
} from "./handLoader";
import {
  classifyHand,
  DEGREES,
  DEGREE_EMOJI,
  DEGREE_HUE,
  DEGREE_LABEL,
  type Degree,
} from "./classify";
import { ChoirAudio } from "./audio";
import { ChoirScene } from "./scene";

/* ───────────────────── Kids' Solfège Signs (Curwen / Kodály) ─────────────────
   Sing a melody with your bare hand. Make the classic Curwen hand-signs in the
   air (fist = "do", flat hand = "fa/mi", point up = "ti", ...) and a choir of
   glowing creatures sings the matching scale degree back. Hold shapes to build
   a little tune; go still and the choir echoes your melody (Kodály echo).
   ─────────────────────────────────────────────────────────────────────────── */

const DWELL_MS = 250; // a sign must persist this long before it rings
const ECHO_AFTER_MS = 2000; // stillness/absence before the choir echoes

// A pretty demo phrase the ghost-hand cycles through (do-re-mi-sol-mi-do...).
const DEMO_PHRASE: Degree[] = [
  "do",
  "re",
  "mi",
  "sol",
  "mi",
  "re",
  "do",
  "sol",
  "la",
  "sol",
];

interface Engine {
  audio: ChoirAudio;
  scene: ChoirScene | null;
  landmarker: HandLandmarkerLike | null;
  stream: MediaStream | null;
  raf: number;
  mode: "camera" | "auto-demo";
  // dwell tracking
  candidate: Degree | null;
  candidateSince: number;
  ringing: Degree | null;
  height: number;
  lastInputAt: number;
  echoScheduled: boolean;
  // latest hand skeleton for the HUD overlay (mirrored, 0..1)
  skeleton: HandLandmark[] | null;
  // tap-button override (degree forced by a pressed button)
  tapDegree: Degree | null;
}

export default function KidsSolfegeSigns() {
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "camera" | "auto-demo">("idle");
  const [activeDegree, setActiveDegree] = useState<Degree | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  function stopEverything() {
    const eng = engineRef.current;
    if (!eng) return;
    cancelAnimationFrame(eng.raf);
    if (eng.stream) eng.stream.getTracks().forEach((t) => t.stop());
    if (eng.landmarker) {
      try {
        eng.landmarker.close();
      } catch {
        /* ignore */
      }
    }
    if (eng.scene) eng.scene.dispose();
    void eng.audio.dispose();
    engineRef.current = null;
  }

  useEffect(() => {
    return () => stopEverything();
  }, []);

  async function start() {
    if (running) return;
    setNotice(null);

    const audio = new ChoirAudio();
    await audio.resume();

    // three.js scene (graceful WebGL failure).
    let scene: ChoirScene | null = null;
    const glCanvas = glCanvasRef.current;
    if (glCanvas) {
      try {
        scene = new ChoirScene(glCanvas);
        scene.resize(glCanvas.clientWidth || 640, glCanvas.clientHeight || 360);
      } catch {
        scene = null;
        setNotice(
          "WebGL is unavailable here — the choir still sings, but the glowing creatures are hidden.",
        );
      }
    }

    engineRef.current = {
      audio,
      scene,
      landmarker: null,
      stream: null,
      raf: 0,
      mode: "auto-demo",
      candidate: null,
      candidateSince: 0,
      ringing: null,
      height: 0.5,
      lastInputAt: performance.now(),
      echoScheduled: false,
      skeleton: null,
      tapDegree: null,
    };

    setRunning(true);
    setMode("auto-demo");

    void tryCamera();

    const loop = () => {
      const eng = engineRef.current;
      if (!eng) return;
      runFrame();
      eng.raf = requestAnimationFrame(loop);
    };
    engineRef.current.raf = requestAnimationFrame(loop);
  }

  async function tryCamera() {
    const eng = engineRef.current;
    if (!eng) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice(
        "No camera here — the GHOST HAND is singing a tune by itself. Tap the big colored signs below to sing your own!",
      );
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
    } catch {
      setNotice(
        "Camera off or not allowed — the GHOST HAND sings for you. Tap the big colored signs below to play.",
      );
      return;
    }
    const eng2 = engineRef.current;
    if (!eng2) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    eng2.stream = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* ignore */
      }
    }
    try {
      const lm = await makeHandLandmarker();
      const e3 = engineRef.current;
      if (!e3) {
        lm.close();
        return;
      }
      e3.landmarker = lm;
      e3.mode = "camera";
      setMode("camera");
      setNotice(null);
    } catch {
      setNotice(
        "Hand-tracking model couldn't load — the GHOST HAND sings for you. Tap the big colored signs below to play.",
      );
    }
  }

  /* ── per-frame: read a sign → dwell-gate → ring choir → render scene ── */
  function runFrame() {
    const eng = engineRef.current;
    if (!eng) return;
    const now = performance.now();

    let detected: Degree | null = null;
    let height = eng.height;

    if (eng.tapDegree) {
      // A tap-button is held: force that degree (fully playable, no camera).
      detected = eng.tapDegree;
      height = 0.5;
      eng.skeleton = null;
    } else if (eng.mode === "camera" && eng.landmarker && videoRef.current) {
      let res: HandResult | null = null;
      try {
        res = eng.landmarker.detectForVideo(videoRef.current, now);
      } catch {
        res = null;
      }
      if (res && res.landmarks && res.landmarks.length > 0) {
        const raw = res.landmarks[0];
        // Mirror x for selfie space so left/right match the child.
        const mirrored = raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
        eng.skeleton = mirrored;
        const c = classifyHand(mirrored);
        if (c.degree && c.confidence >= 0.45) {
          detected = c.degree;
          height = c.height;
        }
      } else {
        eng.skeleton = null;
      }
    } else {
      // Ghost-hand auto-demo: cycle the phrase on a gentle timer.
      const idx = Math.floor((now / 1100) % DEMO_PHRASE.length);
      detected = DEMO_PHRASE[idx];
      // bob the height for a living octave shimmer
      height = 0.5 + 0.35 * Math.sin(now / 1700);
      eng.skeleton = makeGhostSkeleton(detected, now);
    }

    eng.height = eng.height + (height - eng.height) * 0.2;

    // ── dwell gate ──
    if (detected) {
      eng.lastInputAt = now;
      eng.echoScheduled = false;
      if (detected !== eng.candidate) {
        eng.candidate = detected;
        eng.candidateSince = now;
      }
      const held = now - eng.candidateSince;
      // For tap buttons & ghost demo, no need for the full dwell jitter guard,
      // but we keep a short one so real-hand flicker doesn't trigger notes.
      const dwell = eng.tapDegree ? 0 : DWELL_MS;
      if (held >= dwell && detected !== eng.ringing) {
        eng.ringing = detected;
        setActiveDegree(detected);
      }
    } else {
      eng.candidate = null;
      // Hand gone — release the held voice and schedule the Kodály echo.
      if (eng.ringing) {
        eng.audio.release();
        eng.ringing = null;
        setActiveDegree(null);
      }
      if (!eng.echoScheduled && now - eng.lastInputAt > ECHO_AFTER_MS) {
        eng.echoScheduled = true;
        eng.audio.playEcho();
      }
    }

    // ── ring the choir for the currently-held sign ──
    if (eng.ringing) {
      const octave = eng.height > 0.62 ? 1 : eng.height < 0.32 ? -1 : 0;
      const brightness = eng.height;
      eng.audio.ring(eng.ringing, octave, brightness);
    }

    // The orb that should glow: the live sign, or whatever the echo is singing.
    const glowing = eng.ringing ?? eng.audio.echoActiveDegree;

    // ── render scene ──
    if (eng.scene && glCanvasRef.current) {
      const c = glCanvasRef.current;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.floor(w) || c.height !== Math.floor(h)) {
        eng.scene.resize(w, h);
      }
      eng.scene.render(glowing, eng.height, eng.audio.level);
    }

    drawHud();
  }

  /* ── tiny Canvas2D HUD: the live hand skeleton so the child feels "seen" ── */
  function drawHud() {
    const eng = engineRef.current;
    const canvas = hudCanvasRef.current;
    if (!eng || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const sk = eng.skeleton;
    if (!sk || sk.length < 21) return;

    const hue = eng.ringing ? DEGREE_HUE[eng.ringing] : 270;
    const col = `hsl(${hue} 90% 70%)`;
    const bones: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ];
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (const [a, b] of bones) {
      ctx.moveTo(sk[a].x * w, sk[a].y * h);
      ctx.lineTo(sk[b].x * w, sk[b].y * h);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    for (const p of sk) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function stopAndReset() {
    stopEverything();
    setRunning(false);
    setMode("idle");
    setActiveDegree(null);
    setNotice(null);
  }

  // Tap-sign press/release wiring (kid tap-targets).
  function pressSign(d: Degree) {
    const eng = engineRef.current;
    if (!eng) return;
    // Tap takes priority over camera/ghost input in runFrame.
    eng.tapDegree = d;
  }
  function releaseSign() {
    const eng = engineRef.current;
    if (!eng) return;
    eng.tapDegree = null;
  }

  const modeLabel =
    mode === "camera"
      ? "Hand-tracking live — make a sign in the air!"
      : mode === "auto-demo"
        ? "Ghost hand is singing — tap a sign to join in!"
        : "idle";

  return (
    <div className="min-h-screen bg-[#070611] text-foreground px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/dream" className="text-violet-300 text-base hover:underline">
          ← back to the dream lab
        </Link>

        <h1 className="mt-4 font-semibold text-3xl sm:text-4xl text-foreground">
          Sing With Your Hand{" "}
          <span className="text-violet-300">(solfège signs)</span>
        </h1>
        <p className="mt-3 text-base text-foreground leading-relaxed">
          Make the classic music-teacher hand-signs in the air — a fist is{" "}
          <em>do</em>, a flat hand is <em>mi</em>, a pointing finger is{" "}
          <em>ti</em> — and a choir of glowing creatures sings that note back.
          Hold and change shapes to build a little tune. Go still, and the choir
          echoes your melody.
        </p>

        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="mt-2 text-violet-300 text-base underline-offset-2 hover:underline"
        >
          {showNotes ? "Hide the design notes" : "Read the design notes"}
        </button>

        {showNotes && (
          <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 text-base text-foreground leading-relaxed space-y-2">
            <p>
              These are the Curwen hand-signs (John Curwen, 1870) used in the
              Kodály method by music teachers worldwide to teach pitch with the
              body. A geometric classifier reads 21 hand landmarks from the
              front camera, decides which of the 7 signs you are making, and
              rings the matching scale degree (do=C, re=D, … ti=B) through a
              warm, kids-safe choir. Hand height shifts the octave and
              brightness; a held sign rings, and stillness triggers a Kodály
              echo of your last few notes.
            </p>
            <p>
              In the lineage of real-time musical sign-recognition such as
              &ldquo;Real-Time Control of a Virtual Orchestra by Recognition of
              Conducting Gestures&rdquo; (arXiv 2604.27957, 2026). See the
              README for the full mapping, references, and an honest caveat.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={() => void start()}
              className="min-h-[72px] px-6 py-3 text-lg rounded-xl bg-violet-500/25 text-violet-100 border border-violet-400/50 hover:bg-violet-500/35 transition-colors"
            >
              ▶ Start singing
            </button>
          ) : (
            <button
              type="button"
              onClick={stopAndReset}
              className="min-h-[44px] px-4 py-2.5 rounded-md bg-muted text-foreground border border-border hover:bg-accent transition-colors"
            >
              Stop
            </button>
          )}
          {running && (
            <span className="text-base text-violet-300/90">{modeLabel}</span>
          )}
        </div>

        {notice && (
          <p className="mt-4 text-violet-300 text-base leading-relaxed">{notice}</p>
        )}

        <div className="mt-5 relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
          <canvas
            ref={glCanvasRef}
            className="absolute inset-0 h-full w-full"
          />
          {/* tiny Canvas2D hand-skeleton HUD — the ONLY 2D, top-right corner */}
          <canvas
            ref={hudCanvasRef}
            className="absolute right-2 top-2 h-[28%] w-[28%] rounded-lg border border-border bg-black/30"
          />
          {!running && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-base">
              Press Start to wake the choir.
            </div>
          )}
        </div>

        {/* hidden video feeds MediaPipe; never shown */}
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* big tap-sign buttons — fully playable with zero camera */}
        {running && (
          <div className="mt-5">
            <p className="text-base text-muted-foreground mb-2">
              Tap and hold a sign to sing it:
            </p>
            <div className="flex flex-wrap gap-2.5">
              {DEGREES.map((d) => {
                const isOn = activeDegree === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      pressSign(d);
                    }}
                    onPointerUp={releaseSign}
                    onPointerLeave={releaseSign}
                    onPointerCancel={releaseSign}
                    aria-label={`Sing ${DEGREE_LABEL[d]}`}
                    className="flex min-h-[72px] min-w-[72px] flex-col items-center justify-center rounded-xl border-2 px-4 py-2.5 text-base transition-transform active:scale-95"
                    style={{
                      borderColor: `hsl(${DEGREE_HUE[d]} 80% ${isOn ? 70 : 45}%)`,
                      background: isOn
                        ? `hsl(${DEGREE_HUE[d]} 75% 30%)`
                        : `hsl(${DEGREE_HUE[d]} 60% 15%)`,
                      color: "white",
                    }}
                  >
                    <span className="text-2xl leading-none">
                      {DEGREE_EMOJI[d]}
                    </span>
                    <span className="mt-1 font-semibold text-lg">
                      {DEGREE_LABEL[d]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {running && (
          <p className="mt-5 text-base text-foreground leading-relaxed">
            No camera? The ghost hand is already singing a little tune. Tap and
            hold the big colored signs above to sing your own melody — every note
            is in tune, so there are no wrong notes.
          </p>
        )}

        <p className="mt-8 text-base text-violet-300/70">
          input: front-camera hand-signs · output: three.js choir · technique:
          Curwen / Kodály 7-sign classifier · vibe: warm · wondrous · kids 4+
        </p>
      </div>
    </div>
  );
}

/* ── a believable ghost-hand skeleton for the auto-demo HUD (per sign) ── */
function makeGhostSkeleton(degree: Degree, now: number): HandLandmark[] {
  // Build a simple 21-point hand whose pose roughly matches the sign, drifting
  // gently so it feels alive. This only drives the HUD, never the classifier.
  const cx = 0.5 + 0.04 * Math.sin(now / 900);
  const cy = 0.55 + 0.03 * Math.cos(now / 1100);
  const s = 0.13;

  // direction the fingers point, by sign
  let dir = { x: 0, y: -1 }; // up
  let curl = 0; // 0 extended .. 1 fist
  switch (degree) {
    case "do":
      curl = 1;
      dir = { x: 0, y: -1 };
      break;
    case "fa":
      curl = 1;
      dir = { x: 0, y: 1 };
      break;
    case "re":
      dir = { x: 0.6, y: -0.8 };
      break;
    case "mi":
      dir = { x: 1, y: -0.05 };
      break;
    case "sol":
      dir = { x: 0, y: -1 };
      break;
    case "la":
      dir = { x: 0, y: 1 };
      break;
    case "ti":
      dir = { x: 0, y: -1 };
      break;
  }
  const dl = Math.hypot(dir.x, dir.y) || 1;
  const dx = dir.x / dl;
  const dy = dir.y / dl;
  const px = -dy; // perpendicular for finger spread
  const py = dx;

  const pts: HandLandmark[] = [];
  const wrist = { x: cx, y: cy, z: 0 };
  pts[0] = wrist;

  const makeFinger = (
    baseIdx: number,
    spread: number,
    length: number,
    fingerCurl: number,
  ) => {
    const bx = cx + px * spread * s;
    const by = cy + py * spread * s;
    for (let j = 1; j <= 4; j++) {
      const reach = (j / 4) * length * (1 - fingerCurl * 0.7);
      pts[baseIdx + j - 1] = {
        x: bx + dx * reach * s,
        y: by + dy * reach * s,
        z: 0,
      };
    }
  };
  // thumb (index 1..4) — for "ti" thumb tucked, for fa thumb leads down
  const thumbDir = degree === "fa" ? { x: 0, y: 1 } : { x: px, y: py };
  for (let j = 1; j <= 4; j++) {
    const reach = (j / 4) * 1.6;
    pts[j] = {
      x: cx + thumbDir.x * reach * s * 0.6 + px * s * 0.4,
      y: cy + thumbDir.y * reach * s * 0.6 + py * s * 0.4,
      z: 0,
    };
  }
  // index(5..8), middle(9..12), ring(13..16), pinky(17..20)
  const tiOnly = degree === "ti";
  makeFinger(5, -1.4, 2.4, tiOnly ? 0 : curl);
  makeFinger(9, -0.5, 2.6, tiOnly ? 1 : curl);
  makeFinger(13, 0.5, 2.4, tiOnly ? 1 : curl);
  makeFinger(17, 1.4, 2.0, tiOnly ? 1 : curl);
  return pts;
}
