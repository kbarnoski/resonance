"use client";

/**
 * 413-kids-mouth-mirror — The Magic X-Ray Mouth Mirror
 *
 * "What if a 4-year-old could sing a vowel and SEE INSIDE the mouth — a
 *  friendly side-view cartoon head whose tongue and jaw physically move to the
 *  shape it heard, then hear the vowel sung back?"
 *
 * Three subsystems:
 *   1. LPC formant tracking + formant→tongue inversion ............ ./lpc.ts
 *   2. Whole-tone vowel-shaped sing-back (call & response) ........ ./synth.ts
 *   3. SVG side-profile cartoon head whose tongue/jaw/lips morph ... here.
 *
 * Input: mic-voice only (AnalyserNode; never recorded/routed/transmitted).
 * Output: SVG paths only (no Canvas/WebGL). Whole-tone sing-back via Web Audio.
 *
 * References:
 *   - AURORA formant-to-tongue inversion (arXiv:2603.17543, March 2026)
 *   - Peterson & Barney (1952) — vowel formant centroids
 *   - Levinson-Durbin LPC source-filter model (Fant 1960; Markel & Gray 1976)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  computeArticulation,
  resetArticulation,
  articulationFromFormants,
  VOWEL_LABELS,
  VOWEL_REF,
  ATTRACT_SEQUENCE,
  type Articulation,
  type VowelId,
} from "./lpc";
import { createSingBack, type SingBackEngine } from "./synth";

// ── App phases ────────────────────────────────────────────────────────────────
type Phase = "idle" | "live" | "attract";

// ── Render snapshot the SVG reads each frame ─────────────────────────────────
interface MouthState {
  height: number; // tongue raised 0..1
  frontness: number; // tongue forward 0..1
  jaw: number; // jaw open 0..1
  round: number; // lip purse 0..1
  f1: number;
  f2: number;
  vowel: VowelId;
  active: boolean;
}

const IDLE_STATE: MouthState = {
  height: 0.4,
  frontness: 0.5,
  jaw: 0.3,
  round: 0.2,
  f1: 500,
  f2: 1500,
  vowel: "a",
  active: false,
};

// ── Small math helpers (not hooks) ───────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function n2(v: number): string {
  return v.toFixed(2);
}

// ── Build the morphing tongue-body path from articulation ────────────────────
// Coordinate frame: a 320x320 viewBox. The mouth cavity sits roughly in the
// lower-left of the profile (the face looks LEFT). The tongue is a smooth
// cubic-Bézier hump anchored at the back of the throat (right) and the tip
// (left). HEIGHT raises the hump toward the palate; FRONTNESS slides the hump's
// apex toward the lips.
function buildTonguePath(s: MouthState): string {
  // Floor of the mouth (jaw drops the floor down as it opens).
  const floorY = lerp(196, 236, s.jaw); // back-of-mouth floor
  const root = { x: 232, y: floorY }; // tongue root (throat side)
  const tip = { x: 118, y: lerp(182, 196, s.jaw) }; // tongue tip near lips

  // The hump apex: x slides with frontness, y rises with height.
  const apexX = lerp(150, 205, 1 - s.frontness); // front tongue => apex toward lips (lower x)
  const apexHigh = lerp(178, 120, s.height); // high tongue => smaller y (toward palate)

  // Control points sculpting a smooth body between root and tip via the apex.
  const c1x = lerp(root.x, apexX, 0.5);
  const c1y = lerp(root.y, apexHigh, 0.7);
  const c2x = lerp(apexX, tip.x, 0.5);
  const c2y = lerp(apexHigh, tip.y, 0.7);

  // Underside returns along the jaw floor so the tongue reads as a solid body.
  return [
    `M ${root.x} ${root.y}`,
    `C ${c1x} ${c1y} ${apexX} ${apexHigh} ${apexX} ${apexHigh}`,
    `C ${c2x} ${c2y} ${tip.x} ${tip.y} ${tip.x} ${tip.y}`,
    `L ${tip.x} ${tip.y + 14}`,
    `Q ${lerp(tip.x, root.x, 0.5)} ${floorY + 20} ${root.x} ${root.y + 6}`,
    "Z",
  ].join(" ");
}

// Upper lip + lower lip (side profile). Lower lip drops with jaw; both purse
// forward with rounding (the lip tip pushes left/out and curls).
function buildUpperLip(s: MouthState): string {
  const purse = s.round;
  const lipX = lerp(96, 78, purse); // pursed => lips push forward (left)
  const tipY = lerp(150, 156, purse);
  return `M 132 150 Q ${lipX} ${lerp(146, 150, purse)} ${lipX - 2} ${tipY}`;
}
function buildLowerLip(s: MouthState): string {
  const purse = s.round;
  const drop = s.jaw;
  const lipX = lerp(96, 78, purse);
  const startY = lerp(176, 198, drop);
  const tipY = lerp(168, 160, purse);
  return `M 132 ${startY} Q ${lipX} ${lerp(startY, tipY, 0.6)} ${lipX - 2} ${tipY}`;
}

// Palate (roof of mouth) — fixed ink curve the tongue rises toward.
const PALATE = "M 130 150 Q 190 138 236 150";

// Lower jaw outline — the chin rotates open with jaw.
function buildJaw(s: MouthState): string {
  const open = s.jaw;
  const chinY = lerp(214, 250, open);
  const chinX = lerp(108, 116, open);
  return `M 236 200 Q ${lerp(170, 175, open)} ${lerp(232, 256, open)} ${chinX} ${chinY} Q 96 ${chinY - 8} 96 ${lerp(190, 206, open)}`;
}

export default function KidsMouthMirror() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [view, setView] = useState<MouthState>(IDLE_STATE);

  // Audio / DOM refs
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const singRef = useRef<SingBackEngine | null>(null);
  const rafRef = useRef<number>(0);
  const timeBufRef = useRef<Float32Array | null>(null);

  // Sing-back / silence tracking
  const lastLoudRef = useRef<number>(0);
  const heldVowelRef = useRef<VowelId | null>(null);
  const sungRef = useRef<boolean>(false);
  const idleSinceRef = useRef<number>(0);

  // Attract-mode timeline
  const attractStartRef = useRef<number>(0);
  const attractSungIdxRef = useRef<number>(-1);

  // ── Cleanup everything ──────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    singRef.current?.dispose();
    singRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
  }, []);

  useEffect(() => stopAll, [stopAll]);

  // ── LIVE frame loop: mic → LPC → articulation → SVG + sing-back ─────────────
  const runLiveFrame = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx = ctxRef.current;
    const buf = timeBufRef.current;
    if (!analyser || !ctx || !buf) return;

    // Cast: our buffer's runtime type satisfies the lib's stricter signature.
    analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
    const art: Articulation = computeArticulation(buf, ctx.sampleRate);
    const now = ctx.currentTime;

    setView({
      height: art.height,
      frontness: art.frontness,
      jaw: art.jaw,
      round: art.round,
      f1: art.f1,
      f2: art.f2,
      vowel: art.vowel,
      active: art.active,
    });

    if (art.active) {
      lastLoudRef.current = now;
      heldVowelRef.current = art.vowel;
      sungRef.current = false;
      idleSinceRef.current = now;
      singRef.current?.setBreath(0);
    } else {
      const quietFor = now - lastLoudRef.current;
      // Call & response: ~1.2s after a held vowel goes quiet, sing it back.
      if (!sungRef.current && heldVowelRef.current && quietFor > 1.2) {
        singRef.current?.sing(heldVowelRef.current, art.f1, art.f2);
        sungRef.current = true;
      }
      // After ~4s of silence, drift into a gentle idle breath.
      if (now - idleSinceRef.current > 4) {
        singRef.current?.setBreath(0.5);
      }
    }

    rafRef.current = requestAnimationFrame(runLiveFrame);
  }, []);

  // ── ATTRACT loop: cycle /a/→/e/→/i/→/o/→/u/ hands-free with sing-back ───────
  const runAttractFrame = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const t = ctx.currentTime - attractStartRef.current;

    const PER = 2.0; // seconds per vowel
    const seq = ATTRACT_SEQUENCE;
    const total = seq.length * PER;
    const tt = t % total;
    const idx = Math.floor(tt / PER);
    const frac = (tt % PER) / PER;

    const cur = seq[idx];
    const nxt = seq[(idx + 1) % seq.length];
    const refA = VOWEL_REF[cur];
    const refB = VOWEL_REF[nxt];

    // Glide formants between reference poses (smooth ease near the hold).
    const ease = frac < 0.7 ? 0 : (frac - 0.7) / 0.3; // hold then morph to next
    const f1 = lerp(refA.f1, refB.f1, ease);
    const f2 = lerp(refA.f2, refB.f2, ease);
    const a = articulationFromFormants(f1, f2);

    setView({
      height: a.height,
      frontness: a.frontness,
      jaw: a.jaw,
      round: a.round,
      f1,
      f2,
      vowel: a.vowel,
      active: true,
    });

    // Sing each vowel once, just after it settles into its hold.
    if (frac > 0.15 && frac < 0.25 && attractSungIdxRef.current !== idx) {
      attractSungIdxRef.current = idx;
      singRef.current?.sing(cur, refA.f1, refA.f2);
    }

    rafRef.current = requestAnimationFrame(runAttractFrame);
  }, []);

  // ── Begin attract mode (no mic) ─────────────────────────────────────────────
  const beginAttract = useCallback(
    (ctx: AudioContext) => {
      singRef.current = createSingBack(ctx);
      attractStartRef.current = ctx.currentTime;
      attractSungIdxRef.current = -1;
      setPhase("attract");
      rafRef.current = requestAnimationFrame(runAttractFrame);
    },
    [runAttractFrame],
  );

  // ── Start button (must create AudioContext inside the pointer handler) ──────
  const handleStart = useCallback(async () => {
    if (phase !== "idle") return;
    resetArticulation();
    setMicError(null);

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      await ctx.resume();
    } catch {
      setMicError("Audio could not start on this device.");
      return;
    }
    ctxRef.current = ctx;

    // Try mic. If denied/absent → attract/fallback mode (still audio-visual).
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("No microphone here — watch the magic mirror demo instead.");
      beginAttract(ctx);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; // ~2048-sample frame for LPC
      analyser.smoothingTimeConstant = 0;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser); // mic → analyser ONLY (never to destination)
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(analyser.fftSize);

      singRef.current = createSingBack(ctx);
      lastLoudRef.current = ctx.currentTime;
      idleSinceRef.current = ctx.currentTime;
      setPhase("live");
      rafRef.current = requestAnimationFrame(runLiveFrame);
    } catch {
      setMicError(
        "Microphone blocked — watch the magic mirror demo instead.",
      );
      beginAttract(ctx);
    }
  }, [phase, beginAttract, runLiveFrame]);

  // ── Derived SVG geometry ────────────────────────────────────────────────────
  const tonguePath = buildTonguePath(view);
  const upperLip = buildUpperLip(view);
  const lowerLip = buildLowerLip(view);
  const jawPath = buildJaw(view);
  const label = VOWEL_LABELS[view.vowel];

  // Vowel-quadrilateral inset dot (frontness → x, height → y).
  const qx = lerp(86, 14, view.frontness); // front (high F2) on the LEFT (mouth faces left)
  const qy = lerp(14, 70, view.height); // high tongue near TOP

  return (
    <main className="min-h-screen bg-[#1a1726] text-white flex flex-col items-center px-4 py-6 font-sans">
      <Link
        href="/dream"
        className="self-start text-white/60 hover:text-white/90 text-base mb-2"
      >
        ← dream lab
      </Link>

      <h1 className="text-2xl sm:text-3xl font-semibold text-white/95 text-center">
        The Magic X-Ray Mouth Mirror
      </h1>
      <p className="text-white/75 text-base text-center max-w-md mt-1">
        Sing a long vowel — <span className="font-mono">aaah, eee, ooo</span> —
        and watch the tongue inside the friendly head move to the shape it heard.
        Go quiet and it sings back.
      </p>

      {/* ── The cartoon head (SVG cross-section) ── */}
      <div className="relative mt-4 w-full max-w-[420px] aspect-square">
        <svg
          viewBox="0 0 320 320"
          className="w-full h-full rounded-3xl"
          style={{
            background:
              "radial-gradient(120% 120% at 70% 20%, #3a3350 0%, #221d33 60%, #15121f 100%)",
          }}
          role="img"
          aria-label={`Cartoon head singing the vowel ${label}`}
        >
          {/* warm paper-cream head, facing LEFT (cross-section) */}
          <defs>
            <radialGradient id="head" cx="60%" cy="40%" r="75%">
              <stop offset="0%" stopColor="#fbf3e2" />
              <stop offset="100%" stopColor="#efe0c4" />
            </radialGradient>
          </defs>

          {/* rounded animal head silhouette */}
          <path
            d="M 250 70 Q 300 110 286 180 Q 280 232 232 262 Q 150 312 92 268 Q 54 240 60 196 L 60 150 Q 56 96 110 70 Q 180 36 250 70 Z"
            fill="url(#head)"
            stroke="#5b4636"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          {/* cute ear */}
          <path
            d="M 232 74 Q 256 40 282 58 Q 280 92 250 92 Z"
            fill="url(#head)"
            stroke="#5b4636"
            strokeWidth="3.5"
          />
          {/* eye (blinks closed-ish when idle) */}
          <circle cx="170" cy="120" r="9" fill="#3a2c20" />
          <circle cx="173" cy="117" r="3" fill="#fff" opacity="0.85" />
          {/* nose at the front (left) */}
          <path
            d="M 70 138 Q 52 150 70 162"
            fill="none"
            stroke="#5b4636"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* ── mouth cavity (the magic x-ray window) ── */}
          {/* dark cavity backdrop so tongue + teeth read clearly */}
          <path
            d="M 96 150 Q 120 146 236 150 L 236 200 Q 170 250 96 206 Z"
            fill="#2a1622"
            opacity="0.92"
          />
          {/* palate (roof) */}
          <path
            d={PALATE}
            fill="none"
            stroke="#caa6a0"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* the morphing tongue body */}
          <path
            d={tonguePath}
            fill="#e8807f"
            stroke="#b85a63"
            strokeWidth="3"
            strokeLinejoin="round"
          >
            {!view.active && (
              <animate
                attributeName="opacity"
                values="0.9;1;0.9"
                dur="4s"
                repeatCount="indefinite"
              />
            )}
          </path>
          {/* lips (side profile) */}
          <path
            d={upperLip}
            fill="none"
            stroke="#c25b67"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d={lowerLip}
            fill="none"
            stroke="#c25b67"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* jaw outline */}
          <path
            d={jawPath}
            fill="none"
            stroke="#5b4636"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>

        {/* ── vowel-quadrilateral inset ── */}
        <svg
          viewBox="0 0 100 84"
          className="absolute bottom-2 right-2 w-24 h-20 rounded-xl bg-black/35 backdrop-blur-sm"
          aria-hidden="true"
        >
          {/* trapezoid quadrilateral */}
          <path
            d="M 10 12 L 90 12 L 78 70 L 22 70 Z"
            fill="none"
            stroke="#ffffff55"
            strokeWidth="1.2"
          />
          <text x="8" y="9" fill="#ffffff99" fontSize="7">
            front
          </text>
          <text x="74" y="9" fill="#ffffff99" fontSize="7">
            back
          </text>
          <text x="50" y="80" fill="#ffffff99" fontSize="7" textAnchor="middle">
            low
          </text>
          <circle cx={qx} cy={qy} r="4.5" fill="#ffd27d">
            <animate
              attributeName="r"
              values="4.5;5.5;4.5"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>

        {/* big readable vowel label */}
        <div className="absolute top-2 left-2 px-3 py-1.5 rounded-xl bg-black/35 backdrop-blur-sm">
          <span className="font-mono text-2xl text-white/95">{label}</span>
        </div>
      </div>

      {/* ── controls + readout ── */}
      <div className="mt-5 flex flex-col items-center gap-3 w-full max-w-md">
        {phase === "idle" ? (
          <button
            onPointerDown={handleStart}
            className="min-h-[64px] min-w-[200px] px-8 py-4 rounded-2xl bg-amber-300 text-[#2a1a10] text-xl font-semibold active:scale-95 transition-transform shadow-lg"
          >
            Start 🎤
          </button>
        ) : (
          <div className="text-center">
            <p className="text-white/90 text-base">
              {phase === "attract"
                ? "Demo mode — the mirror is singing each vowel for you."
                : view.active
                  ? "I hear you! Keep singing the vowel."
                  : "Listening… sing a long aaah, eee or ooo."}
            </p>
            <button
              onPointerDown={() => {
                stopAll();
                setPhase("idle");
                setView(IDLE_STATE);
              }}
              className="mt-3 min-h-[44px] px-4 py-2.5 rounded-xl bg-white/10 text-white/80 text-base hover:bg-white/20"
            >
              Stop
            </button>
          </div>
        )}

        {micError && (
          <p className="text-rose-300 text-base text-center max-w-sm">
            {micError}
          </p>
        )}

        {/* tiny formant readout (monospace accent) */}
        {phase !== "idle" && (
          <p className="font-mono text-sm text-white/60">
            F1 {Math.round(view.f1)} Hz · F2 {Math.round(view.f2)} Hz · tongue
            ↑{n2(view.height)} →{n2(view.frontness)} · jaw {n2(view.jaw)} · lips{" "}
            {n2(view.round)}
          </p>
        )}
      </div>

      <p className="mt-6 text-white/40 text-sm text-center max-w-md font-mono">
        LPC formant tracking → articulatory inversion → SVG tongue. Mic is
        analysed only — never recorded, routed, or sent anywhere.
      </p>
    </main>
  );
}
