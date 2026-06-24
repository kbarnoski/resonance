"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ContourEngine, PitchSmoother, trackPitch } from "./pitch";
import { HarmonyVoice } from "./audio";

/**
 * 891 — Kids: Sing a Path
 *
 * "What if a 4-year-old could SING and watch their own voice draw a glowing
 *  path that a little firefly flies along — and it always sounds beautiful
 *  because we follow the SHAPE of their voice, not whether they hit a
 *  'correct' note?"
 *
 * INPUT: mic/voice · OUTPUT: animated SVG (no canvas/webgl) · TECHNIQUE:
 * real-time autocorrelation/NSDF pitch + contour-relative mapping (PESTO).
 */

// --- Geometry of the scrolling path ---
const MAX_POINTS = 220; // points kept in the visible path
const STEP_X = 4.2; // horizontal advance per frame (viewBox units)
const VIEW_W = 1000;
const VIEW_H = 560;
const MID_Y = VIEW_H * 0.52;
const AMP_Y = VIEW_H * 0.4; // vertical swing of the contour

interface PathPoint {
  x: number;
  y: number;
  glow: number; // 0..1 brightness from loudness
}

interface Sparkle {
  id: number;
  x: number;
  y: number;
  born: number;
  hue: number;
}

// A pre-scripted gentle sung contour for the hands-free auto-demo. Values are
// contour heights in [-1, 1]; the same path+firefly+harmony pipeline consumes
// them, so the page always sings within ~1.5s with zero hardware.
function demoHeight(tSec: number): { height: number; rms: number } {
  // A calm lullaby-ish rise/fall with little swoops and breathing rests.
  const phrase = tSec % 12;
  const base =
    0.55 * Math.sin(phrase * 0.9) +
    0.25 * Math.sin(phrase * 1.9 + 1) +
    0.12 * Math.sin(phrase * 3.3);
  // Breathing rests: drop to silence briefly between phrases.
  const rest = phrase > 5.4 && phrase < 6.1 ? 0 : 1;
  const rms = rest === 0 ? 0 : 0.18 + 0.08 * (0.5 + 0.5 * Math.sin(phrase * 2.2));
  return { height: Math.max(-1, Math.min(1, base)), rms: rest === 0 ? 0 : rms };
}

export default function KidsSingAPath() {
  const [mode, setMode] = useState<"idle" | "demo" | "live">("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [singing, setSinging] = useState(false); // true while sound is detected

  // SVG element refs we mutate directly each frame (cheaper than React state).
  const pathRef = useRef<SVGPathElement | null>(null);
  const glowPathRef = useRef<SVGPathElement | null>(null);
  const fireflyRef = useRef<SVGGElement | null>(null);
  const sparkleLayerRef = useRef<SVGGElement | null>(null);

  // Audio + analysis state held in refs so the rAF loop stays stable.
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Float32Array | null>(null);
  const voiceRef = useRef<HarmonyVoice | null>(null);
  const smootherRef = useRef(new PitchSmoother(0.25));
  const contourRef = useRef(new ContourEngine());
  const pointsRef = useRef<PathPoint[]>([]);
  const sparklesRef = useRef<Sparkle[]>([]);
  const rafRef = useRef<number | null>(null);
  const sparkleIdRef = useRef(0);
  const lastTwinkleRef = useRef(0);
  const startedAtRef = useRef(0);
  const modeRef = useRef<"idle" | "demo" | "live">("idle");

  modeRef.current = mode;

  // --- The render/animation loop (SVG/DOM only). ---
  const tick = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick);
    const now = performance.now();
    const tSec = (now - startedAtRef.current) / 1000;

    let height: number | null = null;
    let rms = 0;

    if (modeRef.current === "live" && analyserRef.current && bufRef.current) {
      const analyser = analyserRef.current;
      const buf = bufRef.current;
      analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
      const ctx = ctxRef.current;
      const sr = ctx ? ctx.sampleRate : 44100;
      const pf = trackPitch(buf, sr);
      rms = pf.rms;
      const smoothed = smootherRef.current.push(pf.hz);
      height = pf.hz > 0 ? contourRef.current.height(smoothed) : null;
      if (pf.rms < 0.012) height = null;
    } else if (modeRef.current === "demo") {
      const d = demoHeight(tSec);
      rms = d.rms;
      height = d.rms > 0 ? d.height : null;
    }

    // Drive the harmony voice (always pretty — quantized to pentatonic).
    voiceRef.current?.update(height, rms);

    const isSinging = height !== null && rms > 0.012;
    setSinging((prev) => (prev !== isSinging ? isSinging : prev));

    // --- Advance the scrolling path ---
    const pts = pointsRef.current;
    // Shift everything left.
    for (const p of pts) p.x -= STEP_X;
    // Drop points that scrolled off the left edge.
    while (pts.length > 0 && pts[0].x < -20) pts.shift();

    // Target y: high contour → near the top (small y). Hold last y when silent.
    const lastY = pts.length > 0 ? pts[pts.length - 1].y : MID_Y;
    let newY = lastY;
    let glow = 0;
    if (height !== null) {
      newY = MID_Y - height * AMP_Y;
      glow = Math.min(1, 0.3 + rms * 3);
    } else {
      glow = Math.max(0, (pts[pts.length - 1]?.glow ?? 0) * 0.9);
    }
    pts.push({ x: VIEW_W - 40, y: newY, glow });
    if (pts.length > MAX_POINTS) pts.shift();

    // Build the SVG path string (smooth-ish via simple line segments).
    if (pts.length > 1) {
      let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        d += ` Q ${a.x.toFixed(1)} ${a.y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
      }
      d += ` L ${pts[pts.length - 1].x.toFixed(1)} ${pts[pts.length - 1].y.toFixed(1)}`;
      pathRef.current?.setAttribute("d", d);
      glowPathRef.current?.setAttribute("d", d);
    }

    // --- Firefly rides the tip ---
    const tip = pts[pts.length - 1];
    if (tip && fireflyRef.current) {
      const pulse = 1 + 0.18 * Math.sin(now / 180);
      const bright = 0.55 + 0.45 * glow;
      fireflyRef.current.setAttribute(
        "transform",
        `translate(${tip.x.toFixed(1)} ${tip.y.toFixed(1)}) scale(${pulse.toFixed(3)})`
      );
      fireflyRef.current.setAttribute("opacity", bright.toFixed(2));
    }

    // --- Trailing sparkles, born from loud / high moments ---
    if (tip && glow > 0.5 && now - lastTwinkleRef.current > 90) {
      lastTwinkleRef.current = now;
      const hue = 40 + (1 - (tip.y / VIEW_H)) * 80; // warm gold→amber, higher = brighter gold
      sparklesRef.current.push({
        id: sparkleIdRef.current++,
        x: tip.x + (Math.random() - 0.5) * 18,
        y: tip.y + (Math.random() - 0.5) * 18,
        born: now,
        hue,
      });
      // Twinkle sound on strong high points (rate-limited inside).
      if (height !== null && height > 0.45 && now - lastTwinkleRef.current >= 0) {
        voiceRef.current?.twinkle(height);
      }
    }

    // Update sparkle DOM.
    const layer = sparkleLayerRef.current;
    if (layer) {
      const sparks = sparklesRef.current;
      // Move & age sparkles; cull old ones.
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const age = (now - s.born) / 1000;
        if (age > 1.4) {
          sparks.splice(i, 1);
        } else {
          s.x -= STEP_X; // scroll with the path
        }
      }
      // Rebuild sparkle circles (small counts, cheap).
      const desired = sparks.length;
      while (layer.children.length < desired) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("r", "5");
        c.setAttribute("filter", "url(#sp-blur)");
        layer.appendChild(c);
      }
      while (layer.children.length > desired) {
        layer.removeChild(layer.lastChild as Node);
      }
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i];
        const age = (now - s.born) / 1000;
        const fade = Math.max(0, 1 - age / 1.4);
        const el = layer.children[i] as SVGCircleElement;
        el.setAttribute("cx", s.x.toFixed(1));
        el.setAttribute("cy", s.y.toFixed(1));
        el.setAttribute("opacity", (fade * 0.9).toFixed(2));
        el.setAttribute("r", (5 * (0.6 + fade * 0.9)).toFixed(1));
        el.setAttribute("fill", `hsl(${s.hue.toFixed(0)} 95% 75%)`);
      }
    }
  }, []);

  // --- Set up audio graph + (optionally) mic ---
  const ensureAudio = useCallback(() => {
    if (!ctxRef.current) {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      voiceRef.current = new HarmonyVoice(ctx);
    }
    void ctxRef.current.resume();
    voiceRef.current?.start();
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current === null) {
      startedAtRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  // Begin in auto-demo mode (no hardware, page always sings within ~1.5s).
  const startDemo = useCallback(() => {
    ensureAudio();
    smootherRef.current.reset();
    contourRef.current.reset();
    setMode("demo");
    startLoop();
  }, [ensureAudio, startLoop]);

  // Request the mic and switch to live singing.
  const startLive = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
      ensureAudio();
      const ctx = ctxRef.current;
      if (!ctx) return;
      streamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.1;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      smootherRef.current.reset();
      contourRef.current.reset();
      setMode("live");
      startLoop();
    } catch (e) {
      setMicError(
        e instanceof Error
          ? `Microphone is off (${e.message}). You can still watch the demo — tap Sing to try again.`
          : "Microphone is off. You can still watch the demo — tap Sing to try again."
      );
      // Fall back to the auto-demo so the page never goes silent.
      if (modeRef.current === "idle") startDemo();
    }
  }, [ensureAudio, startLoop, startDemo]);

  // Kick off the hands-free auto-demo shortly after mount so the page is
  // alive (sound + motion) without any user action.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (modeRef.current === "idle") {
        try {
          startDemo();
        } catch {
          // Autoplay may be blocked until a gesture — the Sing button covers it.
        }
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [startDemo]);

  // Cleanup: cancel rAF, stop tracks, close context.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      voiceRef.current?.dispose();
      voiceRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);

  const liveActive = mode === "live";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0712] text-white">
      {/* Scene */}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          {/* Warm storybook night sky */}
          <radialGradient id="sky" cx="50%" cy="18%" r="95%">
            <stop offset="0%" stopColor="#241a3d" />
            <stop offset="45%" stopColor="#150f29" />
            <stop offset="100%" stopColor="#070510" />
          </radialGradient>
          <linearGradient id="pathGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c5bd9" stopOpacity="0.2" />
            <stop offset="60%" stopColor="#ffd27a" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#fff3c4" stopOpacity="1" />
          </linearGradient>
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="7" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="ff-blur" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id="sp-blur" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <radialGradient id="halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff6cf" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#ffd97a" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffd97a" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#sky)" />

        {/* A few static background stars */}
        {Array.from({ length: 36 }).map((_, i) => {
          const x = (i * 137.5) % VIEW_W;
          const y = ((i * 89.3) % (VIEW_H * 0.7)) + 12;
          const r = 0.8 + ((i * 7) % 3) * 0.5;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={r}
              fill="#fff"
              opacity={0.12 + ((i * 13) % 7) * 0.04}
            />
          );
        })}

        {/* Soft moon */}
        <circle cx={VIEW_W * 0.82} cy={VIEW_H * 0.2} r="46" fill="#fff5d6" opacity="0.12" filter="url(#ff-blur)" />
        <circle cx={VIEW_W * 0.82} cy={VIEW_H * 0.2} r="34" fill="#fff7dd" opacity="0.5" />

        {/* The sung path — blurred glow layer under a crisp stroke */}
        <path
          ref={glowPathRef}
          fill="none"
          stroke="url(#pathGrad)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
          filter="url(#glow)"
        />
        <path
          ref={pathRef}
          fill="none"
          stroke="url(#pathGrad)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Trailing sparkles (populated each frame) */}
        <g ref={sparkleLayerRef} />

        {/* Firefly riding the tip */}
        <g ref={fireflyRef} opacity="0.7">
          <circle r="34" fill="url(#halo)" />
          <circle r="7" fill="#fff7d6" filter="url(#ff-blur)" />
          <circle r="4.5" fill="#fffdf2" />
        </g>
      </svg>

      {/* UI overlay */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-between p-5 sm:p-8">
        {/* Top row: title + status */}
        <div className="flex w-full max-w-3xl items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Sing a Path
            </h1>
            <p className="mt-1 max-w-md text-base text-white/75">
              Make any sound and your voice draws a glowing trail. The little
              firefly flies along it.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                liveActive
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-violet-500/20 text-violet-300"
              }`}
            >
              {liveActive ? "🎙️ Mic live" : "✨ Demo mode"}
            </span>
            {singing && (
              <span className="rounded-full bg-amber-400/20 px-3 py-1 text-sm font-medium text-amber-200">
                singing!
              </span>
            )}
          </div>
        </div>

        {/* Bottom row: the giant Sing button + notices */}
        <div className="flex w-full max-w-3xl flex-col items-center gap-4">
          {micError && (
            <p
              role="alert"
              className="max-w-md rounded-2xl bg-rose-500/10 px-4 py-3 text-center text-base font-medium text-rose-300"
            >
              {micError}
            </p>
          )}
          {!liveActive && !micError && (
            <p className="text-center text-base text-rose-300">
              Playing a demo song for you. Tap the big button to sing yourself!
            </p>
          )}

          <button
            type="button"
            onClick={() => void startLive()}
            className="flex min-h-[96px] min-w-[260px] items-center justify-center gap-3 rounded-full bg-gradient-to-b from-violet-400 to-violet-600 px-10 text-3xl font-bold text-white shadow-[0_0_40px_rgba(139,92,246,0.5)] transition-transform active:scale-95"
          >
            <span className="text-4xl" aria-hidden>
              🎤
            </span>
            {liveActive ? "Keep singing!" : "Sing!"}
          </button>

          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-full px-4 text-base text-white/75 underline-offset-4 hover:text-white hover:underline"
          >
            {showNotes ? "Hide design notes" : "Design notes"}
          </button>
        </div>
      </div>

      {/* Design notes drawer (points to README.md) */}
      {showNotes && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-[80vh] max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#120c22] p-6 text-base text-white/90 shadow-2xl">
            <h2 className="text-xl font-semibold text-white">Design notes</h2>
            <p className="mt-3 text-white/85">
              Your raw voice drives the <em>shape</em> of the path — never a
              right-or-wrong note. Following PESTO (arXiv 2508.01488), we track
              pitch <strong>contour</strong> (relative up/down/hold), not
              absolute pitch, so any child sounds beautiful and stays on screen.
            </p>
            <p className="mt-3 text-white/85">
              The companion tone you hear is snapped to the C-major pentatonic
              scale, so the music is always consonant. A soft pad drone and a
              master limiter keep everything gentle.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-white/80">
              <li>Mic → NSDF / YIN-lite pitch tracker (autocorrelation).</li>
              <li>Contour-relative engine maps motion to a rising/falling path.</li>
              <li>Animated SVG renderer (no canvas / no webgl).</li>
              <li>Web Audio pentatonic harmony voice + pad drone.</li>
            </ul>
            <p className="mt-3 text-sm text-white/70">
              Full write-up: see <code className="text-violet-300">README.md</code> in
              this prototype folder.
            </p>
            <div className="mt-4 flex items-center justify-between">
              <Link href="/dream" className="text-base text-violet-300 hover:underline">
                ← back to dream lab
              </Link>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-full bg-violet-500/20 px-5 text-base text-violet-200 hover:bg-violet-500/30"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
