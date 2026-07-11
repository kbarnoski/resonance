"use client";

// 368 · Kids Rainbow Quest
// ─────────────────────────────────────────────────────────────────────────────
// A camera "find this color" quest for kids 4+.
// A friendly creature asks you to find a color in the real world — point the
// camera at something red, orange, etc — and rewards you with music + sparkles.
// Builds a rainbow arc across the top as you collect all 7 colors.
//
// Scale: D-Dorian (D E F G A B C — NOT C-major-pentatonic; hard rule).
// Always-on: soft D + A drone pad.
// Renderer: DOM/CSS only (video BG + styled divs) — no Canvas2D for display,
//   no WebGL, no SVG, no three.js. A tiny offscreen canvas is used ONLY for
//   getImageData color analysis.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  RAINBOW_COLORS,
  sampleCenterHSV,
  computeWarmth,
  isColorMatch,
  shuffleColors,
  type RainbowColor,
} from "./colors";
import { createRainbowAudio, type RainbowAudio } from "./audio";

// ── types ─────────────────────────────────────────────────────────────────────
type Phase =
  | "idle"
  | "camera-starting"
  | "questing"
  | "fanfaring"    // brief lock after a find
  | "rainbow-song" // all 7 found, play the song
  | "no-camera";   // camera denied/unavailable — auto-demo mode

interface SparkleParticle {
  id: number;
  x: number;      // % 0-100
  y: number;      // % 0-100
  size: number;   // px
  color: string;
  opacity: number;
  tx: number;     // translate target x (px)
  ty: number;     // translate target y (px)
}

// ── constants ──────────────────────────────────────────────────────────────────
const DWELL_FRAMES = 36;         // ~0.6s at 60fps before "found!"
const AUTO_DEMO_FIND_MS = 2200;  // auto-demo: how long to "look" before finding
const FANFARE_LOCK_MS   = 1800;  // lock during found animation before next color
const RAINBOW_SONG_MS   = 7000;  // rainbow song duration before looping

// ── sparkle helpers ───────────────────────────────────────────────────────────
let sparkleCounter = 0;

function makeSparkles(color: string, count = 12): SparkleParticle[] {
  return Array.from({ length: count }, () => {
    sparkleCounter++;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 60 + Math.random() * 80;
    return {
      id:      sparkleCounter,
      x:       40 + Math.random() * 20,  // near center
      y:       45 + Math.random() * 10,
      size:    4 + Math.random() * 8,
      color,
      opacity: 1,
      tx:      Math.cos(angle) * dist,
      ty:      Math.sin(angle) * dist,
    };
  });
}

// ── utility: hex color to "r,g,b" string ─────────────────────────────────────
function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const num   = parseInt(clean, 16);
  const r     = (num >> 16) & 255;
  const g     = (num >> 8) & 255;
  const b     = num & 255;
  return `${r},${g},${b}`;
}

// ── component ─────────────────────────────────────────────────────────────────
export default function KidsRainbowQuest() {
  // ── phase state ──────────────────────────────────────────────────────────
  const [phase, setPhase]       = useState<Phase>("idle");
  const phaseRef                = useRef<Phase>("idle");

  // ── quest state ───────────────────────────────────────────────────────────
  const [questOrder, setQuestOrder]   = useState<RainbowColor[]>([]);
  const [questIdx, setQuestIdx]       = useState(0);       // which color we want now
  const [collectedMask, setCollectedMask] = useState<boolean[]>(new Array(7).fill(false));
  const [warmth, setWarmth]           = useState(0);       // 0..1 glow intensity
  const [sparkles, setSparkles]       = useState<SparkleParticle[]>([]);
  const [highlightBand, setHighlightBand] = useState<number | null>(null); // rainbow song

  // internal refs (avoid stale closures in rAF)
  const questOrderRef   = useRef<RainbowColor[]>([]);
  const questIdxRef     = useRef(0);
  const collectedRef    = useRef<boolean[]>(new Array(7).fill(false));
  const dwellFramesRef  = useRef(0);
  const warmthRef       = useRef(0);

  // ── audio ─────────────────────────────────────────────────────────────────
  const audioRef = useRef<RainbowAudio | null>(null);

  // ── camera ────────────────────────────────────────────────────────────────
  const videoRef        = useRef<HTMLVideoElement | null>(null);
  const offCanvasRef    = useRef<HTMLCanvasElement | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const noFrameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraLiveRef   = useRef(false);

  // ── rAF ───────────────────────────────────────────────────────────────────
  const rafRef          = useRef<number | null>(null);
  const autoDemoRef     = useRef(false);
  const autoDemoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── rainbow song timer ────────────────────────────────────────────────────
  const songTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── analysis loop ─────────────────────────────────────────────────────────
  const runAnalysis = useCallback(() => {
    if (
      phaseRef.current !== "questing" &&
      phaseRef.current !== "fanfaring"
    ) return;

    rafRef.current = requestAnimationFrame(runAnalysis);

    if (phaseRef.current === "fanfaring") return; // skip analysis during fanfare lock

    const video  = videoRef.current;
    const canvas = offCanvasRef.current;
    if (!video || !canvas) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    // resize offscreen canvas lazily
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    ctx2d.drawImage(video, 0, 0, w, h);
    const imgData = ctx2d.getImageData(0, 0, w, h);
    const hsv = sampleCenterHSV(imgData.data, w, h);

    const target = questOrderRef.current[questIdxRef.current];
    if (!target) return;

    const w0 = computeWarmth(hsv, target);
    warmthRef.current = w0;

    // smooth warmth state update (only when changed meaningfully)
    setWarmth(w0);
    audioRef.current?.setWarmth(w0);

    if (isColorMatch(hsv, target)) {
      dwellFramesRef.current++;
      if (dwellFramesRef.current >= DWELL_FRAMES) {
        dwellFramesRef.current = 0;
        triggerFound();
      }
    } else {
      dwellFramesRef.current = 0;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── auto-demo: self-finding loop ─────────────────────────────────────────
  const scheduleAutoFind = useCallback(() => {
    if (!autoDemoRef.current) return;
    autoDemoTimerRef.current = setTimeout(() => {
      if (!autoDemoRef.current) return;
      if (
        phaseRef.current !== "questing" &&
        phaseRef.current !== "fanfaring"
      ) return;
      if (phaseRef.current === "fanfaring") {
        // retry after fanfare clears
        scheduleAutoFind();
        return;
      }
      // Simulate warmth rising
      let w = 0;
      const rampInterval = setInterval(() => {
        w = Math.min(1, w + 0.07);
        warmthRef.current = w;
        setWarmth(w);
        audioRef.current?.setWarmth(w);
        if (w >= 1) {
          clearInterval(rampInterval);
          if (autoDemoRef.current) triggerFound();
        }
      }, 50);
    }, AUTO_DEMO_FIND_MS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── triggerFound: a color was found (camera or auto-demo) ─────────────────
  const triggerFound = useCallback(() => {
    const target = questOrderRef.current[questIdxRef.current];
    if (!target) return;

    phaseRef.current = "fanfaring";
    setPhase("fanfaring");

    // 1) audio fanfare
    audioRef.current?.playFanfare(target.noteIdx);

    // 2) warmth → 0
    audioRef.current?.setWarmth(0);
    setWarmth(0);
    warmthRef.current = 0;

    // 3) sparkles
    setSparkles(makeSparkles(target.hex));

    // 4) mark collected
    const newMask = [...collectedRef.current];
    // find the RAINBOW_COLORS index (the target's original noteIdx)
    const arcIdx = RAINBOW_COLORS.findIndex((c) => c.name === target.name);
    if (arcIdx >= 0) newMask[arcIdx] = true;
    collectedRef.current = newMask;
    setCollectedMask([...newMask]);

    const nextIdx = questIdxRef.current + 1;

    setTimeout(() => {
      // clear sparkles
      setSparkles([]);

      if (nextIdx >= questOrderRef.current.length) {
        // ALL 7 FOUND — rainbow song!
        phaseRef.current = "rainbow-song";
        setPhase("rainbow-song");

        audioRef.current?.playRainbowSong((bandIdx) => {
          setHighlightBand(bandIdx);
        });

        songTimerRef.current = setTimeout(() => {
          // loop with fresh shuffle
          const fresh = shuffleColors(RAINBOW_COLORS);
          questOrderRef.current = fresh;
          questIdxRef.current   = 0;
          collectedRef.current  = new Array(7).fill(false);
          setQuestOrder([...fresh]);
          setQuestIdx(0);
          setCollectedMask(new Array(7).fill(false));
          setHighlightBand(null);
          phaseRef.current = "questing";
          setPhase("questing");
          if (autoDemoRef.current) scheduleAutoFind();
          rafRef.current = requestAnimationFrame(runAnalysis);
        }, RAINBOW_SONG_MS);

      } else {
        // next color
        questIdxRef.current = nextIdx;
        setQuestIdx(nextIdx);
        phaseRef.current = "questing";
        setPhase("questing");
        if (autoDemoRef.current) scheduleAutoFind();
        // resume analysis loop
        rafRef.current = requestAnimationFrame(runAnalysis);
      }
    }, FANFARE_LOCK_MS);
  }, [runAnalysis, scheduleAutoFind]);

  // ── start the quest ───────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (typeof window === "undefined") return;

    // Create AudioContext INSIDE the tap handler (iOS-safe)
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext!;

    if (!AC) {
      phaseRef.current = "no-camera";
      setPhase("no-camera");
      return;
    }

    const audioCtx = new AC();
    await audioCtx.resume();
    audioRef.current = createRainbowAudio(audioCtx);

    // Shuffle color order
    const order = shuffleColors(RAINBOW_COLORS);
    questOrderRef.current = order;
    questIdxRef.current   = 0;
    collectedRef.current  = new Array(7).fill(false);
    setQuestOrder([...order]);
    setQuestIdx(0);
    setCollectedMask(new Array(7).fill(false));
    setSparkles([]);
    setHighlightBand(null);

    phaseRef.current = "camera-starting";
    setPhase("camera-starting");

    // Request rear camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;

      // Create offscreen canvas for analysis
      const offCanvas = document.createElement("canvas");
      offCanvasRef.current = offCanvas;

      const video = document.createElement("video");
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      video.setAttribute("playsinline", "");
      videoRef.current = video;

      video.onloadedmetadata = () => {
        video.play().catch(() => undefined);
        cameraLiveRef.current = true;

        // Clear the no-frame timer if we already set it
        if (noFrameTimerRef.current) {
          clearTimeout(noFrameTimerRef.current);
          noFrameTimerRef.current = null;
        }

        phaseRef.current = "questing";
        setPhase("questing");

        rafRef.current = requestAnimationFrame(runAnalysis);
      };

      // If no frame arrives within ~2s, fall back to auto-demo
      noFrameTimerRef.current = setTimeout(() => {
        if (!cameraLiveRef.current) {
          activateAutoDemo();
        }
      }, 2000);

    } catch {
      // Camera denied or unavailable
      activateAutoDemo();
    }
  }, [runAnalysis]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── auto-demo activation ─────────────────────────────────────────────────
  const activateAutoDemo = useCallback(() => {
    autoDemoRef.current = true;
    phaseRef.current    = "questing";
    setPhase("questing");
    scheduleAutoFind();
    // no rAF needed for auto-demo (it's timer-based)
  }, [scheduleAutoFind]);

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (noFrameTimerRef.current) clearTimeout(noFrameTimerRef.current);
      if (autoDemoTimerRef.current) clearTimeout(autoDemoTimerRef.current);
      if (songTimerRef.current) clearTimeout(songTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      audioRef.current?.teardown();
      audioRef.current = null;
    };
  }, []);

  // ── derived ───────────────────────────────────────────────────────────────
  const isRunning   = phase === "questing" || phase === "fanfaring";
  const isSong      = phase === "rainbow-song";
  const currentTarget = questOrder[questIdx] ?? null;
  const isAutoDemo  = autoDemoRef.current;
  const collectedCount = collectedMask.filter(Boolean).length;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <main
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden select-none"
      style={{ background: "#0a0610" }}
    >
      {/* ── CAMERA BACKGROUND ─────────────────────────────────────────────── */}
      {(isRunning || isSong) && !isAutoDemo && videoRef.current && (
        <CameraBackground videoEl={videoRef.current} />
      )}

      {/* ── WARMTH GLOW OVERLAY ───────────────────────────────────────────── */}
      {isRunning && currentTarget && (
        <WarmthGlow
          warmth={warmth}
          color={currentTarget.glowHex}
        />
      )}

      {/* ── RAINBOW ARC (top strip) ───────────────────────────────────────── */}
      {(isRunning || isSong) && (
        <RainbowArc
          collectedMask={collectedMask}
          highlightBand={highlightBand}
          questOrder={questOrder}
        />
      )}

      {/* ── SPARKLES ──────────────────────────────────────────────────────── */}
      <SparkleLayer particles={sparkles} />

      {/* ── IDLE SCREEN ───────────────────────────────────────────────────── */}
      {phase === "idle" && (
        <div className="relative z-10 flex max-w-sm flex-col items-center gap-8 px-6 text-center">
          {/* Creature */}
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 120,
              height: 120,
              background: "radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 70%)",
              boxShadow: "0 0 40px rgba(168,85,247,0.3)",
              fontSize: 72,
              lineHeight: 1,
            }}
          >
            🦄
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Rainbow Quest
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              The unicorn wants colours! Find them with your camera.
            </p>
          </div>

          <button
            onClick={handleStart}
            className="min-h-[64px] w-full rounded-2xl border border-violet-400/40 bg-violet-500/20 px-6 py-4 text-2xl font-bold text-foreground transition-all hover:bg-violet-500/30 active:scale-95"
            style={{ touchAction: "manipulation" }}
          >
            🌈 Start ▸
          </button>

          <p className="text-sm text-muted-foreground/70 leading-relaxed">
            Camera stays on your device — never recorded or uploaded.
          </p>
        </div>
      )}

      {/* ── CAMERA STARTING ───────────────────────────────────────────────── */}
      {phase === "camera-starting" && (
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="text-5xl animate-pulse">🌈</div>
          <p className="text-xl text-muted-foreground">Opening camera…</p>
        </div>
      )}

      {/* ── QUESTING / FANFARING ─────────────────────────────────────────── */}
      {(isRunning || isSong) && (
        <QuestOverlay
          phase={phase}
          currentTarget={currentTarget}
          warmth={warmth}
          questTotal={questOrder.length}
          collectedCount={collectedCount}
          isAutoDemo={isAutoDemo}
        />
      )}

      {/* ── RAINBOW SONG SCREEN ───────────────────────────────────────────── */}
      {isSong && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, rgba(168,85,247,0.12) 0%, transparent 65%)" }}
        >
          <div
            className="text-7xl"
            style={{
              filter: "drop-shadow(0 0 24px rgba(168,85,247,0.7))",
              animation: "spin 4s linear infinite",
            }}
          >
            🌈
          </div>
          <p className="text-2xl font-bold text-foreground" style={{ textShadow: "0 0 20px rgba(255,255,255,0.4)" }}>
            Rainbow complete!
          </p>
          <p className="text-base text-muted-foreground">
            Listen to your rainbow song…
          </p>
        </div>
      )}

      {/* ── NO CAMERA NOTICE ─────────────────────────────────────────────── */}
      {phase === "no-camera" && (
        <div className="relative z-10 max-w-sm px-6 text-center">
          <p className="text-base text-violet-300 leading-relaxed">
            Camera not available — running auto-demo mode so you can see the
            full quest play itself.
          </p>
        </div>
      )}

      {/* ── Design notes link ────────────────────────────────────────────── */}
      <a
        href="/dream/368-kids-rainbow-quest/README.md"
        className="absolute bottom-4 right-4 text-sm text-muted-foreground/70 hover:text-muted-foreground transition-colors z-50"
      >
        Design notes
      </a>

      {/* ── CSS animations ───────────────────────────────────────────────── */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes sparkle-out {
          0%   { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0.2); }
        }
        @keyframes creature-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50%       { transform: translateY(-8px) scale(1.06); }
        }
        @keyframes creature-celebrate {
          0%   { transform: scale(1) rotate(0deg); }
          25%  { transform: scale(1.2) rotate(-10deg); }
          75%  { transform: scale(1.2) rotate(10deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes warmth-pulse {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1; }
        }
        @keyframes arc-glow {
          0%, 100% { filter: brightness(1); }
          50%       { filter: brightness(1.7) saturate(1.4); }
        }
      `}</style>
    </main>
  );
}

// ── Camera background ─────────────────────────────────────────────────────────
// Renders the live camera feed as a DOM background using object-fit cover.
interface CameraBackgroundProps {
  videoEl: HTMLVideoElement;
}

function CameraBackground({ videoEl }: CameraBackgroundProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Mount the existing video element into the DOM
    videoEl.style.width  = "100%";
    videoEl.style.height = "100%";
    videoEl.style.objectFit = "cover";
    videoEl.style.position  = "absolute";
    videoEl.style.inset     = "0";
    container.appendChild(videoEl);
    return () => {
      if (container.contains(videoEl)) container.removeChild(videoEl);
    };
  }, [videoEl]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0"
      style={{ opacity: 0.55 }}
    />
  );
}

// ── Warmth glow overlay ───────────────────────────────────────────────────────
interface WarmthGlowProps {
  warmth: number;  // 0..1
  color: string;   // hex
}

function WarmthGlow({ warmth, color }: WarmthGlowProps) {
  if (warmth < 0.05) return null;
  const rgb = hexToRgb(color);
  const alpha = warmth * 0.45;
  const spread = 80 + warmth * 160;

  return (
    <div
      className="absolute inset-0 z-10 pointer-events-none"
      style={{
        background: `radial-gradient(ellipse ${spread}% ${spread}% at 50% 50%, rgba(${rgb}, ${alpha}) 0%, transparent 70%)`,
        transition: "background 0.18s ease",
        animation: warmth > 0.6 ? "warmth-pulse 0.8s ease-in-out infinite" : "none",
      }}
    />
  );
}

// ── Rainbow arc (top strip) ────────────────────────────────────────────────────
interface RainbowArcProps {
  collectedMask: boolean[];       // 7-element, indexed by RAINBOW_COLORS order
  highlightBand: number | null;   // which band is currently ringing in the song
  questOrder: RainbowColor[];     // current quest order (for display)
}

function RainbowArc({ collectedMask, highlightBand, questOrder }: RainbowArcProps) {
  // Always show bands in RAINBOW_COLORS canonical order (R O Y G B I V)
  return (
    <div
      className="absolute top-12 left-0 right-0 z-30 flex pointer-events-none"
      style={{ height: 20 }}
      aria-hidden="true"
    >
      {RAINBOW_COLORS.map((color, i) => {
        const collected = collectedMask[i];
        const isHighlight = highlightBand === i;
        // Is this color the current target?
        const isTarget = questOrder[0] !== undefined &&
          !collectedMask.some(Boolean) === false
            ? false // not relevant mid-quest for now
            : false;
        void isTarget; // intentionally unused; arc reflects collected only

        return (
          <div
            key={color.name}
            className="flex-1 transition-all duration-500"
            style={{
              height: "100%",
              background: collected ? color.hex : "rgba(255,255,255,0.07)",
              boxShadow: isHighlight
                ? `0 0 18px 4px ${color.glowHex}`
                : collected
                  ? `0 0 8px 1px ${color.hex}60`
                  : "none",
              animation: isHighlight ? "arc-glow 0.4s ease-in-out" : "none",
              borderBottom: collected
                ? `2px solid ${color.glowHex}`
                : "2px solid rgba(255,255,255,0.05)",
              opacity: collected ? 1 : 0.35,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Sparkle layer ─────────────────────────────────────────────────────────────
interface SparkleLayerProps {
  particles: SparkleParticle[];
}

function SparkleLayer({ particles }: SparkleLayerProps) {
  if (particles.length === 0) return null;
  return (
    <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            // CSS custom properties for the animation target
            "--tx": `${p.tx}px`,
            "--ty": `${p.ty}px`,
            animation: "sparkle-out 1.4s cubic-bezier(0.2,0.8,0.6,1) forwards",
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ── Quest Overlay ─────────────────────────────────────────────────────────────
interface QuestOverlayProps {
  phase: Phase;
  currentTarget: RainbowColor | null;
  warmth: number;
  questTotal: number;
  collectedCount: number;
  isAutoDemo: boolean;
}

function QuestOverlay({
  phase,
  currentTarget,
  warmth,
  questTotal,
  collectedCount,
  isAutoDemo,
}: QuestOverlayProps) {
  const isFanfare = phase === "fanfaring";
  const target    = currentTarget;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-between pointer-events-none"
      style={{ paddingTop: 48 + 20 + 16, paddingBottom: 56 }}
    >
      {/* Top: quest counter */}
      <div className="flex items-center gap-2">
        <span className="text-base text-muted-foreground">
          {collectedCount} / {questTotal}
        </span>
        {isAutoDemo && (
          <span className="text-sm text-violet-300 ml-2">
            · auto-demo
          </span>
        )}
      </div>

      {/* Center: creature + target swatch */}
      <div className="flex flex-col items-center gap-6">
        {/* Creature */}
        <div
          style={{
            fontSize: 96,
            lineHeight: 1,
            animation: isFanfare
              ? "creature-celebrate 0.6s ease-in-out 2"
              : "creature-bounce 2.2s ease-in-out infinite",
            filter: target && !isFanfare
              ? `drop-shadow(0 0 ${12 + warmth * 24}px ${target.glowHex})`
              : isFanfare && target
                ? `drop-shadow(0 0 32px ${target.glowHex})`
                : "drop-shadow(0 0 12px rgba(168,85,247,0.5))",
          }}
        >
          {isFanfare ? "🎉" : "🦄"}
        </div>

        {/* Target color swatch — the creature "wants" this */}
        {!isFanfare && target && (
          <div className="flex flex-col items-center gap-3">
            {/* Creature speech bubble */}
            <div
              className="rounded-2xl px-4 py-2"
              style={{
                background: "rgba(0,0,0,0.55)",
                border: `1.5px solid rgba(255,255,255,0.15)`,
              }}
            >
              <p className="text-xl font-semibold text-foreground">
                Find me{" "}
                <span style={{ color: target.glowHex }}>
                  {target.emoji}
                </span>
                !
              </p>
            </div>

            {/* Big glowing target swatch */}
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 24,
                background: target.hex,
                boxShadow: `0 0 ${24 + warmth * 48}px ${target.glowHex},
                            0 0 ${8 + warmth * 16}px ${target.hex}`,
                border: `3px solid ${target.glowHex}`,
                transition: "box-shadow 0.18s ease",
              }}
            />

            {/* Warmth progress bar */}
            <WarmthBar warmth={warmth} color={target.glowHex} />
          </div>
        )}

        {/* Fanfare message */}
        {isFanfare && target && (
          <div
            className="rounded-2xl px-6 py-3"
            style={{
              background: "rgba(0,0,0,0.55)",
              border: `2px solid ${target.glowHex}`,
              boxShadow: `0 0 24px ${target.glowHex}40`,
            }}
          >
            <p className="text-2xl font-bold text-foreground">
              {target.emoji} Found it!
            </p>
          </div>
        )}
      </div>

      {/* Bottom: hint */}
      <div className="flex flex-col items-center gap-1">
        {!isFanfare && target && (
          <p className="text-base text-muted-foreground">
            {warmth > 0.7
              ? "Hold still…"
              : warmth > 0.35
                ? "Getting warmer! 🔥"
                : isAutoDemo
                  ? "Looking for it…"
                  : "Point the camera at something"}
          </p>
        )}
        {!isAutoDemo && (
          <p className="text-sm text-muted-foreground/70">
            Camera: on-device only · never recorded
          </p>
        )}
      </div>
    </div>
  );
}

// ── Warmth progress bar ───────────────────────────────────────────────────────
interface WarmthBarProps {
  warmth: number;
  color: string;
}

function WarmthBar({ warmth, color }: WarmthBarProps) {
  const rgb = hexToRgb(color);
  return (
    <div
      className="overflow-hidden rounded-full"
      style={{
        width: 96,
        height: 8,
        background: "rgba(255,255,255,0.12)",
      }}
    >
      <div
        style={{
          width: `${Math.round(warmth * 100)}%`,
          height: "100%",
          background: `rgba(${rgb}, 0.9)`,
          boxShadow: `0 0 8px rgba(${rgb}, 0.8)`,
          transition: "width 0.18s ease",
          borderRadius: "9999px",
        }}
      />
    </div>
  );
}
