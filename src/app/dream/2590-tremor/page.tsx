"use client";

/**
 * 2590-tremor — Tremor
 *
 * "What if you were the glottis and your hands were the vocal tract — a body
 * tracked by the camera that becomes a continuous, dissonance-capable voice you
 * play by moving?"
 *
 * The deliberate INVERSION of 2026's audio→body frontier (arXiv:2605.28272
 * "EchoAvatar" and arXiv:2605.28491 "DiscoForcing", SIGGRAPH '26 — real-time
 * full-body motion generated FROM streaming audio). Every shipped system runs
 * the arrow audio→body (an avatar puppeted by sound). Tremor runs it the other
 * way: sound FROM motion. The human moves; the machine sings what the motion
 * means.
 *
 * Motion → voice: centroid height → continuous microtonal f0 (never snapped to
 * any scale); spread/openness → a vowel-opening formant sweep; energy → gain;
 * velocity/spread → roughness (beating + an inharmonic growl + amplitude
 * jitter). Dissonance is under the mover's control — no safety net.
 *
 * On load a seeded (0x2590) auto-demo plays itself — a gesture that rises,
 * opens, accelerates, then stills — driving both the WebGL2 voice-field and the
 * voice. Camera (MediaPipe Hands, else an optical-flow fallback) is opt-in;
 * denial keeps the demo alive with an on-brand notice.
 *
 * Privacy: webcam frames are analysed in-browser only — never recorded, stored,
 * or transmitted.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createHandTracker,
  makeAutoDriver,
  makeFlowTracker,
  restState,
  type MotionState,
  type Tracker,
} from "./motion";
import { motionToF0, motionToRoughness, startVocalSynth, type VocalSynth } from "./audio";
import { makeVoiceField, type VoiceField } from "./glfield";

type Mode = "auto" | "camera";
type Source = "demo" | "hands" | "flow";

const F_MIN = 90;
const F_MAX = 880;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const pitchNorm = (f0: number) =>
  clamp01(Math.log(f0 / F_MIN) / Math.log(F_MAX / F_MIN));

const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/2590-tremor/README.md";

interface Readout {
  f0: number;
  rough: number;
  energy: number;
}

export default function TremorPage() {
  const [showNotes, setShowNotes] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [source, setSource] = useState<Source>("demo");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useSvg, setUseSvg] = useState(false);
  const [readout, setReadout] = useState<Readout>({ f0: 160, rough: 0, energy: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<VoiceField | null>(null);
  const synthRef = useRef<VocalSynth | null>(null);
  const trackerRef = useRef<Tracker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const modeRef = useRef<Mode>("auto");
  const driverRef = useRef<(t: number) => MotionState>(makeAutoDriver(0x2590));
  const t0Ref = useRef<number>(0);
  const smoothRef = useRef<MotionState>(restState());
  const readoutTickRef = useRef<number>(0);

  // SVG fallback element refs.
  const svgHeadRef = useRef<SVGEllipseElement | null>(null);
  const svgTrailRef = useRef<SVGPolylineElement | null>(null);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const teardownCamera = useCallback(() => {
    trackerRef.current?.dispose();
    trackerRef.current = null;
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
  }, []);

  // ── Persistent render + synth loop ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    let field: VoiceField | null = null;
    if (canvas) {
      field = makeVoiceField(canvas);
      fieldRef.current = field;
      if (!field) setUseSvg(true);
    } else {
      setUseSvg(true);
    }

    // Start the voice for the auto-demo (browsers may keep it suspended until a
    // gesture — the synth resumes itself on the first interaction).
    try {
      synthRef.current = startVocalSynth();
    } catch {
      setNotice("Web Audio is unavailable — the voice-field still animates.");
    }

    const ro = field ? new ResizeObserver(() => field?.resize()) : null;
    if (ro && canvas) ro.observe(canvas);

    t0Ref.current = performance.now();

    const smooth = smoothRef.current;
    let last = performance.now();

    const tick = (nowMs: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - last) / 1000));
      last = nowMs;
      const time = (nowMs - t0Ref.current) / 1000;

      let target: MotionState;
      if (modeRef.current === "camera" && trackerRef.current) {
        target = trackerRef.current.read();
      } else {
        target = driverRef.current(time);
      }

      // Light glide so the field and voice never jitter.
      const a = 1 - Math.exp(-dt * 10);
      smooth.cx += (target.cx - smooth.cx) * a;
      smooth.cy += (target.cy - smooth.cy) * a;
      smooth.energy += (target.energy - smooth.energy) * a;
      smooth.spread += (target.spread - smooth.spread) * a;
      smooth.velocity += (target.velocity - smooth.velocity) * a;

      synthRef.current?.update(smooth);

      const f0 = motionToF0(smooth);
      const rough = motionToRoughness(smooth);
      const p01 = pitchNorm(f0);

      if (fieldRef.current) {
        fieldRef.current.draw({
          cx: smooth.cx,
          cy: smooth.cy,
          pitch01: p01,
          rough,
          energy: smooth.energy,
          time,
        });
      } else {
        drawSvg(smooth, p01, rough);
      }

      readoutTickRef.current += 1;
      if (readoutTickRef.current % 6 === 0) {
        setReadout({ f0, rough, energy: smooth.energy });
      }
    };

    const drawSvg = (s: MotionState, p01: number, rough: number) => {
      const head = svgHeadRef.current;
      const trailEl = svgTrailRef.current;
      const x = s.cx * 100;
      const y = s.cy * 100;
      if (head) {
        head.setAttribute("cx", x.toFixed(2));
        head.setAttribute("cy", y.toFixed(2));
        head.setAttribute("rx", (3 + s.spread * 16).toFixed(2));
        head.setAttribute("ry", (3 + s.energy * 18).toFixed(2));
        // Violet→magenta by pitch; brighten with roughness.
        const hue = 270 + p01 * 30 + rough * 20;
        const light = 55 + p01 * 20;
        head.setAttribute("fill", `hsl(${hue.toFixed(0)} 85% ${light.toFixed(0)}%)`);
        head.setAttribute("opacity", (0.25 + s.energy * 0.7).toFixed(2));
      }
      const trail = trailRef.current;
      trail.push({ x, y });
      if (trail.length > 90) trail.shift();
      if (trailEl) {
        trailEl.setAttribute("points", trail.map((p) => `${p.x},${p.y}`).join(" "));
        trailEl.setAttribute("opacity", (0.2 + s.energy * 0.5).toFixed(2));
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro?.disconnect();
      synthRef.current?.stop();
      synthRef.current = null;
      teardownCamera();
      fieldRef.current?.dispose();
      fieldRef.current = null;
    };
  }, [teardownCamera]);

  // ── Start camera: MediaPipe Hands, else optical-flow, else stay on the demo ─
  const startCamera = useCallback(async () => {
    setNotice(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      setNotice("No camera on this device — the seeded auto-demo keeps playing.");
      return;
    }

    setLoading(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
    } catch {
      setLoading(false);
      setNotice("Camera access was denied — the seeded auto-demo keeps playing.");
      return;
    }
    streamRef.current = stream;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    try {
      await video.play();
      await new Promise<void>((resolve) => {
        if (video.videoWidth > 0) return resolve();
        const onReady = () => {
          video.removeEventListener("loadeddata", onReady);
          resolve();
        };
        video.addEventListener("loadeddata", onReady);
      });
    } catch {
      for (const t of stream.getTracks()) t.stop();
      streamRef.current = null;
      setLoading(false);
      setNotice("The camera stream could not start — the auto-demo keeps playing.");
      return;
    }
    videoRef.current = video;

    // Prefer MediaPipe Hands; degrade to a self-computed optical-flow field.
    try {
      trackerRef.current = await createHandTracker(video, 12000);
      setSource("hands");
    } catch {
      trackerRef.current = makeFlowTracker(video);
      setSource("flow");
      setNotice(
        "Hand tracking could not load from the CDN — using an optical-flow motion field instead.",
      );
    }

    setMode("camera");
    modeRef.current = "camera";
    setLoading(false);
  }, []);

  const stopCamera = useCallback(() => {
    teardownCamera();
    setMode("auto");
    modeRef.current = "auto";
    setSource("demo");
    setNotice(null);
    t0Ref.current = performance.now();
  }, [teardownCamera]);

  const sourceLabel =
    source === "hands"
      ? "MediaPipe Hands"
      : source === "flow"
        ? "optical-flow field"
        : "seeded auto-demo";

  return (
    <main className="min-h-screen bg-[#05070f] text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream lab · motion → voice
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Tremor
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Close notes" : "Read the design notes"}
          </button>
        </div>

        <p className="mt-3 text-base text-muted-foreground">
          You are the glottis; your hands are the vocal tract. Move your body and
          the camera reads it into a continuous, dissonance-capable voice — raise
          up for higher pitch, open wide to open the vowel, move fast to roughen
          it into a growl. The frontier makes bodies dance to sound; this runs the
          arrow the other way — sound from motion.
        </p>

        {/* Stage */}
        <div className="relative mt-5 aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-[#05070f]">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full"
            style={{ display: useSvg ? "none" : "block" }}
          />
          {useSvg && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              <polyline
                ref={svgTrailRef}
                fill="none"
                stroke="#a78bfa"
                strokeWidth="1.2"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.4"
              />
              <ellipse ref={svgHeadRef} cx="50" cy="60" rx="6" ry="6" fill="#c4b5fd" />
            </svg>
          )}

          {/* Live readout */}
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/40 px-3 py-2 font-mono text-xs text-muted-foreground backdrop-blur-sm">
            <div>
              f0 <span className="text-foreground">{readout.f0.toFixed(1)} Hz</span>
            </div>
            <div>
              rough{" "}
              <span className="text-foreground">{readout.rough.toFixed(2)}</span>
              {"  "}energy{" "}
              <span className="text-foreground">{readout.energy.toFixed(2)}</span>
            </div>
            <div className="text-muted-foreground/80">{sourceLabel}</div>
          </div>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <p className="text-base text-muted-foreground">
                Loading hand tracking…
              </p>
            </div>
          )}
        </div>

        {notice && <p className="mt-3 text-base text-destructive">{notice}</p>}

        {/* Controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {mode === "auto" ? (
            <button
              type="button"
              onClick={startCamera}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              Start camera
            </button>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop camera
            </button>
          )}
          <span className="text-sm text-muted-foreground">
            {mode === "camera"
              ? "Move to play. Still hands let the voice settle."
              : "The seeded gesture is playing itself. Add your body with the camera."}
          </span>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          If you hear nothing, click anywhere once — browsers hold audio until you
          interact. Webcam frames are analysed in your browser only.
        </p>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link
            href="/dream"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to the lab
          </Link>
          <a
            href={README_URL}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            README
          </a>
        </div>

        {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}
      </div>
    </main>
  );
}

// ── Design notes modal ──────────────────────────────────────────────────────

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg border border-border bg-background p-6 shadow-lg max-w-lg"
      >
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Design notes
        </h2>
        <div className="mt-3 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            <span className="text-foreground">The question.</span> What if you
            were the glottis and your hands were the vocal tract — a body tracked
            by the camera that becomes a continuous, dissonance-capable voice you
            play by moving?
          </p>
          <p>
            <span className="text-foreground">The inversion.</span> 2026&rsquo;s
            frontier — <span className="text-foreground">EchoAvatar</span>{" "}
            (arXiv:2605.28272) and{" "}
            <span className="text-foreground">DiscoForcing</span>{" "}
            (arXiv:2605.28491), SIGGRAPH &rsquo;26 — generates real-time full-body
            motion <em>from</em> streaming audio: avatars puppeted by sound. Tremor
            runs the arrow the other way. The human moves; the machine sings what
            the motion means.
          </p>
          <p>
            <span className="text-foreground">Motion → voice.</span> Centroid
            height sets a continuous, microtonal f0 (log scale, ~90–880 Hz) that
            is <em>never</em> snapped to a scale, chord, or lattice. Openness /
            spread sweeps two formant resonances from a closed &ldquo;oo&rdquo;
            toward an open &ldquo;ah&rdquo;. Energy drives gain — still hands let
            the voice rest. Velocity and spread drive roughness: the two glottal
            saws beat against each other, an inharmonic partial grows, and
            amplitude jitter deepens, so fast/wide motion genuinely clashes. No
            safety net.
          </p>
          <p>
            <span className="text-foreground">Tracking.</span> Preferred path is
            MediaPipe HandLandmarker loaded at runtime from an ESM CDN (no npm
            dependency). If that fails it degrades to a self-computed optical-flow
            / frame-difference field read from an offscreen buffer; if the camera
            is denied it stays on a seeded (0x2590) auto-demo that rises, opens,
            accelerates, then stills.
          </p>
          <p>
            <span className="text-foreground">The field.</span> A WebGL2 ping-pong
            feedback trail follows the motion centroid and stretches / colors with
            pitch and roughness along the violet→magenta ramp — the sonic gesture
            made visible. No WebGL2 falls back to an SVG tract figure.
          </p>
          <p>
            <span className="text-foreground">Honest limits.</span> Hand tracking
            and optical flow are noisy, so everything is smoothed — very fast
            gestures blur. Two-formant morphing approximates vowels rather than
            modelling a full tract. MediaPipe and the camera path could not be
            exercised in a headless build, so those are the least-tested paths.
            Next cycle: per-hand independent voices (a duet), a real advected fluid
            for the field, and a breath/onset term from motion acceleration.
          </p>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
