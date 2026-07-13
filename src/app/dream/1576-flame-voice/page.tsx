"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { Flame, SONIFIED } from "./flame";
import { Voice } from "./voice";
import { Drone } from "./audio";

const VAR_LABELS = [...SONIFIED];

export default function FlameVoicePage() {
  const [audioOn, setAudioOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [noCanvas, setNoCanvas] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readout, setReadout] = useState<number[]>(() =>
    new Array(SONIFIED.length).fill(0),
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const imgRef = useRef<ImageData | null>(null);
  const flameRef = useRef<Flame | null>(null);
  const voiceRef = useRef<Voice | null>(null);
  const droneRef = useRef<Drone | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const featuresRef = useRef<Float32Array | null>(null);
  const frameRef = useRef<number>(0);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const flame = flameRef.current;
    const c2d = ctx2dRef.current;
    if (!canvas || !flame || !c2d) return;
    // Fixed-ish internal buffer (Canvas2D typed-array accumulation, off-GPU),
    // CSS-stretched to fill the viewport.
    const maxW = 980;
    const maxH = 660;
    const iw = Math.max(320, Math.min(maxW, window.innerWidth));
    const ratio = window.innerHeight / Math.max(1, window.innerWidth);
    const ih = Math.max(240, Math.min(maxH, Math.round(iw * ratio)));
    if (canvas.width !== iw || canvas.height !== ih) {
      canvas.width = iw;
      canvas.height = ih;
      flame.resize(iw, ih);
      imgRef.current = c2d.createImageData(iw, ih);
    }
  }, []);

  // Mount: set up the flame + idle carrier and start the visual loop. Runs with
  // NO audio and NO mic — the seeded carrier keeps the organism morphing so the
  // page is never blank. Audio joins later on a user gesture.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c2d = canvas.getContext("2d");
    if (!c2d) {
      setNoCanvas(true);
      return;
    }
    reducedRef.current =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    ctx2dRef.current = c2d;
    flameRef.current = new Flame();
    voiceRef.current = new Voice();
    startTimeRef.current = performance.now();
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      const flame = flameRef.current;
      const voice = voiceRef.current;
      const img = imgRef.current;
      if (flame && voice && img && ctx2dRef.current) {
        const t = (performance.now() - startTimeRef.current) / 1000;
        const reduced = reducedRef.current;
        const drive = voice.sample(t, reduced);
        flame.setDrive(drive);
        const points = reduced ? 34000 : 74000;
        const decay = reduced ? 0.94 : 0.92;
        const features = flame.renderFrame(img, points, decay);
        featuresRef.current = features;
        ctx2dRef.current.putImageData(img, 0, 0);
        droneRef.current?.setPartials(features);

        // Throttled readout (~10 fps) so the weld is visible in the chrome too.
        frameRef.current++;
        if (frameRef.current % 6 === 0) {
          setReadout(Array.from(features));
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      voiceRef.current?.stop();
      voiceRef.current = null;
      droneRef.current?.stop();
      droneRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") void ac.close();
      acRef.current = null;
      flameRef.current = null;
    };
  }, [resize]);

  const handleBegin = useCallback(async () => {
    if (audioOn) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;
    const drone = new Drone(ac, 0.16);
    drone.start();
    droneRef.current = drone;
    setAudioOn(true);

    // Optional analysis-only mic. Never routed to the destination; the drone is
    // never routed into its analyser, so the loop cannot howl.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
        });
        if (voiceRef.current?.attachMic(ac, stream)) {
          setMicOn(true);
          setMicError(null);
        }
      } catch {
        setMicError(
          "Microphone unavailable — the flame is self-driving its own drone.",
        );
      }
    } else {
      setMicError("No microphone API here — running the idle self-demo.");
    }
  }, [audioOn]);

  const dominant = readout.reduce(
    (best, v, i) => (v > readout[best] ? i : best),
    0,
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {!noCanvas && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 h-full w-full touch-none"
          style={{ imageRendering: "auto" }}
        />
      )}

      <div className="fixed left-0 top-0 z-30 max-w-xl p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Flame Voice
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          A fractal flame rendered as a two-way instrument. You sing into it and
          it sings back: the live structure you see — which nonlinear variations
          dominate the organism — is sonified as a Just-Intonation chord, so the
          shape on screen <span className="text-foreground">is</span> the chord
          in your ears.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {!audioOn && (
            <button
              onClick={handleBegin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Begin — sing with it
            </button>
          )}
          <button
            onClick={() => setNotesOpen(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          {!audioOn
            ? "Visuals are already live — a seeded carrier is playing the flame silently. Press Begin to hear its structure and to sing into it."
            : micOn
              ? "Mic listening (analysis only, never played back). Sing — pitch morphs the flame, and the flame re-voices its own drone."
              : "Self-demo: the seeded carrier drives the flame and the drone sings its structure."}
        </p>

        {micError && (
          <p className="mt-2 text-sm text-destructive">{micError}</p>
        )}

        {noCanvas && (
          <p className="mt-3 max-w-sm text-sm text-destructive">
            Canvas 2D is unavailable here, so the flame can&rsquo;t be drawn.
            Press Begin and the Just-Intonation drone will still sing.
          </p>
        )}

        {/* Live weld readout: the same 8 numbers that shape the picture and the
            8 partial amplitudes you hear. */}
        <div className="mt-5 max-w-sm">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              variation dominance = chord
            </span>
            <span className="text-xs text-primary">{VAR_LABELS[dominant]}</span>
          </div>
          <div className="flex items-end gap-1.5">
            {readout.map((v, i) => (
              <div
                key={VAR_LABELS[i]}
                className="flex-1"
                title={VAR_LABELS[i]}
                aria-hidden
              >
                <div className="flex h-16 items-end overflow-hidden rounded-sm bg-muted">
                  <div
                    className="w-full bg-primary/60"
                    style={{
                      height: `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {notesOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              How it works
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                This is a genuine <span className="text-foreground">fractal
                flame</span> (Scott Draves &amp; Erik Reckase, &ldquo;The Fractal
                Flame Algorithm,&rdquo; 2003; the engine behind Electric Sheep).
                A handful of affine transforms, each blending nonlinear{" "}
                <span className="text-foreground">variations</span>, are rendered
                by the <span className="text-foreground">chaos game</span>: a
                point wanders the plane, and after a warm-up every step is
                accumulated into a density buffer.
              </p>
              <p>
                The image is <span className="text-foreground">log-density
                tone-mapped</span> — alpha = log(d+1) / log(max+1) with a gamma
                lift — which is exactly what turns a sparse point cloud into a
                luminous organism.
              </p>
              <p>
                <span className="text-foreground">The weld:</span> each frame the
                engine measures how dominant each of eight variations is (the
                hit-weighted average of the very blend weights used to draw every
                point). Those eight numbers become the amplitudes of eight
                Just-Intonation partials (1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2)
                over a 110&nbsp;Hz drone. Sing → autocorrelation reads your pitch
                → the variation blend and final rotation shift → the flame
                re-voices its own chord. The bars at left are those exact eight
                numbers.
              </p>
              <p>
                No microphone is required: a seeded synthetic carrier always
                drives the morph so the flame is never still and the drone is
                never silent.
              </p>
            </div>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1576-flame-voice"]} />
    </main>
  );
}
