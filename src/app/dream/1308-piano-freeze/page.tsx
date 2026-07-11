"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchPianoBuffer, renderFallbackBuffer, type SourceKind } from "./audio";
import { makeEngine, type GranularEngine } from "./engine";
import { makeHandLandmarker, type HandLandmarkerLike } from "./handLoader";

/*
 * 1308 · PIANO FREEZE
 *
 * Reach into Karel's recorded solo piano ("Welcome Home") with your bare hand
 * and make the fixed recording plastic. A granular resynthesis engine reads
 * Hann-windowed grains at a playhead that moves INDEPENDENTLY of grain playback:
 *   • Hand X scrubs the playhead through the whole recording (pitch-independent).
 *   • Raise the hand UP → FREEZE: the read position stops chasing and the
 *     overlapping grains re-read one slice endlessly = a Paulstretch-style
 *     infinite shimmering drone. A parallel dry path fades in so the frozen
 *     moment stays legible while it holds.
 *   • Pinch ↔ spread (thumb-tip to index-tip) tilts the spectrum darker/brighter.
 *
 * Degrades gracefully: no camera → a mouse driver (X scrubs, top = freeze, wheel
 * = tilt) plus a slow auto-drift, so a cold glance is never dead or silent.
 */

// SSR-safe reduced-motion check (inlined to keep the folder self-contained).
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const COLS = 220; // spectral-curtain column resolution (offscreen)
const BINS = 128; // vertical bins drawn per column
const PINCH_MIN = 0.03; // thumb-index distance mapped to darkest
const PINCH_MAX = 0.26; // ... to brightest
const AUTO_IDLE_MS = 2200; // no input for this long → auto-drift takes over

type CamState = "off" | "loading" | "on" | "denied" | "unavailable";

interface HandDots {
  pts: { x: number; y: number }[]; // mirrored, normalized 0..1
}

export default function PianoFreezePage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const engineRef = useRef<GranularEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  // control refs written by whichever driver is active (hand / mouse / drift)
  const targetRef = useRef(0.5);
  const freezeRef = useRef(0);
  const tiltRef = useRef(0);
  const lastInputRef = useRef(0);
  const camOnRef = useRef(false);
  const handRef = useRef<HandDots | null>(null);

  const reducedRef = useRef(false);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });
  const lastTsRef = useRef(0);
  const lastFrameRef = useRef(0);
  const scrollAccRef = useRef(0);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const specRef = useRef<Uint8Array | null>(null);

  const [phase, setPhase] = useState<"idle" | "loading" | "playing">("idle");
  const [source, setSource] = useState<SourceKind | null>(null);
  const [camState, setCamState] = useState<CamState>("off");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // ── render + tracking loop (runs from mount; alive before audio) ──────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const videoEl = videoRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // offscreen curtain buffer (native column resolution, blitted scaled)
    const off = document.createElement("canvas");
    off.width = COLS;
    off.height = BINS;
    offRef.current = off;
    const octx = off.getContext("2d");

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    // read hand landmarks → control refs
    const detect = () => {
      const lm = landmarkerRef.current;
      const video = videoRef.current;
      if (!lm || !video || !camOnRef.current) {
        handRef.current = null;
        return;
      }
      if (video.readyState < 2 || video.videoWidth === 0) return;
      let ts = performance.now();
      if (ts <= lastTsRef.current) ts = lastTsRef.current + 1;
      lastTsRef.current = ts;
      let res;
      try {
        res = lm.detectForVideo(video, ts);
      } catch {
        return;
      }
      const hands = res.landmarks ?? [];
      if (hands.length === 0 || !hands[0] || hands[0].length < 21) {
        handRef.current = null;
        return;
      }
      const h = hands[0];
      // mirror X for a natural mirror
      const pts = h.map((p) => ({ x: 1 - p.x, y: p.y }));
      const center = pts[9]; // middle-finger MCP = hand center
      const thumb = pts[4];
      const index = pts[8];

      targetRef.current = center.x;
      // hand near the TOP → freeze (centerY small)
      freezeRef.current = Math.max(0, Math.min(1, (0.42 - center.y) / 0.3));
      // pinch↔spread → spectral tilt (-1 dark .. +1 bright)
      const d = dist(thumb, index);
      tiltRef.current = Math.max(-1, Math.min(1, ((d - PINCH_MIN) / (PINCH_MAX - PINCH_MIN)) * 2 - 1));

      handRef.current = { pts };
      lastInputRef.current = performance.now();
    };

    // one spectral-curtain column from the FFT into the offscreen buffer
    const drawColumn = (frozen: number) => {
      const spec = specRef.current;
      if (!octx || !spec) return;
      for (let i = 0; i < BINS; i++) {
        // sample the lower ~75% of the spectrum (most piano energy lives there)
        const idx = Math.floor((i / BINS) * spec.length * 0.75);
        const m = spec[idx] / 255;
        const y = BINS - 1 - i;
        // violet / indigo palette; frozen slices push toward cyan-white cores
        const core = frozen * Math.pow(m, 1.5);
        const r = Math.min(255, m * 150 + m * m * 90 + core * 120);
        const g = Math.min(255, m * 45 + m * m * 60 + core * 200);
        const b = Math.min(255, 70 + m * 170 + core * 120);
        const a = 0.12 + m * 0.88;
        octx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
        octx.fillRect(COLS - 1, y, 1, 1);
      }
    };

    const draw = (now: number, dt: number) => {
      const { w, h, dpr } = sizeRef.current;
      const reduced = reducedRef.current;
      const eng = engineRef.current;
      const freeze = eng ? eng.getFreeze() : freezeRef.current;
      const readPos = eng ? eng.getReadPos() : targetRef.current;
      const target = eng ? eng.getTarget() : targetRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // advance the curtain: scroll speed collapses as freeze → 1 (crystallizes)
      if (octx) {
        const baseSpeed = reduced ? 22 : 46; // columns/sec at full scroll
        scrollAccRef.current += baseSpeed * (1 - freeze) * dt;
        let steps = 0;
        while (scrollAccRef.current >= 1 && steps < 8) {
          octx.drawImage(off, -1, 0); // shift left one column
          scrollAccRef.current -= 1;
          steps++;
        }
        if (steps > 0) {
          drawColumn(freeze);
        } else if (freeze > 0.05) {
          // frozen: keep refreshing the rightmost column in place so the
          // crystallized cores breathe rather than sit as a dead stripe
          drawColumn(freeze);
        }
      }

      // background wash
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#07030f";
      ctx.fillRect(0, 0, w, h);

      // blit the curtain, scaled to fill; frozen = a slow (<3 Hz) luminance drift
      if (offRef.current) {
        let alpha = 0.92;
        if (freeze > 0.05) {
          const hz = reduced ? 0.5 : 1.6; // never a strobe
          const shimmer = 0.5 + 0.5 * Math.sin(now * 0.001 * hz * 2 * Math.PI);
          alpha = 0.72 + freeze * (0.12 + shimmer * 0.16);
        }
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(offRef.current, 0, 0, COLS, BINS, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      // frozen crystallization overlay: a soft cyan-white bloom band
      if (freeze > 0.05) {
        const hz = reduced ? 0.4 : 1.2;
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.001 * hz * 2 * Math.PI);
        const bloom = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
        const strength = freeze * (0.1 + pulse * 0.12);
        bloom.addColorStop(0, `rgba(180,240,255,${strength})`);
        bloom.addColorStop(1, "rgba(180,240,255,0)");
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = bloom;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
      }

      // amber playhead timeline over the recording
      const railY = h - 46;
      const railL = 24;
      const railR = w - 24;
      const railW = railR - railL;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(railL, railY - 1, railW, 2);
      const tx = railL + target * railW;
      const rx = railL + readPos * railW;
      // faint target ghost
      ctx.fillStyle = "rgba(251,191,36,0.35)";
      ctx.beginPath();
      ctx.arc(tx, railY, 4, 0, Math.PI * 2);
      ctx.fill();
      // read head (amber, brighter; halo grows when frozen)
      const halo = 8 + freeze * 16;
      const hg = ctx.createRadialGradient(rx, railY, 0, rx, railY, halo);
      hg.addColorStop(0, `rgba(251,191,36,${0.5 + freeze * 0.4})`);
      hg.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(rx, railY, halo, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(253,230,138,0.95)";
      ctx.beginPath();
      ctx.arc(rx, railY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // webcam thumbnail + amber landmark dots (only when tracking is live)
      if (camOnRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        const tw = Math.min(180, w * 0.28);
        const th = tw * 0.72;
        const tx0 = w - tw - 16;
        const ty0 = 16;
        ctx.save();
        ctx.globalAlpha = 0.85;
        // mirror the thumbnail
        ctx.translate(tx0 + tw, ty0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, tw, th);
        ctx.restore();
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(tx0, ty0, tw, th);
        const hand = handRef.current;
        if (hand) {
          ctx.fillStyle = "rgba(251,191,36,0.9)";
          for (const p of hand.pts) {
            ctx.beginPath();
            ctx.arc(tx0 + p.x * tw, ty0 + p.y * th, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    };

    const frame = (now: number) => {
      const dt = lastFrameRef.current ? Math.min(0.05, (now - lastFrameRef.current) / 1000) : 0.016;
      lastFrameRef.current = now;

      detect();

      // choose the active driver, then push controls to the engine
      const eng = engineRef.current;
      if (eng) {
        const idle = now - lastInputRef.current > AUTO_IDLE_MS;
        const handLive = camOnRef.current && handRef.current !== null;
        if (idle && !handLive) {
          // gentle auto-drift so it's alive with no input
          targetRef.current = 0.5 + 0.42 * Math.sin(now * 0.00007);
          freezeRef.current = Math.max(0, 0.35 + 0.35 * Math.sin(now * 0.00003));
          tiltRef.current = 0.4 * Math.sin(now * 0.00005);
        }
        eng.setTarget(targetRef.current);
        eng.setFreeze(freezeRef.current);
        eng.setTilt(tiltRef.current);
        specRef.current = eng.getSpectrum();
      }

      draw(now, dt);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      engineRef.current?.stop();
      engineRef.current = null;
      ctxRef.current = null;
      try {
        landmarkerRef.current?.close();
      } catch {
        /* ignore */
      }
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
    };
  }, []);

  // ── mouse / wheel driver (fallback + always-available) ────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    targetRef.current = Math.max(0, Math.min(1, x));
    // mouse near the top of the canvas = freeze
    freezeRef.current = Math.max(0, Math.min(1, (0.22 - y) / 0.2));
    lastInputRef.current = performance.now();
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    tiltRef.current = Math.max(-1, Math.min(1, tiltRef.current - e.deltaY * 0.0016));
    lastInputRef.current = performance.now();
  }, []);

  // ── primary action: load the piano + start the granular drone ─────────────
  const begin = useCallback(async () => {
    if (engineRef.current || phase === "loading") return;
    setPhase("loading");
    setNotice(null);
    try {
      const AC: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;

      let buffer = await fetchPianoBuffer(ctx);
      if (buffer) {
        setSource("piano");
      } else {
        buffer = await renderFallbackBuffer(ctx.sampleRate);
        setSource("fallback");
      }

      const eng = makeEngine(ctx, buffer);
      specRef.current = new Uint8Array(eng.spectrumSize);
      engineRef.current = eng;
      lastInputRef.current = performance.now();
      await eng.start();
      setPhase("playing");
    } catch {
      setPhase("idle");
      setNotice("Audio could not start in this browser. Try tapping again or reloading.");
    }
  }, [phase]);

  // ── enable camera + hand tracking ─────────────────────────────────────────
  const enableCamera = useCallback(async () => {
    if (camOnRef.current || camState === "loading") return;
    const video = videoRef.current;
    if (!video) return;
    setNotice(null);
    setCamState("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      const lm = await makeHandLandmarker();
      landmarkerRef.current = lm;
      camOnRef.current = true;
      setCamState("on");
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCamState("denied");
        setNotice("Camera denied — use the mouse: move left/right to scrub, hold near the top to freeze, scroll to tilt the tone.");
      } else {
        setCamState("unavailable");
        setNotice("Camera or hand-tracking unavailable here — use the mouse: left/right scrubs, top freezes, scroll tilts the tone.");
      }
    }
  }, [camState]);

  return (
    <div
      ref={wrapRef}
      onPointerMove={onPointerMove}
      onWheel={onWheel}
      className="relative h-dvh w-full touch-none overflow-hidden bg-[#07030f] text-foreground"
    >
      <canvas ref={canvasRef} className="absolute inset-0 block" />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* design-notes link */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-3 top-3 z-20 min-h-[44px] rounded-lg px-4 py-2.5 text-base text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* header */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-xl">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Piano Freeze</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Reach into Karel&apos;s recorded piano — scrub through it with your hand, then raise up to freeze a
          moment into an infinite shimmer.
        </p>
        {phase === "playing" && (
          <p className="mt-2 text-base text-muted-foreground">
            {source === "piano"
              ? "Source · Karel — Welcome Home (live recording)"
              : "Source · synthesized piano fallback"}
          </p>
        )}
      </div>

      {/* live gesture legend */}
      {phase === "playing" && camState === "on" && (
        <p className="pointer-events-none absolute inset-x-0 top-24 z-10 text-center text-base text-muted-foreground">
          Move your hand across to scrub · raise up to freeze · pinch/spread to darken/brighten
        </p>
      )}

      {/* controls */}
      <div className="absolute inset-x-0 bottom-16 z-10 flex flex-col items-center gap-3 px-4">
        {notice && <p className="max-w-md text-center text-base text-violet-300">{notice}</p>}

        {phase !== "playing" ? (
          <button
            onClick={begin}
            disabled={phase === "loading"}
            className="min-h-[44px] rounded-full bg-violet-500/90 px-4 py-2.5 text-base font-semibold text-foreground shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:bg-violet-400 disabled:opacity-60"
          >
            {phase === "loading" ? "Loading the piano…" : "Start"}
          </button>
        ) : camState === "on" ? (
          <p className="text-base text-muted-foreground">Hand tracking live — conduct the freeze.</p>
        ) : (
          <button
            onClick={enableCamera}
            disabled={camState === "loading"}
            className="min-h-[44px] rounded-full bg-violet-500/20 px-4 py-2.5 text-base font-semibold text-violet-300 ring-1 ring-violet-400/40 hover:bg-violet-500/30 disabled:opacity-60"
          >
            {camState === "loading" ? "Starting camera…" : "Enable camera to freeze with your hand"}
          </button>
        )}
        {phase === "playing" && camState !== "on" && camState !== "loading" && (
          <p className="max-w-md text-center text-base text-muted-foreground">
            Or drive it now with the mouse — move left/right to scrub, hold near the top to freeze, scroll to
            tilt the tone.
          </p>
        )}
      </div>

      {/* design notes */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-[#0a0518] p-6 text-base text-foreground">
            <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
            <p className="mt-3">
              Karel&apos;s fixed solo-piano recording is fed to a granular resynthesis engine: ~135 ms
              Hann-windowed grains at ~60% overlap, scheduled ~20 ms ahead. The crucial trick is that the
              READ position (where grains are sampled from) moves independently of grain playback, so scrub
              and freeze fall straight out.
            </p>
            <p className="mt-3">
              Raising the hand scales the read-position chase by (1 − freeze). At full freeze the read point
              stops and the overlapping grains re-read a single slice forever — a Paulstretch-style infinite
              shimmer. Tiny per-grain read-jitter and detune keep it glistening, and a parallel dry grain path
              fades in so the frozen moment stays legible while it holds.
            </p>
            <p className="mt-3 text-muted-foreground">
              Lineage: Robert Henke / Monolake&apos;s granular time-stretching, Paulstretch (Nasca Octavian
              Paul) for extreme spectral smearing, and Sampleson&apos;s <em>Aeronaut</em> (2026) for
              spectral-freeze held against a parallel looper so the source never fully disappears. No strobe —
              the frozen shimmer is a slow (&lt;3 Hz) luminance drift, gentler under reduced-motion.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
