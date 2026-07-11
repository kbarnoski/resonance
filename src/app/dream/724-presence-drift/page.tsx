"use client";

// ── Presence Drift ───────────────────────────────────────────────────────────
// "What if the voices you leave hanging in 3D were each a slow READ-HEAD walking
//  through Karel's real *Welcome Home* recording — so the spatial chord you build
//  never holds still, but continuously re-voices itself as each point drifts
//  through a different moment of his performance?"
//
// INPUT  : webcam full-body pose (MediaPipe Pose, CDN at runtime) → reach/dwell/flick
// OUTPUT : WebGPU compute particle field (Canvas2D fallback) + HRTF spatial grains
// CORE   : persistent HRTF voices, each a drifting read-head into the REAL
//          recording — concatenative Hann-windowed grains, re-voicing over minutes.
// VIBE   : long-form, stateful, alive — different at minute five than at minute one.
//
// Cycle-2 of 710-presence-bloom, fused with 718/720's concatenative-grain piano.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DriftAudio } from "./audio";
import { makeRenderer, type Renderer, type Attractor } from "./render";
import {
  createLandmarker,
  bodyFromLandmarks,
  makeGhostBody,
  makeWristTracker,
  runWristGesture,
  LM,
  type Body,
  type PoseLandmarkerInst,
  type WristTracker,
} from "./pose";

type Phase = "idle" | "running";

export default function PresenceDriftPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [ghostMode, setGhostMode] = useState(false);
  const [rendererKind, setRendererKind] = useState<string>("");
  const [voiceCount, setVoiceCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const rendererRef = useRef<Renderer | null>(null);
  const audioRef = useRef<DriftAudio | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const prevCentreRef = useRef<[number, number]>([0, 0]);
  const lastBodyAtRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const ghostActiveRef = useRef<boolean>(false);
  const smoothBodyRef = useRef<Body | null>(null);
  const energyRef = useRef<number>(0);
  const lTrackRef = useRef<WristTracker>(makeWristTracker());
  const rTrackRef = useRef<WristTracker>(makeWristTracker());
  const runInputAndAudioRef = useRef<
    (tSec: number, dt: number, audio: DriftAudio) => void
  >(() => {});

  // ── Build renderer + start the idle preview loop the instant we mount ──
  const startPreview = useCallback(async () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const w = wrap.clientWidth || window.innerWidth;
    const h = wrap.clientHeight || window.innerHeight;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    try {
      const r = await makeRenderer(canvas, w, h);
      rendererRef.current = r;
      setRendererKind(r.kind);
    } catch {
      setNotice("Visuals unavailable on this device.");
      return;
    }

    startedAtRef.current = performance.now();
    lastFrameRef.current = performance.now();

    const previewAttractors: Attractor[] = [];

    const loop = () => {
      const r = rendererRef.current;
      if (!r) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;
      const tSec = (now - startedAtRef.current) / 1000;

      const audio = audioRef.current;
      if (audio) {
        // RUNNING: real drifting-read-head voices drive everything.
        runInputAndAudioRef.current(tSec, dt, audio);
        const snap = audio.snapshot();
        const attractors: Attractor[] = snap.map((v) => ({
          x: v.pos.x,
          y: v.pos.y,
          z: v.pos.z,
          level: v.level,
          pulse: v.pulse,
          head: v.head,
        }));
        r.frame(attractors, energyRef.current, tSec, dt);
      } else {
        // IDLE PREVIEW: a slow ghost drift seeds visual-only attractors so the
        // field breathes before the user presses Start.
        if (
          previewAttractors.length < 7 &&
          Math.floor(tSec * 0.7) > previewAttractors.length - 1
        ) {
          const a = tSec * 0.5 + previewAttractors.length * 1.7;
          previewAttractors.push({
            x: Math.cos(a) * 2.2,
            y: Math.sin(a * 0.8) * 1.4,
            z: Math.sin(a * 0.5) * 2 - 1,
            level: 0.6,
            pulse: 1,
            head: (previewAttractors.length / 7) % 1,
          });
        }
        for (const pa of previewAttractors) {
          pa.pulse = Math.max(0.15, pa.pulse - dt * 0.5);
          pa.level = 0.4 + Math.sin(tSec * 0.6 + pa.x) * 0.2;
          pa.head = (pa.head + dt * 0.03) % 1; // heads slowly drift in preview too
        }
        const energy = 0.35 + Math.sin(tSec * 0.4) * 0.15;
        r.frame(previewAttractors, energy, tSec, dt);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ── Per-frame: read body (real or ghost), detect gestures, place voices ──
  const runInputAndAudio = useCallback(
    (tSec: number, dt: number, audio: DriftAudio) => {
      let body: Body | null = null;
      let isGhost = false;

      const lm = landmarkerRef.current;
      const video = videoRef.current;
      if (lm && video && video.readyState >= 2) {
        try {
          const res = lm.detectForVideo(video, performance.now());
          if (res.landmarks && res.landmarks.length > 0) {
            const out = bodyFromLandmarks(
              res.landmarks[0],
              prevCentreRef.current,
            );
            body = out.body;
            prevCentreRef.current = out.centre;
            lastBodyAtRef.current = tSec;
          }
        } catch {
          /* detection hiccup — fall through to ghost */
        }
      }

      // No real body for ~2.5s → synthetic ghost takes over.
      if (!body || tSec - lastBodyAtRef.current > 2.5) {
        body = makeGhostBody(tSec);
        isGhost = true;
      }
      if (ghostActiveRef.current !== isGhost) {
        ghostActiveRef.current = isGhost;
        setGhostMode(isGhost);
      }

      // Smooth the body for liquid motion + stable gestures.
      const prev = smoothBodyRef.current;
      const a = isGhost ? 1 : 0.4;
      let cur = body;
      if (prev) {
        const merged: Body["pts"] = {};
        for (const k of Object.keys(body.pts)) {
          const idx = Number(k);
          const np = body.pts[idx];
          const pp = prev.pts[idx] ?? np;
          merged[idx] = {
            x: pp.x + (np.x - pp.x) * a,
            y: pp.y + (np.y - pp.y) * a,
            z: pp.z + (np.z - pp.z) * a,
            v: np.v,
          };
        }
        cur = { pts: merged, feat: body.feat };
      }
      smoothBodyRef.current = cur;

      // Energy: body motion swells brightness/level + steers drift speed.
      const targetEnergy = cur.feat.brightness * 0.6 + cur.feat.motion * 0.5;
      energyRef.current += (targetEnergy - energyRef.current) * 0.06;

      // Gesture detection on both wrists.
      const lw = cur.pts[LM.leftWrist];
      const rw = cur.pts[LM.rightWrist];
      if (lw && lw.v > 0.2) {
        const ev = runWristGesture(lTrackRef.current, lw, tSec);
        if (ev) {
          audio.placeVoice(ev.x, ev.y, ev.z);
          setVoiceCount(audio.voiceCount());
        }
      }
      if (rw && rw.v > 0.2) {
        const ev = runWristGesture(rTrackRef.current, rw, tSec);
        if (ev) {
          audio.placeVoice(ev.x, ev.y, ev.z);
          setVoiceCount(audio.voiceCount());
        }
      }

      audio.tick(dt, energyRef.current);
    },
    [],
  );
  runInputAndAudioRef.current = runInputAndAudio;

  // ── Try to attach the camera + MediaPipe. Failure → silent ghost demo. ──
  const tryCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
    } catch {
      setCamError(
        "Camera unavailable — running a hands-free ghost demo. It builds the architecture on its own.",
      );
      return;
    }
    try {
      landmarkerRef.current = await createLandmarker();
    } catch {
      setCamError(
        "Pose model could not load (offline?) — running the hands-free ghost demo.",
      );
    }
  }, []);

  // ── Start: unlock audio inside the gesture, load corpus, then attach camera ──
  const handleStart = useCallback(async () => {
    if (phase === "running") return;
    setPhase("running");
    setNotice("Loading Karel's recording…");

    try {
      const audio = new DriftAudio();
      await audio.start();
      audioRef.current = audio;

      // Load the real recording (or fallback) before seeding voices.
      const kind = await audio.loadCorpus();
      if (kind === "fallback") {
        setFallbackNotice(
          "Karel's recording couldn't be fetched — drifting through a soft fallback piano instead.",
        );
      }

      setNotice(
        "Reach, dwell, then flick to leave a voice. Each one walks slowly through his recording.",
      );

      // Seed two voices so there is immediate spatial sound + bloom.
      audio.placeVoice(0.5, 0.3, 0.6);
      audio.placeVoice(-0.5, 0.1, 0.4);
      setVoiceCount(audio.voiceCount());
    } catch {
      setNotice("Audio could not start on this device. Visuals continue.");
    }

    // Camera + pose attach asynchronously; ghost demo runs until they arrive.
    lastBodyAtRef.current = -10;
    void tryCamera();
  }, [phase, tryCamera]);

  // ── Mount: kick off the idle preview immediately ──
  useEffect(() => {
    void startPreview();
    const onResize = () => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      const r = rendererRef.current;
      if (!wrap || !canvas || !r) return;
      const w = wrap.clientWidth || window.innerWidth;
      const h = wrap.clientHeight || window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      r.resize(w, h);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      void audioRef.current?.close();
      audioRef.current = null;
      try {
        landmarkerRef.current?.close();
      } catch {
        /* noop */
      }
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [startPreview]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#04060c] text-foreground">
      <video ref={videoRef} className="hidden" muted playsInline />
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      {/* Vignette for depth */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)]" />

      {/* Hero / idle overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Presence Drift
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-foreground sm:text-lg">
            Move your body to leave behind persistent singing voices in 3D. Each
            one is a slow read-head walking through Karel&rsquo;s real{" "}
            <em>Welcome Home</em> recording — so the spatial chord never holds
            still. It re-voices itself over minutes, genuinely different at minute
            five than at minute one.
          </p>
          <button
            onClick={handleStart}
            className="min-h-[44px] rounded-full bg-muted px-7 py-2.5 text-base font-medium text-black transition hover:bg-card"
          >
            Start
          </button>
          <p className="text-base text-muted-foreground">
            Headphones strongly recommended — the sound is spatial (HRTF).
          </p>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-6">
          <div className="rounded-xl bg-black/35 px-4 py-2.5 backdrop-blur-sm">
            <p className="text-base text-foreground">
              Drifting voices:{" "}
              <span className="font-semibold text-foreground">{voiceCount}</span>
            </p>
            {notice && (
              <p className="mt-1 max-w-xs text-base text-muted-foreground">{notice}</p>
            )}
            {fallbackNotice && (
              <p className="mt-1 max-w-xs text-base text-violet-300/95">
                {fallbackNotice}
              </p>
            )}
          </div>
          <div className="rounded-xl bg-black/35 px-3 py-2 text-base text-muted-foreground backdrop-blur-sm">
            {rendererKind === "webgpu" ? "WebGPU" : "Canvas2D"}
            {ghostMode ? " · ghost demo" : ""}
          </div>
        </div>
      )}

      {/* Camera / model error (visible) */}
      {camError && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-6">
          <p className="max-w-md rounded-xl bg-black/45 px-4 py-2.5 text-center text-base text-violet-300 backdrop-blur-sm">
            {camError}
          </p>
        </div>
      )}

      {/* Design notes link */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute bottom-4 right-4 min-h-[44px] rounded-full bg-black/35 px-4 py-2.5 text-base text-foreground backdrop-blur-sm transition hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="max-w-2xl space-y-4 rounded-2xl bg-[#0a0e1a]/90 p-6 sm:p-8">
            <h2 className="text-2xl font-semibold text-foreground">Design notes</h2>
            <p className="text-base leading-relaxed text-foreground">
              Spatialization is the instrument. One listener sits at the origin —
              your ears. Each deliberate wrist gesture (reach, dwell, then flick)
              leaves a <em>persistent</em> voice fixed at that point in 3D, sung
              through an HRTF panner with distance attenuation and a reverb send
              that grows with distance: far voices quieter and wetter, near voices
              present and dry.
            </p>
            <p className="text-base leading-relaxed text-foreground">
              The change from <span className="text-violet-300">Presence Bloom</span>{" "}
              (cycle-1): each voice no longer sings a synth note. Instead it owns
              its own slow <span className="text-violet-300/95">read-head</span>{" "}
              walking through Karel&rsquo;s real <em>Welcome Home</em> recording,
              continuously playing Hann-windowed grains from wherever its head
              currently sits — concatenative grain synthesis. Every head drifts at
              a slightly different rate, so the spatial chord never re-aligns. As
              the heads crawl through his performance, the harmony of the room
              re-voices itself over minutes: a true long-form, stateful piece,
              never a loop. Stillness slows every head; movement advances them.
            </p>
            <p className="text-base leading-relaxed text-muted-foreground">
              Refs: HRTF / binaural spatialization (Web Audio PannerNode);
              CataRT / corpus-based concatenative synthesis (Diemo Schwarz); Refik
              Anadol (GPU particle data-architecture). This is cycle-2 of
              710-presence-bloom, fused with the lab&rsquo;s grain-piano work
              (718-duet-paths, 720-paths-grainfield). The recording is fetched from
              an existing read-only route; the camera is analysed on-device only —
              never recorded or sent.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-full bg-muted px-5 py-2.5 text-base font-medium text-black"
            >
              Close
            </button>
            <Link
              href="/dream"
              className="ml-3 inline-block text-base text-muted-foreground underline hover:text-foreground"
            >
              Back to the lab
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
