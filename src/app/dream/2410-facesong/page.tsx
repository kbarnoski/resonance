"use client";

/**
 * 2410-facesong — Face Song
 *
 * "What if your face were the instrument — open your mouth to swell a vocal
 * pad, raise your brows to bend pitch, smile to brighten the timbre, tilt your
 * head to pan, and a glowing face-mesh sings back what your expression is
 * doing?"
 *
 * The lab's first real MediaPipe FaceLandmarker integration driven by the 52
 * BLENDSHAPE coefficients (jawOpen, mouthSmile*, browInnerUp, browDown*,
 * eyeBlink*, mouthPucker) plus head pose from the 478-point landmark geometry.
 * Blendshapes are the whole point: they are the expressive control surface
 * over a source–filter formant voice (see audio.ts, face.ts).
 *
 * Degrades gracefully: a seeded deterministic auto-demo animates a synthetic
 * face on mount (visual only — audio waits for the Start gesture). If the
 * camera or the model is unavailable, pointer + sliders drive the identical
 * synth.
 *
 * Privacy: webcam frames are analysed in-browser only — never recorded,
 * stored, or transmitted.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  blendshapeLookup,
  buildLiveGeometry,
  buildParametricGeometry,
  computeFaceParams,
  createLandmarker,
  drawFaceMesh,
  makeAutoDriver,
  neutralParams,
  type FaceLandmarkerInst,
  type FaceParams,
  type Landmark,
} from "./face";
import { startVocalSynth, type VocalSynth } from "./audio";

type Mode = "auto" | "camera" | "fallback";
type Phase = "idle" | "loading" | "running";

interface Sliders {
  jawOpen: number;
  smile: number;
  pucker: number;
  brow: number;
}

const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/2410-facesong/README.md";

export default function FaceSongPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("auto");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [sliders, setSliders] = useState<Sliders>({
    jawOpen: 0.4,
    smile: 0.3,
    pucker: 0,
    brow: 0,
  });
  const [readout, setReadout] = useState<FaceParams>(neutralParams());

  // Refs consumed by the persistent RAF loop (so no effect re-subscription).
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<Mode>("auto");
  const synthRef = useRef<VocalSynth | null>(null);
  const landmarkerRef = useRef<FaceLandmarkerInst | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const slidersRef = useRef<Sliders>(sliders);
  const pointerXRef = useRef<number>(0.5);
  const smoothedRef = useRef<FaceParams>(neutralParams());
  const lastLmParamsRef = useRef<FaceParams>(neutralParams());
  const liveLandmarksRef = useRef<Landmark[] | null>(null);
  const prevBlinkRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const autoDriverRef = useRef<(t: number) => FaceParams>(makeAutoDriver(0x2410));
  const readoutTickRef = useRef<number>(0);

  useEffect(() => {
    slidersRef.current = sliders;
  }, [sliders]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── Teardown helper ─────────────────────────────────────────────────────────
  const teardownLive = useCallback(() => {
    synthRef.current?.stop();
    synthRef.current = null;
    try {
      landmarkerRef.current?.close();
    } catch {
      /* noop */
    }
    landmarkerRef.current = null;
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    liveLandmarksRef.current = null;
  }, []);

  // ── The persistent render + synth loop ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const smooth = (target: FaceParams, dt: number): FaceParams => {
      const s = smoothedRef.current;
      const a = 1 - Math.exp(-dt * 12); // ~time-constant smoothing
      const lerp = (x: number, y: number) => x + (y - x) * a;
      const out: FaceParams = {
        jawOpen: lerp(s.jawOpen, target.jawOpen),
        smile: lerp(s.smile, target.smile),
        pucker: lerp(s.pucker, target.pucker),
        brow: lerp(s.brow, target.brow),
        blink: lerp(s.blink, target.blink),
        pan: lerp(s.pan, target.pan),
        roll: lerp(s.roll, target.roll),
        yaw: lerp(s.yaw, target.yaw),
        energy: lerp(s.energy, target.energy),
      };
      smoothedRef.current = out;
      return out;
    };

    let last = performance.now();
    const tick = (nowMs: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - last) / 1000));
      last = nowMs;
      frameRef.current += 1;
      const t = frameRef.current / 60;

      const m = modeRef.current;
      let target: FaceParams;

      if (m === "camera") {
        const lm = landmarkerRef.current;
        const video = videoRef.current;
        if (lm && video && video.videoWidth > 0) {
          try {
            const res = lm.detectForVideo(video, nowMs);
            const face = res.faceLandmarks[0];
            const bs = res.faceBlendshapes[0];
            if (face && bs) {
              const params = computeFaceParams(face, blendshapeLookup(bs.categories));
              lastLmParamsRef.current = params;
              liveLandmarksRef.current = face;
            } else {
              // Lost the face — decay expression toward rest, keep last mesh.
              lastLmParamsRef.current = {
                ...lastLmParamsRef.current,
                jawOpen: lastLmParamsRef.current.jawOpen * 0.9,
                smile: lastLmParamsRef.current.smile * 0.9,
                energy: lastLmParamsRef.current.energy * 0.9,
              };
            }
          } catch {
            /* detection hiccup — reuse last params */
          }
        }
        target = lastLmParamsRef.current;
      } else if (m === "fallback") {
        const sl = slidersRef.current;
        const pan = (pointerXRef.current - 0.5) * 2;
        target = {
          jawOpen: sl.jawOpen,
          smile: sl.smile,
          pucker: sl.pucker,
          brow: sl.brow,
          blink: 0,
          pan,
          roll: -pan / 2.6,
          yaw: pan * 0.5,
          energy: Math.min(
            1,
            sl.jawOpen * 0.5 + sl.smile * 0.25 + Math.abs(sl.brow) * 0.2,
          ),
        };
      } else {
        target = autoDriverRef.current(t);
      }

      const sm = smooth(target, dt);

      // Blink accent (debounced rising edge).
      if (sm.blink > 0.5 && prevBlinkRef.current <= 0.5) {
        synthRef.current?.blinkAccent();
      }
      prevBlinkRef.current = sm.blink;

      synthRef.current?.update(sm);

      // Geometry: real 478-point cloud when live, else the parametric face.
      const geom =
        m === "camera" && liveLandmarksRef.current
          ? buildLiveGeometry(liveLandmarksRef.current)
          : buildParametricGeometry(sm, t);

      drawFaceMesh(ctx, W, H, geom, sm.energy, t);

      // Throttle React readout updates to ~10 Hz.
      readoutTickRef.current += 1;
      if (readoutTickRef.current % 6 === 0) setReadout(sm);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  // Full teardown on unmount.
  useEffect(() => teardownLive, [teardownLive]);

  // ── Pointer over the stage → pan (fallback play) ────────────────────────────
  const onPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (modeRef.current !== "fallback") return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointerXRef.current = Math.min(
      1,
      Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)),
    );
  }, []);

  // ── Start: create synth in-gesture, then try camera + model ─────────────────
  const startCamera = useCallback(async () => {
    setErrorMsg(null);
    setNotice(null);

    // AudioContext must be born inside the user gesture.
    try {
      synthRef.current = startVocalSynth();
    } catch {
      setErrorMsg("Web Audio is unavailable in this browser.");
      return;
    }

    setPhase("loading");

    const failToFallback = (msg: string) => {
      setNotice(msg);
      setMode("fallback");
      modeRef.current = "fallback";
      setPhase("running");
    };

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      failToFallback(
        "No camera on this device — play the voice with the sliders and pointer below.",
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
    } catch {
      failToFallback(
        "Camera access was denied — play the voice with the sliders and pointer below.",
      );
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
      failToFallback("The camera stream could not start — use the controls below.");
      return;
    }
    videoRef.current = video;

    try {
      landmarkerRef.current = await createLandmarker(12000);
    } catch {
      for (const t of stream.getTracks()) t.stop();
      streamRef.current = null;
      videoRef.current = null;
      failToFallback(
        "The face-tracking model could not load — play the voice with the controls below.",
      );
      return;
    }

    setMode("camera");
    modeRef.current = "camera";
    setPhase("running");
  }, []);

  const stop = useCallback(() => {
    teardownLive();
    setPhase("idle");
    setMode("auto");
    modeRef.current = "auto";
    setNotice(null);
    lastLmParamsRef.current = neutralParams();
  }, [teardownLive]);

  const fmt = (v: number) => v.toFixed(2);
  const fmtS = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

  return (
    <main className="min-h-screen bg-[#05070f] text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream lab · face instrument
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Face Song
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Close notes" : "Design notes"}
          </button>
        </div>

        <p className="mt-3 text-base text-muted-foreground">
          Your face is the instrument: open your mouth to swell a vocal pad,
          raise your brows to bend the pitch, smile to brighten the vowel, purse
          your lips to round it, and tilt your head to pan — a glowing
          face-mesh sings back what your expression is doing.
        </p>

        {/* Stage */}
        <div
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          className="relative mt-5 aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-lg border border-border bg-[#05070f]"
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30 px-6 text-center backdrop-blur-[1px]">
              <p className="text-base text-muted-foreground">
                The mesh is breathing on its own. Turn it into a voice.
              </p>
              <button
                type="button"
                onClick={startCamera}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start camera
              </button>
              <p className="max-w-sm text-sm text-muted-foreground">
                Webcam frames are analysed in your browser only — never
                recorded or sent anywhere. No camera? You can still play it.
              </p>
            </div>
          )}

          {phase === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <p className="text-base text-muted-foreground">
                Loading the face model…
              </p>
            </div>
          )}

          {/* Live readout */}
          {phase === "running" && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/40 px-3 py-2 font-mono text-xs text-muted-foreground backdrop-blur-sm">
              <div>
                jaw <span className="text-foreground">{fmt(readout.jawOpen)}</span>
                {"  "}smile{" "}
                <span className="text-foreground">{fmt(readout.smile)}</span>
              </div>
              <div>
                brow <span className="text-foreground">{fmtS(readout.brow)}</span>
                {"  "}pucker{" "}
                <span className="text-foreground">{fmt(readout.pucker)}</span>
              </div>
              <div>
                pan <span className="text-foreground">{fmtS(readout.pan)}</span>
                {"  "}
                {mode === "camera" ? "live face" : "sliders"}
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <p className="mt-3 text-base text-destructive">{errorMsg}</p>
        )}
        {notice && phase === "running" && (
          <p className="mt-3 text-base text-destructive">{notice}</p>
        )}

        {/* Controls */}
        {phase === "running" && (
          <>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={stop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop
              </button>
              <span className="text-sm text-muted-foreground">
                {mode === "camera"
                  ? "Move your face to play."
                  : "Drag across the stage to pan; use the sliders to shape the voice."}
              </span>
            </div>

            {mode === "fallback" && (
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <SliderRow
                  label="Jaw open (aah)"
                  value={sliders.jawOpen}
                  min={0}
                  max={1}
                  onChange={(v) => setSliders((s) => ({ ...s, jawOpen: v }))}
                />
                <SliderRow
                  label="Smile (ee, brighter)"
                  value={sliders.smile}
                  min={0}
                  max={1}
                  onChange={(v) => setSliders((s) => ({ ...s, smile: v }))}
                />
                <SliderRow
                  label="Pucker (oo, rounder)"
                  value={sliders.pucker}
                  min={0}
                  max={1}
                  onChange={(v) => setSliders((s) => ({ ...s, pucker: v }))}
                />
                <SliderRow
                  label="Brow (pitch bend)"
                  value={sliders.brow}
                  min={-1}
                  max={1}
                  signed
                  onChange={(v) => setSliders((s) => ({ ...s, brow: v }))}
                />
              </div>
            )}
          </>
        )}

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

        {showNotes && <DesignNotes />}
      </div>
    </main>
  );
}

// ── Slider row ────────────────────────────────────────────────────────────────

function SliderRow({
  label,
  value,
  min,
  max,
  signed,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  signed?: boolean;
  onChange: (v: number) => void;
}) {
  const shown = signed
    ? (value >= 0 ? "+" : "") + value.toFixed(2)
    : value.toFixed(2);
  return (
    <label className="flex flex-col gap-1.5 text-base text-muted-foreground">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-xs text-foreground">{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 accent-violet-300"
      />
    </label>
  );
}

// ── Design notes ──────────────────────────────────────────────────────────────

function DesignNotes() {
  return (
    <div className="mt-6 rounded-lg border border-border bg-background/40 p-5">
      <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Design notes
      </h2>
      <div className="mt-3 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          <span className="text-foreground">The question.</span> What if your
          face were the instrument? This maps facial expression — not gesture,
          not motion — onto a singing voice, so a smile you can feel becomes a
          brightness you can hear.
        </p>
        <p>
          <span className="text-foreground">How it works.</span> MediaPipe{" "}
          <span className="font-mono text-foreground">FaceLandmarker</span>{" "}
          returns 478 3D landmarks and 52 blendshape coefficients per frame. The
          blendshapes are the control surface:{" "}
          <span className="font-mono text-foreground">jawOpen</span> gates the
          amplitude and opens the vowel toward &ldquo;aah&rdquo;;{" "}
          <span className="font-mono text-foreground">mouthSmile*</span> pushes
          the formants toward &ldquo;ee&rdquo;;{" "}
          <span className="font-mono text-foreground">mouthPucker</span> rounds
          them back toward &ldquo;oo&rdquo;;{" "}
          <span className="font-mono text-foreground">browInnerUp</span> minus{" "}
          <span className="font-mono text-foreground">browDown*</span> bends the
          pitch (snapped to A minor-pentatonic) and adds vibrato; head roll from
          the landmark geometry pans the stereo field; a blink is a soft accent.
        </p>
        <p>
          <span className="text-foreground">The voice.</span> A source–filter
          synth: two detuned sawtooths plus a sub sine (the glottal source)
          through three parallel bandpass formant filters whose centre
          frequencies sweep between measured /u/, /a/ and /i/ vowel targets — a
          real vowel-morphing vocal timbre rather than a filtered buzz.
        </p>
        <p>
          <span className="text-foreground">No camera?</span> A seeded
          deterministic auto-demo breathes the mesh on load (visual only —
          audio waits for your gesture). If the camera or model is unavailable,
          sliders and the pointer drive the identical synth.
        </p>
        <p>
          <span className="text-foreground">References.</span> MediaPipe{" "}
          <span className="font-mono text-foreground">FaceLandmarker</span> and
          its 52 blendshapes (Google AI Edge); Grishchenko et al.,
          &ldquo;Blendshapes GHUM: Real-time Monocular Facial Blendshape
          Prediction&rdquo; (arXiv:2309.05782, 2023); Gunnar Fant,{" "}
          <em>Acoustic Theory of Speech Production</em> (1960) for source–filter
          formant synthesis; and the vocoder / vowel-morphing lineage of
          expressive vocal synthesis.
        </p>
        <p>
          <span className="text-foreground">Honest limitations.</span> Face
          tracking itself is not novel; the fresh move is treating the 52
          blendshapes as a continuous instrument for a formant voice.
          Blendshape scores are noisy, so everything is EMA-smoothed — very fast
          expressions blur. Formant morphing approximates vowels rather than
          modelling a full vocal tract, and pitch is quantised to stay musical,
          so you cannot slide freely between notes.
        </p>
      </div>
    </div>
  );
}
